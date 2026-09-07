import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  GoneException,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { In, Repository } from 'typeorm';
import { CurrentUser, OrgId } from '../common/decorators';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { Skill } from '../skills/entities/skill.entity';
import { WorkflowMap } from '../workflows/entities/workflow-map.entity';
import { CoachService, type SkipReason } from './coach.service';
import { COMPETENCY_CATALOG } from './competency-catalog';
import { CoachNote } from './entities/coach-note.entity';
import { Competency } from './entities/competency.entity';
import { Exercise } from './entities/exercise.entity';
import { Grade } from './entities/grade.entity';
import { Submission, type Artifact } from './entities/submission.entity';
import { GraderService } from './grader.service';
import { LadderService } from './ladder.service';
import type {
  ExerciseDetail,
  ExerciseSummary,
  GradeView,
  LadderView,
  MasteryResponse,
  MySkillsResponse,
  RevisitSummary,
  RunResult,
  SubmissionView,
  SubmitResponse,
} from './learning.types';
import {
  gradeOfRecord,
  practiceOf,
  toExerciseSummary,
  toGradeView,
  toSubmissionView,
} from './mappers';
import { MasteryService } from './mastery.service';
import { MemoryService } from './memory.service';
import { dataReminder } from './prompts';
import { PersonRefService } from './person-ref.service';
import { RevisitService } from './revisit.service';

// ───────────────────────── DTOs ─────────────────────────

/** Body varies by practice kind; the service validates the fields the kind needs. */
class RunDto {
  // prompt
  @IsOptional() @IsString() prompt?: string;
  @IsOptional() @IsString() material?: string;
  @IsOptional() @IsArray() connectors?: string[];
  // project
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsArray() files?: { name: string; content: string }[];
  @IsOptional() @IsString() testTask?: string;
  @IsOptional() @IsString() name?: string;
  // skill
  @IsOptional() @IsString() skillMd?: string;
  @IsOptional() @IsArray() sampleRequests?: string[];
  // workflow
  @IsOptional() @IsObject() schema?: Record<string, unknown>;
}

class SubmitDto {
  @IsObject() artifact: Artifact;
  // Legacy (pre-v2) fields: accepted and ignored.
  @IsOptional() @IsString() expectationText?: string;
  @IsOptional() @IsNumber() expectationConfidence?: number;
  @IsOptional() @IsString() critiqueText?: string;
  @IsOptional() @IsBoolean() coldAttempt?: boolean;
}

class SkipDto {
  @IsIn(['no_time', 'blocked', 'tool_issue', 'not_relevant'])
  reason: SkipReason;
  @IsOptional() @IsString() note?: string;
}

class AnswerDto {
  @IsString() @IsNotEmpty() response: string;
}

const ARTIFACT_TYPES: Artifact['type'][] = [
  'prompt_run',
  'project',
  'skill',
  'workflow',
  'text',
  'review',
];

/**
 * Learning routes from docs/api-contract.md (learner section). Every query is scoped to the
 * caller's org; `personId` access is self, the champion of the person's team, or sponsor/admin/lead.
 */
@ApiTags('Learning')
@Controller()
export class LearningController {
  constructor(
    @InjectRepository(Exercise)
    private readonly exercises: Repository<Exercise>,
    @InjectRepository(Submission)
    private readonly submissions: Repository<Submission>,
    @InjectRepository(Grade) private readonly grades: Repository<Grade>,
    @InjectRepository(CoachNote) private readonly notes: Repository<CoachNote>,
    @InjectRepository(Competency)
    private readonly competencies: Repository<Competency>,
    @InjectRepository(Person) private readonly people: Repository<Person>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(Skill) private readonly skills: Repository<Skill>,
    @InjectRepository(WorkflowMap)
    private readonly workflows: Repository<WorkflowMap>,
    private readonly mastery: MasteryService,
    private readonly coach: CoachService,
    private readonly grader: GraderService,
    private readonly revisits: RevisitService,
    private readonly ladder: LadderService,
    private readonly refs: PersonRefService,
    private readonly memory: MemoryService,
  ) {}

  // ───────────────────────── ladder ─────────────────────────

  @Get('ladder/me')
  @ApiOperation({
    summary:
      "The learner's ladder: rung, gate progress, competencies, judgement, hours back, next up, revisits due.",
  })
  async ladderMe(
    @CurrentUser() user: Person,
    @OrgId() orgId: string,
  ): Promise<LadderView> {
    return this.buildLadder(user, orgId);
  }

  async buildLadder(person: Person, orgId: string | null): Promise<LadderView> {
    const [
      ref,
      report,
      hoursBack,
      streak,
      nextUp,
      queued,
      revisitsDue,
      artifacts,
      notes,
    ] = await Promise.all([
      this.refs.ref(person),
      this.mastery.report(person.id),
      this.ladder.hoursBack(person.id),
      this.ladder.streak(person.id),
      this.coach.ensureNextUp(person, orgId),
      this.coach.queued(person.id),
      this.revisits.dueFor(person.id, 'today'),
      this.mastery.gradedArtifacts(person.id),
      this.notes.find({
        where: { personId: person.id },
        order: { createdAt: 'DESC' },
        take: 6,
      }),
    ]);
    return {
      person: ref,
      rung: report.rung,
      nextRung: report.nextRung,
      progress: report.progress,
      competencies: report.competencies,
      judgement: report.judgement,
      hoursBack,
      streak,
      nextUp: nextUp ? toExerciseSummary(nextUp) : null,
      revisitsDue,
      queued: queued.filter((e) => e.id !== nextUp?.id).map(toExerciseSummary),
      recentGrades: artifacts
        .slice(-5)
        .reverse()
        .map((a) => ({
          submissionId: a.submission.id,
          exerciseTitle: a.exercise.title,
          score: a.grade.score,
          decision: a.grade.decision,
          gradedAt: new Date(a.grade.gradedAt).toISOString(),
        })),
      coachNotes: notes.map((n) => ({
        note: n.note,
        tags: n.tags,
        createdAt: new Date(n.createdAt).toISOString(),
      })),
    };
  }

  // ───────────────────────── exercises ─────────────────────────

  @Get('exercises')
  @ApiOperation({
    summary:
      'Exercises for the caller (or for personId when the caller may view that person).',
  })
  async listExercises(
    @CurrentUser() user: Person,
    @OrgId() orgId: string,
    @Query('status') status?: string,
    @Query('personId') personId?: string,
  ): Promise<ExerciseSummary[]> {
    const target = await this.resolveViewablePerson(user, orgId, personId);
    const statuses = status
      ? status
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : null;
    const rows = await this.exercises.find({
      where: statuses
        ? { personId: target.id, status: In(statuses) }
        : { personId: target.id },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toExerciseSummary);
  }

  @Get('exercises/:id')
  async exerciseDetail(
    @CurrentUser() user: Person,
    @OrgId() orgId: string,
    @Param('id') id: string,
  ): Promise<ExerciseDetail> {
    const exercise = await this.loadExercise(id, user, orgId, 'view');
    return this.detail(exercise);
  }

  @Post('exercises/:id/start')
  async start(
    @CurrentUser() user: Person,
    @OrgId() orgId: string,
    @Param('id') id: string,
  ): Promise<ExerciseDetail> {
    const exercise = await this.loadExercise(id, user, orgId, 'edit');
    if (exercise.status === 'queued' || exercise.status === 'skipped') {
      exercise.status = 'active';
      await this.exercises.save(exercise);
    }
    return this.detail(exercise);
  }

  @Post('exercises/:id/hint')
  @ApiOperation({ summary: 'Reveal the next hint (one at a time).' })
  async hint(
    @CurrentUser() user: Person,
    @OrgId() orgId: string,
    @Param('id') id: string,
  ) {
    const exercise = await this.loadExercise(id, user, orgId, 'edit');
    return this.coach.hint(exercise);
  }

  @Post('exercises/:id/expect')
  @ApiOperation({
    summary: 'Retired (410). Practice v2 has no prediction step.',
  })
  expect(): never {
    throw new GoneException(
      'Retired: practice no longer asks for a guess before Run; call POST /exercises/:id/run directly.',
    );
  }

  @Post('exercises/:id/run')
  @ApiOperation({
    summary:
      'Run Claude for the practice kind: prompt {prompt, material?} → {output}; project {instructions, files, testTask} → {output}; skill {skillMd, sampleRequests} → {results[]}; workflow {schema} → {skillDraft}. Review: 409.',
  })
  async run(
    @CurrentUser() user: Person,
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Body() dto: RunDto,
  ): Promise<RunResult> {
    const exercise = await this.loadExercise(id, user, orgId, 'edit');
    return this.coach.run(
      exercise,
      user,
      orgId,
      dto as Record<string, unknown>,
    );
  }

  @Post('exercises/:id/submit')
  @ApiOperation({
    summary:
      'Submit the work { artifact }; grades it (three lines, score out of 10, pass / try again), updates mastery, schedules revisits, may promote and queue the next exercise. Review kind adds agreement with the Grader.',
  })
  async submit(
    @CurrentUser() user: Person,
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Body() dto: SubmitDto,
  ): Promise<SubmitResponse> {
    const exercise = await this.loadExercise(id, user, orgId, 'edit');
    const practice = practiceOf(exercise);
    const artifact = dto.artifact;
    if (!artifact || typeof artifact !== 'object')
      throw new BadRequestException('artifact is required.');
    if (!ARTIFACT_TYPES.includes(artifact.type))
      throw new BadRequestException(
        `artifact.type must be one of ${ARTIFACT_TYPES.join(', ')}.`,
      );
    if (practice.kind === 'review') {
      if (artifact.type !== 'review')
        throw new BadRequestException(
          "artifact.type must be 'review' for this practice.",
        );
      if (
        typeof artifact.score10 !== 'number' ||
        !Number.isFinite(artifact.score10)
      )
        throw new BadRequestException(
          'artifact.score10 (0–10) is required for a review.',
        );
      if (typeof artifact.notes !== 'string' || !artifact.notes.trim())
        throw new BadRequestException(
          'artifact.notes is required: a few lines the author can act on.',
        );
      if (typeof artifact.content !== 'string' || !artifact.content.trim())
        artifact.content = artifact.notes.trim();
    } else if (
      typeof artifact.content !== 'string' ||
      !artifact.content.trim()
    ) {
      throw new BadRequestException('artifact.content is required.');
    }
    if (exercise.status === 'passed')
      throw new ConflictException(
        'This one has already passed. Your next exercise is waiting for you.',
      );

    const prior = await this.submissions.count({
      where: { exerciseId: exercise.id },
    });
    const submission = await this.submissions.save(
      this.submissions.create({
        exerciseId: exercise.id,
        personId: user.id,
        attempt: prior + 1,
        expectationText: '',
        expectationConfidence: 0.5,
        artifact,
        critiqueText: null,
        coldAttempt: prior === 0,
      }),
    );

    let agreement: SubmitResponse['agreement'];
    let grade: Grade;
    if (practice.kind === 'review') {
      const r = await this.grader.gradeReview(
        exercise,
        submission,
        user,
        orgId,
      );
      grade = r.grade;
      agreement = r.agreement;
    } else {
      grade = await this.grader.gradeSubmission(
        exercise,
        submission,
        user,
        orgId,
      );
    }
    exercise.status = grade.decision === 'pass' ? 'passed' : 'revise';
    exercise.completedAt = grade.decision === 'pass' ? new Date() : null;
    await this.exercises.save(exercise);

    await this.mastery.snapshot(user.id);
    await this.revisits.scheduleAfterGrade(exercise, grade);
    await this.revisits.injectDecayRevisits(user.id);
    const promotion = await this.mastery.promoteIfEligible(user.id);
    const gradeView = toGradeView(grade);
    const { feedback, score10, decision } = gradeView.learner;
    const weak = grade.rubric.filter((r) => r.score < 0.75).map((r) => r.label);
    // Tools the learner worked with: the connectors they switched on and named, plus anything else they named.
    const content = String(artifact.content ?? '').toLowerCase();
    const connectorsUsed = (artifact.connectors ?? []).filter((c) =>
      content.includes(c.toLowerCase()),
    );
    const tools = [
      ...new Set([
        ...connectorsUsed,
        ...((grade as Grade & { toolsNamed?: string[] }).toolsNamed ?? []),
      ]),
    ];
    await this.memory.record(user.id, orgId, {
      kind: 'submission_graded',
      note: `Graded "${exercise.title}" (${practice.kind}): ${score10}/10 ${decision}${weak.length ? `; missed: ${weak.join(', ')}` : ''}${tools.length ? `; tools named: ${tools.join(', ')}` : ''}${feedback.tryNext ? `; next time: ${feedback.tryNext.slice(0, 140)}` : ''}${promotion ? `; promoted to L${promotion.newRung}` : ''}.`,
      data: {
        tools,
        exerciseTitle: exercise.title,
        score: grade.score,
        score10,
        decision: grade.decision,
        missed: weak,
        tryNext: feedback.tryNext,
        practiceKind: practice.kind,
        workSurface: exercise.workSurface,
      },
    });
    if (tools.length) await this.memory.noteSystems(user.id, orgId, tools);

    let nextUp = await this.coach.nextUp(user.id);
    if (grade.decision === 'pass' && !nextUp) {
      try {
        nextUp = await this.coach.generateNextExercise(user, orgId);
      } catch {
        nextUp = null;
      }
    }
    if (grade.decision === 'revise') nextUp = exercise; // the learner's current task is still this one

    return {
      feedback,
      score10,
      decision,
      ...(agreement ? { agreement } : {}),
      submission: toSubmissionView(submission, gradeView),
      grade: gradeView,
      exercise: await this.detail(exercise),
      nextUp: nextUp ? toExerciseSummary(nextUp) : null,
      ...(promotion ? { promotion: { newRung: promotion.newRung } } : {}),
    };
  }

  @Post('exercises/:id/skip')
  async skip(
    @CurrentUser() user: Person,
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Body() dto: SkipDto,
  ): Promise<{ ok: true; nextUp: ExerciseSummary | null; escalated: boolean }> {
    const exercise = await this.loadExercise(id, user, orgId, 'edit');
    if (exercise.status === 'passed')
      throw new ConflictException('A passed exercise cannot be skipped.');
    const { escalated, nextUp } = await this.coach.skip(
      exercise,
      user,
      orgId,
      dto.reason,
      dto.note,
    );
    return {
      ok: true,
      nextUp: nextUp ? toExerciseSummary(nextUp) : null,
      escalated,
    };
  }

  @Post('exercises/:id/open-in-claude')
  @ApiOperation({
    summary: 'Retired (410). Every practice item runs in the app.',
  })
  openInClaude(): never {
    throw new GoneException(
      'Retired: practice runs in the app now; use POST /exercises/:id/run.',
    );
  }

  // ───────────────────────── revisits ─────────────────────────

  @Get('revisits')
  async listRevisits(
    @CurrentUser() user: Person,
    @Query('due') due?: string,
  ): Promise<RevisitSummary[]> {
    return this.revisits.dueFor(user.id, due === 'all' ? 'all' : 'today');
  }

  @Post('revisits/:id/answer')
  async answerRevisit(
    @CurrentUser() user: Person,
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Body() dto: AnswerDto,
  ) {
    const revisit = await this.revisits.findForPerson(id, user.id);
    if (revisit.doneAt)
      throw new ConflictException('This revisit has already been answered.');
    return this.revisits.answer(revisit, dto.response.trim(), orgId);
  }

  // ───────────────────────── history / mastery / catalog / skills ─────────────────────────

  @Get('history')
  async history(@CurrentUser() user: Person): Promise<{
    items: { exercise: ExerciseSummary; submission: SubmissionView }[];
  }> {
    const submissions = await this.submissions.find({
      where: { personId: user.id },
      order: { submittedAt: 'DESC' },
    });
    if (submissions.length === 0) return { items: [] };
    const [exercises, grades] = await Promise.all([
      this.exercises.find({
        where: { id: In([...new Set(submissions.map((s) => s.exerciseId))]) },
      }),
      this.grades.find({
        where: { submissionId: In(submissions.map((s) => s.id)) },
      }),
    ]);
    const exerciseById = new Map(exercises.map((e) => [e.id, e]));
    const gradeViews = await this.gradeViewsBySubmission(grades);
    return {
      items: submissions
        .filter((s) => exerciseById.has(s.exerciseId))
        .map((s) => ({
          exercise: toExerciseSummary(
            exerciseById.get(s.exerciseId) as Exercise,
          ),
          submission: toSubmissionView(s, gradeViews.get(s.id) ?? null),
        })),
    };
  }

  @Get('mastery/:personId')
  @ApiOperation({
    summary:
      'Competency views and 30 days of snapshots for a person (self, champion of team, sponsor/admin/lead).',
  })
  async masteryFor(
    @CurrentUser() user: Person,
    @OrgId() orgId: string,
    @Param('personId') personId: string,
  ): Promise<MasteryResponse> {
    const target = await this.resolveViewablePerson(user, orgId, personId);
    const [report, snapshots] = await Promise.all([
      this.mastery.report(target.id),
      this.mastery.snapshots30d(target.id),
    ]);
    return { competencies: report.competencies, snapshots };
  }

  @Get('competencies')
  async catalog() {
    const rows = await this.competencies.find({ order: { orderIndex: 'ASC' } });
    if (rows.length) return rows;
    return COMPETENCY_CATALOG.map((c) => ({ id: c.code, ...c }));
  }

  @Get('my-skills')
  async mySkills(
    @CurrentUser() user: Person,
    @OrgId() orgId: string,
  ): Promise<MySkillsResponse> {
    return this.ladder.mySkills(user, orgId);
  }

  // ───────────────────────── helpers ─────────────────────────

  private async loadExercise(
    id: string,
    user: Person,
    orgId: string | null,
    access: 'view' | 'edit',
  ): Promise<Exercise> {
    const exercise = await this.exercises.findOne({ where: { id } });
    if (!exercise) throw new NotFoundException('Exercise not found');
    if (exercise.personId !== user.id) {
      if (access === 'edit')
        throw new ForbiddenException(
          'Only the learner can work on their own exercise.',
        );
      await this.resolveViewablePerson(user, orgId, exercise.personId);
    }
    return exercise;
  }

  /** self, champion of the person's team, or sponsor/admin/lead; the person must be in the effective org. */
  async resolveViewablePerson(
    user: Person,
    orgId: string | null,
    personId?: string,
  ): Promise<Person> {
    if (!personId || personId === user.id || personId === 'me') return user;
    const target = await this.people.findOne({ where: { id: personId } });
    if (!target || (orgId && target.orgId !== orgId))
      throw new NotFoundException('Person not found in this org');
    if (
      user.roles.some((r) => r === 'lead' || r === 'admin' || r === 'sponsor')
    )
      return target;
    if (user.roles.includes('champion')) {
      if (target.teamId && target.teamId === user.teamId) return target;
      const team = target.teamId
        ? await this.teams.findOne({ where: { id: target.teamId } })
        : null;
      if (team?.championPersonId === user.id) return target;
    }
    throw new ForbiddenException(
      "You can only view your own learning data, or your team's as its champion.",
    );
  }

  private async boundaryForPerson(personId: string) {
    const person = await this.people.findOne({ where: { id: personId } });
    return this.grader.orgBoundary(person?.orgId ?? null);
  }

  async detail(exercise: Exercise): Promise<ExerciseDetail> {
    const submissions = await this.submissions.find({
      where: { exerciseId: exercise.id },
      order: { attempt: 'ASC' },
    });
    const grades = submissions.length
      ? await this.grades.find({
          where: { submissionId: In(submissions.map((s) => s.id)) },
        })
      : [];
    const gradeViews = await this.gradeViewsBySubmission(grades);
    const [skill, workflow] = await Promise.all([
      exercise.skillId
        ? this.skills.findOne({ where: { id: exercise.skillId } })
        : null,
      exercise.workflowMapId
        ? this.workflows.findOne({ where: { id: exercise.workflowMapId } })
        : null,
    ]);
    const { draftExpectation: _legacyDraft, ...starterRest } =
      exercise.starter ?? {};
    void _legacyDraft;
    const practice = practiceOf(exercise, workflow?.name ?? null);
    // The tools this person told us they work in, offered as connectors in the practice composer.
    const owner = await this.people.findOne({
      where: { id: exercise.personId },
    });
    const connectors = owner
      ? await this.coach.connectorsFor(owner, owner.orgId ?? null)
      : [];
    return {
      ...toExerciseSummary(exercise),
      practice,
      connectors,
      hints: exercise.hints.slice(0, exercise.hintsRevealed),
      hintsRevealed: exercise.hintsRevealed,
      hintsTotal: exercise.hints.length,
      workedExample: submissions.length > 0 ? exercise.workedExample : null,
      starter: { ...starterRest, practice },
      submissions: submissions.map((s) =>
        toSubmissionView(s, gradeViews.get(s.id) ?? null),
      ),
      ...(skill
        ? { skill: await this.ladder.skillCard(skill, exercise.personId) }
        : {}),
      ...(workflow
        ? { workflow: await this.ladder.workflowSummary(workflow) }
        : {}),
      coachIntro: this.coach.coachIntro(exercise, submissions.length),
      dataReminder: dataReminder(
        await this.boundaryForPerson(exercise.personId),
      ),
    };
  }

  private async gradeViewsBySubmission(
    grades: Grade[],
  ): Promise<Map<string, GradeView>> {
    const bySubmission = new Map<string, Grade[]>();
    for (const g of grades) {
      if (!g.submissionId) continue;
      bySubmission.set(g.submissionId, [
        ...(bySubmission.get(g.submissionId) ?? []),
        g,
      ]);
    }
    const graderIds = [
      ...new Set(
        grades
          .map((g) => g.gradedByPersonId)
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const graders = graderIds.length
      ? await this.refs.refs(
          await this.people.find({ where: { id: In(graderIds) } }),
        )
      : [];
    const graderById = new Map(graders.map((r) => [r.id, r]));
    const out = new Map<string, GradeView>();
    for (const [submissionId, list] of bySubmission) {
      const g = gradeOfRecord(list);
      if (g)
        out.set(
          submissionId,
          toGradeView(
            g,
            g.gradedByPersonId
              ? (graderById.get(g.gradedByPersonId) ?? null)
              : null,
          ),
        );
    }
    return out;
  }
}
