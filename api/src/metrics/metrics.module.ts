import {
  CallHandler,
  ExecutionContext,
  Global,
  Injectable,
  Logger,
  Module,
  NestInterceptor,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { createServer, type Server } from 'node:http';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';
import { PgBossJobs } from '../jobs/jobs.service';
import { LicenseService } from '../license/license.service';
import {
  httpDuration,
  jobLastSuccess,
  jobsQueued,
  licenseSeats,
  licenseSeatsUsed,
  registry,
} from './registry';

/** Request timing with the matched route (not the raw URL, so ids do not explode the label set). */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const start = process.hrtime.bigint();
    const route =
      (req.route as { path?: string } | undefined)?.path ?? req.path;
    const observe = () =>
      httpDuration
        .labels(route, req.method, String(res.statusCode))
        .observe(Number(process.hrtime.bigint() - start) / 1e9);
    return next.handle().pipe(
      tap({
        next: observe,
        error: observe,
      }),
    );
  }
}

/**
 * Serves /metrics on METRICS_PORT (default 9464) for every role, separate from the application
 * port so it is never exposed through the ingress. Queue and license gauges are refreshed on scrape.
 */
@Injectable()
export class MetricsService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(MetricsService.name);
  private server: Server | null = null;

  constructor(
    private readonly jobs: PgBossJobs,
    private readonly license: LicenseService,
  ) {}

  /** The bound port (METRICS_PORT=0 picks a free one), or null when not listening. */
  get port(): number | null {
    const addr = this.server?.address();
    return addr && typeof addr === 'object' ? addr.port : null;
  }

  async refresh(): Promise<void> {
    try {
      const stats = await this.jobs.stats();
      for (const s of stats) {
        jobsQueued.labels(s.name).set(s.queued);
        jobLastSuccess
          .labels(s.name)
          .set(
            s.lastCompletedAt
              ? Math.floor(new Date(s.lastCompletedAt).getTime() / 1000)
              : 0,
          );
      }
    } catch (e) {
      this.logger.debug(
        `queue stats unavailable: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    try {
      const s = await this.license.state();
      licenseSeatsUsed.set(s.seatsUsed ?? 0);
      licenseSeats.set(s.seats ?? 0);
    } catch {
      /* no license state: leave the gauges as they are */
    }
  }

  onApplicationBootstrap(): void {
    if (process.env.METRICS_ENABLED === 'false') return;
    const port = Number(process.env.METRICS_PORT ?? 9464);
    this.server = createServer((req, res) => {
      if ((req.url ?? '').split('?')[0] !== '/metrics') {
        res.writeHead(404);
        res.end();
        return;
      }
      void this.refresh().then(async () => {
        const body = await registry.metrics();
        res.writeHead(200, { 'content-type': registry.contentType });
        res.end(body);
      });
    });
    this.server.on('error', (e) =>
      this.logger.warn(
        `metrics server: ${e instanceof Error ? e.message : String(e)}`,
      ),
    );
    this.server.listen(port, () =>
      this.logger.log(`Metrics on :${port}/metrics`),
    );
  }

  onApplicationShutdown(): void {
    this.server?.close();
    this.server = null;
  }
}

@Global()
@Module({
  providers: [
    MetricsService,
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
