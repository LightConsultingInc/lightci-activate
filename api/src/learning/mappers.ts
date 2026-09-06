import { COMPETENCY_BY_CODE } from './competency-catalog';
import type { Exercise } from './entities/exercise.entity';
import type { Grade, RubricScore } from './entities/grade.entity';
import type { Revisit } from './entities/revisit.entity';
import type { Submission } from './entities/submission.entity';
import type {
  ExerciseSummary,
  GradeView,
  PersonRef,
  RevisitSummary,
  SubmissionView,
} from './learning.types';

const iso = (d: Date | string | null | undefined): string | null =>
  d ? new Date(d).toISOString() : null;

export function toExerciseSummary(e: Exercise): ExerciseSummary {
  return {
    id: e.id,
    title: e.title,
    rung: e.rung,
    kind: e.kind,
    mode: e.mode,
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

/** Extra JSON carried on each rubric row when the learner's self-check was compared (no schema change). */
export type RubricScoreWithSelfCheck = RubricScore & {
  selfCheck?: { item: string; learner: boolean; grader: boolean };
};

export function selfCheckAgreementOf(
  rubric: RubricScore[],
): GradeView['selfCheckAgreement'] {
  const rows = (rubric as RubricScoreWithSelfCheck[]).filter((r) => r.selfCheck);
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
    ...(selfCheckAgreement ? { selfCheckAgreement } : {}),
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
