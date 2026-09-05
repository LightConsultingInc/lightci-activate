/**
 * Minimal fetch wrapper shared by the Analytics, Admin and Compliance clients.
 *
 *  - x-api-key auth + anthropic-version header on every request
 *  - per-key token bucket (default 60 req/min, the Analytics API limit)
 *  - retry on 429 honouring `retry-after`, and on 5xx unless `x-should-retry: false`
 *  - array query params use bracket notation (`filter[]=a&filter[]=b`)
 *
 * Keys are never logged; use `maskKey()` when you need to show one.
 */

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
export const ANTHROPIC_VERSION = '2023-06-01';

export type QueryValue =
  string | number | boolean | null | undefined | (string | number)[];
export type Query = Record<string, QueryValue>;

export class ClaudeApiError extends Error {
  constructor(
    public readonly status: number,
    /** Anthropic `error.type`, e.g. `authentication_error`, `permission_error`, `rate_limit_error`. */
    public readonly errorType: string,
    message: string,
    public readonly requestId: string | null = null,
    public readonly path: string = '',
  ) {
    super(message);
    this.name = 'ClaudeApiError';
  }

  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /** Scopes the key carries, parsed from "Got: ['a', 'b']" in a 403 message. */
  get grantedScopes(): string[] | undefined {
    return parseGrantedScopes(this.message);
  }
}

export function parseGrantedScopes(message: string): string[] | undefined {
  const m = /Got:\s*\[([^\]]*)\]/.exec(message);
  if (!m) return undefined;
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

export function maskKey(key: string | undefined): string {
  if (!key) return '(unset)';
  return key.length <= 12 ? '****' : `${key.slice(0, 12)}...`;
}

/** Simple token bucket: `capacity` tokens refilled evenly over `perMs`. */
export class TokenBucket {
  private tokens: number;
  private last = Date.now();

  constructor(
    private readonly capacity: number,
    private readonly perMs: number = 60_000,
  ) {
    this.tokens = capacity;
  }

  private refill(): void {
    const now = Date.now();
    this.tokens = Math.min(
      this.capacity,
      this.tokens + ((now - this.last) / this.perMs) * this.capacity,
    );
    this.last = now;
  }

  /** Resolves when a token is available (waits, never rejects). */
  async take(): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.ceil(
        ((1 - this.tokens) / this.capacity) * this.perMs,
      );
      await sleep(Math.max(waitMs, 10));
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface HttpOptions {
  /** Requests per minute allowed per key. */
  ratePerMinute: number;
  maxAttempts?: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class ClaudeHttp {
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly maxAttempts: number;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: HttpOptions) {
    this.maxAttempts = opts.maxAttempts ?? 4;
    this.baseUrl = opts.baseUrl ?? ANTHROPIC_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  private bucketFor(key: string): TokenBucket {
    // Rate limits are per organisation; one bucket per key is a close, safe proxy.
    let b = this.buckets.get(key);
    if (!b) {
      b = new TokenBucket(this.opts.ratePerMinute);
      this.buckets.set(key, b);
    }
    return b;
  }

  buildUrl(path: string, query?: Query): string {
    const url = new URL(path, this.baseUrl);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        if (Array.isArray(v)) {
          const name = k.endsWith('[]') ? k : `${k}[]`;
          for (const item of v) url.searchParams.append(name, String(item));
        } else {
          url.searchParams.set(k, String(v));
        }
      }
    }
    return url.toString();
  }

  async get<T>(key: string, path: string, query?: Query): Promise<T> {
    if (!key)
      throw new ClaudeApiError(
        401,
        'unconfigured',
        'No API key supplied',
        null,
        path,
      );
    const url = this.buildUrl(path, query);
    let attempt = 0;
    for (;;) {
      attempt += 1;
      await this.bucketFor(key).take();
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: 'GET',
          headers: {
            'x-api-key': key,
            'anthropic-version': ANTHROPIC_VERSION,
            accept: 'application/json',
          },
        });
      } catch (e) {
        if (attempt >= this.maxAttempts) throw e;
        await sleep(backoffMs(attempt));
        continue;
      }

      if (res.ok) return (await res.json()) as T;

      const body = await safeJson(res);
      const err = new ClaudeApiError(
        res.status,
        body?.error?.type ?? 'http_error',
        body?.error?.message ?? `HTTP ${res.status}`,
        body?.request_id ?? res.headers.get('request-id'),
        path,
      );

      const retryable =
        res.status === 429 ||
        (res.status >= 500 && res.headers.get('x-should-retry') !== 'false');
      if (!retryable || attempt >= this.maxAttempts) throw err;

      const wait =
        res.status === 429
          ? (retryAfterMs(res.headers.get('retry-after')) ?? backoffMs(attempt))
          : backoffMs(attempt);
      await sleep(wait);
    }
  }
}

function backoffMs(attempt: number): number {
  return (
    Math.min(60_000, 1000 * 2 ** (attempt - 1)) +
    Math.floor(Math.random() * 250)
  );
}

/** `retry-after` may be seconds or an HTTP date. */
export function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(header);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

async function safeJson(res: Response): Promise<any | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
