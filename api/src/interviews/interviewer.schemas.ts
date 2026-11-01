/**
 * Structured-output schemas for the Interviewer role. Every field is required-but-nullable so the
 * schemas stay compatible with Anthropic structured outputs (no optional keys, no numeric bounds).
 */
import { z } from 'zod';
import type { InterviewMode } from './interviews.types';

const str = z.string().nullable();
const strList = z.array(z.string()).nullable();
const num = z.number().nullable();

export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'ad_hoc'] as const;

export const WorkflowScribeSchema = z.object({
  purpose: str,
  trigger: str,
  frequency: z.enum(FREQUENCIES).nullable(),
  minutesPerRun: num,
  runsPerWeek: num,
  inputs: z
    .array(z.object({ name: z.string(), source: z.string(), dataClass: str }))
    .nullable(),
  steps: z
    .array(
      z.object({
        order: z.number().int(),
        action: z.string(),
        actor: z.enum(['human', 'claude', 'system']),
        system: str,
      }),
    )
    .nullable(),
  decisions: z
    .array(z.object({ point: z.string(), rule: z.string() }))
    .nullable(),
  exceptions: z
    .array(z.object({ case: z.string(), handling: z.string() }))
    .nullable(),
  systems: strList,
  mustNeverLeave: strList,
  outputs: z
    .array(z.object({ name: z.string(), destination: z.string() }))
    .nullable(),
  humanReview: strList,
});
export type WorkflowScribe = z.infer<typeof WorkflowScribeSchema>;

export const IntakeScribeSchema = z.object({
  role: str,
  responsibilities: strList,
  weeklyWorkflows: z
    .array(
      z.object({
        name: z.string(),
        minutesPerRun: z.number(),
        runsPerWeek: z.number(),
        systems: z.array(z.string()),
      }),
    )
    .nullable(),
  claudeUseToday: str,
  selfRatedComfort: num,
  sensitivities: strList,
});
export type IntakeScribe = z.infer<typeof IntakeScribeSchema>;

export const ChampionScribeSchema = z.object({
  teamPurpose: str,
  vocabulary: z
    .array(z.object({ term: z.string(), meaning: z.string() }))
    .nullable(),
  anchorWorkflows: strList,
  sensitivities: strList,
  systems: strList,
  priorities: strList,
  seedWorkflows: z
    .array(
      z.object({
        name: z.string(),
        purpose: z.string(),
        frequency: z.enum(FREQUENCIES),
        minutesPerRun: z.number(),
        runsPerWeek: z.number(),
        systems: z.array(z.string()),
      }),
    )
    .nullable(),
});
export type ChampionScribe = z.infer<typeof ChampionScribeSchema>;

const CheckerFlags = z.array(
  z.object({ field: z.string(), issue: z.string() }),
);

function scribeFor(mode: InterviewMode) {
  return mode === 'intake'
    ? IntakeScribeSchema
    : mode === 'champion'
      ? ChampionScribeSchema
      : WorkflowScribeSchema;
}

/**
 * Scribe + checker only (task `interviewer.scribe`). Used after voice turns: the Realtime agent is the
 * interviewer in voice mode, so this call never produces a question.
 */
export function scribeSchemaFor(mode: InterviewMode) {
  return z.object({
    scribeUpdate: scribeFor(mode).describe(
      'Fields you can now fill or correct from the whole conversation. Null for fields with no new information. Arrays are the full current list.',
    ),
    checkerFlags: CheckerFlags.describe(
      'Inconsistencies or gaps the checker sees (field + issue). Empty when none.',
    ),
    completeness: z
      .number()
      .describe('0..1 share of the schema filled to a usable standard.'),
  });
}
export type ScribeOutput = z.infer<ReturnType<typeof scribeSchemaFor>>;

export function turnSchemaFor(mode: InterviewMode) {
  const scribe = scribeFor(mode);
  return z.object({
    nextQuestion: z
      .string()
      .describe(
        'The single next question, in plain language, mirroring back what was just heard in one clause when useful.',
      ),
    scribeUpdate: scribe.describe(
      'Fields you can now fill or correct from the whole conversation. Null for fields with no new information. Arrays are the full current list.',
    ),
    checkerFlags: CheckerFlags.describe(
      'Inconsistencies or gaps the checker sees (field + issue). Empty when none.',
    ),
    completeness: z
      .number()
      .describe('0..1 share of the schema filled to a usable standard.'),
    proposeFinish: z
      .boolean()
      .describe(
        'True when the schema is complete enough to stop and the next question is a wrap-up.',
      ),
    finish: z
      .boolean()
      .describe(
        'Your decision to end the interview. Set true ONLY in the turn where nextQuestion is the closing line; the interview ends immediately after it and nothing further is asked. Otherwise false.',
      ),
  });
}
export type TurnOutput = z.infer<ReturnType<typeof turnSchemaFor>>;

const ContextLayerOut = z.object({
  summary: z.string(),
  vocabulary: z.array(z.object({ term: z.string(), meaning: z.string() })),
  anchorWorkflows: z.array(z.string()),
  sensitivities: z.array(z.string()),
  systems: z.array(z.string()),
});

/**
 * Compact workflow draft for completion outputs. The full WorkflowScribeSchema nested inside an
 * array blew past Anthropic's strict-grammar size limit ("compiled grammar is too large"), so
 * completion returns flat string lists and `compactMapToScribe` expands them.
 */
const WorkflowMapOut = z.object({
  name: z.string(),
  purpose: z.string(),
  trigger: z.string(),
  frequency: z.enum(FREQUENCIES),
  minutesPerRun: z.number(),
  runsPerWeek: z.number(),
  inputs: z
    .array(z.string())
    .describe('Input names, optionally "name — source".'),
  steps: z
    .array(z.string())
    .describe(
      'Steps in order; prefix with "claude:" or "system:" when not done by the human.',
    ),
  decisions: z.array(z.string()).describe('"decision point — rule" strings.'),
  exceptions: z.array(z.string()).describe('"case — handling" strings.'),
  systems: z.array(z.string()),
  mustNeverLeave: z.array(z.string()),
  outputs: z.array(z.string()).describe('"output — destination" strings.'),
  humanReview: z.array(z.string()),
});
export type WorkflowMapOutT = z.infer<typeof WorkflowMapOut>;

const splitPair = (v: string): [string, string] => {
  const i = v.search(/\s[—–-]\s|:\s/);
  return i === -1
    ? [v.trim(), '']
    : [
        v.slice(0, i).trim(),
        v
          .slice(i)
          .replace(/^\s*[—–:-]\s*/, '')
          .trim(),
      ];
};

/** Expand the compact completion draft into the WorkflowScribe shape used everywhere else. */
export function compactMapToScribe(
  m: WorkflowMapOutT,
): Record<string, unknown> {
  return {
    purpose: m.purpose,
    trigger: m.trigger,
    frequency: m.frequency,
    minutesPerRun: m.minutesPerRun,
    runsPerWeek: m.runsPerWeek,
    inputs: m.inputs.map((v) => {
      const [name, source] = splitPair(v);
      return { name, source: source || 'unspecified', dataClass: null };
    }),
    steps: m.steps.map((v, i) => {
      const actorMatch = v.match(/^(human|claude|system):\s*/i);
      return {
        order: i + 1,
        action: actorMatch ? v.slice(actorMatch[0].length) : v,
        actor:
          (actorMatch?.[1].toLowerCase() as 'human' | 'claude' | 'system') ??
          'human',
        system: null,
      };
    }),
    decisions: m.decisions.map((v) => {
      const [point, rule] = splitPair(v);
      return { point, rule: rule || 'as described' };
    }),
    exceptions: m.exceptions.map((v) => {
      const [c, handling] = splitPair(v);
      return { case: c, handling: handling || 'as described' };
    }),
    systems: m.systems,
    mustNeverLeave: m.mustNeverLeave,
    outputs: m.outputs.map((v) => {
      const [name, destination] = splitPair(v);
      return { name, destination: destination || 'unspecified' };
    }),
    humanReview: m.humanReview,
  };
}

export const IntakeCompleteSchema = z.object({
  profile: z.object({
    role: z.string(),
    responsibilities: z.array(z.string()),
    weeklyWorkflows: z.array(
      z.object({
        name: z.string(),
        minutesPerRun: z.number(),
        runsPerWeek: z.number(),
        systems: z.array(z.string()),
      }),
    ),
    claudeUseToday: z.string(),
    selfRatedComfort: z.number(),
    sensitivities: z.array(z.string()),
  }),
  contextLayer: ContextLayerOut,
  workflowMaps: z
    .array(WorkflowMapOut)
    .describe(
      '2–4 workflow map drafts from the weekly workflows named, with minutesPerRun and runsPerWeek.',
    ),
  placement: z.object({
    rung: z.number().int().describe('Diagnostic rung 0, 1 or 2.'),
    evidence: z
      .array(z.string())
      .describe(
        'Quotes or observations from the interview that justify the rung.',
      ),
  }),
});
export type IntakeCompleteOutput = z.infer<typeof IntakeCompleteSchema>;

export const ChampionCompleteSchema = z.object({
  teamPurpose: z.string(),
  contextLayer: ContextLayerOut,
  workflowMaps: z
    .array(WorkflowMapOut)
    .describe('Seed workflow maps for the team backlog (2–6).'),
  priorities: z.array(z.string()),
});
export type ChampionCompleteOutput = z.infer<typeof ChampionCompleteSchema>;

export const WorkflowCompleteSchema = z.object({
  name: z.string().nullable(),
  schema: WorkflowScribeSchema,
  completeness: z.number(),
  openQuestions: z.array(z.string()),
});
export type WorkflowCompleteOutput = z.infer<typeof WorkflowCompleteSchema>;

export function completeSchemaFor(mode: InterviewMode) {
  return mode === 'intake'
    ? IntakeCompleteSchema
    : mode === 'champion'
      ? ChampionCompleteSchema
      : WorkflowCompleteSchema;
}

/** Drop null values so a scribe output becomes a Partial<WorkflowSchema>-style object. */
export function stripNulls<T extends Record<string, unknown>>(
  obj: T,
): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      (out as Record<string, unknown>)[k] = (v as unknown[]).map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? stripNulls(item as Record<string, unknown>)
          : item,
      );
    } else (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export const WORKFLOW_SCHEMA_KEYS = [
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
] as const;
export const INTAKE_KEYS = [
  'role',
  'responsibilities',
  'weeklyWorkflows',
  'claudeUseToday',
  'selfRatedComfort',
] as const; // sensitivities stays on the schema (nullable) but is not asked or counted
export const CHAMPION_KEYS = [
  'teamPurpose',
  'vocabulary',
  'anchorWorkflows',
  'systems',
  'priorities',
  'seedWorkflows',
] as const;

/** Share of schema keys that hold a non-empty value. */
export function schemaCompleteness(
  mode: InterviewMode,
  scribe: Record<string, unknown>,
): number {
  const keys: readonly string[] =
    mode === 'intake'
      ? INTAKE_KEYS
      : mode === 'champion'
        ? CHAMPION_KEYS
        : WORKFLOW_SCHEMA_KEYS;
  const filled = keys.filter((k) => {
    const v = scribe[k];
    if (v === null || v === undefined || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }).length;
  return Math.round((filled / keys.length) * 100) / 100;
}
