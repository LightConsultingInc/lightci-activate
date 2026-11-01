import { Global, Module } from '@nestjs/common';
import { JOBS, JobRegistry } from './jobs.port';
import { PgBossJobs } from './jobs.service';

/**
 * Background work. Feature services register handlers on `JobRegistry` in their
 * onModuleInit; `PgBossJobs` installs queues at bootstrap and, in worker or all
 * roles, runs them. Inject `JOBS` (a `JobsPort`) to enqueue.
 */
@Global()
@Module({
  providers: [
    JobRegistry,
    PgBossJobs,
    { provide: JOBS, useExisting: PgBossJobs },
  ],
  exports: [JobRegistry, PgBossJobs, JOBS],
})
export class JobsModule {}
