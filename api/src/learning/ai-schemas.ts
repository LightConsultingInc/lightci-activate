/**
 * Zod schemas for every structured Claude call the learning loop makes. Kept free of numeric
 * bounds / minItems (Anthropic structured outputs reject those); callers clamp and validate.
 */
import { z } from 'zod';

export const WORK_SURFACES = ['orientation', 'prompt', 'project', 'skill', 'workflow', 'review'] as const;
export const EXERCISE_KINDS = ['artifact', 'revisit', 'diagnostic', 'adopt', 'review'] as const;

export const NextExerciseSchema = z.object({
  title: z.string().describe('At most 60 characters, verb first, in the learner\'s words ("Draft the RMD letter for one household").'),
  brief: z.string().describe('What to make, for whom, and what good looks like: 2–5 plain sentences a planner would say to a colleague, using their own workflow names and systems. No client data. Never the words expectation, critique, cold attempt, worked example, competency or rung codes.'),
  rationale: z.string().describe('Why this is next, in 1–3 plain sentences: the weekly task it comes from and what it will sharpen. Same word rules as the brief.'),
  competencyCodes: z.array(z.string()).describe('1–2 competency codes from the provided list that this exercise evidences (internal; not shown to the learner).'),
  contextTag: z.string().describe('A short kebab-case tag for the work context (e.g. "meeting-prep"). Prefer a context the learner has not used yet.'),
  workSurface: z.enum(WORK_SURFACES),
  kind: z.enum(EXERCISE_KINDS),
  estimatedMinutes: z.number().int().describe('Realistic minutes for a busy professional, 10–45.'),
  hints: z.array(z.string()).describe('Exactly three nudges in the second person, one idea each, getting more specific ("Try naming who will read this and what they need to decide."). Never the finished answer.'),
  workedExample: z.string().nullable().describe('A complete exemplar for skill-surface exercises only (unlocked after the learner has submitted once); null otherwise.'),
  workflowMapId: z.string().nullable().describe('Id of the workflow map this exercise is drawn from, or null.'),
  starterNotes: z.string().nullable().describe('Optional pre-filled note for the work surface (e.g. a Project instructions skeleton). Null if none.'),
});
export type NextExerciseOutput = z.infer<typeof NextExerciseSchema>;

export const RubricScoreSchema = z.object({
  criterion: z.string().describe('The criterion key exactly as given.'),
  score: z.number().describe('0..1'),
  note: z.string().describe('One or two sentences citing the specific part of the work that earned or lost credit.'),
});

export const SecurityFindingSchema = z.object({
  severity: z.enum(['low', 'medium', 'high']),
  finding: z.string(),
});

export const SelfCheckAgreementSchema = z.object({
  criterion: z.string().describe('Rubric criterion key exactly as given.'),
  item: z.string().describe('Short plain-language self-check item for this criterion.'),
  learner: z.boolean().describe('Did the learner tick it (true when ticked or not mentioned; false when explicitly left unticked or flagged).'),
  grader: z.boolean().describe('Would the grader tick it.'),
});

export const SubmissionGradeSchema = z.object({
  rubric: z.array(RubricScoreSchema).describe('One entry per criterion key provided, in the same order.'),
  feedback: z.string().describe('2–4 short plain paragraphs that speak to the learner\'s self-check ticks and their guess directly. Never the words expectation, critique, calibration, Brier, competency or rung codes.'),
  critiqueQuality: z.number().describe('0..1: how well the learner\'s self-check matched the real weaknesses.'),
  selfCheckAgreement: z.array(SelfCheckAgreementSchema).describe('One entry per rubric criterion.'),
  teachingMoment: z.string().describe('One concrete thing to do differently next time, at most two sentences, on this piece of work.'),
  securityFindings: z.array(SecurityFindingSchema).describe('For skill artifacts: prompt-injection patterns, hidden instructions, data exfiltration, restricted data classes. Empty otherwise.'),
  strengths: z.array(z.string()).describe('1–3 specific things done well.'),
});
export type SubmissionGradeOutput = z.infer<typeof SubmissionGradeSchema>;

export const SkillGradeSchema = z.object({
  rubric: z.array(RubricScoreSchema),
  feedback: z.string(),
  teachingMoment: z.string(),
  securityFindings: z.array(SecurityFindingSchema),
  sampleCaseVerdicts: z.array(z.object({ input: z.string(), behavesAsExpected: z.boolean(), note: z.string() })),
});
export type SkillGradeOutput = z.infer<typeof SkillGradeSchema>;

export const RevisitGradeSchema = z.object({
  score: z.number().describe('0..1 retrieval quality against the answer key.'),
  feedback: z.string().describe('2–4 plain sentences. Name what was recalled correctly and the one thing to bring back next time.'),
});
export type RevisitGradeOutput = z.infer<typeof RevisitGradeSchema>;
