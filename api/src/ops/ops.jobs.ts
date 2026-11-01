import { Injectable, type OnModuleInit } from '@nestjs/common';
import { JobRegistry } from '../jobs/jobs.port';
import { AnalyticsSyncService } from './analytics-sync.service';

/** Nightly pull from the Claude Enterprise Analytics API, once across the cluster. */
@Injectable()
export class OpsJobs implements OnModuleInit {
  constructor(
    private readonly registry: JobRegistry,
    private readonly analytics: AnalyticsSyncService,
  ) {}

  onModuleInit() {
    this.registry.register({
      name: 'nightly.analytics',
      cron: '15 3 * * *',
      retryLimit: 2,
      retryDelaySeconds: 300,
      expireInSeconds: 60 * 60,
      handler: async () => {
        await this.analytics.nightly();
      },
    });
  }
}
