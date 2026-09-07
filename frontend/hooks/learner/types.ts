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
/** @deprecated The practice model has no "do it in Claude" path; kept only so older summaries still type-check. */
export type ExerciseMode = "in_app" | "in_claude"
export type ExerciseStatus = "queued" | "active" | "submitted" | "graded" | "passed" | "revise" | "try_again" | "skipped"

// ─────────────────────────── Practice (v2) ───────────────────────────
/** The input a practice item asks for. Mirrors docs/practice-model.md; `orientation` items are `prompt`. */
export type PracticeKind = "prompt" | "project" | "skill" | "workflow" | "review"

export type PromptPrefill = { prompt: string; material?: string }
export type ProjectPrefill = { instructions: string; files: { name: string; content: string }[]; testTask: string }
export type SkillPrefill = { skillMd: string; sampleRequests: string[] }
export type WorkflowPrefill = { schema: Partial<WorkflowSchema> }
export type ReviewPrefill = { submissionId: string }
/** Only the keys for the item's `kind` are present; typed loosely so a reader can pick what it needs. */
export type PracticePrefill = Partial<PromptPrefill & ProjectPrefill & SkillPrefill & WorkflowPrefill & ReviewPrefill>

/** `ExerciseDetail.starter.practice`: the ask, the kind of input, and what to pre-fill it with. */
export type PracticeSpec = {
  ask: string
  kind: PracticeKind
  workflowName: string | null
  prefill: PracticePrefill
}

/** POST /exercises/:id/run body, by kind. Review items do not run. */
export type RunBody =
  | { kind: "prompt"; prompt: string; material?: string }
  | { kind: "project"; instructions: string; files: { name: string; content: string }[]; testTask: string }
  | { kind: "skill"; skillMd: string; sampleRequests: string[] }
  | { kind: "workflow"; schema: Partial<WorkflowSchema> }

/** One sample request run with the skill in context (L3). */
export type SkillRunResult = { request: string; fired: boolean; output: string }

/** What POST /exercises/:id/run hands back, by kind. */
export type RunResult = { output?: string; results?: SkillRunResult[]; skillDraft?: string; model?: string; runId?: string }

/** Coach's three lines. */
export type Feedback = { worked: string; change: string; tryNext: string }
export type PracticeDecision = "pass" | "try_again"

export type ExerciseSummary = {
  id: string
  title: string
  rung: number
  kind: "artifact" | "revisit" | "diagnostic" | "adopt" | "review"
  /** @deprecated ignored by the practice screen. */
  mode: ExerciseMode
  workSurface: WorkSurface
  status: ExerciseStatus
  /** The one-sentence ask, when the API sends it on the summary; cards fall back to `title`. */
  ask?: string | null
  /** The learner's workflow this item is framed on; cards fall back to `contextTag`. */
  workflowName?: string | null
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
  /** prompt: the pasted material, if any. */
  material?: string
  files?: { name: string; content: string }[]
  /** project: the pre-filled task the Project was run against. */
  testTask?: string
  /** skill: the three sample requests and what happened when each ran. */
  sampleRequests?: string[]
  results?: SkillRunResult[]
  /** workflow: the skill drafted from the map. */
  skillDraft?: string
  /** review: the learner's 0–10 score and the teammate's submission. */
  score10?: number
  submissionId?: string
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
  /** Practice v2: the three lines and the score out of 10, when the API stores them on the attempt. */
  feedback?: Feedback | null
  score10?: number | null
  decision?: PracticeDecision | null
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
  workedExample?: string | null
  /** `practice` is the v2 shape; older starters carry loose keys (starterPrompt, instructions, schema…) keyed off `workSurface`. */
  starter: Record<string, unknown> & { practice?: PracticeSpec }
  /** L5 review items: the teammate's artifact the learner is asked to grade. */
  review?: { artifact: Artifact; person: PersonRef | null; exerciseTitle: string } | null
  submissions: SubmissionView[]
  skill?: SkillCard
  workflow?: WorkflowSummary
  coachIntro?: string
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

/** POST /modules/:code/prepare and GET /modules/:code/readiness: how far personalisation of a module has got. */
export type ModuleReadiness = {
  status: "ready" | "preparing"
  lessons: { total: number; ready: number }
  practice: { ready: boolean }
  memoryVersion: number
}

/** GET /memory/me: Coach's living picture of the person. */
export type PersonMemory = {
  summary: string
  strengths: string[]
  struggles: string[]
  preferences: string[]
  version: number
  updatedAt: string
}

/** GET /lessons/:slug/personalised: the example and check rewritten around the learner's own work (or the static content echoed back). */
export type LessonPersonalised = {
  example: { title: string; text: string }
  check: { question: string; options: string[]; answer: number; explanation: string }
  personalised: boolean
}

/** One entry of GET /competencies (seeded rows or the in-code catalog). */
export type CompetencyCatalogEntry = {
  id: string
  code: string
  rung: number
  name: string
  description: string
  rubric: { key: string; label: string; description: string; weight: number }[]
  orderIndex: number
  minContexts: number
  masteryThreshold: number
}

export type MySkills = {
  adopted: (SkillCard & { myActivations30d: number })[]
  authored: (SkillCard & { usageByOthers30d: number })[]
}

export type HistoryItem = { exercise: ExerciseSummary; submission: SubmissionView }

/** POST /exercises/:id/submit. Review items add `agreement`: the learner's score next to the grader's. */
export type SubmitResult = {
  feedback: Feedback
  score10: number
  decision: PracticeDecision
  exercise: ExerciseDetail
  nextUp: ExerciseSummary | null
  promotion?: { newRung: number }
  agreement?: { yours: number; grader: number }
  submission?: SubmissionView
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
  finished?: boolean
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
  placement?: { rung: number; evidence: string | string[] }
  exercises: ExerciseSummary[]
}

/** POST /api/realtime/session. `finishTool` names the function the voice agent calls to end the call (defaults to `finish_interview`). */
export type RealtimeSession = { clientSecret: string; model: string; expiresAt: string; instructions: string; finishTool?: string }

/** One spoken turn for POST /api/interviews/:id/voice-transcript. */
export type VoiceTranscriptTurn = { role: "user" | "interviewer"; content: string }
