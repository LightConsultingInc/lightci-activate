import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClaudeEnterpriseModule } from '../claude-enterprise/claude-enterprise.module';
import { ContextSource } from '../context/entities/context-source.entity';
import { AuditLog } from '../ops/entities/audit-log.entity';
import { Baseline } from '../workflows/entities/baseline.entity';
import { Org } from './entities/org.entity';
import { Team } from './entities/team.entity';
import { Person } from './entities/person.entity';
import { OrgIntegration } from './entities/org-integration.entity';
import {
  OrgController,
  PeopleController,
  TeamsController,
} from './org.controller';
import { OrgService } from './org.service';

/**
 * Company admin: org settings and governance versions, integrations (client credentials),
 * provisioning checklist, teams (incl. Admin API group import) and people.
 * IntegrationsService itself is provided by the global AiModule.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Org,
      Team,
      Person,
      OrgIntegration,
      AuditLog,
      ContextSource,
      Baseline,
    ]),
    ClaudeEnterpriseModule,
  ],
  controllers: [OrgController, TeamsController, PeopleController],
  providers: [OrgService],
  exports: [TypeOrmModule, OrgService],
})
export class OrgsModule {}
