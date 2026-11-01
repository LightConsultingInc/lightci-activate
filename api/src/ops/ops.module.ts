import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClaudeEnterpriseModule } from '../claude-enterprise/claude-enterprise.module';
import { OrgsModule } from '../orgs/orgs.module';
import { AuthModule } from '../auth/auth.module';
import { Org } from '../orgs/entities/org.entity';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { Placement } from '../learning/entities/placement.entity';
import { Grade } from '../learning/entities/grade.entity';
import { CoachNote } from '../learning/entities/coach-note.entity';
import { Revisit } from '../learning/entities/revisit.entity';
import { Exercise } from '../learning/entities/exercise.entity';
import { Submission } from '../learning/entities/submission.entity';
import { MasterySnapshot } from '../learning/entities/mastery-snapshot.entity';
import { Baseline } from '../workflows/entities/baseline.entity';
import { Measurement } from '../workflows/entities/measurement.entity';
import { WorkflowMap } from '../workflows/entities/workflow-map.entity';
import { Skill } from '../skills/entities/skill.entity';
import { SkillUsage } from '../skills/entities/skill-usage.entity';
import { SkillAdoption } from '../skills/entities/skill-adoption.entity';
import { SkillAssignment } from '../skills/entities/skill-assignment.entity';
import { PromotionRequest } from '../skills/entities/promotion-request.entity';
import { UsageSnapshot } from './entities/usage-snapshot.entity';
import { Escalation } from './entities/escalation.entity';
import { Wave } from './entities/wave.entity';
import { Readout } from './entities/readout.entity';
import { CostInput } from './entities/cost-input.entity';
import { AgentRun } from './entities/agent-run.entity';
import { AuditLog } from './entities/audit-log.entity';
import { AnalyticsSyncController } from './analytics-sync.controller';
import { AnalyticsSyncService } from './analytics-sync.service';
import { OpsJobs } from './ops.jobs';
import { AuditorService } from './auditor.service';
import { EscalationsController } from './escalations.controller';
import { LeadController } from './lead.controller';
import { LeadService } from './lead.service';
import { MetricsService } from './metrics.service';
import { MissionControlController } from './mission-control.controller';
import { MissionControlService } from './mission-control.service';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

/**
 * Operations, analytics and administration: Team (champion), Mission Control (sponsor/admin),
 * LightCI lead console, escalations, the Auditor role and the nightly Analytics API sync.
 * Reads the learning/workflow/skill entities directly (no dependency on those modules'
 * services) so it can be wired independently of them.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UsageSnapshot,
      Escalation,
      Wave,
      Readout,
      CostInput,
      AgentRun,
      AuditLog,
      Org,
      Team,
      Person,
      Placement,
      Grade,
      CoachNote,
      Revisit,
      Exercise,
      Submission,
      MasterySnapshot,
      Baseline,
      Measurement,
      WorkflowMap,
      Skill,
      SkillUsage,
      SkillAdoption,
      SkillAssignment,
      PromotionRequest,
    ]),
    ClaudeEnterpriseModule,
    OrgsModule,
    AuthModule,
  ],
  controllers: [
    TeamController,
    MissionControlController,
    EscalationsController,
    LeadController,
    AnalyticsSyncController,
  ],
  providers: [
    MetricsService,
    TeamService,
    MissionControlService,
    AuditorService,
    LeadService,
    AnalyticsSyncService,
    OpsJobs,
  ],
  exports: [
    TypeOrmModule,
    MetricsService,
    AuditorService,
    AnalyticsSyncService,
  ],
})
export class OpsModule {}
