import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContextLayer } from '../context/entities/context-layer.entity';
import { Escalation } from '../ops/entities/escalation.entity';
import { UsageSnapshot } from '../ops/entities/usage-snapshot.entity';
import { Org } from '../orgs/entities/org.entity';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { Skill } from '../skills/entities/skill.entity';
import { SkillAdoption } from '../skills/entities/skill-adoption.entity';
import { SkillUsage } from '../skills/entities/skill-usage.entity';
import { Baseline } from '../workflows/entities/baseline.entity';
import { Measurement } from '../workflows/entities/measurement.entity';
import { WorkflowMap } from '../workflows/entities/workflow-map.entity';
import { CoachService } from './coach.service';
import { CoachNote } from './entities/coach-note.entity';
import { Competency } from './entities/competency.entity';
import { Exercise } from './entities/exercise.entity';
import { Grade } from './entities/grade.entity';
import { MasterySnapshot } from './entities/mastery-snapshot.entity';
import { Placement } from './entities/placement.entity';
import { Revisit } from './entities/revisit.entity';
import { Submission } from './entities/submission.entity';
import { GraderService } from './grader.service';
import { LadderService } from './ladder.service';
import { LearningController } from './learning.controller';
import { LessonPersonalisation } from './entities/lesson-personalisation.entity';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';
import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';
import { ModulePrepService } from './module-prep.service';
import { ModulesController } from './modules.controller';
import { MasteryService } from './mastery.service';
import { PersonRefService } from './person-ref.service';
import { RevisitService } from './revisit.service';
import './learning.mocks';

/**
 * The learning loop: Coach, Grader, mastery model and revisit scheduler. Other modules import this
 * module for GraderService (skills grading), CoachService (adopt exercises, first exercise after
 * intake), MasteryService (team/MC views), PersonRefService and LearningController.buildLadder.
 * Cross-module entities are registered here with forFeature so no module cycle is needed.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Competency,
      Placement,
      Exercise,
      Submission,
      Grade,
      Revisit,
      CoachNote,
      MasterySnapshot,
      LessonPersonalisation,
      Person,
      Team,
      Org,
      ContextLayer,
      WorkflowMap,
      Baseline,
      Measurement,
      Skill,
      SkillAdoption,
      SkillUsage,
      Escalation,
      UsageSnapshot,
    ]),
  ],
  controllers: [LearningController, LessonsController, MemoryController, ModulesController],
  providers: [
    PersonRefService,
    MasteryService,
    RevisitService,
    GraderService,
    CoachService,
    LadderService,
    LessonsService,
    MemoryService,
    ModulePrepService,
    LearningController,
  ],
  exports: [
    TypeOrmModule,
    PersonRefService,
    MasteryService,
    RevisitService,
    GraderService,
    CoachService,
    LadderService,
    LessonsService,
    MemoryService,
    LearningController,
  ],
})
export class LearningModule {}
