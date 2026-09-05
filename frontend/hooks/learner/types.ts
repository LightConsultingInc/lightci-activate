/**
 * Learner-facing shapes from docs/api-contract.md (Learning, Interviews, Workflows).
 * Kept in one place so the pages, components and hooks agree on the contract.
 */

export type PersonRef = {
  id: string
  name: string
  email: string
  title: string | null
  avatarUrl: string | null
  teamId: string | null
  teamName: string | null
  rung: number
  roles: string[]
}

export type CompetencyStatus = "locked" | "in_progress" | "mastered" | "decayed"

export type Competency = {
  code: string
  name: string
  rung: number
  mastery: number
  components: { artifact: number; consistency: number; retention: number; judgement: number; contexts: number }
  threshold: number
  minContexts: number
  status: CompetencyStatus
}

export type WorkSurface = "orientation" | "prompt" | "project" | "skill" | "workflow" | "review"
export type ExerciseMode = "in_app" | "in_claude"
export type ExerciseStatus = "queued" | "active" | "submitted" | "graded" | "passed" | "revise" | "skipped"

export type ExerciseSummary = {
  id: string
  title: string
  rung: number
  kind: "artifact" | "revisit" | "diagnostic" | "adopt" | "review"
  mode: ExerciseMode
  workSurface: WorkSurface
  status: ExerciseStatus
  brief: string
  rationale: string
  competencyCodes: string[]
  estimatedMinutes: number
  contextTag: string | null
  scheduledFor: string | null
  createdAt: string
  skillId?: string | null
  workflowMapId?: string | null
}

export type RevisitSummary = {
  id: string
  competencyCode: string
  competencyName: string
  prompt: string
  dueAt: string
  intervalStep: number
  overdue: boolean
}

export type RubricScore = { criterion: string; label: string; score: number; note: string }

export type GradeView = {
  id: string
  score: number
  decision: "pass" | "revise"
  rubric: RubricScore[]
  feedback: string
  teachingMoment: string | null
  critiqueQuality: number | null
  expectationAccuracy: number | null
  securityFindings: { severity: "low" | "medium" | "high"; finding: string }[]
  gradedAt: string
  gradedBy: "grader" | PersonRef
}

export type SampleCase = { input: string; shouldTrigger: "yes" | "no" | "ambiguous"; expected: string }
export type Boundary = { mayRead: string[]; mustNeverReceive: string[]; humanReview: string[] }

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

export type SkillCard = {
  id: string
  slug: string
  name: string
  triggerLine: string
  plugin: string
  team: { id: string; name: string } | null
  owner: PersonRef | null
  status: "draft" | "in_review" | "published" | "deprecated"
  rungRequired: number
  version: number
  grade: { score: number; decision: "pass" | "revise" } | null
  boundaryBadge: "green" | "amber" | "red"
  activeUsers30d: number
  runs30d: number
  adoptedByMe: boolean
  publishedAt: string | null
  updatedAt: string
  health: string[]
}

export type SkillDetail = SkillCard & {
  skillMd: string
  boundary: Boundary
  sampleCases: SampleCase[]
}

export type WorkflowSchema = {
  purpose: string
  trigger: string
  frequency: "daily" | "weekly" | "monthly" | "ad_hoc"
  minutesPerRun: number
  runsPerWeek: number
  inputs: { name: string; source: string; dataClass?: string }[]
  steps: { order: number; action: string; actor: "human" | "claude" | "system"; system?: string }[]
  decisions: { point: string; rule: string }[]
  exceptions: { case: string; handling: string }[]
  systems: string[]
  mustNeverLeave: string[]
  outputs: { name: string; destination: string }[]
  humanReview: string[]
}

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

export type Baseline = {
  id: string
  task: string
  method: "time_diary" | "interview_estimate"
  minutesPerWeek: number
  reworkMinutesPerWeek: number
  capturedAt: string
}

export type Measurement = {
  id: string
  task: string
  minutesPerWeek: number
  reworkMinutesPerWeek: number
  periodStart: string
  periodEnd: string
  method: "time_diary" | "interview_estimate"
  source: "self" | "auditor"
  createdAt: string
}

export type WorkflowDetail = WorkflowSummary & {
  schema: Partial<WorkflowSchema>
  interviewSessionId: string | null
  baselines: Baseline[]
  measurements: Measurement[]
}

export type ExerciseDetail = ExerciseSummary & {
  hints: string[]
  hintsRevealed: number
  hintsTotal: number
  workedExample: string | null
  starter: Record<string, unknown> & { draftExpectation?: { expectationText: string; expectationConfidence: number } }
  submissions: SubmissionView[]
  skill?: SkillCard
  workflow?: WorkflowSummary
  coachIntro: string
}

export type LadderView = {
  person: PersonRef
  rung: number
  nextRung: number | null
  progress: {
    toNextRung: number
    gate: { masteryThreshold: number; minContexts: number; minJudgement: number }
    met: { mastery: boolean; contexts: boolean; judgement: boolean; retention: boolean }
  }
  competencies: Competency[]
  judgement: { score: number; calibration: number; critiqueQuality: number; trend: "up" | "flat" | "down"; overconfidentRate: number }
  hoursBack: {
    thisMonthMinutes: number
    baselineMinutesPerWeek: number
    currentMinutesPerWeek: number
    netOfReworkMinutes: number
    series: { week: string; minutesBack: number }[]
  }
  streak: { activeDays: number; last14: { day: string; active: boolean }[] }
  nextUp: ExerciseSummary | null
  revisitsDue: RevisitSummary[]
  queued: ExerciseSummary[]
  recentGrades: { submissionId: string; exerciseTitle: string; score: number; decision: "pass" | "revise"; gradedAt: string }[]
  coachNotes: { note: string; tags: string[]; createdAt: string }[]
}

export type MySkills = {
  adopted: (SkillCard & { myActivations30d: number })[]
  authored: (SkillCard & { usageByOthers30d: number })[]
}

export type HistoryItem = { exercise: ExerciseSummary; submission: SubmissionView }

export type SubmitResult = {
  submission: SubmissionView
  grade: GradeView
  exercise: ExerciseDetail
  nextUp: ExerciseSummary | null
  promotion?: { newRung: number }
}

export type RevisitAnswer = { score: number; feedback: string; nextDueAt: string; intervalStep: number }

export type IntakeProfile = {
  role?: string
  responsibilities?: string[]
  weeklyWorkflows?: { name: string; minutesPerRun?: number; runsPerWeek?: number; systems?: string[] }[]
  claudeUseToday?: string
  selfRatedComfort?: number
  sensitivities?: string[]
}

export type InterviewTurn = { role: "interviewer" | "user" | "scribe" | "checker"; content: string; at: string }

export type InterviewView = {
  id: string
  mode: "intake" | "champion" | "workflow"
  status: "active" | "complete" | "abandoned"
  completeness: number
  transcript: InterviewTurn[]
  scribe: IntakeProfile | Partial<WorkflowSchema>
  checkerFlags: { field: string; issue: string }[]
  turnCount: number
  nextQuestion: string
  result: Record<string, unknown> | null
}

export type InterviewComplete = {
  interview: InterviewView
  workflowMapIds: string[]
  placement?: { rung: number; evidence: string }
  exercises: ExerciseSummary[]
}

export type RealtimeSession = { clientSecret: string; model: string; expiresAt: string; instructions: string }
