import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContextLayer } from '../context/entities/context-layer.entity';
import { LearningModule } from '../learning/learning.module';
import { Escalation } from '../ops/entities/escalation.entity';
import { Org } from '../orgs/entities/org.entity';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { Skill } from '../skills/entities/skill.entity';
import { SkillsModule } from '../skills/skills.module';
import { BuilderService } from './builder.service';
import { Baseline } from './entities/baseline.entity';
import { Measurement } from './entities/measurement.entity';
import { WorkflowMap } from './entities/workflow-map.entity';
import { ScorerService } from './scorer.service';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import './workflows.mocks';

/**
 * Workflow maps, backlog, Scorer and Builder. Imports SkillsModule (LibraryService for Builder
 * drafts and skill cards) and LearningModule (PersonRefService). ScheduleModule.forRoot() in
 * AppModule enables the nightly @Cron in ScorerService.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([WorkflowMap, Baseline, Measurement, Person, Team, Org, Skill, Escalation, ContextLayer]),
    SkillsModule,
    LearningModule,
  ],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, ScorerService, BuilderService],
  exports: [TypeOrmModule, WorkflowsService, ScorerService, BuilderService],
})
export class WorkflowsModule {}
