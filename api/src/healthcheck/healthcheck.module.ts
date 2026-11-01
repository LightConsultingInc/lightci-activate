import { Module } from '@nestjs/common';

import { HealthcheckController } from './healthcheck.controller';
import { ReadinessService } from './readiness.service';

@Module({
  controllers: [HealthcheckController],
  providers: [ReadinessService],
})
export class HealthcheckModule {}
