import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exercise } from '../learning/entities/exercise.entity';
import { Grade } from '../learning/entities/grade.entity';
import { LearningModule } from '../learning/learning.module';
import { AuditLog } from '../ops/entities/audit-log.entity';
import { Escalation } from '../ops/entities/escalation.entity';
import { Org } from '../orgs/entities/org.entity';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { Baseline } from '../workflows/entities/baseline.entity';
import { Measurement } from '../workflows/entities/measurement.entity';
import { WorkflowMap } from '../workflows/entities/workflow-map.entity';
import { PromotionRequest } from './entities/promotion-request.entity';
import { SkillAdoption } from './entities/skill-adoption.entity';
import { SkillAssignment } from './entities/skill-assignment.entity';
import { SkillComment } from './entities/skill-comment.entity';
import { SkillUsage } from './entities/skill-usage.entity';
import { SkillVersion } from './entities/skill-version.entity';
import { Skill } from './entities/skill.entity';
import { GitRepoService } from './git-repo.service';
import { LibraryService } from './library.service';
import { PluginUpdateService } from './plugin-update.service';
import { PromoterService } from './promoter.service';
import { SkillsController } from './skills.controller';
import './skills.mocks';

/**
 * Skill library, publishing and the Promoter. Depends on LearningModule for GraderService (skill
 * grading) and PersonRefService. Cross-module entities are registered with forFeature so no module
 * cycle is needed; WorkflowsModule imports this module for LibraryService (Builder drafts).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Skill,
      SkillVersion,
      SkillAssignment,
      SkillUsage,
      SkillAdoption,
      SkillComment,
      PromotionRequest,
      Person,
      Team,
      Org,
      Grade,
      Exercise,
      WorkflowMap,
      Baseline,
      Measurement,
      Escalation,
      AuditLog,
    ]),
    LearningModule,
  ],
  controllers: [SkillsController],
  providers: [
    GitRepoService,
    LibraryService,
    PromoterService,
    PluginUpdateService,
  ],
  exports: [
    TypeOrmModule,
    GitRepoService,
    LibraryService,
    PromoterService,
    PluginUpdateService,
  ],
})
export class SkillsModule {}
