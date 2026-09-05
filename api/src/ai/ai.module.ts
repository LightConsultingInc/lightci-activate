import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecretsService } from '../common/secrets.service';
import { OrgIntegration } from '../orgs/entities/org-integration.entity';
import { IntegrationsService } from '../orgs/integrations.service';
import { AgentRun } from '../ops/entities/agent-run.entity';
import { AiService } from './ai.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AgentRun, OrgIntegration])],
  providers: [AiService, IntegrationsService, SecretsService],
  exports: [AiService, IntegrationsService, SecretsService],
})
export class AiModule {}
