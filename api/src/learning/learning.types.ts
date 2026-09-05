/**
 * Wire shapes for the Learning section of docs/api-contract.md. These are the exact payloads
 * the controller returns; other modules (team, mission control, MCP) import them so the same
 * JSON reaches every host.
 */
import type { Artifact } from './entities/submission.entity';
import type { Exercise } from './entities/exercise.entity';
import type { RubricScore } from './entities/grade.entity';
import type { WorkflowScore } from '../workflows/entities/workflow-map.entity';

export interface PersonRef {
  id: string;
  name: string;
  email: string;
  title: string | null;
  avatarUrl: string | null;
  teamId: string | null;
  teamName: string | null;
  rung: number;
  roles: string[];
}

export type CompetencyStatus =
  'locked' | 'in_progress' | 'mastered' | 'decayed';

export interface CompetencyView {
  code: string;
  name: string;
  rung: number;
  mastery: number;
  components: {
    artifact: number;
    consistency: number;
    retention: number;
    judgement: number;
    contexts: number;
  };
  threshold: number;
  minContexts: number;
  status: CompetencyStatus;
}

export interface JudgementView {
  score: number;
  calibration: number;
  critiqueQuality: number;
  trend: 'up' | 'flat' | 'down';
  overconfidentRate: number;
}

export interface GateView {
  masteryThreshold: number;
  minContexts: number;
  minJudgement: number;
}

export interface ProgressView {
  toNextRung: number;
  gate: GateView;
  met: {
    mastery: boolean;
    contexts: boolean;
    judgement: boolean;
    retention: boolean;
  };
}

export interface HoursBackView {
  thisMonthMinutes: number;
  baselineMinutesPerWeek: number;
  currentMinutesPerWeek: number;
  netOfReworkMinutes: number;
  series: { week: string; minutesBack: number }[];
}

export interface StreakView {
  activeDays: number;
  last14: { day: string; active: boolean }[];
}

export interface ExerciseSummary {
  id: string;
  title: string;
  rung: number;
  kind: Exercise['kind'];
  mode: Exercise['mode'];
  workSurface: Exercise['workSurface'];
  status: Exercise['status'];
  brief: string;
  rationale: string;
  competencyCodes: string[];
  estimatedMinutes: number;
  contextTag: string | null;
  scheduledFor: string | null;
  createdAt: string;
  skillId?: string;
  workflowMapId?: string;
}

export interface RevisitSummary {
  id: string;
  competencyCode: string;
  competencyName: string;
  prompt: string;
  dueAt: string;
  intervalStep: number;
  overdue: boolean;
}

export interface GradeView {
  id: string;
  score: number;
  decision: 'pass' | 'revise';
  rubric: RubricScore[];
  feedback: string;
  teachingMoment: string | null;
  critiqueQuality: number | null;
  expectationAccuracy: number | null;
  securityFindings: { severity: 'low' | 'medium' | 'high'; finding: string }[];
  gradedAt: string;
  gradedBy: 'grader' | PersonRef;
}

export interface SubmissionView {
  id: string;
  attempt: number;
  expectationText: string;
  expectationConfidence: number;
  artifact: Artifact;
  critiqueText: string | null;
  coldAttempt: boolean;
  submittedAt: string;
  grade: GradeView | null;
}

/** Minimal SkillCard as defined in the Skills section of the contract; the skills module owns the canonical mapper. */
export interface SkillCard {
  id: string;
  slug: string;
  name: string;
  triggerLine: string;
  plugin: string;
  team: { id: string; name: string } | null;
  owner: PersonRef | null;
  status: string;
  rungRequired: number;
  version: number;
  grade: { score: number; decision: string } | null;
  boundaryBadge: 'green' | 'amber' | 'red';
  activeUsers30d: number;
  runs30d: number;
  adoptedByMe: boolean;
  publishedAt: string | null;
  updatedAt: string;
  health: (
    | 'unused_30d'
    | 'grade_below_threshold'
    | 'boundary_gap'
    | 'owner_left'
    | 'overlapping_trigger'
    | 'pending_review'
  )[];
}

/** WorkflowSummary as defined in the Workflows section of the contract (fields the learning module can fill). */
export interface WorkflowSummary {
  id: string;
  name: string;
  teamId: string | null;
  teamName: string | null;
  owner: PersonRef | null;
  status: string;
  completeness: number;
  championVerified: boolean;
  score: WorkflowScore | null;
  nextWave: boolean;
  linkedSkills: SkillCard[];
  baselineMinutesPerWeek: number;
  measuredMinutesPerWeek: number;
  hoursBackPerWeek: number;
  updatedAt: string;
}

export interface ExerciseDetail extends ExerciseSummary {
  hints: string[];
  hintsRevealed: number;
  hintsTotal: number;
  workedExample: string | null;
  starter: Record<string, unknown>;
  submissions: SubmissionView[];
  skill?: SkillCard;
  workflow?: WorkflowSummary;
  coachIntro: string;
}

export interface LadderView {
  person: PersonRef;
  rung: number;
  nextRung: number | null;
  progress: ProgressView;
  competencies: CompetencyView[];
  judgement: JudgementView;
  hoursBack: HoursBackView;
  streak: StreakView;
  nextUp: ExerciseSummary | null;
  revisitsDue: RevisitSummary[];
  queued: ExerciseSummary[];
  recentGrades: {
    submissionId: string;
    exerciseTitle: string;
    score: number;
    decision: 'pass' | 'revise';
    gradedAt: string;
  }[];
  coachNotes: { note: string; tags: string[]; createdAt: string }[];
}

export interface SubmitResponse {
  submission: SubmissionView;
  grade: GradeView;
  exercise: ExerciseDetail;
  nextUp: ExerciseSummary | null;
  promotion?: { newRung: number };
}

export interface MasteryResponse {
  competencies: CompetencyView[];
  snapshots: { day: string; competencyCode: string; mastery: number }[];
}

export interface MySkillsResponse {
  adopted: (SkillCard & { myActivations30d: number })[];
  authored: (SkillCard & { usageByOthers30d: number })[];
}

/** Everything MasteryService knows about one person at one moment. */
export interface MasteryReport {
  rung: number;
  nextRung: number | null;
  competencies: CompetencyView[];
  judgement: JudgementView;
  progress: ProgressView;
  eligible: boolean;
}
