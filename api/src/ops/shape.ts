/**
 * Turns entity rows into the contract shapes (PersonRef, SkillCard, PromotionView,
 * WorkflowSummary, ExerciseSummary, SubmissionView, GradeView) using an OrgFacts
 * bundle for the joins. Kept here so the ops module has no dependency on the
 * learning/skills/workflows services owned by other agents.
 */
import { DAY_MS, isoDay } from '../common/dates';
import type { Person } from '../orgs/entities/person.entity';
import type { ComplianceBoundary } from '../orgs/entities/org.entity';
import type { Exercise } from '../learning/entities/exercise.entity';
import type { Grade } from '../learning/entities/grade.entity';
import type { Submission } from '../learning/entities/submission.entity';
import type { Skill } from '../skills/entities/skill.entity';
import type { PromotionRequest } from '../skills/entities/promotion-request.entity';
import type { WorkflowMap } from '../workflows/entities/workflow-map.entity';
import { hoursBack, type OrgFacts } from './metrics.service';
import type {
  ExerciseSummary,
  GradeView,
  PersonRef,
  PromotionView,
  SkillCard,
  SkillHealthFlag,
  SubmissionView,
  WorkflowSummary,
} from './ops.types';

export function personRef(
  p: Person,
  f: Pick<OrgFacts, 'teamName' | 'rungs'>,
): PersonRef {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    title: p.title,
    avatarUrl: p.avatarUrl,
    teamId: p.teamId,
    teamName: p.teamId ? (f.teamName.get(p.teamId) ?? null) : null,
    rung: f.rungs.get(p.id) ?? 0,
    roles: p.roles,
  };
}

export function personById(
  f: OrgFacts,
  id: string | null | undefined,
): PersonRef | null {
  if (!id) return null;
  const p = f.people.find((x) => x.id === id);
  return p ? personRef(p, f) : null;
}

export function exerciseSummary(e: Exercise): ExerciseSummary {
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
    scheduledFor: e.scheduledFor,
    createdAt: e.createdAt,
    skillId: e.skillId,
    workflowMapId: e.workflowMapId,
  };
}

export function gradeView(g: Grade, f: OrgFacts): GradeView {
  return {
    id: g.id,
    score: g.score,
    decision: g.decision,
    rubric: g.rubric,
    feedback: g.feedback,
    teachingMoment: g.teachingMoment,
    critiqueQuality: g.critiqueQuality,
    expectationAccuracy: g.expectationAccuracy,
    securityFindings: g.securityFindings,
    gradedAt: g.gradedAt,
    gradedBy: g.gradedByPersonId
      ? (personById(f, g.gradedByPersonId) ?? 'grader')
      : 'grader',
  };
}

export function latestGradeFor(
  f: OrgFacts,
  submissionId: string,
): Grade | null {
  return (
    f.grades
      .filter((g) => g.submissionId === submissionId)
      .sort((a, b) => b.gradedAt.getTime() - a.gradedAt.getTime())[0] ?? null
  );
}

export function submissionView(s: Submission, f: OrgFacts): SubmissionView {
  const g = latestGradeFor(f, s.id);
  return {
    id: s.id,
    attempt: s.attempt,
    expectationText: s.expectationText,
    expectationConfidence: s.expectationConfidence,
    artifact: s.artifact,
    critiqueText: s.critiqueText,
    coldAttempt: s.coldAttempt,
    submittedAt: s.submittedAt,
    grade: g ? gradeView(g, f) : null,
  };
}

/** Same rule as the contract's SkillCard note; pure so the badge is identical everywhere. */
export function boundaryBadge(
  skill: Pick<Skill, 'boundary' | 'manifest'>,
  orgBoundary: ComplianceBoundary | null | undefined,
): 'green' | 'amber' | 'red' {
  const forbidden = new Set(
    (orgBoundary?.forbiddenDataClasses ?? []).map((s) => s.toLowerCase()),
  );
  const reads = [
    ...(skill.boundary?.mayRead ?? []),
    ...(skill.manifest?.boundary?.may_read ?? []),
  ].map((s) => s.toLowerCase());
  const never = new Set(
    [
      ...(skill.boundary?.mustNeverReceive ?? []),
      ...(skill.manifest?.boundary?.must_never_receive ?? []),
    ].map((s) => s.toLowerCase()),
  );
  const touchesRestricted = reads.some((r) => forbidden.has(r));
  const declaresNone = [...never].every((n) => !forbidden.has(n));
  if (forbidden.size > 0 && touchesRestricted && declaresNone) return 'red';
  if (touchesRestricted) return 'red';
  if (
    (skill.boundary?.humanReview ?? []).length > 0 ||
    (skill.manifest?.boundary?.human_review ?? []).length > 0
  )
    return 'amber';
  return 'green';
}

export const GRADE_THRESHOLD = 0.8;

export function skillCard(
  s: Skill,
  f: OrgFacts,
  viewerId?: string | null,
): SkillCard {
  const since = isoDay(new Date(f.now.getTime() - 30 * DAY_MS));
  const usage = f.skillUsage.filter(
    (u) => u.skillId === s.id && u.day >= since,
  );
  const runs30d = usage.reduce((n, u) => n + u.activations, 0);
  const activeUsers30d = new Set(
    usage.filter((u) => u.activations > 0).map((u) => u.personId),
  ).size;
  const grade = s.latestGradeId
    ? (f.grades.find((g) => g.id === s.latestGradeId) ?? null)
    : null;
  const owner = s.ownerPersonId
    ? (f.people.find((p) => p.id === s.ownerPersonId) ?? null)
    : null;
  const badge = boundaryBadge(s, f.org.settings?.boundary);
  const health: SkillHealthFlag[] = [];
  if (s.status === 'published' && runs30d === 0) health.push('unused_30d');
  if (grade && grade.score < GRADE_THRESHOLD)
    health.push('grade_below_threshold');
  if (badge === 'red') health.push('boundary_gap');
  if (s.ownerPersonId && (!owner || owner.status === 'inactive'))
    health.push('owner_left');
  if (
    s.status === 'in_review' ||
    f.promotions.some((p) => p.skillId === s.id && p.decision === 'pending')
  )
    health.push('pending_review');
  const trigger = s.triggerLine.trim().toLowerCase();
  if (
    trigger &&
    f.skills.some(
      (o) =>
        o.id !== s.id &&
        o.status !== 'deprecated' &&
        o.triggerLine.trim().toLowerCase() === trigger,
    )
  )
    health.push('overlapping_trigger');
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    triggerLine: s.triggerLine,
    plugin: s.plugin,
    team: s.teamId
      ? { id: s.teamId, name: f.teamName.get(s.teamId) ?? '' }
      : null,
    owner: owner ? personRef(owner, f) : null,
    status: s.status,
    rungRequired: s.rungRequired,
    version: s.currentVersion,
    grade: grade ? { score: grade.score, decision: grade.decision } : null,
    boundaryBadge: badge,
    activeUsers30d,
    runs30d,
    adoptedByMe: viewerId
      ? f.adoptions.some((a) => a.skillId === s.id && a.personId === viewerId)
      : false,
    publishedAt: s.publishedAt,
    updatedAt: s.updatedAt,
    health,
  };
}

export function promotionView(
  pr: PromotionRequest,
  f: OrgFacts,
  viewerId?: string | null,
): PromotionView | null {
  const skill = f.skills.find((s) => s.id === pr.skillId);
  if (!skill) return null;
  const grade = pr.gradeId
    ? (f.grades.find((g) => g.id === pr.gradeId) ?? null)
    : null;
  return {
    id: pr.id,
    skill: skillCard(skill, f, viewerId),
    version: skill.currentVersion,
    requestedBy: personById(f, pr.requestedByPersonId),
    prNumber: pr.prNumber,
    prUrl: pr.prUrl,
    branch: pr.branch,
    grade: grade ? gradeView(grade, f) : null,
    boundaryCheck: pr.boundaryCheck,
    diffSummary: pr.diffSummary,
    approvals: pr.approvals,
    requiredApproverRoles: pr.requiredApproverRoles,
    decision: pr.decision,
    highExposure: pr.highExposure,
    testResults: pr.testResults,
    createdAt: pr.createdAt,
    decidedAt: pr.decidedAt,
  };
}

export function workflowSummary(
  w: WorkflowMap,
  f: OrgFacts,
  viewerId?: string | null,
): WorkflowSummary {
  const hb = hoursBack(
    f.baselines.filter((b) => b.workflowMapId === w.id),
    f.measurements.filter((m) => m.workflowMapId === w.id),
  );
  const baseline = f.baselines
    .filter((b) => b.workflowMapId === w.id)
    .reduce((s, b) => s + b.minutesPerWeek + b.reworkMinutesPerWeek, 0);
  return {
    id: w.id,
    name: w.name,
    teamId: w.teamId,
    teamName: w.teamId ? (f.teamName.get(w.teamId) ?? null) : null,
    owner: personById(f, w.ownerPersonId),
    status: w.status,
    completeness: w.completeness,
    championVerified: w.championVerified,
    score: w.score,
    nextWave: w.nextWave,
    linkedSkills: f.skills
      .filter((s) => w.linkedSkillIds.includes(s.id))
      .map((s) => skillCard(s, f, viewerId)),
    baselineMinutesPerWeek: f.baselines.some((b) => b.workflowMapId === w.id)
      ? baseline
      : null,
    measuredMinutesPerWeek: hb.measuredTasks ? hb.currentMinutesPerWeek : null,
    hoursBackPerWeek: hb.measuredTasks
      ? Math.round((hb.minutesBackPerWeek / 60) * 10) / 10
      : null,
    updatedAt: w.updatedAt,
  };
}

export function backlogRank(items: WorkflowSummary[]): WorkflowSummary[] {
  return [...items].sort(
    (a, b) => (b.score?.composite ?? -1) - (a.score?.composite ?? -1),
  );
}
