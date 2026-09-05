import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { DAY_MS, daysAgo, isoDay } from '../common/dates';
import { UsageSnapshot } from '../ops/entities/usage-snapshot.entity';
import type { ComplianceBoundary } from '../orgs/entities/org.entity';
import { Org } from '../orgs/entities/org.entity';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { Skill } from '../skills/entities/skill.entity';
import { SkillAdoption } from '../skills/entities/skill-adoption.entity';
import { SkillUsage } from '../skills/entities/skill-usage.entity';
import { Baseline } from '../workflows/entities/baseline.entity';
import { Measurement } from '../workflows/entities/measurement.entity';
import { WorkflowMap } from '../workflows/entities/workflow-map.entity';
import { Grade } from './entities/grade.entity';
import type {
  HoursBackView,
  MySkillsResponse,
  SkillCard,
  StreakView,
  WorkflowSummary,
} from './learning.types';
import { PersonRefService } from './person-ref.service';

/**
 * Non-mastery parts of LadderView (hours back, streak) plus the SkillCard / WorkflowSummary mappers
 * the learning routes need. The skills and workflows modules own the canonical mappers; these
 * produce the same contract shapes from the same entities.
 */
@Injectable()
export class LadderService {
  constructor(
    @InjectRepository(Baseline)
    private readonly baselines: Repository<Baseline>,
    @InjectRepository(Measurement)
    private readonly measurements: Repository<Measurement>,
    @InjectRepository(UsageSnapshot)
    private readonly usage: Repository<UsageSnapshot>,
    @InjectRepository(Skill) private readonly skills: Repository<Skill>,
    @InjectRepository(SkillAdoption)
    private readonly adoptions: Repository<SkillAdoption>,
    @InjectRepository(SkillUsage)
    private readonly skillUsage: Repository<SkillUsage>,
    @InjectRepository(Grade) private readonly grades: Repository<Grade>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(Person) private readonly people: Repository<Person>,
    @InjectRepository(Org) private readonly orgs: Repository<Org>,
    @InjectRepository(WorkflowMap)
    private readonly workflows: Repository<WorkflowMap>,
    private readonly refs: PersonRefService,
  ) {}

  // ───────────────────────── hours back ─────────────────────────

  async hoursBack(
    personId: string,
    now: Date = new Date(),
  ): Promise<HoursBackView> {
    const [baselines, measurements] = await Promise.all([
      this.baselines.find({
        where: { personId },
        order: { capturedAt: 'ASC' },
      }),
      this.measurements.find({
        where: { personId },
        order: { periodEnd: 'ASC' },
      }),
    ]);
    const baselineByTask = new Map<string, Baseline>();
    for (const b of baselines) baselineByTask.set(b.task, b); // latest baseline per task wins
    const latestByTask = new Map<string, Measurement>();
    for (const m of measurements) latestByTask.set(m.task, m);

    const baselineMinutesPerWeek = sum(
      [...baselineByTask.values()].map((b) => b.minutesPerWeek),
    );
    let currentMinutesPerWeek = 0;
    let netOfReworkMinutes = 0;
    for (const [task, b] of baselineByTask) {
      const m = latestByTask.get(task);
      const current = m ? m.minutesPerWeek : b.minutesPerWeek;
      currentMinutesPerWeek += current;
      const back = b.minutesPerWeek - current;
      const reworkDelta =
        (m?.reworkMinutesPerWeek ?? b.reworkMinutesPerWeek) -
        b.reworkMinutesPerWeek;
      netOfReworkMinutes += back - Math.max(0, reworkDelta);
    }
    const series: { week: string; minutesBack: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = startOfWeek(daysAgo(i * 7, now));
      const weekIso = isoDay(weekStart);
      let minutesBack = 0;
      for (const [task, b] of baselineByTask) {
        const m = [...measurements]
          .filter((x) => x.task === task && x.periodStart <= weekIso)
          .pop();
        if (m)
          minutesBack +=
            b.minutesPerWeek -
            m.minutesPerWeek -
            Math.max(0, m.reworkMinutesPerWeek - b.reworkMinutesPerWeek);
      }
      series.push({ week: weekIso, minutesBack: Math.round(minutesBack) });
    }
    const dayOfMonth = now.getUTCDate();
    const thisMonthMinutes = Math.round(netOfReworkMinutes * (dayOfMonth / 7));
    return {
      thisMonthMinutes,
      baselineMinutesPerWeek: Math.round(baselineMinutesPerWeek),
      currentMinutesPerWeek: Math.round(currentMinutesPerWeek),
      netOfReworkMinutes: Math.round(netOfReworkMinutes),
      series,
    };
  }

  // ───────────────────────── streak ─────────────────────────

  async streak(personId: string, now: Date = new Date()): Promise<StreakView> {
    const since = isoDay(daysAgo(13, now));
    const rows = await this.usage.find({
      where: { personId, day: MoreThanOrEqual(since) },
    });
    const active = new Set(
      rows.filter((r) => r.metrics?.activeOnRealWork).map((r) => String(r.day)),
    );
    const last14: StreakView['last14'] = [];
    for (let i = 13; i >= 0; i--) {
      const day = isoDay(daysAgo(i, now));
      last14.push({ day, active: active.has(day) });
    }
    let activeDays = 0;
    for (let i = last14.length - 1; i >= 0; i--) {
      if (last14[i].active) activeDays += 1;
      else if (i < last14.length - 1) break; // today may not be synced yet; tolerate a gap on the last day only
    }
    return { activeDays, last14 };
  }

  // ───────────────────────── skills ─────────────────────────

  async mySkills(person: Person, orgId: string): Promise<MySkillsResponse> {
    const since = isoDay(daysAgo(30));
    const [adoptions, authored] = await Promise.all([
      this.adoptions.find({ where: { personId: person.id } }),
      this.skills.find({
        where: { orgId, ownerPersonId: person.id },
        order: { updatedAt: 'DESC' },
      }),
    ]);
    const adoptedIds = adoptions.map((a) => a.skillId);
    const adopted = adoptedIds.length
      ? await this.skills.find({ where: { id: In(adoptedIds), orgId } })
      : [];
    const allIds = [
      ...new Set([...adopted.map((s) => s.id), ...authored.map((s) => s.id)]),
    ];
    const usage = allIds.length
      ? await this.skillUsage.find({
          where: { skillId: In(allIds), day: MoreThanOrEqual(since) },
        })
      : [];
    const org = await this.orgs.findOne({ where: { id: orgId } });
    const cards = await this.skillCards(
      [...adopted, ...authored],
      person.id,
      usage,
      org?.settings?.boundary,
    );
    const cardById = new Map(cards.map((c) => [c.id, c]));
    return {
      adopted: adopted.map((s) => ({
        ...(cardById.get(s.id) as SkillCard),
        myActivations30d: sum(
          usage
            .filter((u) => u.skillId === s.id && u.personId === person.id)
            .map((u) => u.activations),
        ),
      })),
      authored: authored.map((s) => ({
        ...(cardById.get(s.id) as SkillCard),
        usageByOthers30d: sum(
          usage
            .filter((u) => u.skillId === s.id && u.personId !== person.id)
            .map((u) => u.activations),
        ),
      })),
    };
  }

  async skillCard(skill: Skill, viewerId: string): Promise<SkillCard> {
    const since = isoDay(daysAgo(30));
    const [usage, org] = await Promise.all([
      this.skillUsage.find({
        where: { skillId: skill.id, day: MoreThanOrEqual(since) },
      }),
      this.orgs.findOne({ where: { id: skill.orgId } }),
    ]);
    const [card] = await this.skillCards(
      [skill],
      viewerId,
      usage,
      org?.settings?.boundary,
    );
    return card;
  }

  async skillCards(
    skills: Skill[],
    viewerId: string,
    usage: SkillUsage[],
    orgBoundary: ComplianceBoundary | undefined,
  ): Promise<SkillCard[]> {
    if (skills.length === 0) return [];
    const teamIds = [
      ...new Set(
        skills.map((s) => s.teamId).filter((t): t is string => Boolean(t)),
      ),
    ];
    const ownerIds = [
      ...new Set(
        skills
          .map((s) => s.ownerPersonId)
          .filter((t): t is string => Boolean(t)),
      ),
    ];
    const gradeIds = [
      ...new Set(
        skills
          .map((s) => s.latestGradeId)
          .filter((t): t is string => Boolean(t)),
      ),
    ];
    const [teams, owners, grades, myAdoptions] = await Promise.all([
      teamIds.length
        ? this.teams.find({ where: { id: In(teamIds) } })
        : Promise.resolve<Team[]>([]),
      ownerIds.length
        ? this.people.find({ where: { id: In(ownerIds) } })
        : Promise.resolve<Person[]>([]),
      gradeIds.length
        ? this.grades.find({ where: { id: In(gradeIds) } })
        : Promise.resolve<Grade[]>([]),
      this.adoptions.find({
        where: { personId: viewerId, skillId: In(skills.map((s) => s.id)) },
      }),
    ]);
    const ownerRefs = new Map(
      (await this.refs.refs(owners)).map((r) => [r.id, r]),
    );
    const teamById = new Map<string, Team>(teams.map((t) => [t.id, t]));
    const gradeById = new Map<string, Grade>(grades.map((g) => [g.id, g]));
    const adoptedSet = new Set(myAdoptions.map((a) => a.skillId));
    return skills.map((s) => {
      const u = usage.filter((x) => x.skillId === s.id);
      const grade = s.latestGradeId
        ? gradeById.get(s.latestGradeId)
        : undefined;
      const runs30d = sum(u.map((x) => x.activations));
      const health: SkillCard['health'] = [];
      if (s.status === 'published' && runs30d === 0) health.push('unused_30d');
      if (grade && grade.decision === 'revise')
        health.push('grade_below_threshold');
      if (s.status === 'in_review') health.push('pending_review');
      const badge = boundaryBadge(s, orgBoundary);
      if (badge === 'red') health.push('boundary_gap');
      return {
        id: s.id,
        slug: s.slug,
        name: s.name,
        triggerLine: s.triggerLine,
        plugin: s.plugin,
        team:
          s.teamId && teamById.get(s.teamId)
            ? { id: s.teamId, name: teamById.get(s.teamId)!.name }
            : null,
        owner: s.ownerPersonId
          ? (ownerRefs.get(s.ownerPersonId) ?? null)
          : null,
        status: s.status,
        rungRequired: s.rungRequired,
        version: s.currentVersion,
        grade: grade ? { score: grade.score, decision: grade.decision } : null,
        boundaryBadge: badge,
        activeUsers30d: new Set(
          u.filter((x) => x.activations > 0).map((x) => x.personId),
        ).size,
        runs30d,
        adoptedByMe: adoptedSet.has(s.id),
        publishedAt: s.publishedAt
          ? new Date(s.publishedAt).toISOString()
          : null,
        updatedAt: new Date(s.updatedAt).toISOString(),
        health,
      };
    });
  }

  // ───────────────────────── workflows ─────────────────────────

  async workflowSummary(workflow: WorkflowMap): Promise<WorkflowSummary> {
    const [team, owner, baselines, measurements] = await Promise.all([
      workflow.teamId
        ? this.teams.findOne({ where: { id: workflow.teamId } })
        : null,
      workflow.ownerPersonId ? this.refs.refById(workflow.ownerPersonId) : null,
      this.baselines.find({ where: { workflowMapId: workflow.id } }),
      this.measurements.find({
        where: { workflowMapId: workflow.id },
        order: { periodEnd: 'ASC' },
      }),
    ]);
    const baselineMinutesPerWeek = sum(baselines.map((b) => b.minutesPerWeek));
    const latest = measurements.at(-1);
    const measuredMinutesPerWeek = latest
      ? latest.minutesPerWeek
      : baselineMinutesPerWeek;
    return {
      id: workflow.id,
      name: workflow.name,
      teamId: workflow.teamId,
      teamName: team?.name ?? null,
      owner,
      status: workflow.status,
      completeness: workflow.completeness,
      championVerified: workflow.championVerified,
      score: workflow.score,
      nextWave: workflow.nextWave,
      linkedSkills: [],
      baselineMinutesPerWeek,
      measuredMinutesPerWeek,
      hoursBackPerWeek:
        Math.round(
          ((baselineMinutesPerWeek - measuredMinutesPerWeek) / 60) * 10,
        ) / 10,
      updatedAt: new Date(workflow.updatedAt).toISOString(),
    };
  }
}

/** Contract rule: red when the skill reads a restricted class (or declares nothing forbidden while restricted classes exist); amber when human review is required; green otherwise. */
export function boundaryBadge(
  skill: Pick<Skill, 'boundary' | 'manifest'>,
  orgBoundary: ComplianceBoundary | undefined,
): 'green' | 'amber' | 'red' {
  const forbidden = (orgBoundary?.forbiddenDataClasses ?? []).map((c) =>
    c.toLowerCase(),
  );
  const mayRead = [
    ...(skill.boundary?.mayRead ?? []),
    ...(skill.manifest?.boundary?.may_read ?? []),
  ].map((c) => c.toLowerCase());
  const mustNever = [
    ...(skill.boundary?.mustNeverReceive ?? []),
    ...(skill.manifest?.boundary?.must_never_receive ?? []),
  ].map((c) => c.toLowerCase());
  const overlaps = (a: string, b: string) => a.includes(b) || b.includes(a);
  const readsRestricted = mayRead.some((m) =>
    forbidden.some((f) => overlaps(m, f)),
  );
  const touchesRestrictedUndeclared =
    forbidden.length > 0 &&
    mayRead.length > 0 &&
    !mustNever.some((m) => forbidden.some((f) => overlaps(m, f))) &&
    readsRestricted;
  if (readsRestricted || touchesRestrictedUndeclared) return 'red';
  if (
    (skill.boundary?.humanReview ?? []).length > 0 ||
    (skill.manifest?.boundary?.human_review ?? []).length > 0
  )
    return 'amber';
  return 'green';
}

function sum(xs: number[]): number {
  return xs.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
}

function startOfWeek(d: Date): Date {
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // Monday-based
  return new Date(d.getTime() - diff * DAY_MS);
}
