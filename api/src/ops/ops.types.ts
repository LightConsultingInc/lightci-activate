/**
 * Contract shapes for the Team, Mission Control and LightCI-lead surfaces
 * (docs/api-contract.md). Shapes owned by other modules (LadderView, SkillCard,
 * PromotionView, WorkflowSummary, ExerciseSummary, SubmissionView, GradeView)
 * are re-declared here structurally so this module has no import dependency on
 * them; the field lists follow the contract text exactly.
 */
import type { Role } from '../common/roles';
import type { Artifact } from '../learning/entities/submission.entity';
import type { RubricScore } from '../learning/entities/grade.entity';
import type {
  BoundaryDeclaration,
  SampleCase,
  SkillStatus,
} from '../skills/entities/skill.entity';
import type {
  BoundaryCheck,
  PromotionDecision,
} from '../skills/entities/promotion-request.entity';
import type {
  WorkflowScore,
  WorkflowStatus,
} from '../workflows/entities/workflow-map.entity';
import type { Escalation } from './entities/escalation.entity';
import type { CostInput } from './entities/cost-input.entity';
import type { Wave } from './entities/wave.entity';
import type { Readout } from './entities/readout.entity';
import type { Baseline } from '../workflows/entities/baseline.entity';
import type { Measurement } from '../workflows/entities/measurement.entity';
import type { ComplianceBoundary } from '../orgs/entities/org.entity';

// ---------------------------------------------------------------- shared

export interface PersonRef {
  id: string;
  name: string;
  email: string;
  title: string | null;
  avatarUrl: string | null;
  teamId: string | null;
  teamName: string | null;
  rung: number;
  roles: Role[];
}

export interface ExerciseSummary {
  id: string;
  title: string;
  rung: number;
  kind: string;
  mode: string;
  workSurface: string;
  status: string;
  brief: string;
  rationale: string;
  competencyCodes: string[];
  estimatedMinutes: number;
  contextTag: string | null;
  scheduledFor: Date | null;
  createdAt: Date;
  skillId?: string | null;
  workflowMapId?: string | null;
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
  gradedAt: Date;
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
  submittedAt: Date;
  grade: GradeView | null;
}

export type SkillHealthFlag =
  | 'unused_30d'
  | 'grade_below_threshold'
  | 'boundary_gap'
  | 'owner_left'
  | 'overlapping_trigger'
  | 'pending_review';

export interface SkillCard {
  id: string;
  slug: string;
  name: string;
  triggerLine: string;
  plugin: string;
  team: { id: string; name: string } | null;
  owner: PersonRef | null;
  status: SkillStatus;
  rungRequired: number;
  version: number;
  grade: { score: number; decision: 'pass' | 'revise' } | null;
  boundaryBadge: 'green' | 'amber' | 'red';
  activeUsers30d: number;
  runs30d: number;
  adoptedByMe: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
  health: SkillHealthFlag[];
}

export interface PromotionView {
  id: string;
  skill: SkillCard;
  version: number;
  requestedBy: PersonRef | null;
  prNumber: number | null;
  prUrl: string | null;
  branch: string | null;
  grade: GradeView | null;
  boundaryCheck: BoundaryCheck;
  diffSummary: {
    filesChanged: number;
    additions: number;
    deletions: number;
    summary: string;
  };
  approvals: {
    personId: string;
    role: string;
    decision: 'approve' | 'send_back';
    note?: string;
    at: string;
  }[];
  requiredApproverRoles: string[];
  decision: PromotionDecision;
  highExposure: boolean;
  testResults: string | null;
  createdAt: Date;
  decidedAt: Date | null;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  teamId: string | null;
  teamName: string | null;
  owner: PersonRef | null;
  status: WorkflowStatus;
  completeness: number;
  championVerified: boolean;
  score: WorkflowScore | null;
  nextWave: boolean;
  linkedSkills: SkillCard[];
  baselineMinutesPerWeek: number | null;
  measuredMinutesPerWeek: number | null;
  hoursBackPerWeek: number | null;
  updatedAt: Date;
}

// ---------------------------------------------------------------- ladder (reduced, see deviations)

export interface LadderCompetency {
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
  status: 'locked' | 'in_progress' | 'mastered' | 'decayed';
}

export interface HoursBack {
  thisMonthMinutes: number;
  baselineMinutesPerWeek: number | null;
  currentMinutesPerWeek: number | null;
  netOfReworkMinutes: number | null;
  series: { week: string; minutesBack: number }[];
}

export interface LadderView {
  person: PersonRef;
  rung: number;
  nextRung: number | null;
  progress: {
    toNextRung: number;
    gate: {
      masteryThreshold: number;
      minContexts: number;
      minJudgement: number;
    };
    met: {
      mastery: boolean;
      contexts: boolean;
      judgement: boolean;
      retention: boolean;
    };
  };
  competencies: LadderCompetency[];
  judgement: {
    score: number;
    calibration: number;
    critiqueQuality: number;
    trend: 'up' | 'flat' | 'down';
    overconfidentRate: number;
  };
  hoursBack: HoursBack;
  streak: { activeDays: number; last14: { day: string; active: boolean }[] };
  nextUp: ExerciseSummary | null;
  revisitsDue: {
    id: string;
    competencyCode: string;
    competencyName: string;
    prompt: string;
    dueAt: Date;
    intervalStep: number;
    overdue: boolean;
  }[];
  queued: ExerciseSummary[];
  recentGrades: {
    submissionId: string;
    exerciseTitle: string;
    score: number;
    decision: string;
    gradedAt: Date;
  }[];
  coachNotes: { note: string; tags: string[]; createdAt: Date }[];
}

// ---------------------------------------------------------------- team

export interface RosterEntry extends PersonRef {
  lastActiveOnRealWork: string | null;
  hoursBackPerWeek: number | null;
  baselineMinutesPerWeek: number | null;
  stalled: boolean;
  stalledDays: number;
  revisitsOverdue: number;
  activeDays30: number;
  masteryAvg: number | null;
}

export interface TeamView {
  team: {
    id: string;
    name: string;
    slug: string;
    plugin: string | null;
    champion: PersonRef | null;
  };
  roster: RosterEntry[];
  backlogTop: WorkflowSummary[];
  reviewQueue: {
    submission: SubmissionView;
    exercise: ExerciseSummary;
    person: PersonRef;
  }[];
  promotionQueue: PromotionView[];
  library: SkillCard[];
  stats: {
    activePct7d: number;
    rungDistribution: number[];
    hoursBackPerWeek: number | null;
    skillsPublished: number;
    promotionsPending: number;
  };
}

// ---------------------------------------------------------------- mission control

export interface ActiveSeries {
  daily: { day: string; active: number; seats: number }[];
  weekly: { day: string; active: number; seats: number }[];
  monthly: { day: string; active: number; seats: number }[];
  pctOfSeats: number;
  trend: 'up' | 'flat' | 'down';
}

export interface FunnelStep {
  step: string;
  count: number;
  medianDays: number | null;
}

export interface AdoptionView {
  active: ActiveSeries;
  depth: {
    sessionsPerActive: number;
    surfaces: { name: string; users: number }[];
    connectors: number;
    skillsActivated: number;
  };
  funnel: FunnelStep[];
  inactiveSeats: (PersonRef & { daysInactive: number | null })[];
  byTeam: {
    teamId: string;
    teamName: string;
    activePct: number;
    hoursBack: number | null;
  }[];
  source: 'analytics_api' | 'seed' | 'mixed' | 'none';
}

export interface ActivationScore {
  composite: number;
  components: {
    rung: number;
    hoursBack: number;
    skillsPublished: number;
    influence: number;
    gradeQuality: number;
    activeDays: number;
  };
}

export interface PeopleEntry extends PersonRef {
  activationScore: ActivationScore;
  hoursBackPerWeek: number | null;
  skillsPublished: number;
  adoptedByOthers: number;
  gradeQuality: number | null;
  activeDays30: number;
  rising: boolean;
  stalled: boolean;
  stalledReason: string | null;
  championCandidate: boolean;
}

export interface JourneyEvent {
  at: Date;
  type:
    'placement' | 'exercise' | 'grade' | 'skill' | 'measurement' | 'escalation';
  title: string;
  detail: string;
}

export interface PersonPage {
  person: PersonRef;
  ladder: LadderView;
  journey: JourneyEvent[];
  baselines: Baseline[];
  measurements: Measurement[];
  usageSeries: { day: string; activeOnRealWork: boolean; messages: number }[];
  coachNotes: {
    id: string;
    note: string;
    tags: string[];
    author: string;
    createdAt: Date;
  }[];
  escalations: Escalation[];
}

export interface JourneyView {
  heatmap: { teamId: string; teamName: string; counts: number[] }[];
  cohorts: { cohortWeek: string; counts: number[] }[];
  timeInRung: {
    rung: number;
    medianDays: number | null;
    p90Days: number | null;
    stuck: PersonRef[];
  }[];
  revisitCompliance: {
    teamId: string;
    teamName: string;
    due: number;
    done: number;
  }[];
}

export interface GroupRow {
  teamId: string;
  teamName: string;
  size: number;
  activePct: number;
  rungMix: number[];
  hoursBackPerPerson: number | null;
  skillsPublished: number;
  skillsAdopted: number;
  promotionThroughput: number;
  reworkRate: number | null;
  championQueueAgeDays: number | null;
}

export interface SkillsView {
  health: SkillCard[];
  mostUsed: SkillCard[];
  leastUsed: SkillCard[];
  byTeam: {
    teamId: string | null;
    teamName: string | null;
    skills: number;
    activations30d: number;
  }[];
  unowned: SkillCard[];
  regradeQueue: SkillCard[];
}

export interface GovernanceEvent {
  at: string;
  type: string;
  actor: string | null;
  detail: string;
  source: 'compliance_api' | 'audit_log';
}

export interface GovernanceView {
  policy: { text: string; version: number; updatedAt: string | null };
  boundary: {
    value: ComplianceBoundary | null;
    version: number;
    updatedAt: string | null;
  };
  promotionLog: {
    at: Date;
    skill: string;
    version: number | null;
    approvers: string[];
    grade: number | null;
    decision: string;
  }[];
  complianceTouch: SkillCard[];
  drift: {
    plugin: string;
    team: { id: string; name: string };
    intendedMode: string;
    observedMode: string | null;
    drift: boolean;
  }[];
  events: GovernanceEvent[];
  complianceFeed: {
    configured: boolean;
    source: 'compliance_api' | 'audit_log';
    detail?: string;
  };
  exportUrl: string;
}

export interface BacklogTotals {
  hoursAtStake: number;
  candidates: number;
  inBuild: number;
  shipped: number;
  nextWave: number;
}

export interface McBacklogView {
  items: WorkflowSummary[];
  totals: BacklogTotals;
  byTeam: ({
    teamId: string | null;
    teamName: string | null;
  } & BacklogTotals)[];
  sowExport: { rows: Record<string, string | number | boolean | null>[] };
}

export interface BaselineRef {
  kind: 'baseline' | 'measurement' | 'cost_input' | 'analytics';
  id: string | null;
  detail: string;
}

export interface CostView {
  inputs: CostInput;
  seats: {
    total: number;
    active: number;
    inactive: number;
    costTotal: number;
    costInactive: number;
    costPerActive: number | null;
    byTeam: {
      teamId: string;
      teamName: string;
      seats: number;
      active: number;
      cost: number;
      costInactive: number;
    }[];
  };
  premium: { seats: number; unused: number; cost: number; costUnused: number };
  program: {
    lightciFees: number;
    championHoursCost: number;
    learnerExerciseHoursCost: number;
    total: number;
    learnerExerciseMinutes: number;
  };
  return: {
    hoursBackPerMonth: number;
    valueUsd: number;
    roi: number | null;
    baselineRefs: BaselineRef[];
    perTeam: {
      teamId: string | null;
      teamName: string | null;
      hoursBackPerMonth: number;
      valueUsd: number;
      baselineRefs: BaselineRef[];
    }[];
    perSkill: {
      skillId: string;
      skillName: string;
      hoursBackPerMonth: number;
      valueUsd: number;
      baselineRefs: BaselineRef[];
    }[];
  };
  waste: {
    kind:
      | 'inactive_seats'
      | 'premium_unused'
      | 'skills_unadopted'
      | 'exercises_abandoned';
    count: number;
    costUsd: number;
  }[];
}

// ---------------------------------------------------------------- lead

export interface LeadQueue {
  escalations: (Escalation & {
    org: { id: string; name: string; slug: string };
    subject: string | null;
    assignee: PersonRef | null;
  })[];
  approvals: (PromotionView & {
    org: { id: string; name: string; slug: string };
  })[];
  stalled: {
    org: { id: string; name: string; slug: string };
    team?: { id: string; name: string } | null;
    person?: PersonRef | null;
    metric: string;
    value: number;
    threshold: number;
  }[];
  waves: {
    org: { id: string; name: string; slug: string };
    wave: Wave;
    week: number;
    skillsShipped: number;
    target: number;
    baselineCoveragePct: number;
    activePct: number;
    status: Wave['status'];
  }[];
}

export interface LeadClientRow {
  org: {
    id: string;
    name: string;
    slug: string;
    industry: string | null;
    sponsorName: string | null;
    isDemo: boolean;
    createdAt: Date;
  };
  seats: number;
  activePct: number;
  rungDistribution: number[];
  skillsPublished: number;
  openEscalations: number;
  wave: Wave | null;
}

export type ReadoutView = Readout;
