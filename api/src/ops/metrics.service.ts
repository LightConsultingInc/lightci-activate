/**
 * Aggregation helpers for Team, Mission Control and the Auditor.
 *
 * The exported functions are pure (no I/O, `now` passed in) so they are unit-tested
 * directly; `MetricsService` loads one org's rows into an `OrgFacts` bundle and the
 * surface services (team, mission-control, lead, auditor) compose the two.
 *
 * Analytics pitfalls from docs/mastery-model.md §5 are respected here: WAU on real
 * work is the headline; logins, streaks and artifact counts never gate anything and
 * are not part of the activation score; nothing "hours back" is reported without a
 * baseline row to point at.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DAY_MS, isoDay } from '../common/dates';
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
import { PromotionRequest } from '../skills/entities/promotion-request.entity';
import { UsageSnapshot } from './entities/usage-snapshot.entity';
import { Escalation } from './entities/escalation.entity';
import type { ActivationScore, BaselineRef, FunnelStep } from './ops.types';

// ============================================================================
// Basic statistics
// ============================================================================

export const clamp01 = (x: number): number =>
  Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
export const round = (x: number, places = 3): number =>
  Math.round(x * 10 ** places) / 10 ** places;

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** Nearest-rank percentile (p in 0..100). */
export function percentile(
  values: readonly number[],
  p: number,
): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * s.length));
  return s[Math.min(s.length, rank) - 1];
}

export function daysBetween(a: Date | string, b: Date | string): number {
  return (toDate(b).getTime() - toDate(a).getTime()) / DAY_MS;
}

export function toDate(d: Date | string): Date {
  return d instanceof Date
    ? d
    : new Date(d.length === 10 ? `${d}T00:00:00Z` : d);
}

export function addDaysIso(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function eachDayIso(from: string, to: string): string[] {
  const out: string[] = [];
  for (
    let t = Date.parse(`${from}T00:00:00Z`);
    t <= Date.parse(`${to}T00:00:00Z`);
    t += DAY_MS
  )
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** Monday of the ISO week containing `day`. */
export function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(d.getTime() - dow * DAY_MS).toISOString().slice(0, 10);
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

// ============================================================================
// Active on real work
// ============================================================================

export interface ActiveDay {
  personId: string;
  day: string;
  active: boolean;
}

export interface ActivePoint {
  day: string;
  active: number;
  seats: number;
}

/** Distinct people active on real work per calendar day over [from, to]. */
export function dailyActive(
  snaps: readonly ActiveDay[],
  from: string,
  to: string,
  seats: number,
): ActivePoint[] {
  const byDay = new Map<string, Set<string>>();
  for (const s of snaps) {
    if (!s.active || s.day < from || s.day > to) continue;
    (byDay.get(s.day) ?? byDay.set(s.day, new Set()).get(s.day)!).add(
      s.personId,
    );
  }
  return eachDayIso(from, to).map((day) => ({
    day,
    active: byDay.get(day)?.size ?? 0,
    seats,
  }));
}

/** Distinct people active per bucket (ISO week or calendar month); `day` is the bucket start. */
export function bucketedActive(
  snaps: readonly ActiveDay[],
  from: string,
  to: string,
  seats: number,
  bucket: 'week' | 'month',
): ActivePoint[] {
  const key = bucket === 'week' ? weekStart : monthStart;
  const buckets = new Map<string, Set<string>>();
  for (const day of eachDayIso(from, to))
    if (!buckets.has(key(day))) buckets.set(key(day), new Set());
  for (const s of snaps) {
    if (!s.active || s.day < from || s.day > to) continue;
    buckets.get(key(s.day))?.add(s.personId);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, set]) => ({ day, active: set.size, seats }));
}

/** Distinct people active in the trailing `windowDays` ending on `to` (inclusive). */
export function activeInWindow(
  snaps: readonly ActiveDay[],
  to: string,
  windowDays: number,
): Set<string> {
  const from = addDaysIso(to, -(windowDays - 1));
  const set = new Set<string>();
  for (const s of snaps)
    if (s.active && s.day >= from && s.day <= to) set.add(s.personId);
  return set;
}

/** Trend of the last complete bucket vs the one before: ±5% band is flat. */
export function trendOf(
  points: readonly ActivePoint[],
): 'up' | 'flat' | 'down' {
  if (points.length < 2) return 'flat';
  const last = points[points.length - 1].active;
  const prev = points[points.length - 2].active;
  if (prev === 0) return last > 0 ? 'up' : 'flat';
  const delta = (last - prev) / prev;
  return delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat';
}

export function activeDaysCount(
  snaps: readonly ActiveDay[],
  personId: string,
  from: string,
  to: string,
): number {
  let n = 0;
  for (const s of snaps)
    if (s.personId === personId && s.active && s.day >= from && s.day <= to)
      n++;
  return n;
}

// ============================================================================
// Funnel: provisioned → logged in → first real work → L1..L5
// ============================================================================

export interface FunnelPerson {
  provisionedAt: Date;
  firstLoginAt: Date | null;
  firstRealWorkAt: Date | null;
  /** Earliest date each rung (1..5) was reached, when it was. */
  rungReachedAt: Partial<Record<1 | 2 | 3 | 4 | 5, Date>>;
}

export function funnel(people: readonly FunnelPerson[]): FunnelStep[] {
  const steps: FunnelStep[] = [
    { step: 'provisioned', count: people.length, medianDays: 0, sampled: 0 },
  ];
  const stepDates = (p: FunnelPerson): (Date | null)[] => [
    p.provisionedAt,
    p.firstLoginAt,
    p.firstRealWorkAt,
    p.rungReachedAt[1] ?? null,
    p.rungReachedAt[2] ?? null,
    p.rungReachedAt[3] ?? null,
    p.rungReachedAt[4] ?? null,
    p.rungReachedAt[5] ?? null,
  ];
  const labels = [
    'provisioned',
    'logged_in',
    'first_real_work',
    'L1',
    'L2',
    'L3',
    'L4',
    'L5',
  ];
  for (let i = 1; i < labels.length; i++) {
    const durations: number[] = [];
    let count = 0;
    for (const p of people) {
      const dates = stepDates(p);
      const at = dates[i];
      if (!at) continue;
      count++;
      // days from the nearest earlier step that has a date (rungs may be skipped by a diagnostic placement)
      const prev = dates
        .slice(0, i)
        .reverse()
        .find((d): d is Date => Boolean(d));
      if (prev) durations.push(Math.max(0, daysBetween(prev, at)));
    }
    const md = median(durations);
    steps.push({
      step: labels[i],
      count,
      medianDays: md === null ? 0 : round(md, 1),
      sampled: durations.length,
    });
  }
  return steps;
}

// ============================================================================
// Rungs
// ============================================================================

export interface PlacementLite {
  personId: string;
  rung: number;
  placedAt: Date;
}

export function rungDistribution(rungs: readonly number[]): number[] {
  const out = [0, 0, 0, 0, 0, 0];
  for (const r of rungs) out[Math.min(5, Math.max(0, Math.round(r)))]++;
  return out;
}

/** Current rung per person = latest placement (0 when none). */
export function currentRungs(
  placements: readonly PlacementLite[],
  personIds: readonly string[],
): Map<string, number> {
  const latest = new Map<string, PlacementLite>();
  for (const p of placements) {
    const cur = latest.get(p.personId);
    if (!cur || p.placedAt > cur.placedAt) latest.set(p.personId, p);
  }
  return new Map(personIds.map((id) => [id, latest.get(id)?.rung ?? 0]));
}

/** Rung at a point in time (0 when no placement had happened yet). */
export function rungAt(
  placements: readonly PlacementLite[],
  personId: string,
  at: Date,
): number {
  let rung = 0;
  let best: Date | null = null;
  for (const p of placements) {
    if (p.personId !== personId || p.placedAt > at) continue;
    if (!best || p.placedAt > best) {
      best = p.placedAt;
      rung = p.rung;
    }
  }
  return rung;
}

export interface TimeInRungRow {
  rung: number;
  medianDays: number;
  p90Days: number;
  sampled: number;
  stuckPersonIds: string[];
}

/**
 * Time spent in each rung. Completed dwells (a later, higher placement exists) and the
 * current dwell (placement → now) both count. A person is "stuck" at their current rung
 * when the current dwell exceeds `stuckAfterDays`.
 */
export function timeInRung(
  placements: readonly PlacementLite[],
  now: Date,
  stuckAfterDays: number,
): TimeInRungRow[] {
  const byPerson = new Map<string, PlacementLite[]>();
  for (const p of placements)
    (
      byPerson.get(p.personId) ?? byPerson.set(p.personId, []).get(p.personId)!
    ).push(p);
  const dwell: number[][] = [[], [], [], [], [], []];
  const stuck: string[][] = [[], [], [], [], [], []];
  for (const [personId, list] of byPerson) {
    const sorted = [...list].sort(
      (a, b) => a.placedAt.getTime() - b.placedAt.getTime(),
    );
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      const next = sorted.slice(i + 1).find((n) => n.rung > cur.rung);
      const r = Math.min(5, Math.max(0, cur.rung));
      if (next) {
        dwell[r].push(daysBetween(cur.placedAt, next.placedAt));
      } else if (i === sorted.length - 1) {
        const d = daysBetween(cur.placedAt, now);
        dwell[r].push(d);
        if (d > stuckAfterDays && r < 5) stuck[r].push(personId);
      }
    }
  }
  return dwell.map((ds, rung) => ({
    rung,
    medianDays: ds.length ? round(median(ds)!, 1) : 0,
    p90Days: ds.length ? round(percentile(ds, 90)!, 1) : 0,
    sampled: ds.length,
    stuckPersonIds: stuck[rung],
  }));
}

export function cohorts(
  people: readonly { cohortWeek: string | null; rung: number }[],
): { cohortWeek: string; counts: number[] }[] {
  const map = new Map<string, number[]>();
  for (const p of people) {
    const key = p.cohortWeek ? weekStart(p.cohortWeek) : 'unknown';
    const counts = map.get(key) ?? map.set(key, [0, 0, 0, 0, 0, 0]).get(key)!;
    counts[Math.min(5, Math.max(0, p.rung))]++;
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([cohortWeek, counts]) => ({ cohortWeek, counts }));
}

/**
 * Rungs gained per person in the trailing `days`. A person's first (diagnostic) placement is
 * their starting point, not a gain: when nobody had placed them by `since`, the base is the
 * rung of that first placement, so a newcomer placed straight at L4 last week is not "rising".
 */
export function rungGains(
  placements: readonly PlacementLite[],
  personIds: readonly string[],
  now: Date,
  days = 30,
): Map<string, number> {
  const since = new Date(now.getTime() - days * DAY_MS);
  const out = new Map<string, number>();
  for (const id of personIds) {
    const mine = placements.filter((p) => p.personId === id && p.placedAt <= now);
    const hadPlacementAtSince = mine.some((p) => p.placedAt <= since);
    const first = mine.reduce<PlacementLite | null>(
      (best, p) => (!best || p.placedAt < best.placedAt ? p : best),
      null,
    );
    const base = hadPlacementAtSince
      ? rungAt(placements, id, since)
      : (first?.rung ?? 0);
    out.set(id, Math.max(0, rungAt(placements, id, now) - base));
  }
  return out;
}

/** Rising = gained at least one rung in the window and at or above the 75th percentile of positive gains. */
export function markRising(gains: ReadonlyMap<string, number>): Set<string> {
  const positive = [...gains.values()].filter((g) => g > 0);
  if (positive.length === 0) return new Set();
  const cut = Math.max(1, percentile(positive, 75) ?? 1);
  return new Set(
    [...gains.entries()].filter(([, g]) => g >= cut).map(([id]) => id),
  );
}

// ============================================================================
// Stalled
// ============================================================================

export interface StalledInput {
  /** Latest placement that raised the rung (any placement when none did), else provisioning date. */
  lastProgressionAt: Date;
  /** Latest submission, if any. */
  lastSubmissionAt: Date | null;
  activeDaysThisMonth: number;
  activeDaysPriorMonth: number;
  latestNoteTags: readonly string[];
  /** Eligibility: inactive people, non-learner sponsors/admins/leads and L5 champions are never "stalled". */
  rung?: number;
  status?: 'invited' | 'active' | 'inactive';
  roles?: readonly string[];
}

export interface StalledResult {
  stalled: boolean;
  /** Days since the last progression or submission. */
  stalledDays: number;
  reason: string | null;
  /** The day the stall began (last activity + stalledAfterDays); null when not stalled. */
  stalledSince: Date | null;
  /** SLA for a human to act: stall start + 3 days. */
  slaDueAt: Date | null;
}

export const STALL_REASONS: Record<string, string> = {
  blocked: 'blocked',
  no_time: 'no time',
  tool_issue: 'tool issue',
  escalated: 'escalated',
};

export const STALL_SLA_DAYS = 3;

/**
 * People who are on the ladder: anyone with the learner role, or with no sponsor/admin/lead
 * role at all. Sponsors, admins and LightCI leads who are not also learners hold a seat but
 * are not ranked, cohorted or flagged as stuck.
 */
export function isLearner(p: Pick<Person, 'roles'>): boolean {
  const roles = p.roles ?? ['learner'];
  if (roles.includes('learner')) return true;
  return !roles.some((r) => r === 'sponsor' || r === 'admin' || r === 'lead');
}

export function learners(f: Pick<OrgFacts, 'people'>): Person[] {
  return f.people.filter(isLearner);
}

export function stallEligible(input: Pick<StalledInput, 'rung' | 'status' | 'roles'>): boolean {
  if (input.status === 'inactive') return false;
  if ((input.rung ?? 0) >= 5) return false;
  const roles = input.roles ?? ['learner'];
  if (!roles.includes('learner') && roles.some((r) => r === 'sponsor' || r === 'admin' || r === 'lead')) return false;
  return true;
}

/**
 * Stalled when the person has NOT passed a rung in `stalledAfterDays` AND either has made no
 * submission in that window OR their active-on-real-work days in the last 30 dropped by more
 * than half versus the prior 30 (only when the prior month had activity to drop from).
 */
export function detectStalled(input: StalledInput, now: Date, stalledAfterDays: number): StalledResult {
  const none: StalledResult = { stalled: false, stalledDays: 0, reason: null, stalledSince: null, slaDueAt: null };
  const lastActivity = new Date(Math.max(input.lastProgressionAt.getTime(), input.lastSubmissionAt?.getTime() ?? 0));
  const stalledDays = Math.max(0, Math.floor(daysBetween(lastActivity, now)));
  if (!stallEligible(input)) return { ...none, stalledDays };
  const noRungPass = daysBetween(input.lastProgressionAt, now) >= stalledAfterDays;
  const noSubmission = !input.lastSubmissionAt || daysBetween(input.lastSubmissionAt, now) >= stalledAfterDays;
  const activityDrop = input.activeDaysPriorMonth > 0 && input.activeDaysThisMonth < input.activeDaysPriorMonth * 0.5;
  const stalled = noRungPass && (noSubmission || activityDrop);
  if (!stalled) return { ...none, stalledDays };
  const tag = input.latestNoteTags.find((t) => t in STALL_REASONS);
  const reason = tag ? STALL_REASONS[tag] : noSubmission ? `no rung passed and no submission in ${stalledDays} days` : 'no rung passed; activity dropped >50% vs prior month';
  const stalledSince = new Date(Math.min(now.getTime(), lastActivity.getTime() + stalledAfterDays * DAY_MS));
  return { stalled: true, stalledDays, reason, stalledSince, slaDueAt: new Date(stalledSince.getTime() + STALL_SLA_DAYS * DAY_MS) };
}

// ============================================================================
// Hours back (always against a baseline)
// ============================================================================

export interface BaselineLite {
  id: string;
  personId: string;
  workflowMapId: string | null;
  task: string;
  minutesPerWeek: number;
  reworkMinutesPerWeek: number;
}
export interface MeasurementLite extends BaselineLite {
  baselineId: string | null;
  periodEnd: string;
}

export interface HoursBackResult {
  /** Minutes returned per week, net of rework (baseline total − measured total). */
  minutesBackPerWeek: number;
  baselineMinutesPerWeek: number;
  currentMinutesPerWeek: number;
  /** Baseline and measurement rows every figure derives from. Empty ⇒ nothing to report. */
  refs: BaselineRef[];
  measuredTasks: number;
}

function matchBaseline(
  m: MeasurementLite,
  baselines: readonly BaselineLite[],
): BaselineLite | undefined {
  if (m.baselineId) {
    const direct = baselines.find((b) => b.id === m.baselineId);
    if (direct) return direct;
  }
  return baselines.find(
    (b) =>
      b.personId === m.personId &&
      ((m.workflowMapId && b.workflowMapId === m.workflowMapId) ||
        b.task === m.task),
  );
}

/**
 * Hours back for a set of people: for every baseline with at least one measurement, take the
 * latest measurement and compute (baseline + rework) − (measured + rework). Baselines without
 * a measurement contribute nothing; measurements without a baseline are ignored (never
 * report a number without a baseline).
 */
export function hoursBack(
  baselines: readonly BaselineLite[],
  measurements: readonly MeasurementLite[],
): HoursBackResult {
  const latestByBaseline = new Map<string, MeasurementLite>();
  for (const m of measurements) {
    const b = matchBaseline(m, baselines);
    if (!b) continue;
    const cur = latestByBaseline.get(b.id);
    if (!cur || m.periodEnd > cur.periodEnd) latestByBaseline.set(b.id, m);
  }
  let back = 0;
  let base = 0;
  let current = 0;
  const refs: BaselineRef[] = [];
  for (const [baselineId, m] of latestByBaseline) {
    const b = baselines.find((x) => x.id === baselineId)!;
    const bTotal = b.minutesPerWeek + b.reworkMinutesPerWeek;
    const mTotal = m.minutesPerWeek + m.reworkMinutesPerWeek;
    base += bTotal;
    current += mTotal;
    back += bTotal - mTotal;
    refs.push({
      kind: 'baseline',
      id: b.id,
      detail: `${b.task}: ${bTotal} min/wk incl. ${b.reworkMinutesPerWeek} rework`,
    });
    refs.push({
      kind: 'measurement',
      id: m.id,
      detail: `${m.task}: ${mTotal} min/wk incl. ${m.reworkMinutesPerWeek} rework (to ${m.periodEnd})`,
    });
  }
  return {
    minutesBackPerWeek: round(back, 1),
    baselineMinutesPerWeek: round(base, 1),
    currentMinutesPerWeek: round(current, 1),
    refs,
    measuredTasks: latestByBaseline.size,
  };
}

// ============================================================================
// Activation score
// ============================================================================

export interface RawScoreInput {
  id: string;
  rung: number;
  hoursBackPerWeek: number | null;
  skillsPublished: number;
  /** Adoptions of skills this person authored, by other people. */
  influence: number;
  /** Mean grade score 0..1, null when never graded. */
  gradeQuality: number | null;
  activeDays30: number;
}

export const ACTIVE_DAYS_FULL = 20; // ~ business days in 30

/**
 * Each component is normalised 0..1 and the composite is their plain mean, so every
 * number shown next to the composite is one of its actual inputs. Rung, grade quality
 * and active days have natural scales; hours back, skills published and influence are
 * scaled against the best value in the population passed in (so a score is always
 * relative to this org, never to a global constant that would make small firms look bad).
 */
export function activationScores(
  rows: readonly RawScoreInput[],
): Map<string, ActivationScore> {
  const maxHours = Math.max(0, ...rows.map((r) => r.hoursBackPerWeek ?? 0));
  const maxSkills = Math.max(0, ...rows.map((r) => r.skillsPublished));
  const maxInfluence = Math.max(0, ...rows.map((r) => r.influence));
  const rel = (v: number, max: number) => (max > 0 ? clamp01(v / max) : 0);
  const out = new Map<string, ActivationScore>();
  for (const r of rows) {
    const components = {
      rung: round(clamp01(r.rung / 5)),
      hoursBack: round(rel(Math.max(0, r.hoursBackPerWeek ?? 0), maxHours)),
      skillsPublished: round(rel(r.skillsPublished, maxSkills)),
      influence: round(rel(r.influence, maxInfluence)),
      gradeQuality: round(clamp01(r.gradeQuality ?? 0)),
      activeDays: round(clamp01(r.activeDays30 / ACTIVE_DAYS_FULL)),
    };
    const composite = round(mean(Object.values(components)));
    out.set(r.id, { composite, components });
  }
  return out;
}

export const CHAMPION_INFLUENCE_MIN = 0.5;
export const CHAMPION_GRADE_MIN = 0.8;

export function isChampionCandidate(
  score: ActivationScore,
  rung: number,
  influenceRaw: number,
): boolean {
  return (
    rung < 5 &&
    influenceRaw > 0 &&
    score.components.influence >= CHAMPION_INFLUENCE_MIN &&
    score.components.gradeQuality >= CHAMPION_GRADE_MIN
  );
}

// ============================================================================
// Revisits, rework, queue age
// ============================================================================

export function revisitCompliance(
  revisits: readonly {
    teamId: string | null;
    dueAt: Date;
    doneAt: Date | null;
  }[],
  now: Date,
): Map<string, { due: number; done: number }> {
  const out = new Map<string, { due: number; done: number }>();
  for (const r of revisits) {
    if (r.dueAt > now) continue;
    const key = r.teamId ?? 'none';
    const row = out.get(key) ?? out.set(key, { due: 0, done: 0 }).get(key)!;
    row.due++;
    if (r.doneAt) row.done++;
  }
  return out;
}

/** revise ÷ pass. With no passes: 0 when nothing was graded, else the revise count itself. */
export function reworkRate(
  decisions: readonly ('pass' | 'revise')[],
): number {
  const pass = decisions.filter((d) => d === 'pass').length;
  const revise = decisions.length - pass;
  if (decisions.length === 0) return 0;
  return pass === 0 ? revise : round(revise / pass);
}

/** Mean age in days of still-pending items; 0 when the queue is empty. */
export function queueAgeDays(
  pending: readonly { createdAt: Date }[],
  now: Date,
): number {
  if (pending.length === 0) return 0;
  return round(mean(pending.map((p) => daysBetween(p.createdAt, now))), 1);
}

// ============================================================================
// Org facts loader
// ============================================================================

export interface OrgFacts {
  org: Org;
  now: Date;
  people: Person[];
  teams: Team[];
  teamName: Map<string, string>;
  placements: Placement[];
  rungs: Map<string, number>;
  grades: Grade[];
  notes: CoachNote[];
  revisits: Revisit[];
  exercises: Exercise[];
  submissions: Submission[];
  baselines: Baseline[];
  measurements: Measurement[];
  workflows: WorkflowMap[];
  skills: Skill[];
  skillUsage: SkillUsage[];
  adoptions: SkillAdoption[];
  promotions: PromotionRequest[];
  usage: UsageSnapshot[];
  escalations: Escalation[];
  masterySnapshots: MasterySnapshot[];
  activeDays: ActiveDay[];
  stalledAfterDays: number;
}

@Injectable()
export class MetricsService {
  constructor(
    @InjectRepository(Org) private readonly orgs: Repository<Org>,
    @InjectRepository(Person) private readonly people: Repository<Person>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(Placement)
    private readonly placements: Repository<Placement>,
    @InjectRepository(Grade) private readonly grades: Repository<Grade>,
    @InjectRepository(CoachNote) private readonly notes: Repository<CoachNote>,
    @InjectRepository(Revisit) private readonly revisits: Repository<Revisit>,
    @InjectRepository(Exercise)
    private readonly exercises: Repository<Exercise>,
    @InjectRepository(Submission)
    private readonly submissions: Repository<Submission>,
    @InjectRepository(MasterySnapshot)
    private readonly masterySnapshots: Repository<MasterySnapshot>,
    @InjectRepository(Baseline)
    private readonly baselines: Repository<Baseline>,
    @InjectRepository(Measurement)
    private readonly measurements: Repository<Measurement>,
    @InjectRepository(WorkflowMap)
    private readonly workflows: Repository<WorkflowMap>,
    @InjectRepository(Skill) private readonly skills: Repository<Skill>,
    @InjectRepository(SkillUsage)
    private readonly skillUsage: Repository<SkillUsage>,
    @InjectRepository(SkillAdoption)
    private readonly adoptions: Repository<SkillAdoption>,
    @InjectRepository(PromotionRequest)
    private readonly promotions: Repository<PromotionRequest>,
    @InjectRepository(UsageSnapshot)
    private readonly usage: Repository<UsageSnapshot>,
    @InjectRepository(Escalation)
    private readonly escalations: Repository<Escalation>,
  ) {}

  /** Load everything the aggregations need for one org (optionally one team). `usageDays` bounds the snapshot window. */
  async load(
    orgId: string,
    opts: { teamId?: string | null; usageDays?: number; now?: Date } = {},
  ): Promise<OrgFacts> {
    const now = opts.now ?? new Date();
    const org = await this.orgs.findOneOrFail({ where: { id: orgId } });
    const teams = await this.teams.find({
      where: { orgId },
      order: { name: 'ASC' },
    });
    const peopleWhere = opts.teamId
      ? { orgId, teamId: opts.teamId }
      : { orgId };
    const people = await this.people.find({
      where: peopleWhere,
      order: { name: 'ASC' },
    });
    const ids = people.map((p) => p.id);
    const usageFrom = isoDay(
      new Date(now.getTime() - (opts.usageDays ?? 120) * DAY_MS),
    );

    const [
      placements,
      grades,
      notes,
      revisits,
      exercises,
      submissions,
      baselines,
      measurements,
      masterySnapshots,
    ] = ids.length
      ? await Promise.all([
          this.placements.find({
            where: { personId: In(ids) },
            order: { placedAt: 'ASC' },
          }),
          this.grades.find({
            where: { personId: In(ids) },
            order: { gradedAt: 'DESC' },
          }),
          this.notes.find({
            where: { personId: In(ids) },
            order: { createdAt: 'DESC' },
          }),
          this.revisits.find({ where: { personId: In(ids) } }),
          this.exercises.find({
            where: { personId: In(ids) },
            order: { createdAt: 'DESC' },
          }),
          this.submissions.find({
            where: { personId: In(ids) },
            order: { submittedAt: 'DESC' },
          }),
          this.baselines.find({ where: { personId: In(ids) } }),
          this.measurements.find({ where: { personId: In(ids) } }),
          this.masterySnapshots.find({
            where: { personId: In(ids) },
            order: { day: 'DESC' },
          }),
        ])
      : [[], [], [], [], [], [], [], [], []];

    const usage = ids.length
      ? await this.usage
          .createQueryBuilder('u')
          .where('u.orgId = :orgId', { orgId })
          .andWhere('u.personId IN (:...ids)', { ids })
          .andWhere('u.day >= :from', { from: usageFrom })
          .getMany()
      : [];
    const workflows = await this.workflows.find({
      where: opts.teamId ? { orgId, teamId: opts.teamId } : { orgId },
    });
    const skills = await this.skills.find({ where: { orgId } });
    const skillIds = skills.map((s) => s.id);
    const [skillUsage, adoptions] = skillIds.length
      ? await Promise.all([
          this.skillUsage
            .createQueryBuilder('su')
            .where('su.skillId IN (:...skillIds)', { skillIds })
            .andWhere('su.day >= :from', {
              from: isoDay(new Date(now.getTime() - 90 * DAY_MS)),
            })
            .getMany(),
          this.adoptions.find({ where: { skillId: In(skillIds) } }),
        ])
      : [[], []];
    const promotions = await this.promotions.find({
      where: { orgId },
      order: { createdAt: 'DESC' },
    });
    const escalations = await this.escalations.find({
      where: { orgId },
      order: { createdAt: 'DESC' },
    });

    return {
      org,
      now,
      people,
      teams,
      teamName: new Map(teams.map((t) => [t.id, t.name])),
      placements,
      rungs: currentRungs(placements, ids),
      grades,
      notes,
      revisits,
      exercises,
      submissions,
      baselines,
      measurements,
      workflows,
      skills,
      skillUsage,
      adoptions,
      promotions,
      usage,
      escalations,
      masterySnapshots,
      activeDays: usage.map((u) => ({
        personId: u.personId,
        day: u.day,
        active: Boolean(u.metrics?.activeOnRealWork),
      })),
      stalledAfterDays: org.settings?.stalledAfterDays ?? 14,
    };
  }
}

// ============================================================================
// Derivations over OrgFacts (thin, reusable across the surfaces)
// ============================================================================

export function personHoursBack(
  f: OrgFacts,
  personId: string,
): HoursBackResult {
  return hoursBack(
    f.baselines.filter((b) => b.personId === personId),
    f.measurements.filter((m) => m.personId === personId),
  );
}

export function teamHoursBack(
  f: OrgFacts,
  teamId: string | null,
): HoursBackResult {
  const ids = new Set(
    f.people
      .filter((p) => (teamId ? p.teamId === teamId : true))
      .map((p) => p.id),
  );
  return hoursBack(
    f.baselines.filter((b) => ids.has(b.personId)),
    f.measurements.filter((m) => ids.has(m.personId)),
  );
}

export function lastActiveDay(f: OrgFacts, personId: string): string | null {
  let last: string | null = null;
  for (const a of f.activeDays)
    if (a.personId === personId && a.active && (!last || a.day > last))
      last = a.day;
  return last;
}

export function gradeQuality(f: OrgFacts, personId: string): number | null {
  const scores = f.grades
    .filter((g) => g.personId === personId)
    .map((g) => g.score);
  return scores.length ? round(mean(scores)) : null;
}

/** Adoptions of skills authored by `personId`, by other people. */
export function influenceOf(f: OrgFacts, personId: string): number {
  const authored = new Set(
    f.skills.filter((s) => s.ownerPersonId === personId).map((s) => s.id),
  );
  return f.adoptions.filter(
    (a) => authored.has(a.skillId) && a.personId !== personId,
  ).length;
}

export function skillsPublishedBy(f: OrgFacts, personId: string): number {
  return f.skills.filter(
    (s) => s.ownerPersonId === personId && s.status === 'published',
  ).length;
}

export function stalledFor(f: OrgFacts, person: Person): StalledResult {
  const now = f.now;
  const today = isoDay(now);
  const mine = f.placements.filter((p) => p.personId === person.id).sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime());
  // last placement that actually raised the rung (a re-placement at the same rung is not progression)
  let lastRaise: Date | null = null;
  let prev = -1;
  for (const p of mine) {
    if (p.rung > prev) lastRaise = p.placedAt;
    prev = Math.max(prev, p.rung);
  }
  const lastProgressionAt = lastRaise ?? mine[mine.length - 1]?.placedAt ?? person.onboardedAt ?? person.createdAt;
  const lastSubmissionAt = f.submissions.filter((s) => s.personId === person.id).map((s) => s.submittedAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const monthAgo = isoDay(new Date(now.getTime() - 30 * DAY_MS));
  const twoMonthsAgo = isoDay(new Date(now.getTime() - 60 * DAY_MS));
  const tags = f.notes.find((n) => n.personId === person.id)?.tags ?? [];
  return detectStalled(
    {
      lastProgressionAt,
      lastSubmissionAt,
      activeDaysThisMonth: activeDaysCount(f.activeDays, person.id, addDaysIso(monthAgo, 1), today),
      activeDaysPriorMonth: activeDaysCount(f.activeDays, person.id, addDaysIso(twoMonthsAgo, 1), monthAgo),
      latestNoteTags: tags,
      rung: f.rungs.get(person.id) ?? 0,
      status: person.status,
      roles: person.roles,
    },
    now,
    f.stalledAfterDays,
  );
}

export function funnelInputs(f: OrgFacts): FunnelPerson[] {
  return f.people.map((p) => {
    const firstActive = f.activeDays
      .filter((a) => a.personId === p.id && a.active)
      .map((a) => a.day)
      .sort()[0];
    const reached: FunnelPerson['rungReachedAt'] = {};
    for (const pl of f.placements.filter((x) => x.personId === p.id)) {
      for (let r = 1; r <= pl.rung && r <= 5; r++) {
        const key = r as 1 | 2 | 3 | 4 | 5;
        if (!reached[key] || pl.placedAt < reached[key])
          reached[key] = pl.placedAt;
      }
    }
    return {
      provisionedAt: p.createdAt,
      firstLoginAt:
        p.onboardedAt ??
        p.lastSeenAt ??
        (p.status === 'active' ? p.createdAt : null),
      firstRealWorkAt: firstActive
        ? new Date(`${firstActive}T00:00:00Z`)
        : null,
      rungReachedAt: reached,
    };
  });
}
