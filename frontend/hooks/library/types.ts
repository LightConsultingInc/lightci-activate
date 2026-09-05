/**
 * Types for the Skill Library, Team, Promotion and Person surfaces.
 * Mirrors docs/api-contract.md exactly; anything not in the contract is marked.
 */

export type Role = "learner" | "champion" | "sponsor" | "admin" | "lead" | "compliance"

export type PersonRef = {
  id: string
  name: string
  email: string
  title: string | null
  avatarUrl: string | null
  teamId: string | null
  teamName: string | null
  rung: number
  roles: Role[]
}

export type SkillStatus = "draft" | "in_review" | "published" | "deprecated"
export type BoundaryBadgeLevel = "green" | "amber" | "red"
export type HealthFlag = "unused_30d" | "grade_below_threshold" | "boundary_gap" | "owner_left" | "overlapping_trigger" | "pending_review"
export type Decision = "pass" | "revise" | "fail"

export type SkillCard = {
  id: string
  slug: string
  name: string
  triggerLine: string
  plugin: string
  team: { id: string; name: string } | null
  owner: PersonRef | null
  status: SkillStatus
  rungRequired: number
  version: number
  grade: { score: number; decision: Decision } | null
  boundaryBadge: BoundaryBadgeLevel
  activeUsers30d: number
  runs30d: number
  adoptedByMe: boolean
  publishedAt: string | null
  updatedAt: string
  health: HealthFlag[]
  /** Not in SkillCard per contract but present on the entity; the library facets use it. */
  workflowFamily?: string | null
}

export type RubricScore = { criterion: string; label: string; score: number; note: string }
export type SecurityFinding = { severity: "low" | "medium" | "high"; finding: string }

export type GradeView = {
  id: string
  score: number
  decision: Decision
  rubric: RubricScore[]
  feedback: string
  teachingMoment: string | null
  critiqueQuality: number | null
  expectationAccuracy: number | null
  securityFindings: SecurityFinding[]
  gradedAt: string
  gradedBy: "grader" | PersonRef
}

export type BoundaryDeclaration = { mayRead: string[]; mustNeverReceive: string[]; humanReview: string[] }
export type SampleCase = { input: string; shouldTrigger: "yes" | "no" | "ambiguous"; expected: string }

export type SkillVersion = {
  id: string
  version: number
  tag: string | null
  commitSha: string | null
  changelog: string
  author: PersonRef | null
  gradeScore: number | null
  approvers: PersonRef[]
  createdAt: string
}

export type SkillComment = { id: string; person: PersonRef; body: string; kind: "comment" | "grader" | "system" | string; createdAt: string }

export type WorkflowScore = { value: number; hours: number; readiness: number; exposure: number; composite: number; rationale: string }
export type WorkflowStatus = "candidate" | "scored" | "in_build" | "shipped" | "measured"

export type WorkflowSummary = {
  id: string
  name: string
  teamId: string | null
  teamName: string | null
  owner: PersonRef | null
  status: WorkflowStatus
  completeness: number
  championVerified: boolean
  score: WorkflowScore | null
  nextWave: boolean
  linkedSkills: SkillCard[]
  baselineMinutesPerWeek: number | null
  measuredMinutesPerWeek: number | null
  hoursBackPerWeek: number | null
  updatedAt: string
}

export type BoundaryCheck = {
  ok: boolean
  touchesRestrictedClasses: string[]
  missingDeclarations: string[]
  humanReviewRequired: boolean
  notes: string
}

export type PromotionDecision = "pending" | "approved" | "sent_back" | "merged" | "withdrawn"

export type Approval = { personId: string; person?: PersonRef | null; role: string; decision: "approve" | "send_back"; note?: string; at: string }

export type PromotionView = {
  id: string
  skill: SkillCard
  version: number
  requestedBy: PersonRef
  prNumber: number | null
  prUrl: string | null
  branch: string | null
  grade: GradeView | null
  boundaryCheck: BoundaryCheck
  diffSummary: { filesChanged: number; additions: number; deletions: number; summary: string }
  approvals: Approval[]
  requiredApproverRoles: string[]
  decision: PromotionDecision
  highExposure: boolean
  testResults: string | null
  createdAt: string
  decidedAt: string | null
  /** Set once merged (tag `<slug>@vN`). Not in the contract; rendered when present. */
  tag?: string | null
}

export type PromotionDetail = PromotionView & { skillMd: string; previousSkillMd: string | null }

export type SkillDetail = SkillCard & {
  skillMd: string
  boundary: BoundaryDeclaration
  sampleCases: SampleCase[]
  manifest: Record<string, unknown> | null
  workflow: WorkflowSummary | null
  versions: SkillVersion[]
  grades: GradeView[]
  usageByTeam: { teamId: string; teamName: string; activations30d: number }[]
  usageSeries: { day: string; activations: number }[]
  adopters: PersonRef[]
  comments: SkillComment[]
  promotion: PromotionView | null
  successor: SkillCard | null
  /** Optional org boundary echo so the Boundary tab can show conflicts. Not in the contract. */
  orgBoundary?: { allowedDataClasses: string[]; forbiddenDataClasses: string[]; humanReviewPoints: string[] } | null
}

export type LibraryFacets = {
  teams: { id: string; name: string; count: number }[]
  families: { name: string; count: number }[]
  rungs: { rung: number; count: number }[] | Record<string, number>
  statuses: { status: SkillStatus; count: number }[] | Record<string, number>
}

export type LibraryResponse = { skills: SkillCard[]; facets: LibraryFacets }

export type LibrarySort = "most_used" | "newest" | "grade"
export type LibraryFilters = { team?: string; family?: string; rung?: string; status?: string; q?: string; sort?: LibrarySort }

export type ExerciseSummary = {
  id: string
  title: string
  rung: number
  kind: string
  mode: string
  workSurface: string
  status: string
  brief: string
  rationale: string
  competencyCodes: string[]
  estimatedMinutes: number
  contextTag: string | null
  scheduledFor: string | null
  createdAt: string
  skillId?: string
  workflowMapId?: string
}

export type Artifact = {
  type: "prompt_run" | "project" | "skill" | "workflow" | "text" | "review"
  content: string
  output?: string
  files?: { name: string; content: string }[]
  rationale?: string
  sampleCases?: SampleCase[]
  boundary?: Record<string, string[]>
}

export type SubmissionView = {
  id: string
  attempt: number
  expectationText: string
  expectationConfidence: number
  artifact: Artifact
  critiqueText: string | null
  coldAttempt: boolean
  submittedAt: string
  grade: GradeView | null
}

export type RosterRow = PersonRef & {
  lastActiveOnRealWork: string | null
  hoursBackPerWeek: number
  baselineMinutesPerWeek: number
  stalled: boolean
  stalledDays: number
  revisitsOverdue: number
  activeDays30: number
  masteryAvg: number
}

export type ReviewItem = { submission: SubmissionView; exercise: ExerciseSummary; person: PersonRef }

export type TeamView = {
  team: { id: string; name: string; slug: string; plugin: string; champion: PersonRef | null }
  roster: RosterRow[]
  backlogTop: WorkflowSummary[]
  reviewQueue: ReviewItem[]
  promotionQueue: PromotionView[]
  library: SkillCard[]
  stats: { activePct7d: number; rungDistribution: number[]; hoursBackPerWeek: number; skillsPublished: number; promotionsPending: number }
}

export type Readout = {
  id: string
  scopeType: "org" | "team" | "person"
  scopeId: string | null
  title: string
  periodStart: string
  periodEnd: string
  metrics: Record<string, unknown>
  narrative: string
  footnotes: { ref: string; source: string; baseline?: string }[]
  generatedAt: string
}

export type ReviewGradeResponse = GradeView & {
  /** Agreement with the Grader's draft, if the API computes it. Not in the contract. */
  agreement?: { score: number; perCriterion?: { criterion: string; delta: number }[] } | null
}

export type Competency = {
  code: string
  name: string
  rung: number
  mastery: number
  components: { artifact: number; consistency: number; retention: number; judgement: number; contexts: number }
  threshold: number
  minContexts: number
  status: "locked" | "in_progress" | "mastered" | "decayed"
}

export type LadderView = {
  person: PersonRef
  rung: number
  nextRung: number | null
  progress: { toNextRung: number; gate: { masteryThreshold: number; minContexts: number; minJudgement: number }; met: { mastery: boolean; contexts: boolean; judgement: boolean; retention: boolean } }
  competencies: Competency[]
  judgement: { score: number; calibration: number; critiqueQuality: number; trend: "up" | "flat" | "down"; overconfidentRate: number }
  hoursBack: { thisMonthMinutes: number; baselineMinutesPerWeek: number; currentMinutesPerWeek: number; netOfReworkMinutes: number; series: { week: string; minutesBack: number }[] }
  streak: { activeDays: number; last14: { day: string; active: boolean }[] }
  nextUp: ExerciseSummary | null
  revisitsDue: unknown[]
  queued: ExerciseSummary[]
  recentGrades: { submissionId: string; exerciseTitle: string; score: number; decision: Decision; gradedAt: string }[]
  coachNotes: { note: string; tags: string[]; createdAt: string }[]
}

export type JourneyEvent = { at: string; type: "placement" | "exercise" | "grade" | "skill" | "measurement" | "escalation"; title: string; detail: string }

export type Baseline = { id: string; task: string; method: string; minutesPerWeek: number; reworkMinutesPerWeek: number; capturedAt: string; workflowMapId?: string | null }
export type Measurement = { id: string; task: string; minutesPerWeek: number; reworkMinutesPerWeek: number; periodStart: string; periodEnd: string; method: string; source: string; baselineId?: string | null }

export type Escalation = {
  id: string
  sourceAgent: string
  kind: "escalation" | "approval" | "stalled" | "access_request"
  subjectType: string
  subjectId: string | null
  reason: string
  state: "open" | "in_progress" | "resolved"
  slaDueAt: string | null
  resolution: string | null
  createdAt: string
}

export type PersonPage = {
  person: PersonRef
  ladder: LadderView
  journey: JourneyEvent[]
  baselines: Baseline[]
  measurements: Measurement[]
  usageSeries: { day: string; activeOnRealWork: boolean; messages: number }[]
  coachNotes: { note: string; tags: string[]; createdAt: string }[]
  escalations: Escalation[]
}

/** Loose alias for PATCH /workflows/:id responses (WorkflowDetail is owned by another surface). */
export type WorkflowDetailLike = WorkflowSummary & Record<string, unknown>
