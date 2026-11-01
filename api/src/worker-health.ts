import { createServer, type Server } from 'node:http';
import type { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReadinessService } from './healthcheck/readiness.service';

/**
 * The worker has no HTTP app, but orchestrators still need liveness and readiness.
 * This serves exactly two routes on PORT: /api/health (process up) and /api/ready
 * (database reachable, schema current), with the same bodies the API returns.
 */
export function startWorkerHealthServer(
  app: INestApplicationContext,
  port: number,
): Server {
  const ds = app.get(DataSource);
  const server = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (req.method !== 'GET' || !['/api/health', '/api/ready'].includes(path)) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 404, title: 'Not Found' }));
      return;
    }
    if (path === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', role: 'worker' }));
      return;
    }
    ReadinessService.evaluate(ds).then(
      (report) => {
        res.writeHead(report.status === 'ok' ? 200 : 503, {
          'content-type': 'application/json',
        });
        res.end(JSON.stringify(report));
      },
      () => {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'fail', db: 'fail' }));
      },
    );
  });
  server.listen(port);
  return server;
}
