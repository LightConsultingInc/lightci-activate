import { COMPETENCY_BY_CODE } from './competency-catalog';
import type { Exercise, WorkSurface } from './entities/exercise.entity';
import type { Grade, RubricScore } from './entities/grade.entity';
import type { Revisit } from './entities/revisit.entity';
import type { Submission } from './entities/submission.entity';
import type { WorkflowSchema } from '../workflows/entities/workflow-map.entity';
import type {
  ExerciseSummary,
  GradeView,
  PersonRef,
  Practice,
  PracticeDecision,
  PracticeFeedback,
  PracticeKind,
  RevisitSummary,
  SubmissionView,
} from './learning.types';

const iso = (d: Date | string | null | undefined): string | null =>
  d ? new Date(d).toISOString() : null;

// ───────────────────────── practice (v2) ─────────────────────────

export const PRACTICE_KIND_FOR_SURFACE: Record<WorkSurface, PracticeKind> = {
  orientation: 'prompt',
  prompt: 'prompt',
  project: 'project',
  skill: 'skill',
  workflow: 'workflow',
  review: 'review',
};

const PRACTICE_KINDS: PracticeKind[] = [
  'prompt',
  'project',
  'skill',
  'workflow',
  'review',
];

const str = (x: unknown, fallback = ''): string =>
  typeof x === 'string' ? x : fallback;

/** Default SKILL.md template used when a skill-kind exercise has no pre-filled editor text. */
export function skillTemplate(workflowName: string): string {
  const slug =
    workflowName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'my-skill';
  return [
    '---',
    `name: ${slug}`,
    `description: Use when a teammate asks for ${workflowName.toLowerCase()} from [the inputs it needs]. Not for [the adjacent task it does not cover].`,
    '---',
    '## When to use',
    `When someone needs ${workflowName.toLowerCase()} done. Not when [describe the case that looks similar but is not this].`,
    '',
    '## Inputs',
    '- [input 1 and where it comes from]',
    '- [input 2]',
    '',
    '## Steps',
    '1. [first step]',
    '2. [second step]',
    '3. Hand to [who] for review before anything leaves.',
    '',
    '## Output format',
    '[headings, length, tone]',
    '',
    '## Boundaries',
    'may_read: [allowed inputs]',
    'must_never_receive: [restricted data]',
    'human_review: [the review point]',
    '',
    '## Examples',
    '1. [a routine request and the output]',
    '2. [a request that should be declined or partly declined]',
  ].join('\n');
}

function defaultSampleRequests(workflowName: string): [string, string, string] {
  const w = workflowName.toLowerCase();
  return [
    `Can you do the ${w} for this week? Notes are below.`,
    'Draft a birthday note for a colleague.',
    `Summarise these notes for me (they are from the ${w} meeting).`,
  ];
}

function isPractice(x: unknown): x is Practice {
  if (!x || typeof x !== 'object') return false;
  const p = x as Record<string, unknown>;
  return (
    typeof p.ask === 'string' &&
    PRACTICE_KINDS.includes(p.kind as PracticeKind) &&
    !!p.prefill &&
    typeof p.prefill === 'object'
  );
}

/**
 * The v2 Practice object for an exercise. Reads `starter.practice` when Coach wrote one; otherwise
 * synthesises it from the legacy fields (`starterPrompt`, `notes`, `currentFiles`, `submissionId`,
 * the brief and the work surface) so seeded and pre-v2 rows never reach the UI in the old shape.
 */
export function practiceOf(
  e: Pick<Exercise, 'brief' | 'workSurface' | 'starter' | 'title'>,
  workflowName?: string | null,
): Practice {
  const starter = e.starter ?? {};
  const stored = starter.practice;
  if (isPractice(stored)) return stored;
  const kind = PRACTICE_KIND_FOR_SURFACE[e.workSurface] ?? 'prompt';
  const wf = workflowName ?? str(starter.workflowName) ?? '';
  const name = wf || 'this task';
  const ask = firstSentence(e.brief) || e.title;
  const notes = str(starter.notes) || str(starter.starterNotes);
  switch (kind) {
    case 'prompt':
      return {
        ask,
        kind,
        workflowName: name,
        prefill: {
          prompt:
            str(starter.starterPrompt) ||
            notes ||
            `I am working on ${name}. Here is what I need:\n\n[what to make, who reads it, the shape you want]\n\n[Paste your inputs here, or pull them through a connector.]`,
        },
      };
    case 'project': {
      const current = Array.isArray(starter.currentFiles)
        ? (starter.currentFiles as unknown[]).filter(
            (f): f is string => typeof f === 'string',
          )
        : [];
      return {
        ask,
        kind,
        workflowName: name,
        prefill: {
          instructions:
            notes ||
            `You help with ${name}. Always: [the rules that hold every time]. Output: [shape, length, tone]. Never: [what to leave out].`,
          files: current.slice(0, 2).map((f) => ({
            name: f,
            content: '[paste the file contents here]',
          })),
          testTask:
            str(starter.testTask) ||
            `Do one real run of ${name} from the material below.\n\n[paste this week's inputs, placeholders for anything client-specific]`,
        },
      };
    }
    case 'skill': {
      const reqs = Array.isArray(starter.sampleRequests)
        ? (starter.sampleRequests as unknown[]).filter(
            (r): r is string => typeof r === 'string',
          )
        : [];
      const three = [...reqs, ...defaultSampleRequests(name)].slice(0, 3) as [
        string,
        string,
        string,
      ];
      return {
        ask,
        kind,
        workflowName: name,
        prefill: {
          skillMd: str(starter.skillMd) || notes || skillTemplate(name),
          sampleRequests: three,
        },
      };
    }
    case 'workflow':
      return {
        ask,
        kind,
        workflowName: name,
        prefill: {
          schema:
            starter.schema && typeof starter.schema === 'object'
              ? starter.schema
              : { purpose: name },
        },
      };
    case 'review':
      return {
        ask,
        kind,
        workflowName: name,
        prefill: { submissionId: str(starter.submissionId) },
      };
  }
}

export function practiceKindOf(
  e: Pick<Exercise, 'workSurface' | 'starter'>,
): PracticeKind {
  const stored = (e.starter ?? {}).practice;
  if (isPractice(stored)) return stored.kind;
  return PRACTICE_KIND_FOR_SURFACE[e.workSurface] ?? 'prompt';
}

function firstSentence(text: string): string {
  const t = (text ?? '').trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(t);
  return (m ? m[1] : t).trim();
}

// ───────────────────────── feedback (three lines) ─────────────────────────

const FEEDBACK_KEYS: { key: keyof PracticeFeedback; label: string }[] = [
  { key: 'worked', label: 'What worked' },
  { key: 'change', label: 'What to change' },
  { key: 'tryNext', label: 'Try next' },
];

/** Serialise the three learner lines into grade.feedback (no new columns). */
export function encodeFeedback(f: PracticeFeedback): string {
  return FEEDBACK_KEYS.map(
    ({ key, label }) => `${label}: ${(f[key] ?? '').trim()}`,
  ).join('\n');
}

/** Read the three lines back; legacy paragraph feedback is split into worked / change with the teaching moment as tryNext. */
export function decodeFeedback(
  feedback: string | null | undefined,
  teachingMoment: string | null | undefined,
): PracticeFeedback {
  const text = (feedback ?? '').trim();
  const out: Partial<PracticeFeedback> = {};
  for (const line of text.split(/\r?\n/)) {
    for (const { key, label } of FEEDBACK_KEYS) {
      const re = new RegExp(`^${label}\\s*:\\s*`, 'i');
      if (re.test(line.trim())) out[key] = line.trim().replace(re, '').trim();
    }
  }
  if (out.worked !== undefined && out.change !== undefined) {
    return {
      worked: out.worked,
      change: out.change,
      tryNext: out.tryNext ?? (teachingMoment ?? '').trim(),
    };
  }
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const sentences =
    paragraphs.length <= 1 ? text.split(/(?<=[.!?])\s+/).filter(Boolean) : [];
  const worked = paragraphs[0] ?? '';
  const change =
    paragraphs.length > 1
      ? paragraphs.slice(1).join(' ')
      : sentences.length > 1
        ? sentences.slice(1).join(' ')
        : '';
  return {
    worked: paragraphs.length > 1 ? worked : (sentences[0] ?? worked),
    change,
    tryNext: (teachingMoment ?? '').trim(),
  };
}

export function score10Of(score: number): number {
  return Math.round(Math.min(1, Math.max(0, score)) * 100) / 10;
}

export function practiceDecisionOf(
  decision: Grade['decision'],
): PracticeDecision {
  return decision === 'pass' ? 'pass' : 'try_again';
}

// ───────────────────────── mappers ─────────────────────────

export function toExerciseSummary(e: Exercise): ExerciseSummary {
  return {
    id: e.id,
    title: e.title,
    rung: e.rung,
    kind: e.kind,
    mode: 'in_app',
    practiceKind: practiceKindOf(e),
    workSurface: e.workSurface,
    status: e.status,
    brief: e.brief,
    rationale: e.rationale,
    competencyCodes: e.competencyCodes,
    estimatedMinutes: e.estimatedMinutes,
    contextTag: e.contextTag,
    scheduledFor: iso(e.scheduledFor),
    createdAt: iso(e.createdAt) ?? new Date().toISOString(),
    ...(e.skillId ? { skillId: e.skillId } : {}),
    ...(e.workflowMapId ? { workflowMapId: e.workflowMapId } : {}),
  };
}

export function toRevisitSummary(
  r: Revisit,
  now: Date = new Date(),
): RevisitSummary {
  return {
    id: r.id,
    competencyCode: r.competencyCode,
    competencyName:
      COMPETENCY_BY_CODE.get(r.competencyCode)?.name ?? r.competencyCode,
    prompt: r.prompt,
    dueAt: new Date(r.dueAt).toISOString(),
    intervalStep: r.intervalStep,
    overdue: !r.doneAt && new Date(r.dueAt).getTime() < now.getTime(),
  };
}

/** Legacy (pre-v2): extra JSON carried on each rubric row when the learner's self-check was compared. */
export type RubricScoreWithSelfCheck = RubricScore & {
  selfCheck?: { item: string; learner: boolean; grader: boolean };
};

export function selfCheckAgreementOf(
  rubric: RubricScore[],
): GradeView['selfCheckAgreement'] {
  const rows = (rubric as RubricScoreWithSelfCheck[]).filter(
    (r) => r.selfCheck,
  );
  return rows.length
    ? rows.map((r) => ({
        item: r.selfCheck!.item,
        learner: r.selfCheck!.learner,
        grader: r.selfCheck!.grader,
      }))
    : undefined;
}

export function toGradeView(
  g: Grade,
  gradedBy: PersonRef | null = null,
): GradeView {
  const selfCheckAgreement = selfCheckAgreementOf(g.rubric ?? []);
  return {
    id: g.id,
    score: g.score,
    decision: g.decision,
    rubric: g.rubric,
    feedback: g.feedback,
    teachingMoment: g.teachingMoment,
    critiqueQuality: g.critiqueQuality,
    expectationAccuracy: g.expectationAccuracy,
    securityFindings: g.securityFindings ?? [],
    ...(selfCheckAgreement ? { selfCheckAgreement } : {}),
    learner: {
      feedback: decodeFeedback(g.feedback, g.teachingMoment),
      score10: score10Of(g.score),
      decision: practiceDecisionOf(g.decision),
    },
    gradedAt: iso(g.gradedAt) ?? new Date().toISOString(),
    gradedBy: g.gradedByPersonId && gradedBy ? gradedBy : 'grader',
  };
}

export function toSubmissionView(
  s: Submission,
  grade: GradeView | null,
): SubmissionView {
  return {
    id: s.id,
    attempt: s.attempt,
    expectationText: s.expectationText,
    expectationConfidence: s.expectationConfidence,
    artifact: s.artifact,
    critiqueText: s.critiqueText,
    coldAttempt: s.coldAttempt,
    submittedAt: iso(s.submittedAt) ?? new Date().toISOString(),
    grade,
  };
}

/** Pick the grade of record for a submission: the champion's when present, else the Grader's latest. */
export function gradeOfRecord(grades: Grade[]): Grade | null {
  if (grades.length === 0) return null;
  const champion = grades
    .filter((g) => g.gradedByPersonId)
    .sort((a, b) => +new Date(b.gradedAt) - +new Date(a.gradedAt))[0];
  if (champion) return champion;
  return [...grades].sort(
    (a, b) => +new Date(b.gradedAt) - +new Date(a.gradedAt),
  )[0];
}
