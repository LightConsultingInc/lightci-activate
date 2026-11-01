/**
 * The job queue as the rest of the API sees it. Two implementations:
 *   PgBossJobs   Postgres-backed (pg-boss), shared by every api and worker process.
 *   InlineJobs   runs handlers in-process, right away. Used by unit tests and by the
 *                `activate` CLI, where there is no queue to hand work to.
 */
export type JobHandler<T = unknown> = (data: T) => Promise<void>;

export interface EnqueueOptions {
  /** At most one queued or running job per key; a second enqueue is a no-op. */
  singletonKey?: string;
  retryLimit?: number;
  retryDelaySeconds?: number;
  /** Seconds a single attempt may run before it is considered failed. */
  expireInSeconds?: number;
}

export interface JobsPort {
  enqueue<T extends object>(
    name: string,
    data: T,
    opts?: EnqueueOptions,
  ): Promise<string | null>;
  /** True while a job with this singleton key is queued, retrying or running. */
  isPending(name: string, singletonKey: string): Promise<boolean>;
  /** Resolves once no job with this singleton key is pending (tests and callers that await). */
  whenIdle(name: string, singletonKey: string): Promise<void>;
}

export const JOBS = Symbol('JOBS');

/** Where feature services declare the handlers the worker runs. */
export interface JobDefinition<T = unknown> {
  name: string;
  handler: JobHandler<T>;
  /** Default retry policy for jobs on this queue. */
  retryLimit?: number;
  retryDelaySeconds?: number;
  expireInSeconds?: number;
  /** Cron expression, when the job also runs on a schedule (worker role only). */
  cron?: string;
  /**
   * One job per singleton key across queued, retrying and running states. Required for
   * queues that enqueue with `singletonKey`; leave off for fire-and-forget queues, where
   * it would serialise unrelated jobs behind each other.
   */
  singleton?: boolean;
}

export class JobRegistry {
  private readonly defs = new Map<string, JobDefinition>();

  register<T>(def: JobDefinition<T>): void {
    if (this.defs.has(def.name))
      throw new Error(`Job "${def.name}" is registered twice`);
    this.defs.set(def.name, def);
  }

  get(name: string): JobDefinition | undefined {
    return this.defs.get(name);
  }

  all(): JobDefinition[] {
    return [...this.defs.values()];
  }
}

/** In-process queue: handlers run on the next tick; singleton keys dedupe in-flight work. */
export class InlineJobs implements JobsPort {
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly log: string[] = [];

  constructor(private readonly registry: JobRegistry) {}

  /** Names of every job enqueued, in order (for tests). */
  get enqueued(): readonly string[] {
    return this.log;
  }

  async enqueue<T extends object>(
    name: string,
    data: T,
    opts: EnqueueOptions = {},
  ): Promise<string | null> {
    const def = this.registry.get(name);
    if (!def) throw new Error(`No handler registered for job "${name}"`);
    const key = opts.singletonKey ? `${name}:${opts.singletonKey}` : null;
    if (key && this.inflight.has(key)) return null;
    const id = `inline-${this.log.length + 1}`;
    this.log.push(name);
    const run = new Promise<void>((resolve) => {
      setImmediate(() => {
        (def.handler as JobHandler<T>)(data)
          .catch(() => undefined)
          .finally(() => {
            if (key) this.inflight.delete(key);
            resolve();
          });
      });
    });
    if (key) this.inflight.set(key, run);
    return Promise.resolve(id);
  }

  isPending(name: string, singletonKey: string): Promise<boolean> {
    return Promise.resolve(this.inflight.has(`${name}:${singletonKey}`));
  }

  async whenIdle(name: string, singletonKey: string): Promise<void> {
    await this.inflight.get(`${name}:${singletonKey}`);
  }
}
