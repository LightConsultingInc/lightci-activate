import { Module } from '@nestjs/common';
import { AdminClient } from './admin.client';
import { AnalyticsClient } from './analytics.client';
import { ClaudeEnterpriseController } from './claude-enterprise.controller';
import { ClaudeEnterpriseService } from './claude-enterprise.service';
import { ComplianceClient } from './compliance.client';

/**
 * Claude Enterprise integration (Analytics, Admin and Compliance APIs).
 * Import into AppModule: `imports: [..., ClaudeEnterpriseModule]`.
 */
@Module({
  controllers: [ClaudeEnterpriseController],
  providers: [
    AnalyticsClient,
    AdminClient,
    ComplianceClient,
    ClaudeEnterpriseService,
  ],
  exports: [
    ClaudeEnterpriseService,
    AnalyticsClient,
    AdminClient,
    ComplianceClient,
  ],
})
export class ClaudeEnterpriseModule {}
