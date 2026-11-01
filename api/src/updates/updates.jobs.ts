import { Injectable, type OnModuleInit } from '@nestjs/common';
import { JobRegistry } from '../jobs/jobs.port';
import { UpdateCheckService } from './update-check.service';

/** Daily, and once when a worker starts, so a fresh install learns about updates on day one. */
@Injectable()
export class UpdatesJobs implements OnModuleInit {
  constructor(
    private readonly registry: JobRegistry,
    private readonly updates: UpdateCheckService,
  ) {}

  onModuleInit() {
    this.registry.register({
      name: 'updates.check',
      cron: '30 4 * * *',
      singleton: true,
      onBoot: { singletonKey: 'boot' },
      retryLimit: 1,
      retryDelaySeconds: 600,
      expireInSeconds: 120,
      handler: async () => {
        await this.updates.check();
      },
    });
  }
}
