import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClaudeEnterpriseService } from '../claude-enterprise/claude-enterprise.service';
import { DAY_MS, isoDay } from '../common/dates';
import { hasAnyRole } from '../common/roles.guard';
import { IntegrationsService } from '../orgs/integrations.service';
import type { Person } from '../orgs/entities/person.entity';
import { settingsOf } from '../orgs/org-settings';
import { SkillAssignment } from '../skills/entities/skill-assignment.entity';
import { AuditLog } from './entities/audit-log.entity';
import { CostInput } from './entities/cost-input.entity';
import { computeCost, type ReturnFacts } from './cost-math';
import { ladderLite } from './ladder-lite';
import {
  activationScores,
  activeDaysCount,
  activeInWindow,
  addDaysIso,
  bucketedActive,
  cohorts,
  dailyActive,
  funnel,
  funnelInputs,
  gradeQuality,
  hoursBack,
  influenceOf,
  isChampionCandidate,
  lastActiveDay,
  learners,
  markRising,
  MetricsService,
  personHoursBack,
  queueAgeDays,
  reworkRate,
  revisitCompliance,
  round,
  rungDistribution,
  rungGains,
  skillsPublishedBy,
  stalledFor,
  teamHoursBack,
  timeInRung,
  trendOf,
  type OrgFacts,
} from './metrics.service';
import {
  backlogRank,
  personById,
  personRef,
  skillCard,
  workflowSummary,
} from './shape';
import type {
  AdoptionView,
  BacklogTotals,
  CostView,
  GovernanceEvent,
  GovernanceView,
  GroupRow,
  JourneyEvent,
  JourneyView,
  McBacklogView,
  PeopleEntry,
  PersonPage,
  SkillCard,
  SkillsView,
} from './ops.types';

export type PeopleSort =
  | 'score'
  | 'rung'
  | 'hoursBack'
  | 'skillsPublished'
  | 'influence'
  | 'gradeQuality'
  | 'activeDays'
  | 'name';

@Injectable()
export class MissionControlService {
  private readonly logger = new Logger(MissionControlService.name);

  constructor(
    private readonly metrics: MetricsService,
    private readonly integrations: IntegrationsService,
    private readonly claude: ClaudeEnterpriseService,
    @InjectRepository(CostInput)
    private readonly costInputs: Repository<CostInput>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
    @InjectRepository(SkillAssignment)
    private readonly assignments: Repository<SkillAssignment>,
  ) {}

  // ---------------------------------------------------------------- adoption

  async adoption(
    orgId: string,
    opts: { teamId?: string | null; range?: '30d' | '90d' },
  ): Promise<AdoptionView> {
    const days = opts.range === '90d' ? 90 : 30;
    const f = await this.metrics.load(orgId, { usageDays: days + 35 });
    const scope = opts.teamId
      ? f.people.filter((p) => p.teamId === opts.teamId)
      : f.people;
    const ids = new Set(scope.map((p) => p.id));
    const snaps = f.activeDays.filter((a) => ids.has(a.personId));
    const today = isoDay(f.now);
    const from = addDaysIso(today, -(days - 1));
    const seats = opts.teamId
      ? scope.length
      : Math.max(f.org.seats, scope.length);

    const daily = dailyActive(snaps, from, today, seats);
    const weekly = bucketedActive(
      snaps,
      addDaysIso(from, -7),
      today,
      seats,
      'week',
    );
    const monthly = bucketedActive(
      snaps,
      addDaysIso(from, -30),
      today,
      seats,
      'month',
    );
    const wau = activeInWindow(snaps, today, 7).size;
    const completeWeeks = weekly.filter((w) => addDaysIso(w.day, 6) <= today);
    const active = {
      daily,
      weekly,
      monthly,
      pctOfSeats: seats ? round(wau / seats) : 0,
      trend: trendOf(completeWeeks.length >= 2 ? completeWeeks : weekly),
    };

    const usage = f.usage.filter((u) => ids.has(u.personId) && u.day >= from);
    const activeIds = new Set(
      usage.filter((u) => u.metrics.activeOnRealWork).map((u) => u.personId),
    );
    const sessions = usage.reduce(
      (n, u) =>
        n +
        (u.metrics.codeSessions ?? 0) +
        (u.metrics.coworkSessions ?? 0) +
        ((u.metrics.messages ?? 0) > 0 ? 1 : 0),
      0,
    );
    const surfaceUsers = (
      pick: (m: (typeof usage)[number]['metrics']) => boolean,
    ) =>
      new Set(usage.filter((u) => pick(u.metrics)).map((u) => u.personId)).size;
    const depth = {
      sessionsPerActive: activeIds.size
        ? round(sessions / activeIds.size, 1)
        : 0,
      surfaces: [
        { name: 'chat', users: surfaceUsers((m) => (m.messages ?? 0) > 0) },
        {
          name: 'projects',
          users: surfaceUsers((m) => (m.projectsUsed ?? 0) > 0),
        },
        { name: 'code', users: surfaceUsers((m) => (m.codeSessions ?? 0) > 0) },
        {
          name: 'cowork',
          users: surfaceUsers((m) => (m.coworkSessions ?? 0) > 0),
        },
      ],
      connectors: usage.reduce(
        (n, u) => n + (u.metrics.connectorsUsed ?? 0),
        0,
      ),
      skillsActivated: usage.reduce(
        (n, u) => n + (u.metrics.skillActivations ?? 0),
        0,
      ),
    };

    const scopedFacts: OrgFacts = { ...f, people: scope };
    const inactiveSeats = scope
      .filter(
        (p) =>
          !activeInWindow(
            snaps.filter((a) => a.personId === p.id),
            today,
            30,
          ).has(p.id),
      )
      .map((p) => {
        const last = lastActiveDay(f, p.id);
        return {
          ...personRef(p, f),
          daysInactive: last
            ? Math.floor((Date.parse(today) - Date.parse(last)) / DAY_MS)
            : null,
        };
      })
      .sort((a, b) => (b.daysInactive ?? 9999) - (a.daysInactive ?? 9999));

    const byTeam = f.teams
      .filter((t) => !opts.teamId || t.id === opts.teamId)
      .map((t) => {
        const members = f.people.filter((p) => p.teamId === t.id);
        const mids = new Set(members.map((m) => m.id));
        const tw = activeInWindow(
          f.activeDays.filter((a) => mids.has(a.personId)),
          today,
          7,
        ).size;
        const hb = teamHoursBack(f, t.id);
        return {
          teamId: t.id,
          teamName: t.name,
          activePct: members.length ? round(tw / members.length) : 0,
          hoursBack: hb.measuredTasks ? round(hb.minutesBackPerWeek / 60, 1) : 0,
          hasBaseline: hb.measuredTasks > 0,
        };
      });

    const sources = new Set(
      f.usage.filter((u) => ids.has(u.personId)).map((u) => u.source),
    );
    const source: AdoptionView['source'] =
      sources.size === 0
        ? 'none'
        : sources.size > 1
          ? 'mixed'
          : [...sources][0];
    return {
      active,
      depth,
      funnel: funnel(funnelInputs(scopedFacts)),
      inactiveSeats,
      byTeam,
      source,
    };
  }

  // ---------------------------------------------------------------- people

  async people(
    orgId: string,
    sort: PeopleSort = 'score',
  ): Promise<{ people: PeopleEntry[] }> {
    const f = await this.metrics.load(orgId, { usageDays: 70 });
    const rows = this.peopleRows(f);
    const cmp: Record<PeopleSort, (a: PeopleEntry, b: PeopleEntry) => number> =
      {
        score: (a, b) =>
          b.activationScore.composite - a.activationScore.composite,
        rung: (a, b) => b.rung - a.rung,
        hoursBack: (a, b) =>
          (b.hoursBackPerWeek ?? -1) - (a.hoursBackPerWeek ?? -1),
        skillsPublished: (a, b) => b.skillsPublished - a.skillsPublished,
        influence: (a, b) => b.adoptedByOthers - a.adoptedByOthers,
        gradeQuality: (a, b) => (b.gradeQuality ?? -1) - (a.gradeQuality ?? -1),
        activeDays: (a, b) => b.activeDays30 - a.activeDays30,
        name: (a, b) => a.name.localeCompare(b.name),
      };
    rows.sort(cmp[sort] ?? cmp.score);
    return { people: rows };
  }

  /** Ranking rows: learners only (a sponsor/admin who is not on the ladder is not ranked). */
  peopleRows(f: OrgFacts): PeopleEntry[] {
    const today = isoDay(f.now);
    const people = learners(f);
    const raw = people.map((p) => {
      const hb = personHoursBack(f, p.id);
      return {
        id: p.id,
        rung: f.rungs.get(p.id) ?? 0,
        hasBaseline: hb.measuredTasks > 0,
        hoursBackPerWeek: hb.measuredTasks
          ? round(hb.minutesBackPerWeek / 60, 1)
          : null,
        skillsPublished: skillsPublishedBy(f, p.id),
        influence: influenceOf(f, p.id),
        gradeQuality: gradeQuality(f, p.id),
        activeDays30: activeDaysCount(
          f.activeDays,
          p.id,
          addDaysIso(today, -29),
          today,
        ),
      };
    });
    const scores = activationScores(raw);
    // Rising is judged among people still in the program; inactive seats cannot be rising.
    const rising = markRising(
      rungGains(
        f.placements,
        people.filter((p) => p.status !== 'inactive').map((p) => p.id),
        f.now,
        30,
      ),
    );
    return people.map((p, i) => {
      const r = raw[i];
      const score = scores.get(p.id)!;
      const stalled = stalledFor(f, p);
      return {
        ...personRef(p, f),
        activationScore: score,
        hoursBackPerWeek: r.hoursBackPerWeek ?? 0,
        hasBaseline: r.hasBaseline,
        skillsPublished: r.skillsPublished,
        adoptedByOthers: r.influence,
        gradeQuality: r.gradeQuality ?? 0,
        hasGrades: r.gradeQuality !== null,
        activeDays30: r.activeDays30,
        rising: rising.has(p.id),
        stalled: stalled.stalled,
        stalledReason: stalled.reason,
        stalledSince: stalled.stalledSince,
        slaDueAt: stalled.slaDueAt,
        championCandidate: isChampionCandidate(score, r.rung, r.influence),
      };
    });
  }

  async person(
    orgId: string,
    personId: string,
    viewer?: Person,
  ): Promise<PersonPage> {
    const f = await this.metrics.load(orgId, { usageDays: 120 });
    const person = f.people.find((p) => p.id === personId);
    if (!person) throw new NotFoundException('Person not found in this org');
    if (viewer && !hasAnyRole(viewer, ['sponsor', 'admin'])) {
      const team = person.teamId
        ? f.teams.find((t) => t.id === person.teamId)
        : null;
      const sameTeam = Boolean(person.teamId) && person.teamId === viewer.teamId;
      const championOf = team?.championPersonId === viewer.id;
      if (person.id !== viewer.id && !sameTeam && !championOf)
        throw new ForbiddenException(
          'You may only view people on your own team.',
        );
    }
    const journey: JourneyEvent[] = [];
    for (const pl of f.placements.filter((x) => x.personId === personId))
      journey.push({
        at: pl.placedAt,
        type: 'placement',
        title: `Placed at L${pl.rung}`,
        detail: `by ${pl.by}`,
      });
    for (const e of f.exercises.filter((x) => x.personId === personId))
      journey.push({
        at: e.completedAt ?? e.createdAt,
        type: 'exercise',
        title: e.title,
        detail: `L${e.rung} ${e.kind} · ${e.status}`,
      });
    for (const g of f.grades.filter((x) => x.personId === personId)) {
      const sub = f.submissions.find((s) => s.id === g.submissionId);
      const ex = sub
        ? f.exercises.find((e) => e.id === sub.exerciseId)
        : undefined;
      journey.push({
        at: g.gradedAt,
        type: 'grade',
        title: `${g.decision === 'pass' ? 'Passed' : 'Revise'}: ${ex?.title ?? 'skill grade'}`,
        detail: `score ${round(g.score, 2)}${g.gradedByPersonId ? ' (champion)' : ''}`,
      });
    }
    for (const s of f.skills.filter((x) => x.ownerPersonId === personId))
      journey.push({
        at: s.publishedAt ?? s.createdAt,
        type: 'skill',
        title: `${s.status === 'published' ? 'Published' : 'Drafted'} skill ${s.name}`,
        detail: `v${s.currentVersion} · ${s.plugin}`,
      });
    for (const m of f.measurements.filter((x) => x.personId === personId)) {
      const b =
        f.baselines.find((x) => x.id === m.baselineId) ??
        f.baselines.find((x) => x.personId === personId && x.task === m.task);
      const back = b
        ? round(
            (b.minutesPerWeek +
              b.reworkMinutesPerWeek -
              m.minutesPerWeek -
              m.reworkMinutesPerWeek) /
              60,
            1,
          )
        : null;
      journey.push({
        at: m.createdAt,
        type: 'measurement',
        title: `Measured ${m.task}`,
        detail:
          back === null
            ? 'no baseline to compare'
            : `${back} h/wk back vs baseline ${b!.id}`,
      });
    }
    const escalations = f.escalations.filter(
      (e) => e.subjectType === 'person' && e.subjectId === personId,
    );
    for (const e of escalations)
      journey.push({
        at: e.createdAt,
        type: 'escalation',
        title: `${e.kind} from ${e.sourceAgent}`,
        detail: e.reason,
      });
    journey.sort((a, b) => b.at.getTime() - a.at.getTime());

    const today = isoDay(f.now);
    const from = addDaysIso(today, -89);
    const usageSeries = f.usage
      .filter((u) => u.personId === personId && u.day >= from)
      .sort((a, b) => (a.day < b.day ? -1 : 1))
      .map((u) => ({
        day: u.day,
        activeOnRealWork: Boolean(u.metrics.activeOnRealWork),
        messages: u.metrics.messages ?? 0,
      }));

    return {
      person: personRef(person, f),
      ladder: ladderLite(f, person),
      journey,
      baselines: f.baselines.filter((b) => b.personId === personId),
      measurements: f.measurements.filter((m) => m.personId === personId),
      usageSeries,
      coachNotes: f.notes
        .filter((n) => n.personId === personId)
        .map((n) => ({
          id: n.id,
          note: n.note,
          tags: n.tags,
          author: n.author,
          createdAt: n.createdAt,
        })),
      escalations,
    };
  }

  // ---------------------------------------------------------------- journey

  async journey(orgId: string): Promise<JourneyView> {
    const f = await this.metrics.load(orgId, { usageDays: 30 });
    const heatmap = f.teams.map((t) => ({
      teamId: t.id,
      teamName: t.name,
      counts: rungDistribution(
        f.people
          .filter((p) => p.teamId === t.id)
          .map((p) => f.rungs.get(p.id) ?? 0),
      ),
    }));
    const stuckAfter = Math.max(45, f.stalledAfterDays * 3);
    // Cohorts and time-in-rung describe learners; a sponsor's L0 seat is not a stuck learner.
    const ladderPeople = learners(f);
    const ladderIds = new Set(ladderPeople.map((p) => p.id));
    const tir = timeInRung(
      f.placements
        .filter((p) => ladderIds.has(p.personId))
        .map((p) => ({
          personId: p.personId,
          rung: p.rung,
          placedAt: p.placedAt,
        })),
      f.now,
      stuckAfter,
    );
    const teamOf = new Map(f.people.map((p) => [p.id, p.teamId]));
    const compliance = revisitCompliance(
      f.revisits.map((r) => ({
        teamId: teamOf.get(r.personId) ?? null,
        dueAt: r.dueAt,
        doneAt: r.doneAt,
      })),
      f.now,
    );
    return {
      heatmap,
      cohorts: cohorts(
        ladderPeople.map((p) => ({
          cohortWeek: p.cohortWeek,
          rung: f.rungs.get(p.id) ?? 0,
        })),
      ),
      timeInRung: tir.map((r) => ({
        rung: r.rung,
        medianDays: r.medianDays,
        sampled: r.sampled,
        p90Days: r.p90Days,
        stuck: r.stuckPersonIds
          .map((id) => personById(f, id))
          .filter((x): x is NonNullable<typeof x> => Boolean(x)),
      })),
      revisitCompliance: f.teams.map((t) => ({
        teamId: t.id,
        teamName: t.name,
        due: compliance.get(t.id)?.due ?? 0,
        done: compliance.get(t.id)?.done ?? 0,
      })),
    };
  }

  // ---------------------------------------------------------------- groups

  async groups(orgId: string): Promise<{ groups: GroupRow[] }> {
    const f = await this.metrics.load(orgId, { usageDays: 30 });
    return { groups: f.teams.map((t) => this.groupRow(f, t.id)) };
  }

  groupRow(f: OrgFacts, teamId: string): GroupRow {
    const team = f.teams.find((t) => t.id === teamId)!;
    const members = f.people.filter((p) => p.teamId === teamId);
    const ids = new Set(members.map((m) => m.id));
    const today = isoDay(f.now);
    const wau = activeInWindow(
      f.activeDays.filter((a) => ids.has(a.personId)),
      today,
      7,
    ).size;
    const hb = teamHoursBack(f, teamId);
    const teamSkills = f.skills.filter((s) => s.teamId === teamId);
    const since = new Date(f.now.getTime() - 30 * DAY_MS);
    const teamSkillIds = new Set(teamSkills.map((s) => s.id));
    const pending = f.promotions.filter(
      (p) => p.decision === 'pending' && teamSkillIds.has(p.skillId),
    );
    const recentGrades = f.grades.filter((g) => ids.has(g.personId) && g.gradedAt >= since);
    return {
      teamId,
      teamName: team.name,
      size: members.length,
      activePct: members.length ? round(wau / members.length) : 0,
      rungMix: rungDistribution(members.map((m) => f.rungs.get(m.id) ?? 0)),
      hoursBackPerPerson: hb.measuredTasks && members.length ? round(hb.minutesBackPerWeek / 60 / members.length, 2) : 0,
      hasBaseline: hb.measuredTasks > 0,
      skillsPublished: teamSkills.filter((s) => s.status === 'published')
        .length,
      skillsAdopted: f.adoptions.filter((a) => ids.has(a.personId)).length,
      promotionThroughput: f.promotions.filter(
        (p) =>
          p.decision === 'merged' &&
          teamSkillIds.has(p.skillId) &&
          p.decidedAt &&
          p.decidedAt >= since,
      ).length,
      reworkRate: reworkRate(recentGrades.map((g) => g.decision)),
      hasGrades: recentGrades.length > 0,
      championQueueAgeDays: queueAgeDays(pending, f.now),
      hasPendingPromotions: pending.length > 0,
    };
  }

  async compare(orgId: string, a: string, b: string) {
    if (!a || !b)
      throw new BadRequestException('a and b team ids are required');
    const f = await this.metrics.load(orgId, { usageDays: 30 });
    if (!f.teams.some((t) => t.id === a) || !f.teams.some((t) => t.id === b))
      throw new NotFoundException('Team not found');
    const norm = (id: string) => {
      const row = this.groupRow(f, id);
      const team = f.teams.find((t) => t.id === id)!;
      const weeks = team.programStartedOn
        ? Math.max(
            1,
            (f.now.getTime() - Date.parse(team.programStartedOn)) /
              (7 * DAY_MS),
          )
        : null;
      const per = (v: number) => (row.size ? round(v / row.size, 3) : 0);
      return {
        ...row,
        programWeeks: weeks ? round(weeks, 1) : null,
        normalised: {
          activePct: row.activePct,
          rungMixPct: row.rungMix.map((c) =>
            row.size ? round(c / row.size) : 0,
          ),
          hoursBackPerPerson: row.hoursBackPerPerson,
          skillsPublishedPerPerson: per(row.skillsPublished),
          skillsAdoptedPerPerson: per(row.skillsAdopted),
          promotionsPerPersonPerWeek: weeks
            ? round(
                row.promotionThroughput /
                  Math.max(1, row.size) /
                  Math.min(weeks, 30 / 7),
                3,
              )
            : per(row.promotionThroughput),
          skillsPublishedPerWeek: weeks
            ? round(row.skillsPublished / weeks, 3)
            : null,
          reworkRate: row.reworkRate,
          championQueueAgeDays: row.championQueueAgeDays,
        },
      };
    };
    return { a: norm(a), b: norm(b) };
  }

  // ---------------------------------------------------------------- skills

  async skills(orgId: string, viewerId?: string | null): Promise<SkillsView> {
    const f = await this.metrics.load(orgId, { usageDays: 30 });
    const cards = f.skills
      .filter((s) => s.status !== 'deprecated')
      .map((s) => skillCard(s, f, viewerId));
    const published = cards.filter((c) => c.status === 'published');
    const byRuns = [...published].sort((a, b) => b.runs30d - a.runs30d);
    const byTeamMap = new Map<
      string | null,
      {
        teamId: string | null;
        teamName: string | null;
        skills: number;
        activations30d: number;
      }
    >();
    for (const c of cards) {
      const key = c.team?.id ?? null;
      const row =
        byTeamMap.get(key) ??
        byTeamMap
          .set(key, {
            teamId: key,
            teamName: c.team?.name ?? null,
            skills: 0,
            activations30d: 0,
          })
          .get(key)!;
      row.skills++;
      row.activations30d += c.runs30d;
    }
    const regradeAfter = new Date(f.now.getTime() - 30 * DAY_MS);
    const regradeQueue = f.skills
      .filter(
        (s) =>
          s.status === 'published' &&
          (!s.lastRegradedAt ||
            s.lastRegradedAt < regradeAfter ||
            (s.latestGradeId &&
              (f.grades.find((g) => g.id === s.latestGradeId)?.score ?? 1) <
                0.8)),
      )
      .map((s) => cards.find((c) => c.id === s.id))
      .filter((c): c is SkillCard => Boolean(c));
    return {
      // Every non-deprecated card with its flags (contract: "SkillCard[] (with health flags)");
      // callers count the library from this and filter for the flagged ones.
      health: cards,
      mostUsed: byRuns.slice(0, 5),
      leastUsed: [...byRuns].reverse().slice(0, 5),
      byTeam: [...byTeamMap.values()],
      unowned: cards.filter((c) => !c.owner || c.health.includes('owner_left')),
      regradeQueue,
    };
  }

  // ---------------------------------------------------------------- governance

  async governance(
    orgId: string,
    viewerId?: string | null,
  ): Promise<GovernanceView> {
    const f = await this.metrics.load(orgId, { usageDays: 30 });
    const settings = settingsOf(f.org);
    const since = new Date(f.now.getTime() - 30 * DAY_MS);

    const log = await this.audit.find({
      where: { orgId },
      order: { createdAt: 'DESC' },
      take: 500,
    });
    const promotionLog = log
      .filter((l) => l.action.startsWith('promotion.'))
      .map((l) => {
        const pr =
          l.subjectType === 'promotion_request'
            ? f.promotions.find((p) => p.id === l.subjectId)
            : undefined;
        const skill = pr
          ? f.skills.find((s) => s.id === pr.skillId)
          : f.skills.find(
              (s) => s.id === (l.meta.skillId as string | undefined),
            );
        const grade = pr?.gradeId
          ? f.grades.find((g) => g.id === pr.gradeId)
          : undefined;
        const approvers = pr
          ? pr.approvals
              .filter((a) => a.decision === 'approve')
              .map((a) => personById(f, a.personId)?.name ?? a.personId)
          : [];
        return {
          at: l.createdAt,
          skill:
            skill?.name ??
            (l.meta.skillName as string | undefined) ??
            'unknown',
          version:
            (l.meta.version as number | undefined) ??
            skill?.currentVersion ??
            null,
          approvers: approvers.length
            ? approvers
            : l.actorPersonId
              ? [personById(f, l.actorPersonId)?.name ?? l.actorPersonId]
              : [],
          grade:
            grade?.score ??
            (typeof l.meta.gradeScore === 'number' ? l.meta.gradeScore : null),
          decision: l.action.replace('promotion.', ''),
        };
      });

    const complianceTouch = f.skills
      .filter((s) => s.status !== 'deprecated')
      .map((s) => skillCard(s, f, viewerId))
      .filter(
        (c) =>
          c.boundaryBadge !== 'green' ||
          f.promotions.some(
            (p) =>
              p.skillId === c.id &&
              (p.highExposure ||
                p.requiredApproverRoles.includes('compliance')),
          ),
      );

    const assignments = await this.assignments.find({ where: { orgId } });
    const drift = assignments.map((a) => ({
      plugin: a.plugin,
      team: { id: a.teamId, name: f.teamName.get(a.teamId) ?? '' },
      intendedMode: a.intendedMode,
      observedMode: a.observedMode,
      drift: a.observedMode !== null && a.observedMode !== a.intendedMode,
    }));

    const complianceFeed = await this.complianceEvents(orgId, since);
    const events: GovernanceEvent[] =
      complianceFeed.events ??
      log
        .filter((l) => l.createdAt >= since)
        .map((l) => ({
          at: l.createdAt.toISOString(),
          type: l.action,
          actor: l.actorPersonId
            ? (personById(f, l.actorPersonId)?.name ?? l.actorPersonId)
            : 'system',
          detail: summariseMeta(l),
          source: 'audit_log' as const,
        }));

    // Older orgs have no version stamps in settings; fall back to the audit trail
    // (`policy.updated` / `boundary.updated` rows) so the version and date are still real.
    const updates = (action: string) =>
      log.filter((l) => l.action === action);
    const policyUpdates = updates('policy.updated');
    const boundaryUpdates = updates('boundary.updated');
    return {
      policy: {
        text: settings.usagePolicy ?? '',
        version:
          settings.policyVersion ??
          (settings.usagePolicy ? Math.max(1, policyUpdates.length) : 0),
        updatedAt:
          settings.policyUpdatedAt ??
          policyUpdates[0]?.createdAt.toISOString() ??
          null,
      },
      boundary: {
        value: settings.boundary ?? null,
        version:
          settings.boundaryVersion ??
          (settings.boundary ? Math.max(1, boundaryUpdates.length) : 0),
        updatedAt:
          settings.boundaryUpdatedAt ??
          boundaryUpdates[0]?.createdAt.toISOString() ??
          null,
      },
      promotionLog,
      complianceTouch,
      drift,
      events,
      complianceFeed: {
        configured: complianceFeed.configured,
        source: complianceFeed.events ? 'compliance_api' : 'audit_log',
        ...(complianceFeed.detail ? { detail: complianceFeed.detail } : {}),
      },
      exportUrl: `/api/mc/governance/export`,
    };
  }

  /** Compliance API activity when the org has a verified compliance key; otherwise `events: null` so the caller falls back. */
  private async complianceEvents(
    orgId: string,
    since: Date,
  ): Promise<{
    configured: boolean;
    events: GovernanceEvent[] | null;
    detail?: string;
  }> {
    const summary = (await this.integrations.list(orgId)).find(
      (i) => i.kind === 'claude_compliance',
    );
    const verified = Boolean(
      summary?.configured &&
      (summary.status === 'verified' || summary.source === 'platform'),
    );
    if (!verified)
      return {
        configured: false,
        events: null,
        detail: summary?.configured
          ? `compliance key ${summary.status ?? 'unverified'}`
          : 'no compliance key',
      };
    const resolved = await this.integrations.resolve(
      orgId,
      'claude_compliance',
    );
    if (!resolved)
      return {
        configured: false,
        events: null,
        detail: 'compliance key could not be resolved',
      };
    try {
      const page = await this.claude.activityFeed(
        { compliance: resolved.secret },
        { since: since.toISOString(), limit: 100 },
      );
      const relevant = page.events.filter((e) =>
        /role|rbac|group|plugin|skill|project|share|api|compliance|member|invite/i.test(
          e.type,
        ),
      );
      return {
        configured: true,
        events: (relevant.length ? relevant : page.events).map((e) => ({
          at: e.createdAt,
          type: e.type,
          actor:
            e.actor.email ?? e.actor.userId ?? e.actor.apiKeyId ?? e.actor.type,
          detail: JSON.stringify(e.data).slice(0, 300),
          source: 'compliance_api' as const,
        })),
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Compliance feed unavailable for ${orgId}: ${detail}`);
      return { configured: true, events: null, detail };
    }
  }

  async governanceExport(orgId: string) {
    const g = await this.governance(orgId);
    const rows = [
      ...g.promotionLog.map((p) => ({
        at: p.at instanceof Date ? p.at.toISOString() : p.at,
        type: `promotion.${p.decision}`,
        actor: p.approvers.join('; '),
        detail: `${p.skill} v${p.version ?? ''} grade ${p.grade ?? ''}`,
      })),
      ...g.events.map((e) => ({
        at: e.at,
        type: e.type,
        actor: e.actor ?? '',
        detail: e.detail,
      })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1));
    return {
      generatedAt: new Date().toISOString(),
      policyVersion: g.policy.version,
      boundaryVersion: g.boundary.version,
      rows,
    };
  }

  // ---------------------------------------------------------------- backlog

  async backlog(
    orgId: string,
    viewerId?: string | null,
  ): Promise<McBacklogView> {
    const f = await this.metrics.load(orgId, { usageDays: 7 });
    const items = backlogRank(
      f.workflows.map((w) => workflowSummary(w, f, viewerId)),
    );
    const totalsOf = (list: typeof items): BacklogTotals => ({
      hoursAtStake: round(
        list.reduce((s, w) => s + (w.score?.hours ?? 0), 0),
        1,
      ),
      candidates: list.filter(
        (w) => w.status === 'candidate' || w.status === 'scored',
      ).length,
      inBuild: list.filter((w) => w.status === 'in_build').length,
      shipped: list.filter(
        (w) => w.status === 'shipped' || w.status === 'measured',
      ).length,
      nextWave: list.filter((w) => w.nextWave).length,
    });
    const teamKeys = [...new Set(items.map((w) => w.teamId ?? null))];
    const byTeam = teamKeys.map((teamId) => ({
      teamId,
      teamName: teamId ? (f.teamName.get(teamId) ?? null) : null,
      ...totalsOf(items.filter((w) => (w.teamId ?? null) === teamId)),
    }));
    const sowRows = items
      .filter(
        (w) => w.nextWave || w.status === 'candidate' || w.status === 'scored',
      )
      .map((w) => ({
        workflow: w.name,
        team: w.teamName,
        owner: w.owner?.name ?? null,
        status: w.status,
        nextWave: w.nextWave,
        hoursPerWeekAtStake: w.score?.hours ?? null,
        value: w.score?.value ?? null,
        readiness: w.score?.readiness ?? null,
        exposure: w.score?.exposure ?? null,
        composite: w.score?.composite ?? null,
        baselineMinutesPerWeek: w.baselineMinutesPerWeek,
        completeness: w.completeness,
        championVerified: w.championVerified,
      }));
    return {
      items,
      totals: totalsOf(items),
      byTeam,
      sowExport: { rows: sowRows },
    };
  }

  // ---------------------------------------------------------------- cost

  async costInputsFor(orgId: string): Promise<CostInput> {
    const existing = await this.costInputs.findOne({ where: { orgId } });
    return (
      existing ??
      (await this.costInputs.save(this.costInputs.create({ orgId })))
    );
  }

  async updateCostInputs(
    orgId: string,
    actor: Person,
    patch: Partial<
      Pick<
        CostInput,
        | 'seatPriceMonthly'
        | 'premiumSeatPriceMonthly'
        | 'loadedHourlyRate'
        | 'lightciFeesMonthly'
        | 'championHoursPerMonth'
      >
    >,
  ): Promise<CostInput> {
    const row = await this.costInputsFor(orgId);
    for (const key of [
      'seatPriceMonthly',
      'premiumSeatPriceMonthly',
      'loadedHourlyRate',
      'lightciFeesMonthly',
      'championHoursPerMonth',
    ] as const) {
      const v = patch[key];
      if (v === undefined) continue;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0)
        throw new BadRequestException(`${key} must be a non-negative number`);
      row[key] = v;
    }
    const saved = await this.costInputs.save(row);
    await this.audit.save(
      this.audit.create({
        orgId,
        actorPersonId: actor.id,
        action: 'cost_inputs.updated',
        subjectType: 'cost_input',
        subjectId: saved.id,
        meta: { ...patch },
      }),
    );
    return saved;
  }

  async cost(orgId: string): Promise<CostView> {
    const [f, inputs] = await Promise.all([
      this.metrics.load(orgId, { usageDays: 30 }),
      this.costInputsFor(orgId),
    ]);
    const today = isoDay(f.now);
    const active30 = activeInWindow(f.activeDays, today, 30);
    const seats = f.people
      .filter((p) => p.status !== 'inactive')
      .map((p) => ({
        teamId: p.teamId,
        teamName: p.teamId ? (f.teamName.get(p.teamId) ?? null) : null,
        active: active30.has(p.id),
        premium: p.premiumSeat,
      }));

    const total = teamHoursBack(f, null);
    const perTeam: ReturnFacts[] = f.teams
      .map((t) => ({ t, hb: teamHoursBack(f, t.id) }))
      .filter(({ hb }) => hb.measuredTasks > 0)
      .map(({ t, hb }) => ({
        key: t.id,
        label: t.name,
        minutesBackPerWeek: hb.minutesBackPerWeek,
        refs: hb.refs,
      }));
    const perSkill: ReturnFacts[] = f.skills
      .filter((s) => s.status !== 'deprecated')
      .map((s) => {
        const wfIds = new Set<string>([
          ...(s.workflowMapId ? [s.workflowMapId] : []),
          ...f.workflows
            .filter((w) => w.linkedSkillIds.includes(s.id))
            .map((w) => w.id),
        ]);
        const hb = hoursBack(
          f.baselines.filter(
            (b) => b.workflowMapId && wfIds.has(b.workflowMapId),
          ),
          f.measurements.filter(
            (m) => m.workflowMapId && wfIds.has(m.workflowMapId),
          ),
        );
        return {
          key: s.id,
          label: s.name,
          minutesBackPerWeek: hb.minutesBackPerWeek,
          refs: hb.refs,
          measured: hb.measuredTasks,
        };
      })
      .filter((r) => r.measured > 0)
      .map(({ measured: _m, ...r }) => r);

    const monthStart = `${today.slice(0, 7)}-01`;
    const learnerExerciseMinutes = f.exercises
      .filter((e) => e.completedAt && isoDay(e.completedAt) >= monthStart)
      .reduce((s, e) => s + (e.estimatedMinutes ?? 0), 0);
    const since30 = isoDay(new Date(f.now.getTime() - 30 * DAY_MS));
    const usedSkillIds = new Set(
      f.skillUsage
        .filter((u) => u.day >= since30 && u.activations > 0)
        .map((u) => u.skillId),
    );
    const adoptedSkillIds = new Set(f.adoptions.map((a) => a.skillId));
    const skillsUnadopted = f.skills.filter(
      (s) =>
        s.status === 'published' &&
        !usedSkillIds.has(s.id) &&
        !adoptedSkillIds.has(s.id),
    ).length;
    const staleCutoff = new Date(f.now.getTime() - 14 * DAY_MS);
    const exercisesAbandoned = f.exercises.filter(
      (e) =>
        e.status === 'skipped' ||
        (e.status === 'active' && e.createdAt < staleCutoff),
    ).length;

    return computeCost({
      inputs,
      seats,
      orgSeats: f.org.seats,
      orgPremiumSeats: f.org.premiumSeats,
      learnerExerciseMinutes,
      hoursBackTotal: {
        key: 'org',
        label: f.org.name,
        minutesBackPerWeek: total.minutesBackPerWeek,
        refs: total.refs,
      },
      perTeam,
      perSkill,
      skillsUnadopted,
      exercisesAbandoned,
    });
  }
}

function summariseMeta(l: AuditLog): string {
  const parts = [
    l.subjectType && l.subjectId ? `${l.subjectType} ${l.subjectId}` : null,
    Object.keys(l.meta).length ? JSON.stringify(l.meta).slice(0, 200) : null,
  ].filter(Boolean);
  return parts.join(' · ');
}
