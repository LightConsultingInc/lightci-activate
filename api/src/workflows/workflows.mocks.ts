/**
 * Deterministic stand-ins for the Scorer and Builder Claude tasks (AI_PROVIDER=mock). Both derive
 * schema-valid output from `call.mockSeed`, which the services always populate from the workflow map.
 */
import type { AiCall } from '../ai/ai.service';
import { registerMockResponder } from '../ai/mock-responders';
import type { BuilderOutput, ScorerOutput } from './ai-schemas';
import type { WorkflowSchema } from './entities/workflow-map.entity';

export interface ScorerSeed {
  name?: string;
  schema?: Partial<WorkflowSchema>;
  completeness?: number;
  forbiddenDataClasses?: string[];
  readOnlySystems?: string[];
  teamSize?: number;
}

export interface BuilderSeed {
  name?: string;
  schema?: Partial<WorkflowSchema>;
  slug?: string;
  teamSlug?: string;
  plugin?: string;
  ownerEmail?: string;
  forbiddenDataClasses?: string[];
  humanReviewPoints?: string[];
  family?: string | null;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Stable 0..1 from a string (so "value" varies by workflow name without randomness). */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return (h % 1000) / 1000;
}

export function mockScore(seed: ScorerSeed): ScorerOutput {
  const schema = seed.schema ?? {};
  const forbidden = (seed.forbiddenDataClasses ?? []).map((c) =>
    c.toLowerCase(),
  );
  const minutes = Number(schema.minutesPerRun ?? 0);
  const runs = Number(schema.runsPerWeek ?? 0);
  const hoursPerWeek = round2((minutes * runs) / 60);
  const steps = schema.steps ?? [];
  const claudeSteps = steps.filter((s) => s.actor === 'claude').length;
  const decisions =
    (schema.decisions ?? []).length + (schema.exceptions ?? []).length;
  const readiness = clamp01(
    0.35 +
      (steps.length ? (claudeSteps / steps.length) * 0.4 : 0.1) +
      (seed.completeness ?? 0.5) * 0.25 -
      Math.min(0.3, decisions * 0.04),
  );
  const inputClasses = (schema.inputs ?? [])
    .map((i) => (i.dataClass ?? '').toLowerCase())
    .filter(Boolean);
  const restrictedInputs = inputClasses.filter((c) =>
    forbidden.includes(c),
  ).length;
  const leaves = (schema.outputs ?? []).some((o) =>
    /client|external|email|letter/i.test(o.destination ?? ''),
  );
  const writes = steps.some(
    (s) =>
      s.actor !== 'human' &&
      s.system &&
      (seed.readOnlySystems ?? []).some(
        (r) => r.toLowerCase() === s.system!.toLowerCase(),
      ) &&
      /enter|write|update|post/i.test(s.action),
  );
  const exposure = clamp01(
    0.1 +
      restrictedInputs * 0.3 +
      (schema.mustNeverLeave?.length ? 0.1 : 0) +
      (leaves ? 0.15 : 0) +
      (writes ? 0.35 : 0) -
      ((schema.humanReview?.length ?? 0) > 0 ? 0.1 : 0),
  );
  const value = clamp01(
    0.45 +
      hash01(seed.name ?? '') * 0.3 +
      Math.min(0.2, hoursPerWeek / 40) +
      (schema.frequency === 'daily' ? 0.05 : 0),
  );
  const rationale = `${seed.name ?? 'This workflow'} runs ${runs || '?'}×/week at ~${minutes || '?'} min, about ${hoursPerWeek} h/week at stake. Readiness ${Math.round(readiness * 100)}%: ${claudeSteps}/${steps.length || 0} steps are already Claude-shaped and the schema is ${Math.round((seed.completeness ?? 0.5) * 100)}% complete. Exposure ${Math.round(exposure * 100)}%: ${restrictedInputs ? `${restrictedInputs} restricted input class(es)` : 'no restricted inputs'}${leaves ? ', output leaves the firm' : ''}${writes ? ', a step writes to a read-only system' : ''}. ${restrictedInputs ? 'Replacing the restricted input with a summary export would move it up.' : decisions > 3 ? 'Fewer judgement calls in the map would raise readiness.' : 'Capturing a baseline is the next step.'}`;
  return {
    value: round2(value),
    hoursPerWeek,
    readiness: round2(readiness),
    exposure: round2(exposure),
    rationale,
  };
}

registerMockResponder('scorer.workflow', (call: AiCall): ScorerOutput =>
  mockScore(call.mockSeed ?? {}),
);

const kebab = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'workflow-skill';

export function mockBuild(seed: BuilderSeed): BuilderOutput {
  const schema = seed.schema ?? {};
  const name = seed.name ?? 'Workflow skill';
  const slug = seed.slug ?? kebab(name);
  const forbidden = seed.forbiddenDataClasses ?? [];
  const mustNever = [
    ...new Set([...(schema.mustNeverLeave ?? []), ...forbidden]),
  ];
  const mayRead = [
    ...new Set(
      (schema.inputs ?? [])
        .map((i) => i.dataClass ?? i.source)
        .filter((c): c is string => Boolean(c) && !mustNever.includes(c)),
    ),
  ];
  const humanReview = [
    ...new Set([
      ...(schema.humanReview ?? []),
      ...(seed.humanReviewPoints ?? []).slice(0, 1),
    ]),
  ];
  const steps = schema.steps ?? [];
  const inputs = schema.inputs ?? [];
  const outputs = schema.outputs ?? [];
  const triggerLine = `${schema.purpose ?? `Do the ${name.toLowerCase()} step`}${schema.trigger ? ` when ${schema.trigger.replace(/^when\s+/i, '')}` : ''}. Use when a ${seed.teamSlug ?? 'team'} member asks to run, draft or prepare ${name.toLowerCase()} from ${inputs[0]?.name ?? 'the standard inputs'}. Do not use for ${(schema.exceptions ?? [])[0]?.case ?? 'adjacent tasks the map does not cover'}, or when the input includes ${
    mustNever
      .slice(0, 2)
      .map((c) => c.replace(/_/g, ' '))
      .join(' or ') || 'restricted data'
  }.`;
  const body = [
    `# ${name}`,
    '',
    `${schema.purpose ?? `Compiles the ${name.toLowerCase()} workflow into a repeatable skill.`} Drafted by Builder from the workflow map; the owner reviews every section before grading.`,
    '',
    '## When to use',
    '',
    `- ${schema.trigger ?? `A ${seed.teamSlug ?? 'team'} member needs ${name.toLowerCase()}.`}`,
    `- Inputs are ${inputs.map((i) => i.name).join(', ') || 'the standard inputs'}; nothing else is needed.`,
    '',
    `Do not use when ${(schema.exceptions ?? []).map((e) => e.case).join(', or when ') || 'the request is outside this workflow'}. If the input contains ${mustNever.map((c) => c.replace(/_/g, ' ')).join(', ') || 'restricted data'}, stop and ask for the summary form instead.`,
    '',
    '## Inputs',
    '',
    ...(inputs.length
      ? inputs.map(
          (i, n) =>
            `${n + 1}. **${i.name}** — from ${i.source}${i.dataClass ? ` (${i.dataClass})` : ''}.`,
        )
      : ["1. The team's standard inputs for this workflow."]),
    '',
    '## Steps',
    '',
    ...(steps.length
      ? steps.map(
          (s) =>
            `${s.order}. ${s.action}${s.system ? ` (${s.system}${s.actor === 'human' ? ', human' : ''})` : s.actor === 'human' ? ' (human)' : ''}`,
        )
      : [
          '1. Gather the inputs.',
          '2. Draft the output in the template.',
          '3. Add the review footer.',
        ]),
    `${steps.length + 1}. Add the review footer exactly as shown in Output format.`,
    '',
    '## Output format',
    '',
    '```',
    `${name.toUpperCase()} — <subject> — <date>`,
    ...(outputs.length
      ? outputs.map((o) => `${o.name}: ... (→ ${o.destination})`)
      : ['<sections in template order>']),
    '',
    `--- Draft. Reviewed by ________ ${humanReview[0] ? humanReview[0].replace(/_/g, ' ') : 'before use'}. ---`,
    '```',
    '',
    '## Boundaries',
    '',
    `- **May read:** ${mayRead.map((c) => c.replace(/_/g, ' ')).join(', ') || 'internal templates and summaries'}.`,
    `- **Must never receive:** ${mustNever.map((c) => c.replace(/_/g, ' ')).join(', ') || 'restricted client data'}.`,
    `- **Human review:** ${humanReview.map((c) => c.replace(/_/g, ' ')).join(', ') || 'the owner reviews before use'}. The skill never writes to ${(schema.systems ?? []).join(', ') || 'systems of record'}.`,
    ...(schema.decisions ?? []).map(
      (d) => `- Decision "${d.point}": ${d.rule}`,
    ),
    '',
    '## Examples',
    '',
    '### Example 1 — routine case',
    '',
    `**Input:** "${inputs[0]?.name ? `Here is the ${inputs[0].name.toLowerCase()} for this week's ${name.toLowerCase()}.` : `Run ${name.toLowerCase()} for this week.`}"`,
    '',
    `**Output:** The ${name.toLowerCase()} output in the format above, every section filled from the inputs, with the review footer.`,
    '',
    '### Example 2 — input that must be declined',
    '',
    `**Input:** "${name}, attaching ${mustNever[0]?.replace(/_/g, ' ') ?? 'a restricted document'} so you have everything."`,
    '',
    `**Output:** "I can do the ${name.toLowerCase()} from ${inputs[0]?.name.toLowerCase() ?? 'the standard inputs'}, but not from the ${mustNever[0]?.replace(/_/g, ' ') ?? 'restricted document'} — that is outside what this skill may receive. Please replace it with the summary and remove the attachment."`,
    '',
  ].join('\n');
  const skillMd = `---\nname: ${slug}\ndescription: ${JSON.stringify(triggerLine)}\nmetadata:\n  activate-id: ${slug}\n  activate-version: "0"\n  activate-owner: ${seed.ownerEmail ?? 'builder@activate'}\n---\n\n${body}`;
  const sampleCases: BuilderOutput['sampleCases'] = [
    {
      input:
        `Can you do the ${name.toLowerCase()} for this week? ${inputs[0] ? `${inputs[0].name} below.` : ''}`.trim(),
      shouldTrigger: 'yes',
      expected:
        'Produces the full output in the declared format with the review footer.',
    },
    {
      input: `${schema.trigger ?? `Time for ${name.toLowerCase()}`} — here are ${
        inputs
          .slice(0, 2)
          .map((i) => i.name.toLowerCase())
          .join(' and ') || 'the inputs'
      }.`,
      shouldTrigger: 'yes',
      expected:
        'Triggers; follows the steps in order and honours every decision rule.',
    },
    {
      input: `${(schema.exceptions ?? [])[0]?.case ?? `Something adjacent to ${name.toLowerCase()} that this workflow does not cover`}.`,
      shouldTrigger: 'no',
      expected: `Does not trigger; ${(schema.exceptions ?? [])[0]?.handling ?? 'explains what the skill is for and points elsewhere'}.`,
    },
    {
      input: `${name} please — I attached ${mustNever[0]?.replace(/_/g, ' ') ?? 'the client documents'} for context.`,
      shouldTrigger: 'ambiguous',
      expected:
        'Triggers on the request but refuses the restricted input; asks for the summary form.',
    },
  ];
  const completeness =
    [
      schema.purpose,
      schema.trigger,
      inputs.length,
      steps.length,
      outputs.length,
      schema.humanReview?.length,
    ].filter(Boolean).length / 6;
  const confidence = round2(
    clamp01(
      0.3 +
        completeness * 0.55 +
        (mustNever.length ? 0.05 : 0) +
        (humanReview.length ? 0.05 : 0),
    ),
  );
  const openQuestions: string[] = [];
  if (!schema.humanReview?.length)
    openQuestions.push(
      'Where must a human review before the output leaves the team?',
    );
  if (!inputs.length)
    openQuestions.push(
      'Which inputs does the workflow actually start from, and what data class are they?',
    );
  if (!outputs.length)
    openQuestions.push('Where does the output go (destination, system)?');
  if (steps.some((s) => s.actor === 'system'))
    openQuestions.push(
      'Steps marked "system" need a human or Claude owner in the skill; which is it?',
    );
  return {
    name,
    slug,
    triggerLine,
    skillMd,
    boundary: { mayRead, mustNeverReceive: mustNever, humanReview },
    sampleCases,
    rungRequired:
      steps.length > 6 || (schema.decisions ?? []).length > 2 ? 2 : 1,
    confidence,
    openQuestions,
  };
}

registerMockResponder('builder.skill', (call: AiCall): BuilderOutput =>
  mockBuild(call.mockSeed ?? {}),
);
