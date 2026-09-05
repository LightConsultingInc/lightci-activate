import { z } from 'zod';

/** Task `scorer.workflow`: the four scoring dimensions plus rationale. Composite is computed in code. */
export const ScorerOutputSchema = z.object({
  value: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Business value of automating this workflow, 0..1, relative to the firm's other work.",
    ),
  hoursPerWeek: z
    .number()
    .min(0)
    .describe(
      'Hours per week at stake across the team (minutesPerRun × runsPerWeek ÷ 60, adjusted for how many people run it).',
    ),
  readiness: z
    .number()
    .min(0)
    .max(1)
    .describe(
      'Automation readiness 0..1: template-shaped inputs, explicit steps, few judgement calls, systems read-only.',
    ),
  exposure: z
    .number()
    .min(0)
    .max(1)
    .describe(
      'Compliance exposure 0..1: restricted data classes in inputs, outputs that leave the firm, writes to systems of record.',
    ),
  rationale: z
    .string()
    .describe(
      'Three or four sentences an operating partner could read: why this ranks where it does, and the one thing that would move it.',
    ),
});
export type ScorerOutput = z.infer<typeof ScorerOutputSchema>;

const SampleCaseSchema = z.object({
  input: z.string().describe("A realistic request in the team's own words."),
  shouldTrigger: z.enum(['yes', 'no', 'ambiguous']),
  expected: z
    .string()
    .describe(
      'What the skill should do with it (or why it should not trigger).',
    ),
});

/** Task `builder.skill`: a complete draft skill compiled from a workflow map. */
export const BuilderOutputSchema = z.object({
  name: z.string().describe('Human name, e.g. "Advisor meeting prep".'),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .describe('kebab-case identifier.'),
  triggerLine: z
    .string()
    .describe(
      "The frontmatter description: when to use AND when not to, in the user's vocabulary.",
    ),
  skillMd: z
    .string()
    .describe(
      'Full SKILL.md with YAML frontmatter (name, description, metadata) and sections: When to use / Inputs / Steps / Output format / Boundaries / Examples (two canonical examples).',
    ),
  boundary: z.object({
    mayRead: z.array(z.string()),
    mustNeverReceive: z.array(z.string()),
    humanReview: z.array(z.string()),
  }),
  sampleCases: z
    .array(SampleCaseSchema)
    .min(4)
    .describe('Four cases: two should-trigger, one should-not, one ambiguous.'),
  rungRequired: z
    .number()
    .int()
    .min(0)
    .max(5)
    .describe(
      'Minimum ladder rung to be assigned this skill (usually 1 or 2).',
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      'How confident the Builder is that this draft is correct without a human reworking it. Below 0.6 escalates.',
    ),
  openQuestions: z
    .array(z.string())
    .describe(
      'Things the workflow map did not settle that a human must answer.',
    ),
});
export type BuilderOutput = z.infer<typeof BuilderOutputSchema>;
