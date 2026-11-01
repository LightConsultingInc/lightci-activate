import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

/**
 * Prometheus metrics for api and worker processes, with the names the self-host guide lists.
 * Plain module-level instruments so hot paths (AI calls, git writes) increment without DI.
 */
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const httpDuration = new Histogram({
  name: 'http_server_duration_seconds',
  help: 'HTTP request duration by route, method and status.',
  labelNames: ['route', 'method', 'status'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
  registers: [registry],
});

export const aiRequests = new Counter({
  name: 'activate_ai_requests_total',
  help: 'Model calls by task, model and outcome.',
  labelNames: ['task', 'model', 'outcome'] as const,
  registers: [registry],
});

export const aiTokens = new Counter({
  name: 'activate_ai_tokens_total',
  help: 'Tokens by task, model and direction (input or output).',
  labelNames: ['task', 'model', 'direction'] as const,
  registers: [registry],
});

export const jobsQueued = new Gauge({
  name: 'activate_jobs_queued',
  help: 'Jobs created, retrying or active per queue.',
  labelNames: ['queue'] as const,
  registers: [registry],
});

export const jobLastSuccess = new Gauge({
  name: 'activate_job_last_success_timestamp',
  help: 'Unix time of the last completed job per queue (0 when none).',
  labelNames: ['job'] as const,
  registers: [registry],
});

export const marketplacePublishFailures = new Counter({
  name: 'activate_marketplace_publish_failures_total',
  help: 'Marketplace git operations that failed, by reason.',
  labelNames: ['reason'] as const,
  registers: [registry],
});

export const licenseSeatsUsed = new Gauge({
  name: 'activate_license_seats_used',
  help: 'Active and invited people counted against the license.',
  registers: [registry],
});

export const licenseSeats = new Gauge({
  name: 'activate_license_seats',
  help: 'Seats the license allows (0 when unlimited or not applicable).',
  registers: [registry],
});
