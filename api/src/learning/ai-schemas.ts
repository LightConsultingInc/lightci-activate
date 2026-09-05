/**
 * Zod schemas for every structured Claude call the learning loop makes. Kept free of numeric
 * bounds / minItems (Anthropic structured outputs reject those); callers clamp and validate.
 */
import { z } from 'zod';

export const WORK_SURFACES = [
  'orientation',
  'prompt',
  'project',
  'skill',
  'workflow',
  'review',
] as const;
export const EXERCISE_KINDS = [
  'artifact',
  'revisit',
  'diagnostic',
  'adopt',
  'review',
] as const;

export const NextExerciseSchema = z.object({
  title: z
    .string()
    .describe(
      "Short, concrete title in the learner's vocabulary (max 80 chars).",
    ),
  brief: z
    .string()
    .describe(
      'The task itself, 2–5 sentences, addressed to the learner, using their own workflow names and systems. No client data.',
    ),
  rationale: z
    .string()
    .describe(
      'Why Coach chose this now: the weakest competency, the workflow it comes from, and the spacing rule applied. 1–3 sentences.',
    ),
  competencyCodes: z
    .array(z.string())
    .describe(
      '1–2 competency codes from the provided list that this exercise evidences.',
    ),
  contextTag: z
    .string()
    .describe(
      'A short kebab-case tag for the work context (e.g. "meeting-prep"). Prefer a context the learner has not used yet.',
    ),
  workSurface: z.enum(WORK_SURFACES),
  kind: z.enum(EXERCISE_KINDS),
  estimatedMinutes: z
    .number()
    .int()
    .describe('Realistic minutes for a busy professional, 10–45.'),
  hints: z
    .array(z.string())
    .describe(
      'Exactly three progressive hints: a nudge, a narrower pointer, a near-complete scaffold. Never the finished answer.',
    ),
  workedExample: z
    .string()
    .nullable()
    .describe(
      'A complete exemplar for L3 skill exercises only (shown after a cold attempt); null otherwise.',
    ),
  workflowMapId: z
    .string()
    .nullable()
    .describe('Id of the workflow map this exercise is drawn from, or null.'),
  starterNotes: z
    .string()
    .nullable()
    .describe(
      'Optional pre-filled note for the work surface (e.g. a Project instructions skeleton). Null if none.',
    ),
});
export type NextExerciseOutput = z.infer<typeof NextExerciseSchema>;

export const RubricScoreSchema = z.object({
  criterion: z.string().describe('The criterion key exactly as given.'),
  score: z.number().describe('0..1'),
  note: z
    .string()
    .describe(
      'One or two sentences citing the specific part of the artifact that earned or lost credit.',
    ),
});

export const SecurityFindingSchema = z.object({
  severity: z.enum(['low', 'medium', 'high']),
  finding: z.string(),
});

export const SubmissionGradeSchema = z.object({
  rubric: z
    .array(RubricScoreSchema)
    .describe('One entry per criterion key provided, in the same order.'),
  feedback: z
    .string()
    .describe(
      "2–4 paragraphs. Hints before answers. Quote the learner's own expectation and critique.",
    ),
  critiqueQuality: z
    .number()
    .describe(
      "0..1: did the learner's critique find the artifact's real weaknesses?",
    ),
  teachingMoment: z
    .string()
    .describe(
      "One just-in-time lesson (3–6 sentences) tied to the weakest criterion, taught on the learner's own work.",
    ),
  securityFindings: z
    .array(SecurityFindingSchema)
    .describe(
      'For skill artifacts: prompt-injection patterns, hidden instructions, data exfiltration, restricted data classes. Empty otherwise.',
    ),
  strengths: z.array(z.string()).describe('1–3 specific things done well.'),
});
export type SubmissionGradeOutput = z.infer<typeof SubmissionGradeSchema>;

export const SkillGradeSchema = z.object({
  rubric: z.array(RubricScoreSchema),
  feedback: z.string(),
  teachingMoment: z.string(),
  securityFindings: z.array(SecurityFindingSchema),
  sampleCaseVerdicts: z.array(
    z.object({
      input: z.string(),
      behavesAsExpected: z.boolean(),
      note: z.string(),
    }),
  ),
});
export type SkillGradeOutput = z.infer<typeof SkillGradeSchema>;

export const RevisitGradeSchema = z.object({
  score: z.number().describe('0..1 retrieval quality against the answer key.'),
  feedback: z
    .string()
    .describe(
      '2–4 sentences. Name what was recalled correctly and the one thing to retrieve next time.',
    ),
});
export type RevisitGradeOutput = z.infer<typeof RevisitGradeSchema>;
