/**
 * Wire shapes for the "Workflows" section of docs/api-contract.md plus the pure scoring maths
 * (composite normalisation, hours back). No I/O; tested in workflows.spec.ts.
 */
import type { PersonRef } from '../learning/learning.types';
import type { SkillCard } from '../skills/skills.types';
import type { Baseline } from './entities/baseline.entity';
import type { Measurement } from './entities/measurement.entity';
import type {
  WorkflowMap,
  WorkflowSchema,
  WorkflowScore,
  WorkflowStatus,
} from './entities/workflow-map.entity';

export interface WorkflowSummary {
  id: string;
  name: string;
  teamId: string | null;
  teamName: string | null;
  owner: PersonRef | null;
  status: WorkflowStatus;
  completeness: number;
  championVerified: boolean;
  score: WorkflowScore | null;
  nextWave: boolean;
  linkedSkills: SkillCard[];
  baselineMinutesPerWeek: number;
  measuredMinutesPerWeek: number;
  hoursBackPerWeek: number;
  updatedAt: string;
}

export interface BaselineView {
  id: string;
  personId: string;
  workflowMapId: string | null;
  task: string;
  method: Baseline['method'];
  minutesPerWeek: number;
  reworkMinutesPerWeek: number;
  approvedByPersonId: string | null;
  capturedAt: string;
}

export interface MeasurementView {
  id: string;
  personId: string;
  workflowMapId: string | null;
  baselineId: string | null;
  task: string;
  minutesPerWeek: number;
  reworkMinutesPerWeek: number;
  periodStart: string;
  periodEnd: string;
  method: Measurement['method'];
  source: Measurement['source'];
  createdAt: string;
}

export interface WorkflowDetail extends WorkflowSummary {
  schema: Partial<WorkflowSchema>;
  interviewSessionId: string | null;
  baselines: BaselineView[];
  measurements: MeasurementView[];
}

export interface BacklogResponse {
  items: WorkflowSummary[];
  totals: {
    hoursAtStake: number;
    candidates: number;
    inBuild: number;
    shipped: number;
    nextWave: number;
  };
}

export interface WorkflowFilters {
  teamId?: string;
  status?: WorkflowStatus;
  nextWave?: boolean;
  /** Restrict to workflows owned by this person. */
  ownerPersonId?: string;
}

export interface CreateWorkflowInput {
  name: string;
  teamId?: string | null;
  schema?: Partial<WorkflowSchema>;
}

export interface PatchWorkflowInput {
  name?: string;
  schema?: Partial<WorkflowSchema>;
  status?: WorkflowStatus;
  nextWave?: boolean;
  teamId?: string | null;
}

export interface BaselineInput {
  method: Baseline['method'];
  minutesPerWeek: number;
  reworkMinutesPerWeek?: number;
  task?: string;
  personId?: string;
}

export interface MeasurementInput {
  minutesPerWeek: number;
  reworkMinutesPerWeek?: number;
  periodStart: string;
  periodEnd: string;
  method: Measurement['method'];
  source?: Measurement['source'];
  task?: string;
  personId?: string;
}

// ───────────────────────── pure maths ─────────────────────────

const clamp01 = (n: number) =>
  Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

/** value × hours × readiness ÷ (1 + exposure); ≥ 0. */
export function rawComposite(
  value: number,
  hours: number,
  readiness: number,
  exposure: number,
): number {
  const h = Math.max(0, Number.isFinite(hours) ? hours : 0);
  return (clamp01(value) * h * clamp01(readiness)) / (1 + clamp01(exposure));
}

/** Normalise a raw composite to 0..100 against the org's maximum raw composite. */
export function normaliseComposite(raw: number, maxRaw: number): number {
  if (!(maxRaw > 0) || !(raw > 0)) return 0;
  return Math.round(Math.min(100, (raw / maxRaw) * 100) * 10) / 10;
}

/** Recompute composites for a set of scores against their shared max. Returns a new array. */
export function normaliseAll<T extends { score: WorkflowScore | null }>(
  items: T[],
): T[] {
  const raws = items.map((i) =>
    i.score
      ? rawComposite(
          i.score.value,
          i.score.hours,
          i.score.readiness,
          i.score.exposure,
        )
      : 0,
  );
  const max = Math.max(0, ...raws);
  return items.map((i, idx) =>
    i.score
      ? {
          ...i,
          score: { ...i.score, composite: normaliseComposite(raws[idx], max) },
        }
      : i,
  );
}

/** Hours back per week, net of rework: (baseline − measured − rework) / 60. Never NaN. */
export function hoursBackPerWeek(
  baselineMinutes: number | null | undefined,
  measuredMinutes: number | null | undefined,
  reworkMinutes: number | null | undefined,
): number {
  if (baselineMinutes == null || measuredMinutes == null) return 0;
  const v = (baselineMinutes - measuredMinutes - (reworkMinutes ?? 0)) / 60;
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

/** Hours/week at stake implied by the schema (minutesPerRun × runsPerWeek / 60). */
export function hoursAtStake(
  schema: Partial<WorkflowSchema> | null | undefined,
): number {
  const m = Number(schema?.minutesPerRun ?? 0);
  const r = Number(schema?.runsPerWeek ?? 0);
  return Number.isFinite(m * r) ? Math.round((m * r) / 6) / 10 : 0;
}

/** Fraction of schema fields filled (0..1). Used by Interviewer/seed too; the same definition. */
export const SCHEMA_FIELDS: (keyof WorkflowSchema)[] = [
  'purpose',
  'trigger',
  'frequency',
  'minutesPerRun',
  'runsPerWeek',
  'inputs',
  'steps',
  'decisions',
  'exceptions',
  'systems',
  'mustNeverLeave',
  'outputs',
  'humanReview',
];
export function schemaCompleteness(
  schema: Partial<WorkflowSchema> | null | undefined,
): number {
  if (!schema) return 0;
  let filled = 0;
  for (const f of SCHEMA_FIELDS) {
    const v = schema[f];
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'number' && !(v > 0)) continue;
    filled++;
  }
  return Math.round((filled / SCHEMA_FIELDS.length) * 100) / 100;
}

export interface WorkflowSummaryContext {
  team: { id: string; name: string } | null;
  owner: PersonRef | null;
  linkedSkills: SkillCard[];
  baseline: Baseline | null;
  measurement: Measurement | null;
}

export function toWorkflowSummary(
  map: WorkflowMap,
  ctx: WorkflowSummaryContext,
): WorkflowSummary {
  const baselineMinutes = ctx.baseline?.minutesPerWeek ?? 0;
  const measuredMinutes = ctx.measurement?.minutesPerWeek ?? baselineMinutes;
  return {
    id: map.id,
    name: map.name,
    teamId: map.teamId,
    teamName: ctx.team?.name ?? null,
    owner: ctx.owner,
    status: map.status,
    completeness: map.completeness,
    championVerified: map.championVerified,
    score: map.score,
    nextWave: map.nextWave,
    linkedSkills: ctx.linkedSkills,
    baselineMinutesPerWeek: baselineMinutes,
    measuredMinutesPerWeek: measuredMinutes,
    hoursBackPerWeek:
      ctx.baseline && ctx.measurement
        ? hoursBackPerWeek(
            baselineMinutes,
            measuredMinutes,
            ctx.measurement.reworkMinutesPerWeek,
          )
        : 0,
    updatedAt: new Date(map.updatedAt ?? Date.now()).toISOString(),
  };
}

export function toBaselineView(b: Baseline): BaselineView {
  return {
    id: b.id,
    personId: b.personId,
    workflowMapId: b.workflowMapId,
    task: b.task,
    method: b.method,
    minutesPerWeek: b.minutesPerWeek,
    reworkMinutesPerWeek: b.reworkMinutesPerWeek,
    approvedByPersonId: b.approvedByPersonId,
    capturedAt: new Date(b.capturedAt ?? Date.now()).toISOString(),
  };
}

export function toMeasurementView(m: Measurement): MeasurementView {
  return {
    id: m.id,
    personId: m.personId,
    workflowMapId: m.workflowMapId,
    baselineId: m.baselineId,
    task: m.task,
    minutesPerWeek: m.minutesPerWeek,
    reworkMinutesPerWeek: m.reworkMinutesPerWeek,
    periodStart: String(m.periodStart),
    periodEnd: String(m.periodEnd),
    method: m.method,
    source: m.source,
    createdAt: new Date(m.createdAt ?? Date.now()).toISOString(),
  };
}
