/**
 * Deterministic stand-ins for the learning loop's Claude tasks (AI_PROVIDER=mock). Each responder
 * derives sensible, schema-valid output from `call.mockSeed`, which the services always populate.
 * Registered on import; the module and the services import this file for its side effect.
 *
 * Learner-facing wording follows Build → Check → Result: no "expectation", "critique", "cold attempt",
 * "worked example", "competency" or rung codes in anything the learner reads.
 */
import type { AiCall } from '../ai/ai.service';
import { registerMockResponder } from '../ai/mock-responders';
import type { NextExerciseOutput, RevisitGradeOutput, SkillGradeOutput, SubmissionGradeOutput } from './ai-schemas';

type Criterion = { criterion: string; label: string };

function seed<T = Record<string, unknown>>(call: AiCall): T {
  return (call.mockSeed ?? {}) as T;
}

export const MOCK_GOOD_SCORE = 0.86;
export const MOCK_WEAK_SCORE = 0.62;

/** The grader heuristic the E2E suite relies on: mentions "expected" and length > 200 → strong artifact. */
export function mockArtifactScore(artifactText: string): number {
  return /expected/i.test(artifactText) && artifactText.length > 200 ? MOCK_GOOD_SCORE : MOCK_WEAK_SCORE;
}

/** Plain self-check wording per rubric label. */
export function selfCheckItem(label: string): string {
  const l = label.trim();
  return /^(only|uses|names|states|keeps|stays|has|is|covers|matches)\b/i.test(l) ? l : `${l.charAt(0).toLowerCase()}${l.slice(1)} is right`;
}

registerMockResponder('grader.submission', (call): SubmissionGradeOutput => {
  const s = seed<{ criteria?: Criterion[]; artifactText?: string; critiqueText?: string; expectationText?: string; isSkill?: boolean; selfCheck?: Record<string, boolean> }>(call);
  const criteria = s.criteria ?? [{ criterion: 'quality', label: 'Quality' }];
  const artifact = s.artifactText ?? '';
  const base = mockArtifactScore(artifact);
  const strong = base >= MOCK_GOOD_SCORE;
  const selfCheckText = (s.critiqueText ?? '').trim();
  const ticks = s.selfCheck ?? {};
  const critiqueQuality = selfCheckText.length > 80 ? 0.72 : 0.4;
  const rubric = criteria.map((c, i) => ({
    criterion: c.criterion,
    score: Math.max(0, Math.min(1, base + (i % 2 === 0 ? 0.03 : -0.03))),
    note: `${c.label}: ${strong ? 'the draft says who it is for and what good looks like, and it is long enough to judge' : 'the draft is thin here; it does not say what a good result looks like'} (mock grader).`,
  }));
  const selfCheckAgreement = criteria.map((c, i) => {
    const grader = rubric[i].score >= 0.75;
    const learner = ticks[c.criterion] ?? true;
    return { criterion: c.criterion, item: selfCheckItem(c.label), learner, grader };
  });
  const weakest = criteria[criteria.length - 1] ?? criteria[0];
  const weakestItem = selfCheckItem(weakest.label);
  const disagreement = selfCheckAgreement.find((a) => a.learner !== a.grader);
  return {
    rubric,
    feedback: [
      `What held up: ${strong ? 'the draft is for a named reader, says what good looks like, and there is enough of it to judge' : 'you had a go and wrote down a guess, which is the habit this exercise is about'}.`,
      `The main gap is ${weakest.label.toLowerCase()}. Before you fix anything, re-read the brief and ask what a colleague would need to see to trust this; that is where the draft is most exposed.`,
      disagreement
        ? `You ${disagreement.learner ? 'ticked' : 'left unticked'} '${disagreement.item}'; ${disagreement.grader ? 'the draft actually holds up there' : 'the draft does not hold up there'}${strong ? '' : ' — it introduced a detail you never gave it'}.`
        : `Your self-check matched what I found${selfCheckText ? ` (${selfCheckText.slice(0, 120)})` : ''}.`,
      `Your guess was "${(s.expectationText ?? '').slice(0, 140)}". ${strong ? 'What came back was close to that.' : 'What came back was thinner than that; the prompt gave Claude less to work with than you assumed.'}`,
    ].join('\n\n'),
    critiqueQuality,
    selfCheckAgreement,
    teachingMoment: `Next time, write the sentence that says what "good" looks like for ${weakestItem} into the prompt itself. Claude matches the standard you set; when it is implicit, the draft goes generic.`,
    securityFindings: s.isSkill && /ignore (all )?previous instructions/i.test(artifact) ? [{ severity: 'high', finding: 'Prompt-injection pattern: "ignore previous instructions".' }] : [],
    strengths: [strong ? 'Guess written before the run' : 'Had a go without the example'],
  };
});

registerMockResponder('grader.skill', (call): SkillGradeOutput => {
  const s = seed<{ criteria?: Criterion[]; skillMd?: string; sampleCases?: { input: string; shouldTrigger: string; expected: string }[] }>(call);
  const criteria = s.criteria ?? [];
  const md = s.skillMd ?? '';
  const strong = md.length > 400 && /when to use|use this skill when|trigger/i.test(md);
  const base = strong ? 0.88 : 0.6;
  return {
    rubric: criteria.map((c, i) => ({ criterion: c.criterion, score: Math.max(0, Math.min(1, base + (i % 3 === 0 ? 0.02 : i % 3 === 1 ? 0 : -0.04))), note: `${c.label}: ${strong ? 'present and specific' : 'missing or generic'} (mock grader).` })),
    feedback: strong
      ? 'The trigger line names the situation in the team\'s words and the body is scoped to one job. Move the long template into a linked file and add an ambiguous sample case before requesting promotion.\n\nThe boundary declaration is present; confirm the read-only systems are named exactly as the firm lists them.'
      : 'The skill does not yet say when Claude should reach for it, so a model choosing among many skills would not pick it reliably. Start with one sentence: "Use when ...". Then cut everything Claude already does by default.\n\nAdd sample cases covering should-trigger, should-not and ambiguous.',
    teachingMoment: 'Write the description as the sentence a teammate would say when they need this skill, not as a summary of the steps.',
    securityFindings: /ignore (all )?previous instructions|curl |webhook|<!--/i.test(md) ? [{ severity: 'high', finding: 'Suspicious instruction or exfiltration pattern found in SKILL.md (mock security review).' }] : [],
    sampleCaseVerdicts: (s.sampleCases ?? []).map((c) => ({ input: c.input, behavesAsExpected: strong, note: strong ? 'Expected behaviour follows from the trigger line.' : 'Trigger line too vague to predict behaviour.' })),
  };
});

registerMockResponder('grader.revisit', (call): RevisitGradeOutput => {
  const s = seed<{ response?: string }>(call);
  const response = (s.response ?? '').trim();
  const score = response.length > 60 ? 0.85 : 0.5;
  return {
    score,
    feedback: score >= 0.8 ? 'You brought back the core idea and tied it to your own work. Next time, also name what goes wrong when it is skipped.' : 'That is the general shape but not the specific rule. Bring back the concrete check you applied last time and say where in your week it bites.',
  };
});

const MOCK_TITLES: Record<string, string> = {
  prompt: 'Draft',
  project: 'Build a Project for',
  skill: 'Write the skill for',
  workflow: 'Map',
  review: 'Review a teammate\'s',
  orientation: 'Finish',
};

const MOCK_BRIEF_TAIL: Record<string, string> = {
  prompt: 'write the prompt, run it, and check what comes back against your own standard',
  project: 'set up the Project instructions and the files you would include, with a short note on what you left out and why',
  skill: 'write the SKILL.md and three sample cases (one that should trigger it, one that should not, one borderline)',
  workflow: 'map the steps, who does each one, what goes in, what comes out and where a person must review',
  review: 'read it as the reviewer and write what you would send back',
  orientation: 'finish one real piece of it with Claude, start to end',
};

registerMockResponder('coach.next-exercise', (call): NextExerciseOutput => {
  const s = seed<{ rung?: number; weakestCode?: string; weakestName?: string; workSurface?: string; usedContexts?: string[]; workflows?: { id: string; name: string }[]; allowedCodes?: string[] }>(call);
  const surface = (s.workSurface ?? 'prompt') as NextExerciseOutput['workSurface'];
  const used = new Set(s.usedContexts ?? []);
  const candidates = ['meeting-prep', 'client-summary', 'weekly-report', 'policy-check', 'data-reformat', 'email-draft'];
  const contextTag = candidates.find((c) => !used.has(c)) ?? `context-${used.size + 1}`;
  const wf = s.workflows?.[0] ?? null;
  const code = s.weakestCode ?? s.allowedCodes?.[0] ?? 'L1.description';
  const task = (wf?.name ?? contextTag.replace(/-/g, ' ')).toLowerCase();
  const skillName = (s.weakestName ?? 'writing a clear brief').toLowerCase();
  return {
    title: `${MOCK_TITLES[surface] ?? 'Do'} ${task} for one case`.slice(0, 60),
    brief: `Take your ${task} as you would do it this week. Say who it is for and what a good version looks like, then ${MOCK_BRIEF_TAIL[surface] ?? MOCK_BRIEF_TAIL.prompt}. Use placeholders for anything client-specific.`,
    rationale: `This comes from your ${task}, which you do every week. It is next because ${skillName} is the part that will save you the most rework right now, and you have not tried it on a ${contextTag.replace(/-/g, ' ')} task yet.`,
    competencyCodes: [code],
    contextTag,
    workSurface: surface,
    kind: 'artifact',
    estimatedMinutes: surface === 'skill' ? 35 : 20,
    hints: [
      'Try writing the one sentence a colleague would need to trust this before you start.',
      'Try naming who will read this and what they need to decide.',
      'Try listing goal, reader, shape and length, limits, and what to leave out, then run it.',
    ],
    workedExample: surface === 'skill' ? '---\nname: meeting-prep\ndescription: Use when preparing the agenda and pre-read for a recurring internal meeting from last week\'s notes. Not for client-facing documents.\n---\n## Steps\n1. Read the previous notes...\n## Boundary\nmay_read: internal notes; must_never_receive: client records; human_review: before sending.' : null,
    workflowMapId: wf?.id ?? null,
    starterNotes: null,
  };
});

registerMockResponder('coach.run#text', (call) => {
  const s = seed<{ prompt?: string }>(call);
  const prompt = (s.prompt ?? '').trim();
  return {
    text: `Here is a first draft for: "${prompt.slice(0, 160)}". Figures and names are placeholders because none were given.\n\n1. Purpose: [the goal in one line]\n2. Reader: [who this is for]\n3. Draft:\n   - Opening line with the outcome.\n   - Two supporting points with placeholders such as [client name] and [figure].\n   - A closing line with the next action.`,
  };
});
