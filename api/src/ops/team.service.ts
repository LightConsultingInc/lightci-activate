import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isoDay } from '../common/dates';
import { hasAnyRole } from '../common/roles.guard';
import type { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { Exercise } from '../learning/entities/exercise.entity';
import { Grade, type RubricScore } from '../learning/entities/grade.entity';
import { Submission } from '../learning/entities/submission.entity';
import { AuditLog } from './entities/audit-log.entity';
import {
  activeInWindow,
  addDaysIso,
  activeDaysCount,
  lastActiveDay,
  mean,
  MetricsService,
  personHoursBack,
  round,
  rungDistribution,
  stalledFor,
  teamHoursBack,
  type OrgFacts,
} from './metrics.service';
import {
  backlogRank,
  exerciseSummary,
  gradeView,
  personById,
  personRef,
  promotionView,
  skillCard,
  submissionView,
  workflowSummary,
} from './shape';
import type {
  GradeView,
  PromotionView,
  RosterEntry,
  TeamView,
} from './ops.types';

export interface ChampionGradeInput {
  rubric: RubricScore[];
  feedback: string;
  decision: 'pass' | 'revise';
}

@Injectable()
export class TeamService {
  constructor(
    private readonly metrics: MetricsService,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(Submission)
    private readonly submissions: Repository<Submission>,
    @InjectRepository(Exercise)
    private readonly exercises: Repository<Exercise>,
    @InjectRepository(Grade) private readonly grades: Repository<Grade>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
  ) {}

  /** Which team the caller may look at: their own by default; any team in the org for sponsor/admin/lead. */
  async resolveTeam(
    orgId: string,
    user: Person,
    teamId?: string | null,
  ): Promise<Team> {
    const wide = hasAnyRole(user, ['sponsor', 'admin']);
    const id = teamId ?? user.teamId ?? null;
    let team: Team | null = null;
    if (id) team = await this.teams.findOne({ where: { id, orgId } });
    if (!team && wide)
      team =
        (await this.teams.findOne({
          where: { orgId },
          order: { name: 'ASC' },
        })) ?? null;
    if (!team) throw new NotFoundException('No team found for this request.');
    const isChampionOf = team.championPersonId === user.id;
    if (!wide && team.id !== user.teamId && !isChampionOf)
      throw new ForbiddenException('You may only view your own team.');
    return team;
  }

  async view(
    orgId: string,
    user: Person,
    teamId?: string | null,
  ): Promise<TeamView> {
    const team = await this.resolveTeam(orgId, user, teamId);
    const f = await this.metrics.load(orgId); // whole org: promotions/skills join across teams
    const roster = f.people
      .filter((p) => p.teamId === team.id)
      .map((p) => this.rosterEntry(f, p));
    const memberIds = new Set(roster.map((r) => r.id));

    const backlogTop = backlogRank(
      f.workflows
        .filter((w) => w.teamId === team.id)
        .map((w) => workflowSummary(w, f, user.id)),
    ).slice(0, 5);

    const reviewQueue = f.submissions
      .filter((s) => memberIds.has(s.personId))
      .map((s) => ({ s, e: f.exercises.find((e) => e.id === s.exerciseId) }))
      .filter(
        ({ s, e }) =>
          e && this.awaitingChampion(f, s, e, team.championPersonId),
      )
      .map(({ s, e }) => ({
        submission: submissionView(s, f),
        exercise: exerciseSummary(e!),
        person: personById(f, s.personId)!,
      }))
      .sort(
        (a, b) =>
          a.submission.submittedAt.getTime() -
          b.submission.submittedAt.getTime(),
      );

    const teamSkillIds = new Set(
      f.skills.filter((s) => s.teamId === team.id).map((s) => s.id),
    );
    const promotionQueue = f.promotions
      .filter((p) => p.decision === 'pending' && teamSkillIds.has(p.skillId))
      .map((p) => promotionView(p, f, user.id))
      .filter((p): p is PromotionView => Boolean(p));

    const library = f.skills
      .filter((s) => s.teamId === team.id && s.status !== 'deprecated')
      .map((s) => skillCard(s, f, user.id));

    const today = isoDay(f.now);
    const active7 = activeInWindow(
      f.activeDays.filter((a) => memberIds.has(a.personId)),
      today,
      7,
    ).size;
    const hb = teamHoursBack(f, team.id);
    return {
      team: {
        id: team.id,
        name: team.name,
        slug: team.slug,
        plugin: team.pluginName,
        champion: personById(f, team.championPersonId),
      },
      roster,
      backlogTop,
      reviewQueue,
      promotionQueue,
      library,
      stats: {
        activePct7d: roster.length ? round(active7 / roster.length) : 0,
        rungDistribution: rungDistribution(roster.map((r) => r.rung)),
        hoursBackPerWeek: hb.measuredTasks
          ? round(hb.minutesBackPerWeek / 60, 1)
          : 0,
        hasBaseline: hb.measuredTasks > 0,
        skillsPublished: library.filter((s) => s.status === 'published').length,
        promotionsPending: promotionQueue.length,
      },
    };
  }

  /**
   * A submission waits on the champion when it is the latest attempt, nobody has champion-graded
   * it, and either the Grader has not produced a decision yet (`submitted`/`graded`) or the
   * exercise is L3+ (the Grader's `passed`/`revise` is only a draft there; the champion's read
   * counts). The champion's own submissions are their L5 work and never sit in their own queue.
   */
  private awaitingChampion(
    f: OrgFacts,
    s: Submission,
    e: Exercise,
    championId: string | null,
  ): boolean {
    if (championId && s.personId === championId) return false;
    const graderOnly = e.status === 'submitted' || e.status === 'graded';
    const drafted = e.status === 'passed' || e.status === 'revise';
    if (!graderOnly && !(drafted && e.rung >= 3)) return false;
    const championGraded = f.grades.some(
      (g) => g.submissionId === s.id && g.gradedByPersonId,
    );
    if (championGraded) return false;
    // latest attempt only
    const latest = f.submissions
      .filter((x) => x.exerciseId === e.id)
      .sort((a, b) => b.attempt - a.attempt)[0];
    if (latest && latest.id !== s.id) return false;
    return graderOnly || e.rung >= 3;
  }

  rosterEntry(f: OrgFacts, p: Person): RosterEntry {
    const today = isoDay(f.now);
    const hb = personHoursBack(f, p.id);
    const stalled = stalledFor(f, p);
    const latestMastery = new Map<string, number>();
    for (const s of f.masterySnapshots)
      if (s.personId === p.id && !latestMastery.has(s.competencyCode))
        latestMastery.set(s.competencyCode, s.mastery);
    const baseline = f.baselines
      .filter((b) => b.personId === p.id)
      .reduce((s, b) => s + b.minutesPerWeek + b.reworkMinutesPerWeek, 0);
    return {
      ...personRef(p, f),
      lastActiveOnRealWork: lastActiveDay(f, p.id),
      hoursBackPerWeek: hb.measuredTasks
        ? round(hb.minutesBackPerWeek / 60, 1)
        : 0,
      baselineMinutesPerWeek: baseline,
      hasBaseline: f.baselines.some((b) => b.personId === p.id),
      hasMeasurement: hb.measuredTasks > 0,
      stalled: stalled.stalled,
      stalledDays: stalled.stalledDays,
      stalledReason: stalled.reason,
      slaDueAt: stalled.slaDueAt,
      revisitsOverdue: f.revisits.filter(
        (r) => r.personId === p.id && !r.doneAt && r.dueAt < f.now,
      ).length,
      activeDays30: activeDaysCount(
        f.activeDays,
        p.id,
        addDaysIso(today, -29),
        today,
      ),
      masteryAvg: latestMastery.size
        ? round(mean([...latestMastery.values()]))
        : 0,
      hasMastery: latestMastery.size > 0,
    };
  }

  /** Champion grading (their L5 exercise). Records agreement with the Grader's own draft when one exists. */
  async gradeSubmission(
    orgId: string,
    user: Person,
    submissionId: string,
    input: ChampionGradeInput,
  ): Promise<GradeView> {
    if (!Array.isArray(input.rubric) || input.rubric.length === 0)
      throw new BadRequestException('rubric must have at least one criterion');
    if (input.decision !== 'pass' && input.decision !== 'revise')
      throw new BadRequestException('decision must be pass or revise');
    const submission = await this.submissions.findOne({
      where: { id: submissionId },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    const f = await this.metrics.load(orgId);
    const author = f.people.find((p) => p.id === submission.personId);
    if (!author) throw new NotFoundException('Submission is not in this org');
    if (!hasAnyRole(user, ['sponsor', 'admin'])) {
      const team = author.teamId
        ? f.teams.find((t) => t.id === author.teamId)
        : null;
      if (
        !team ||
        (team.championPersonId !== user.id && team.id !== user.teamId)
      )
        throw new ForbiddenException('You may only grade your own team.');
    }
    if (author.id === user.id)
      throw new ForbiddenException('You cannot grade your own submission.');

    const score = round(
      mean(
        input.rubric.map((r) => Math.min(1, Math.max(0, Number(r.score) || 0))),
      ),
    );
    const draft =
      f.grades
        .filter((g) => g.submissionId === submission.id && !g.gradedByPersonId)
        .sort((a, b) => b.gradedAt.getTime() - a.gradedAt.getTime())[0] ?? null;
    const grade = await this.grades.save(
      this.grades.create({
        submissionId: submission.id,
        skillVersionId: null,
        personId: submission.personId,
        rubric: input.rubric.map((r) => ({
          criterion: r.criterion,
          label: r.label ?? r.criterion,
          score: Number(r.score) || 0,
          note: r.note ?? '',
        })),
        score,
        feedback: input.feedback ?? '',
        decision: input.decision,
        critiqueQuality: draft?.critiqueQuality ?? null,
        expectationAccuracy: draft?.expectationAccuracy ?? null,
        securityFindings: [],
        teachingMoment: null,
        graderVersion: 'champion',
        model: null,
        gradedByPersonId: user.id,
      }),
    );
    const exercise = f.exercises.find((e) => e.id === submission.exerciseId);
    if (exercise) {
      await this.exercises.update(exercise.id, {
        status: input.decision === 'pass' ? 'passed' : 'revise',
        completedAt: input.decision === 'pass' ? new Date() : null,
      });
    }
    const agreement = draft
      ? {
          draftGradeId: draft.id,
          scoreDelta: round(score - draft.score),
          decisionMatch: draft.decision === input.decision,
          withinTolerance:
            Math.abs(score - draft.score) <= 0.1 &&
            draft.decision === input.decision,
        }
      : null;
    await this.audit.save(
      this.audit.create({
        orgId,
        actorPersonId: user.id,
        action: 'review.graded',
        subjectType: 'submission',
        subjectId: submission.id,
        meta: {
          gradeId: grade.id,
          personId: submission.personId,
          exerciseId: submission.exerciseId,
          score,
          decision: input.decision,
          agreement,
        },
      }),
    );
    f.grades.unshift(grade);
    return gradeView(grade, f);
  }
}
