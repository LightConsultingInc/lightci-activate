import { Injectable, type OnModuleInit } from '@nestjs/common';
import { JobRegistry } from '../jobs/jobs.port';
import { ScorerService } from './scorer.service';

/** Nightly rescoring of candidate workflows, once across the cluster. SCORER_NIGHTLY=off disables the schedule. */
@Injectable()
export class WorkflowsJobs implements OnModuleInit {
  constructor(
    private readonly registry: JobRegistry,
    private readonly scorer: ScorerService,
  ) {}

  onModuleInit() {
    this.registry.register({
      name: 'nightly.scorer',
      cron: process.env.SCORER_NIGHTLY === 'off' ? undefined : '15 3 * * *',
      retryLimit: 1,
      expireInSeconds: 2 * 60 * 60,
      handler: async () => {
        await this.scorer.nightly();
      },
    });
  }
}
