/**
 * Deterministic stand-ins for the learning loop's Claude tasks (AI_PROVIDER=mock). Each responder
 * derives sensible, schema-valid output from `call.mockSeed`, which the services always populate.
 * Registered on import; the module and the services import this file for its side effect.
 */
import type { AiCall } from '../ai/ai.service';
import { registerMockResponder } from '../ai/mock-responders';
import type {
  NextExerciseOutput,
  RevisitGradeOutput,
  SkillGradeOutput,
  SubmissionGradeOutput,
} from './ai-schemas';

type Criterion = { criterion: string; label: string };

function seed<T = Record<string, unknown>>(call: AiCall): T {
  return (call.mockSeed ?? {}) as T;
}

export const MOCK_GOOD_SCORE = 0.86;
export const MOCK_WEAK_SCORE = 0.62;

/** The grader heuristic the E2E suite relies on: mentions "expected" and length > 200 → strong artifact. */
export function mockArtifactScore(artifactText: string): number {
  return /expected/i.test(artifactText) && artifactText.length > 200
    ? MOCK_GOOD_SCORE
    : MOCK_WEAK_SCORE;
}

registerMockResponder('grader.submission', (call): SubmissionGradeOutput => {
  const s = seed<{
    criteria?: Criterion[];
    artifactText?: string;
    critiqueText?: string;
    expectationText?: string;
    isSkill?: boolean;
  }>(call);
  const criteria = s.criteria ?? [{ criterion: 'quality', label: 'Quality' }];
  const artifact = s.artifactText ?? '';
  const base = mockArtifactScore(artifact);
  const critiqueQuality =
    (s.critiqueText ?? '').trim().length > 80 ? 0.72 : 0.4;
  const rubric = criteria.map((c, i) => ({
    criterion: c.criterion,
    score: Math.max(0, Math.min(1, base + (i % 2 === 0 ? 0.03 : -0.03))),
    note: `${c.label}: ${base >= MOCK_GOOD_SCORE ? 'the artifact states what it expected and covers the task in enough depth' : 'the artifact is thin here; it does not say what a good result would look like'} (mock grader).`,
  }));
  const weakest = criteria[criteria.length - 1] ?? criteria[0];
  return {
    rubric,
    feedback: [
      `What worked: ${base >= MOCK_GOOD_SCORE ? 'you wrote down a concrete expectation and the artifact is substantial enough to judge' : 'you made an attempt and recorded an expectation, which is the habit this rung is about'}.`,
      `The main gap is ${weakest.label.toLowerCase()}. Before fixing anything, re-read the brief and ask what a colleague would need to see to trust this output; that is the criterion your artifact leaves most exposed.`,
      `You expected: "${(s.expectationText ?? '').slice(0, 140)}". Your critique said: "${(s.critiqueText ?? '').slice(0, 140)}". ${critiqueQuality > 0.5 ? 'Your critique found the real weakness, which is the discernment habit we want.' : 'Your critique stayed general; next time name the single sentence you would change and why.'}`,
    ].join('\n\n'),
    critiqueQuality,
    teachingMoment: `On ${weakest.label.toLowerCase()}: the fastest improvement is to state, in the prompt itself, what "good" looks like for this task. Claude matches the standard you set; when the standard is implicit, the output is generic.`,
    securityFindings:
      s.isSkill && /ignore (all )?previous instructions/i.test(artifact)
        ? [
            {
              severity: 'high',
              finding:
                'Prompt-injection pattern: "ignore previous instructions".',
            },
          ]
        : [],
    strengths: [
      base >= MOCK_GOOD_SCORE
        ? 'Expectation stated before the run'
        : 'Attempted cold',
    ],
  };
});

registerMockResponder('grader.skill', (call): SkillGradeOutput => {
  const s = seed<{
    criteria?: Criterion[];
    skillMd?: string;
    sampleCases?: { input: string; shouldTrigger: string; expected: string }[];
  }>(call);
  const criteria = s.criteria ?? [];
  const md = s.skillMd ?? '';
  const strong =
    md.length > 400 && /when to use|use this skill when|trigger/i.test(md);
  const base = strong ? 0.88 : 0.6;
  return {
    rubric: criteria.map((c, i) => ({
      criterion: c.criterion,
      score: Math.max(
        0,
        Math.min(1, base + (i % 3 === 0 ? 0.02 : i % 3 === 1 ? 0 : -0.04)),
      ),
      note: `${c.label}: ${strong ? 'present and specific' : 'missing or generic'} (mock grader).`,
    })),
    feedback: strong
      ? "The trigger line names the situation in the team's words and the body is scoped to one job. Move the long template into a linked file and add an ambiguous sample case before requesting promotion.\n\nBoundary declaration is present; confirm the read-only systems are named exactly as the firm lists them."
      : 'The skill does not yet say when Claude should reach for it, so a model choosing among many skills would not pick it reliably. Start with one sentence: "Use when ...". Then cut everything Claude already does by default.\n\nAdd sample cases covering should-trigger, should-not and ambiguous.',
    teachingMoment:
      "A skill's description is its trigger. Write it as the sentence a teammate would say when they need it, not as a summary of the steps.",
    securityFindings:
      /ignore (all )?previous instructions|curl |webhook|<!--/i.test(md)
        ? [
            {
              severity: 'high',
              finding:
                'Suspicious instruction or exfiltration pattern found in SKILL.md (mock security review).',
            },
          ]
        : [],
    sampleCaseVerdicts: (s.sampleCases ?? []).map((c) => ({
      input: c.input,
      behavesAsExpected: strong,
      note: strong
        ? 'Expected behaviour follows from the trigger line.'
        : 'Trigger line too vague to predict behaviour.',
    })),
  };
});

registerMockResponder('grader.revisit', (call): RevisitGradeOutput => {
  const s = seed<{ response?: string }>(call);
  const response = (s.response ?? '').trim();
  const score = response.length > 60 ? 0.85 : 0.5;
  return {
    score,
    feedback:
      score >= 0.8
        ? 'You recalled the core idea and tied it to your own workflow. Next time, also name the failure mode you are guarding against.'
        : 'That is the general shape but not the specific rule. Retrieve the concrete criterion you applied last time and say where in your workflow it bites.',
  };
});

const MOCK_TITLES: Record<string, string> = {
  prompt: 'Draft it with a stated expectation',
  project: 'Build a Project for your repeated task',
  skill: 'Write the skill cold',
  workflow: 'Map the workflow end to end',
  review: "Review a teammate's submission",
  orientation: 'Finish one real piece of work',
};

registerMockResponder('coach.next-exercise', (call): NextExerciseOutput => {
  const s = seed<{
    rung?: number;
    weakestCode?: string;
    weakestName?: string;
    workSurface?: string;
    usedContexts?: string[];
    workflows?: { id: string; name: string }[];
    allowedCodes?: string[];
  }>(call);
  const surface = (s.workSurface ??
    'prompt') as NextExerciseOutput['workSurface'];
  const used = new Set(s.usedContexts ?? []);
  const candidates = [
    'meeting-prep',
    'client-summary',
    'weekly-report',
    'policy-check',
    'data-reformat',
    'email-draft',
  ];
  const contextTag =
    candidates.find((c) => !used.has(c)) ?? `context-${used.size + 1}`;
  const wf = s.workflows?.[0] ?? null;
  const code = s.weakestCode ?? s.allowedCodes?.[0] ?? 'L1.description';
  return {
    title: `${MOCK_TITLES[surface] ?? 'Next exercise'}: ${wf?.name ?? contextTag}`,
    brief: `Take your ${wf?.name ?? contextTag.replace(/-/g, ' ')} task as you would do it this week. Write down what a good result looks like before you run anything, then produce the ${surface === 'skill' ? 'SKILL.md and three sample cases' : surface === 'project' ? 'Project instructions and the files you would include, with a one-paragraph rationale for what you left out' : 'prompt and take the output through your own critique'}. Use placeholders for anything client-specific.`,
    rationale: `${s.weakestName ?? code} is your lowest competency at L${s.rung ?? 1}, and you have not yet worked in the "${contextTag}" context; spacing rules kept this from repeating your last exercise.`,
    competencyCodes: [code],
    contextTag,
    workSurface: surface,
    kind: 'artifact',
    estimatedMinutes: surface === 'skill' ? 35 : 20,
    hints: [
      'Start by writing the one sentence a colleague would need to trust this output.',
      'Name the audience and the format explicitly; those are the two things most often left implicit.',
      'Scaffold: goal → audience → format and length → constraints → what to leave out. Fill each line before running.',
    ],
    workedExample:
      surface === 'skill'
        ? "---\nname: meeting-prep\ndescription: Use when preparing the agenda and pre-read for a recurring internal meeting from last week's notes. Not for client-facing documents.\n---\n## Steps\n1. Read the previous notes...\n## Boundary\nmay_read: internal notes; must_never_receive: client records; human_review: before sending."
        : null,
    workflowMapId: wf?.id ?? null,
    starterNotes: null,
  };
});

registerMockResponder('coach.run#text', (call) => {
  const s = seed<{ prompt?: string }>(call);
  const prompt = (s.prompt ?? '').trim();
  return {
    text: `[Mock Claude run inside a training exercise]\n\nHere is a first draft for: "${prompt.slice(0, 160)}"\n\n1. Purpose: [state the goal you gave me in one line]\n2. Audience: [who reads this]\n3. Draft:\n   - Opening line summarising the outcome expected.\n   - Two supporting points with placeholders such as [client name] and [figure] where specifics were not supplied.\n   - A closing line with the next action.\n\nAssumptions: no client data was provided, so all specifics are placeholders.`,
  };
});
