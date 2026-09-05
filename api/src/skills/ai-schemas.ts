import { z } from 'zod';

/** Structured output for task `promoter.package`: the one-screen approval pack. */
export const PromoterPackageSchema = z.object({
  approvalSummary: z
    .string()
    .describe(
      'One screen (≤ 900 chars) a champion reads before approving: what the skill does, who it is for, what changed, what the grader said, what the boundary check found.',
    ),
  risks: z
    .array(z.string())
    .describe(
      'Concrete risks for the approver, each one sentence; empty when none.',
    ),
  testResults: z
    .string()
    .describe(
      'Reasoned evaluation of each sample case against the skill text (no execution): case → would trigger? → behaves as expected? → note.',
    ),
});
export type PromoterPackageOutput = z.infer<typeof PromoterPackageSchema>;
