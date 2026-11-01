/**
 * The Prometheus endpoint through the real application (T4.3): it listens on its own port, serves
 * the metric names the self-host guide documents, and the counters move when the code paths they
 * instrument run (an HTTP request, a mock model call, a queued job). Uses the local Postgres from
 * api/.env.
 */

import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { z } from 'zod';
import { AiService } from '../../src/ai/ai.service';
import { registerMockResponder } from '../../src/ai/mock-responders';
import { AppModule } from '../../src/app.module';
import { JOBS, type JobsPort } from '../../src/jobs/jobs.port';
import { MetricsService } from '../../src/metrics/metrics.module';

describe('metrics endpoint through the application', () => {
  const saved = { ...process.env };
  let app: INestApplication;
  let metricsUrl: string;

  const scrape = async (): Promise<string> => {
    const res = await fetch(`${metricsUrl}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
    return res.text();
  };
  const sample = (
    text: string,
    name: string,
    labels: string,
  ): number | null => {
    const line = text
      .split('\n')
      .find(
        (l) =>
          l.startsWith(`${name}{`) &&
          labels.split(',').every((kv) => l.includes(kv)),
      );
    return line ? Number(line.split(' ').pop()) : null;
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ACTIVATE_EDITION = 'cloud';
    process.env.ACTIVATE_ROLE = 'api';
    process.env.AI_PROVIDER = 'mock';
    process.env.MIGRATIONS_RUN_ON_BOOT = 'true';
    process.env.METRICS_PORT = '0';
    delete process.env.SEED_ON_BOOT;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: ['error'] });
    app.setGlobalPrefix('api', {
      exclude: ['mcp', 'mcp/(.*)', '.well-known/(.*)', 'oauth', 'oauth/(.*)'],
    });
    await app.init();
    const port = app.get(MetricsService).port;
    expect(port).toBeGreaterThan(0);
    metricsUrl = `http://127.0.0.1:${port}`;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    process.env = saved;
  });

  it('serves the documented metric families on its own port, and nothing else', async () => {
    const text = await scrape();
    for (const name of [
      'http_server_duration_seconds',
      'activate_ai_requests_total',
      'activate_ai_tokens_total',
      'activate_jobs_queued',
      'activate_job_last_success_timestamp',
      'activate_marketplace_publish_failures_total',
      'activate_license_seats_used',
      'process_cpu_user_seconds_total',
    ]) {
      expect(text).toContain(`# TYPE ${name} `);
    }
    expect((await fetch(`${metricsUrl}/anything-else`)).status).toBe(404);
    // The application port does not serve metrics.
    await request(app.getHttpServer()).get('/metrics').expect(404);
  });

  it('times HTTP requests by matched route, not by raw URL', async () => {
    await request(app.getHttpServer()).get('/api/ready').expect(200);
    await request(app.getHttpServer()).get('/api/ready').expect(200);
    const text = await scrape();
    const count = sample(
      text,
      'http_server_duration_seconds_count',
      'route="/api/ready",method="GET",status="200"',
    );
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('counts model calls by task and outcome', async () => {
    registerMockResponder('metrics.probe', () => ({ answer: 42 }));
    const ai = app.get(AiService);
    const before =
      sample(
        await scrape(),
        'activate_ai_requests_total',
        'task="metrics.probe"',
      ) ?? 0;
    const out = await ai.structured(
      {
        agent: 'test',
        task: 'metrics.probe',
        system: 'x',
        messages: [{ role: 'user', content: 'y' }],
      },
      z.object({ answer: z.number() }),
    );
    expect(out.answer).toBe(42);
    const after = sample(
      await scrape(),
      'activate_ai_requests_total',
      'task="metrics.probe",outcome="mock"',
    );
    expect(after).toBe(before + 1);
  });

  it('reports queued jobs per queue', async () => {
    const jobs = app.get<JobsPort>(JOBS);
    // The api role installs queues but runs no workers, so the job stays queued and is visible.
    const id = await jobs.enqueue(
      'nightly.analytics',
      { probe: true },
      { singletonKey: `metrics-${Date.now()}` },
    );
    expect(id).toBeTruthy();
    const text = await scrape();
    expect(
      sample(text, 'activate_jobs_queued', 'queue="nightly.analytics"'),
    ).toBeGreaterThanOrEqual(1);
    expect(text).toMatch(
      /activate_job_last_success_timestamp\{job="nightly\.analytics"\} \d+/,
    );
  });
});
