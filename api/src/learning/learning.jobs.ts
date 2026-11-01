import { Injectable, type OnModuleInit } from '@nestjs/common';
import { JobRegistry } from '../jobs/jobs.port';
import { MasteryService } from './mastery.service';
import { RevisitService } from './revisit.service';

/**
 * Nightly learning jobs. These used to be @Cron methods on each service, which ran
 * on every API replica; as queue schedules they fire once across the cluster.
 */
@Injectable()
export class LearningJobs implements OnModuleInit {
  constructor(
    private readonly registry: JobRegistry,
    private readonly mastery: MasteryService,
    private readonly revisits: RevisitService,
  ) {}

  onModuleInit() {
    this.registry.register({
      name: 'nightly.mastery',
      cron: '0 2 * * *',
      retryLimit: 1,
      expireInSeconds: 60 * 60,
      handler: async () => {
        await this.mastery.nightlySnapshots();
      },
    });
    this.registry.register({
      name: 'nightly.revisits',
      cron: '0 3 * * *',
      retryLimit: 1,
      expireInSeconds: 60 * 60,
      handler: async () => {
        await this.revisits.nightlyDecayCheck();
      },
    });
  }
}
