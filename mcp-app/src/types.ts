/** Payload types transcribed from docs/api-contract.md. Only fields the cards render are required. */

export type Role = 'learner' | 'champion' | 'sponsor' | 'admin' | 'lead';

export interface PersonRef {
  id: string;
  name: string;
  email: string;
  title?: string | null;
  avatarUrl?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  rung?: number | null;
  roles?: Role[];
}

export interface ExerciseSummary {
  id: string;
  title: string;
  rung: number;
  kind: string;
  mode: string;
  workSurface?: string;
  status: string;
  brief: string;
  rationale?: string;
  competencyCodes?: string[];
  estimatedMinutes?: number;
  contextTag?: string | null;
  scheduledFor?: string | null;
  createdAt?: string;
  skillId?: string | null;
  workflowMapId?: string | null;
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

export interface Competency {
  code: string;
  name: string;
  rung: number;
  mastery: number;
  components?: { artifact: number; consistency: number; retention: number; judgement: number; contexts: number };
  threshold: number;
  minContexts?: number;
  status: 'locked' | 'in_progress' | 'mastered' | 'decayed';
}

export interface LadderView {
  person: PersonRef;
  rung: number;
  nextRung: number | null;
  progress: {
    toNextRung: number;
    gate?: { masteryThreshold: number; minContexts: number; minJudgement: number };
    met?: { mastery: boolean; contexts: boolean; judgement: boolean; retention: boolean };
  };
  competencies: Competency[];
  judgement?: { score: number; calibration: number; critiqueQuality: number; trend: 'up' | 'flat' | 'down'; overconfidentRate: number };
  hoursBack: {
    thisMonthMinutes: number;
    baselineMinutesPerWeek: number;
    currentMinutesPerWeek: number;
    netOfReworkMinutes?: number;
    series: { week: string; minutesBack: number }[];
  };
  streak?: { activeDays: number; last14: { day: string; active: boolean }[] };
  nextUp: ExerciseSummary | null;
  revisitsDue: RevisitSummary[];
  queued?: ExerciseSummary[];
  recentGrades?: { submissionId: string; exerciseTitle: string; score: number; decision: string; gradedAt: string }[];
  coachNotes?: { note: string; tags: string[]; createdAt: string }[];
}

export type Decision = 'pass' | 'revise' | 'fail' | string;

export interface GradeView {
  id: string;
  score: number;
  decision: Decision;
  rubric: { criterion: string; label: string; score: number; note?: string }[];
  feedback: string;
  teachingMoment?: string | null;
  critiqueQuality?: number | null;
  expectationAccuracy?: number | null;
  securityFindings?: { severity?: string; title?: string; detail?: string }[] | string[];
  gradedAt: string;
  gradedBy: 'grader' | PersonRef;
}

export type BoundaryBadge = 'green' | 'amber' | 'red';

export interface SkillCard {
  id: string;
  slug: string;
  name: string;
  triggerLine: string;
  plugin?: string | null;
  team: { id: string; name: string } | null;
  owner: PersonRef | null;
  status: string;
  rungRequired?: number;
  version: number | string;
  grade: { score: number; decision: Decision } | null;
  boundaryBadge: BoundaryBadge;
  activeUsers30d: number;
  runs30d?: number;
  adoptedByMe: boolean;
  publishedAt?: string | null;
  updatedAt?: string;
  health?: string[];
}

export interface Boundary {
  allowedDataClasses?: string[];
  mustNeverReceive?: string[];
  readOnlySystems?: string[];
  humanReview?: string[];
  [key: string]: unknown;
}

export interface SkillVersion {
  id: string;
  version: number | string;
  tag?: string | null;
  commitSha?: string | null;
  changelog?: string | null;
  author: PersonRef | null;
  gradeScore?: number | null;
  approvers?: PersonRef[];
  createdAt: string;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  teamId?: string | null;
  teamName?: string | null;
  owner: PersonRef | null;
  status: string;
  completeness?: number;
  championVerified?: boolean;
  score?: { composite?: number; [k: string]: unknown } | number | null;
  nextWave?: boolean;
  linkedSkills?: SkillCard[];
  baselineMinutesPerWeek?: number | null;
  measuredMinutesPerWeek?: number | null;
  hoursBackPerWeek?: number | null;
  updatedAt?: string;
}

export interface PromotionView {
  id: string;
  skill: SkillCard;
  version: number | string;
  requestedBy: PersonRef;
  prNumber?: number | null;
  prUrl?: string | null;
  branch?: string;
  grade: GradeView | null;
  boundaryCheck: { ok?: boolean; passed?: boolean; findings?: string[]; notes?: string; [k: string]: unknown } | null;
  diffSummary: string | null;
  approvals: { person?: PersonRef; role?: string; at?: string; note?: string }[];
  requiredApproverRoles: string[];
  decision: 'pending' | 'approved' | 'sent_back' | 'merged' | string;
  highExposure?: boolean;
  testResults?: { passed?: number; failed?: number; total?: number; [k: string]: unknown } | null;
  createdAt: string;
  decidedAt?: string | null;
}

export interface SkillDetail extends SkillCard {
  skillMd: string;
  boundary: Boundary | null;
  sampleCases?: unknown[];
  manifest?: Record<string, unknown> | null;
  workflow: WorkflowSummary | null;
  versions: SkillVersion[];
  grades?: GradeView[];
  usageByTeam: { teamId: string; teamName: string; activations30d: number }[];
  usageSeries?: { day: string; activations: number }[];
  adopters?: PersonRef[];
  comments?: { id: string; person: PersonRef; body: string; kind?: string; createdAt: string }[];
  promotion?: PromotionView | null;
  successor?: SkillCard | null;
}

export interface LibraryPayload {
  skills: SkillCard[];
  facets?: {
    teams?: { id: string; name: string; count: number }[];
    families?: { name: string; count: number }[];
    rungs?: { rung: number; count: number }[] | number[];
    statuses?: { status: string; count: number }[] | string[];
  };
}

export interface SubmissionView {
  id: string;
  attempt: number;
  expectationText: string;
  expectationConfidence: number;
  artifact: unknown;
  critiqueText: string;
  coldAttempt?: boolean;
  submittedAt: string;
  grade: GradeView | null;
}

export interface SubmitArtifactPayload {
  submission: SubmissionView;
  grade: GradeView;
  exercise: ExerciseSummary & { skill?: SkillCard };
  nextUp: ExerciseSummary | null;
  promotion?: { newRung: number } | null;
}

export interface SubmitSkillPayload {
  grade: GradeView;
  skill: SkillDetail;
}

export interface InterviewView {
  id: string;
  mode: 'intake' | 'champion' | 'workflow' | string;
  status: string;
  completeness: number;
  transcript: { role: 'user' | 'assistant' | 'interviewer' | string; content: string; at?: string }[];
  scribe: Record<string, unknown>;
  checkerFlags?: { field?: string; message: string; severity?: string }[] | string[];
  turnCount: number;
  nextQuestion: string;
  result?: unknown;
}

export interface RosterEntry extends PersonRef {
  lastActiveOnRealWork?: string | null;
  hoursBackPerWeek?: number;
  baselineMinutesPerWeek?: number;
  stalled: boolean;
  stalledDays?: number;
  revisitsOverdue?: number;
  activeDays30?: number;
  masteryAvg?: number;
}

export interface TeamView {
  team: { id: string; name: string; slug?: string; plugin?: string | null; champion: PersonRef | null };
  roster: RosterEntry[];
  backlogTop: WorkflowSummary[];
  reviewQueue: { submission: SubmissionView; exercise: ExerciseSummary; person: PersonRef }[];
  promotionQueue: PromotionView[];
  library?: SkillCard[];
  stats: { activePct7d: number; rungDistribution: number[]; hoursBackPerWeek: number; skillsPublished: number; promotionsPending: number };
}

export interface OrgPayload {
  org: { id: string; name: string; slug?: string; seats?: number; premiumSeats?: number; [k: string]: unknown } | null;
  adoption: {
    active?: { pctOfSeats?: number; trend?: string; weekly?: unknown; monthly?: unknown; daily?: { day: string; active: number; seats: number }[] };
    depth?: { sessionsPerActive?: number; connectors?: number; skillsActivated?: number };
    inactiveSeats?: PersonRef[];
    byTeam?: { teamId: string; teamName: string; activePct: number; hoursBack: number }[];
  } | null;
  people: { people: { id: string; name: string; rising?: boolean; stalled?: boolean; championCandidate?: boolean; hoursBackPerWeek?: number }[] } | null;
  groups: { groups: { teamId: string; teamName: string; size: number; activePct: number; hoursBackPerPerson: number; skillsPublished: number }[] } | null;
  cost: {
    seats?: { total?: number; active?: number; inactive?: number; costTotal?: number; costInactive?: number; costPerActive?: number };
    return?: { hoursBackPerMonth?: number; valueUsd?: number; roi?: number };
    waste?: { kind: string; count: number; costUsd: number }[];
  } | null;
}

export interface PromotionQueuePayload {
  promotions: PromotionView[];
  acted?: PromotionView | null;
}
