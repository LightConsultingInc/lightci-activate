import { Module } from '@nestjs/common';
import { BootstrapService } from './bootstrap.service';

/** First-boot provisioning from configuration (competency catalogue, the customer's org and admins). */
@Module({
  providers: [BootstrapService],
  exports: [BootstrapService],
})
export class BootstrapModule {}
