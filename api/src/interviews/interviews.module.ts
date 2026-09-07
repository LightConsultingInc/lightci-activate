import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exercise } from '../learning/entities/exercise.entity';
import { Baseline } from '../workflows/entities/baseline.entity';
import { ContextLayer } from '../context/entities/context-layer.entity';
import { ContextSource } from '../context/entities/context-source.entity';
import { Placement } from '../learning/entities/placement.entity';
import { LearningModule } from '../learning/learning.module';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { WorkflowMap } from '../workflows/entities/workflow-map.entity';
import { InterviewSession } from './entities/interview-session.entity';
import { InterviewerService } from './interviewer.service';
import { InterviewsController } from './interviews.controller';
import './interviewer.mocks';

/**
 * Interviewer role. Imports LearningModule for CoachService (first exercise after intake) and
 * RealtimeModule so `POST /realtime/session` is mounted without touching app.module.ts.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Exercise,
      Baseline,
      InterviewSession,
      WorkflowMap,
      ContextLayer,
      ContextSource,
      Placement,
      Person,
      Team,
    ]),
    LearningModule,
    RealtimeModule,
  ],
  controllers: [InterviewsController],
  providers: [InterviewerService],
  exports: [TypeOrmModule, InterviewerService],
})
export class InterviewsModule {}
