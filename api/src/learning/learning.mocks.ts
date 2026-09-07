/**
 * Deterministic stand-ins for the learning loop's Claude tasks (AI_PROVIDER=mock). Each responder
 * derives sensible, schema-valid output from `call.mockSeed`, which the services always populate.
 * Registered on import; the module and the services import this file for its side effect.
 *
 * Learner-facing wording follows practice v2 (docs/practice-model.md): three lines, a score, pass /
 * try again. No "expectation", "critique", "competency", "mastery" or rung codes in anything the learner reads.
 */
import type { AiCall } from '../ai/ai.service';
import { registerMockResponder } from '../ai/mock-responders';
import type {
  NextExerciseOutput,
  RevisitGradeOutput,
  SkillGradeOutput,
  SkillRunOutput,
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

/** Rung 0: encouraging; pass when there is a usable piece of work (> 120 chars) with no invented figures. */
/** Mock stand-in for the grader's toolsNamed: proper names after "using" / "from" / "in". */
function namedTools(artifact: string): string[] {
  return [
    ...new Set(
      [...artifact.matchAll(/\b(?:using|from|in)\s+([A-Z][A-Za-z0-9]+)/g)].map(
        (m) => m[1],
      ),
    ),
  ].slice(0, 8);
}

function mockFirstTaskGrade(
  criteria: Criterion[],
  artifact: string,
): SubmissionGradeOutput {
  const usable = artifact.trim().length > 120;
  const invented =
    /\$\d|\b\d{6,}\b/.test(artifact) && !/stand-in/i.test(artifact);
  const scores: Record<string, number> = {
    'first.finished': usable ? 0.9 : 0.5,
    'first.own_facts': invented ? 0.4 : 0.9,
  };
  const rubric = criteria.map((c) => ({
    criterion: c.criterion,
    score: scores[c.criterion] ?? (usable ? 0.85 : 0.5),
    note: c.criterion.endsWith('own_facts')
      ? invented
        ? 'A figure appears that you did not supply.'
        : 'Everything in it came from what you gave Claude.'
      : usable
        ? 'This is a finished piece you could use.'
        : 'This is a fragment; the task is not finished yet.',
  }));
  return {
    rubric,
    worked: usable
      ? 'You have a finished piece of real work you could use today.'
      : 'You made a start on real work rather than a demo.',
    change: usable
      ? invented
        ? 'One figure crept in that you never supplied; say it is a stand-in or take it out.'
        : 'Nothing major; the draft is usable as it is.'
      : 'Finish the run: paste the real inputs (or pull them through a connector) and ask for the whole thing.',
    tryNext: usable
      ? 'Next run, tell Claude who reads this and what they will do with it.'
      : 'Next run, say what shape you need back so Claude does not stop at an outline.',
    toolsNamed: namedTools(artifact),
    securityFindings: [],
  };
}

registerMockResponder('grader.submission', (call): SubmissionGradeOutput => {
  const s = seed<{
    criteria?: Criterion[];
    artifactText?: string;
    kind?: string;
    workflowName?: string;
    isSkill?: boolean;
    firstTask?: boolean;
  }>(call);
  const criteria = s.criteria ?? [{ criterion: 'quality', label: 'Quality' }];
  const artifact = s.artifactText ?? '';
  if (s.firstTask) return mockFirstTaskGrade(criteria, artifact);
  const base = mockArtifactScore(artifact);
  const strong = base >= MOCK_GOOD_SCORE;
  const rubric = criteria.map((c, i) => ({
    criterion: c.criterion,
    score: Math.max(0, Math.min(1, base + (i % 2 === 0 ? 0.03 : -0.03))),
    note: `${c.label}: ${strong ? 'the work says who it is for and what good looks like, and there is enough of it to judge' : 'the work is thin here; it does not say what a good result looks like'} (mock grader).`,
  }));
  const weakest = criteria[criteria.length - 1] ?? criteria[0];
  const wf = (s.workflowName ?? 'this task').toLowerCase();
  const kindLine: Record<string, string> = {
    prompt: 'the prompt',
    project: 'the Project instructions',
    skill: "the skill's trigger line",
    workflow: "the map's steps",
  };
  const where = kindLine[s.kind ?? 'prompt'] ?? 'the work';
  return {
    rubric,
    toolsNamed: namedTools(artifact),
    worked: strong
      ? `${where.charAt(0).toUpperCase()}${where.slice(1)} names the reader and what good looks like, so what came back is usable.`
      : `You had a go at ${wf} on your own work, which is the habit that matters.`,
    change: strong
      ? `Tighten ${weakest.label.toLowerCase()}: a colleague would still ask one question before trusting it.`
      : `${weakest.label} is the gap: ${where} does not say what a good result looks like, so what came back went generic.`,
    tryNext: `Next run of ${wf}, write the one sentence that says what "good" looks like into ${where} itself.`,
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
      ? "The trigger line names the situation in the team's words and the body is scoped to one job. Move the long template into a linked file and add an ambiguous sample case before requesting promotion.\n\nThe boundary declaration is present; confirm the read-only systems are named exactly as the firm lists them."
      : 'The skill does not yet say when Claude should reach for it, so a model choosing among many skills would not pick it reliably. Start with one sentence: "Use when ...". Then cut everything Claude already does by default.\n\nAdd sample cases covering should-trigger, should-not and ambiguous.',
    teachingMoment:
      'Write the description as the sentence a teammate would say when they need this skill, not as a summary of the steps.',
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
        ? 'You brought back the core idea and tied it to your own work. Next time, also name what goes wrong when it is skipped.'
        : 'That is the general shape but not the specific rule. Bring back the concrete check you applied last time and say where in your week it bites.',
  };
});

const MOCK_TITLES: Record<string, string> = {
  prompt: 'Draft',
  project: 'Build a Project for',
  skill: 'Write the skill for',
  workflow: 'Map',
  review: "Review a teammate's",
  orientation: 'Finish',
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
  const task = (wf?.name ?? contextTag.replace(/-/g, ' ')).toLowerCase();
  const skillName = (s.weakestName ?? 'writing a clear brief').toLowerCase();
  const wfName = wf?.name ?? contextTag.replace(/-/g, ' ');
  const asks: Record<string, string> = {
    orientation: `Try one real thing: write what you'd ask Claude for ${task}.`,
    prompt: `For your ${task}, write the prompt you'd give Claude.`,
    project: `Set up a Project for your ${task}.`,
    skill: `Write the skill for your ${task}.`,
    workflow: `Map your ${task}.`,
    review: "Review this piece of a teammate's work.",
  };
  const system = (s as { systems?: string[] }).systems?.[0] ?? null;
  const isPrompt = surface === 'prompt' || surface === 'orientation';
  return {
    title: `${MOCK_TITLES[surface] ?? 'Do'} ${task} for one case`.slice(0, 60),
    brief: asks[surface] ?? asks.prompt,
    workflowName: wfName,
    prefillPrompt: null,
    prefillMaterial: null,
    prefillInstructions:
      surface === 'project'
        ? `You help me with ${task}. Always: [the rules that hold every run]. Output: [shape, length, tone]. Never: [what to leave out]. Ask one question if the inputs are unclear.`
        : null,
    prefillFiles:
      surface === 'project'
        ? [
            {
              name: 'template.md',
              content: '# [Title]\n\n[Section 1]\n[Section 2]\n[Next steps]',
            },
          ]
        : [],
    prefillTestTask:
      surface === 'project'
        ? `Do this week's ${task} from the notes below.\n\n${system ? `[Pull the notes from ${system} if you have the connector; otherwise paste them here.]` : '[paste the notes here]'}`
        : null,
    prefillSkillMd:
      surface === 'skill'
        ? `---\nname: ${contextTag}\ndescription: Use when a teammate asks for ${task} from [inputs]. Not for [adjacent task].\n---\n## When to use\n[the situation in the team's words]\n\n## Inputs\n- [input]\n\n## Steps\n1. [step]\n2. Hand to [who] for review.\n\n## Output format\n[shape]\n\n## Boundaries\nmay_read: [allowed]\nmust_never_receive: [restricted]\nhuman_review: [point]\n\n## Examples\n1. [routine]\n2. [declined]`
        : null,
    prefillSampleRequests:
      surface === 'skill'
        ? [
            `Can you do the ${task} for this week?`,
            'Write a birthday note for a colleague.',
            `Summarise these notes from the ${task} meeting.`,
          ]
        : [],
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
    workedExample:
      surface === 'skill'
        ? "---\nname: meeting-prep\ndescription: Use when preparing the agenda and pre-read for a recurring internal meeting from last week's notes. Not for client-facing documents.\n---\n## Steps\n1. Read the previous notes...\n## Boundary\nmay_read: internal notes; must_never_receive: client records; human_review: before sending."
        : null,
    workflowMapId: wf?.id ?? null,
  };
});

// ───────────────────────── Run, per practice kind ─────────────────────────

registerMockResponder('coach.run.prompt#text', (call) => {
  const s = seed<{ prompt?: string; material?: string; connectors?: string[] }>(
    call,
  );
  const prompt = (s.prompt ?? '').trim();
  const material = (s.material ?? '').trim();
  const pulled = (s.connectors ?? []).find((c) =>
    new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(
      prompt,
    ),
  );
  return {
    text: `${pulled ? `Pulled 3 records from ${pulled} (sample records standing in for ${pulled}).\n\n` : ''}Here is a first draft for: "${prompt.slice(0, 160)}".${material ? ` I used the ${material.split(/\s+/).length}-word material you attached.` : ' A few details are stand-ins because none were given.'}\n\nSubject: the outcome, in one line\n\nOpening line with the outcome. Two supporting points drawn from what you gave, with a stand-in name (Dana Whitfield) and a stand-in figure (about 12 percent) where none were supplied. A closing line with the next action.\n\nStand-ins: the client name, the percentage.`,
  };
});

registerMockResponder('coach.run.project#text', (call) => {
  const s = seed<{
    instructions?: string;
    files?: string[];
    testTask?: string;
  }>(call);
  const task = (s.testTask ?? '').trim();
  const files = s.files ?? [];
  const connectors = (s as { connectors?: string[] }).connectors ?? [];
  const rules = (s.instructions ?? '')
    .split(/[.\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 2);
  return {
    text: `Following the Project instructions${rules.length ? ` (${rules.join('; ')})` : ''}${files.length ? ` and ${files.length} file${files.length === 1 ? '' : 's'} (${files.join(', ')})` : ''}${connectors.length ? `, reading ${connectors[0]} (sample records standing in for ${connectors[0]})` : ''}, here is the result for: "${task.slice(0, 140)}".\n\n## Summary\nA one-paragraph answer in the shape the instructions ask for, using the template from ${files[0] ?? 'the instructions'}.\n\n## Details\n- A point drawn from ${files[0] ?? 'the instructions'}.\n- A point with a stand-in figure (about 40k) where the inputs were missing.\n\n## Next steps\n- One action for the reader.\n\nStand-ins: the figure.`,
  };
});

registerMockResponder('coach.run.skill', (call): SkillRunOutput => {
  const s = seed<{ skillMd?: string; request?: string }>(call);
  const md = s.skillMd ?? '';
  const request = (s.request ?? '').trim();
  const desc =
    (/description:\s*(.+)/i.exec(md)?.[1] ?? '') +
    ' ' +
    (/## When to use\s*([\s\S]*?)(\n## |$)/i.exec(md)?.[1] ?? '');
  const words = (t: string) =>
    new Set(
      t
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, ' ')
        .split(/\s+/)
        .filter(
          (w) =>
            w.length > 3 &&
            !/^(when|this|that|from|with|your|their|not|for|the|and|use|skill|asks|need|needs|teammate|someone)$/.test(
              w,
            ),
        ),
    );
  const overlap = [...words(request)].filter((w) => words(desc).has(w));
  const vague = /\[/.test(desc) && overlap.length === 0;
  const fired = overlap.length > 0 && !vague;
  return {
    fired,
    reason: fired
      ? `The request mentions ${overlap.slice(0, 2).join(' and ')}, which the trigger line names.`
      : overlap.length === 0
        ? 'The request does not match the situation the trigger line names.'
        : 'The trigger line is still a template; nothing in it matches this request.',
    output: fired
      ? `(skill fired) Following the skill's steps for: "${request.slice(0, 120)}".\n\nOutput in the skill's format, with a stand-in name (Harbor Trust) for anything client-specific.\nHanded to the named reviewer before anything leaves.\n\nStand-ins: the client name.`
      : `(skill did not fire) Plain answer for: "${request.slice(0, 120)}".\n\nA generic draft; nothing from the skill was applied.`,
  };
});

registerMockResponder('coach.run.workflow#text', (call) => {
  const s = seed<{ schema?: Record<string, unknown>; workflowName?: string }>(
    call,
  );
  const schema = s.schema ?? {};
  const name =
    s.workflowName ??
    (typeof schema.purpose === 'string' ? schema.purpose : 'workflow');
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'workflow';
  const inputs = Array.isArray(schema.inputs)
    ? (schema.inputs as { name?: string; source?: string }[])
    : [];
  const steps = Array.isArray(schema.steps)
    ? (schema.steps as { action?: string; actor?: string }[])
    : [];
  const review = Array.isArray(schema.humanReview)
    ? (schema.humanReview as string[])
    : [];
  const never = Array.isArray(schema.mustNeverLeave)
    ? (schema.mustNeverLeave as string[])
    : [];
  return {
    text: [
      '---',
      `name: ${slug}`,
      `description: Use when a teammate needs ${name.toLowerCase()} from ${
        inputs
          .map((i) => i.name)
          .filter(Boolean)
          .join(', ') || '[inputs: open question]'
      }. Not for adjacent tasks the map does not cover.`,
      '---',
      '## When to use',
      typeof schema.trigger === 'string' && schema.trigger
        ? schema.trigger
        : '[open question: what triggers this run?]',
      '',
      '## Inputs',
      ...(inputs.length
        ? inputs.map(
            (i) =>
              `- ${i.name ?? '[input]'}${i.source ? ` (from ${i.source})` : ''}`,
          )
        : ['- [open question: which inputs?]']),
      '',
      '## Steps',
      ...(steps.length
        ? steps.map(
            (st, i) =>
              `${i + 1}. ${st.action ?? '[step]'}${st.actor ? ` (${st.actor})` : ''}`,
          )
        : ['1. [open question: the steps]']),
      '',
      '## Output format',
      Array.isArray(schema.outputs) &&
      (schema.outputs as { name?: string }[]).length
        ? (schema.outputs as { name?: string }[])
            .map((o) => o.name)
            .filter(Boolean)
            .join(', ')
        : '[open question: what comes out?]',
      '',
      '## Boundaries',
      `may_read: ${
        inputs
          .map((i) => i.source)
          .filter(Boolean)
          .join(', ') || '[open question]'
      }`,
      `must_never_receive: ${never.join(', ') || '[firm forbidden classes]'}`,
      `human_review: ${review.join(', ') || '[at least one review point before anything leaves]'}`,
      '',
      '## Examples',
      `1. Routine: a teammate asks for ${name.toLowerCase()} with all inputs present; the skill follows the steps and hands to review.`,
      '2. Declined: the request includes a restricted input; the skill asks for the summary export instead.',
    ].join('\n'),
  };
});

registerMockResponder('coach.personalise-lesson', (call) => {
  const s = seed<{
    workflow?: string | null;
    role?: string | null;
    example?: { title: string; text: string };
    check?: {
      question: string;
      options: string[];
      answer: number;
      explanation: string;
    };
  }>(call);
  const workflow = s.workflow ?? 'your weekly task';
  const example = s.example ?? { title: 'Example', text: 'An example.' };
  const check = s.check ?? {
    question: 'What matters most?',
    options: ['A', 'B', 'C'],
    answer: 0,
    explanation: 'Because.',
  };
  const lower = (q: string) => q.charAt(0).toLowerCase() + q.slice(1);
  return {
    example: {
      title: `${workflow}: ${example.title}`,
      text: `Take your ${workflow}${s.role ? ` as a ${s.role}` : ''}. ${example.text}`,
    },
    check: {
      question: `In your ${workflow}, ${lower(check.question)}`,
      options: check.options,
      answer: check.answer,
      explanation: check.explanation,
    },
  };
});

registerMockResponder('memory.synthesise', (call) => {
  const s = seed<{
    previous?: {
      summary: string | null;
      strengths: string[];
      struggles: string[];
      preferences: string[];
      vocabulary: { term: string; meaning: string }[];
      systems: string[];
      anchorWorkflows: string[];
    };
    events?: { kind: string; note: string }[];
    allEvents?: { kind: string; note: string }[];
    role?: string | null;
    profile?: {
      weeklyWorkflows?: string[];
      responsibilities?: string[];
      systems?: string[];
    };
  }>(call);
  const prev = s.previous ?? {
    summary: null,
    strengths: [],
    struggles: [],
    preferences: [],
    vocabulary: [],
    systems: [],
    anchorWorkflows: [],
  };
  const all = s.allEvents ?? s.events ?? [];
  const graded = all.filter((e) => e.kind === 'submission_graded');
  const passes = graded.filter((e) => /\bpass\b/.test(e.note)).length;
  const revises = graded.filter((e) => /\brevise\b/.test(e.note)).length;
  const missed = [
    ...new Set(
      all.flatMap((e) =>
        (/missed: ([^;.]+)/.exec(e.note)?.[1] ?? '')
          .split(',')
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean),
      ),
    ),
  ];
  const skips = all.filter((e) => e.kind === 'exercise_skipped');
  const struggles = [
    ...new Set([
      ...prev.struggles,
      ...missed.map((m) => `gets caught on ${m}`),
      ...(skips.filter((e) => /blocked/.test(e.note)).length >= 2
        ? ['often blocked by access or tooling']
        : []),
    ]),
  ].slice(0, 6);
  const strengths = [
    ...new Set([
      ...prev.strengths,
      ...(passes >= 1 ? ['finishes real work with Claude'] : []),
      ...(all.some(
        (e) => e.kind === 'revisit_answered' && /passed/.test(e.note),
      )
        ? ['recalls the rules later without prompting']
        : []),
    ]),
  ].slice(0, 6);
  const preferences = [
    ...new Set([
      ...prev.preferences,
      ...all
        .filter((e) => /prefer/i.test(e.note))
        .map((e) => e.note.replace(/^.*?(prefer)/i, '$1').slice(0, 60)),
      ...(skips.filter((e) => /no_time/.test(e.note)).length >= 2
        ? ['short exercises on busy weeks']
        : []),
    ]),
  ].slice(0, 6);
  const workflows = [
    ...new Set([
      ...prev.anchorWorkflows,
      ...(s.profile?.weeklyWorkflows ?? []),
    ]),
  ];
  const role = s.role ?? 'professional';
  return {
    summary: `${role.charAt(0).toUpperCase()}${role.slice(1)} who does ${workflows.slice(0, 2).join(' and ') || 'recurring weekly work'} most weeks. Has ${graded.length} graded piece${graded.length === 1 ? '' : 's'} so far (${passes} passed, ${revises} sent back)${struggles.length ? `; keeps getting caught on ${struggles[0].replace(/^gets caught on /, '')}` : ''}. ${strengths.length ? `Strength: ${strengths[0]}.` : 'Still early; no clear strengths recorded yet.'} ${preferences.length ? `Prefers ${preferences[0]}.` : 'No working preferences recorded yet.'} Coach should keep tasks short and tied to those workflows.`,
    strengths,
    struggles,
    preferences,
    vocabulary: prev.vocabulary,
    systems: [...new Set([...prev.systems, ...(s.profile?.systems ?? [])])],
    anchorWorkflows: workflows,
  };
});

registerMockResponder('memory.why-me', (call) => {
  const s = seed<{
    module?: string;
    struggles?: string[];
    anchorWorkflows?: string[];
  }>(call);
  const wf = s.anchorWorkflows?.[0];
  const struggle = s.struggles?.[0];
  return {
    line: struggle
      ? `Because you ${struggle.replace(/^gets /, '')}, ${s.module ?? 'this module'} is where you will get time back first.`
      : wf
        ? `Because you run ${wf} every week, ${s.module ?? 'this module'} pays off on the very next run.`
        : `${s.module ?? 'This module'} is the next step to handing real work to Claude and trusting what comes back.`,
  };
});
