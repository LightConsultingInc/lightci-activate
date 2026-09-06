/**
 * Shapes consumed by Mission Control, Company admin and the LightCI Lead Console.
 * Mirrors docs/api-contract.md. Where the contract leaves a field loosely typed we
 * accept the plausible variants and normalise in the view (see hooks/mc/normalise.ts).
 */

export type Role = "learner" | "champion" | "sponsor" | "admin" | "lead"

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

/** Optional provenance carried on payloads. Absent → we say "no baseline" honestly. */
export type Provenance = { source?: string; baseline?: string | null; baselineIds?: string[] }

// ───────────────────────────── Mission Control ─────────────────────────────

export type DailyActive = { day: string; active: number; seats: number }
export type Trend = number | "up" | "flat" | "down" | null | undefined

export type Adoption = {
  active: {
    daily: DailyActive[]
    weekly: number | { day: string; active: number }[]
    monthly: number | { day: string; active: number }[]
    pctOfSeats: number
    trend: Trend
    seats?: number
  } & Provenance
  depth: { sessionsPerActive: number; surfaces: { name: string; users: number }[]; connectors: number; skillsActivated: number } & Provenance
  funnel: ({ step: string; count: number; medianDays: number | null } & Provenance)[]
  inactiveSeats: (PersonRef & { daysInactive: number })[]
  byTeam: ({ teamId: string; teamName: string; activePct: number; hoursBack: number; hasBaseline?: boolean; baselineHours?: number | null } & Provenance)[]
} & Provenance

export type ActivationComponents = { rung: number; hoursBack: number; skillsPublished: number; influence: number; gradeQuality: number; activeDays: number }
export type McPerson = PersonRef & {
  activationScore: { composite: number; components: ActivationComponents }
  hoursBackPerWeek: number
  /** False when no baseline+measurement pair exists; hoursBackPerWeek is then 0, not measured. */
  hasBaseline?: boolean
  baselineMinutesPerWeek?: number | null
  skillsPublished: number
  adoptedByOthers: number
  gradeQuality: number
  /** False when never graded; gradeQuality is then 0, not measured. */
  hasGrades?: boolean
  activeDays30: number
  rising: boolean
  stalled: boolean
  stalledReason: string | null
  championCandidate: boolean
}
export type McPeople = { people: McPerson[] } & Provenance

export type Journey = {
  heatmap: { teamId: string; teamName: string; counts: number[] }[]
  cohorts: { cohortWeek: string; counts: number[] }[]
  timeInRung: { rung: number; medianDays: number; p90Days: number; stuck: PersonRef[] }[]
  revisitCompliance: { teamId: string; teamName?: string; due: number; done: number }[]
} & Provenance

export type GroupRow = {
  teamId: string
  teamName: string
  size: number
  activePct: number
  rungMix: number[]
  hoursBackPerPerson: number
  skillsPublished: number
  skillsAdopted: number
  promotionThroughput: number
  reworkRate: number
  championQueueAgeDays: number
  programStartedOn?: string | null
}
export type Groups = { groups: GroupRow[] } & Provenance
/** Server-normalised per-person / per-week values (contract deviation for /mc/groups/compare). */
export type GroupNormalised = {
  activePct: number
  rungMixPct: number[]
  hoursBackPerPerson: number
  skillsPublishedPerPerson: number
  skillsAdoptedPerPerson: number
  promotionsPerPersonPerWeek: number
  skillsPublishedPerWeek: number | null
  reworkRate: number
  championQueueAgeDays: number
}
export type GroupsCompare = {
  a: GroupRow & { programWeeks?: number | null; normalised?: GroupNormalised }
  b: GroupRow & { programWeeks?: number | null; normalised?: GroupNormalised }
  /** Optional server-normalised metrics; when absent the view normalises per person. */
  metrics?: { key: string; label: string; a: number; b: number; unit?: string; higherIsBetter?: boolean }[]
  normalisedFor?: string[]
}

export type SkillHealthFlag = "unused_30d" | "grade_below_threshold" | "boundary_gap" | "owner_left" | "overlapping_trigger" | "pending_review"
export type SkillCard = {
  id: string
  slug: string
  name: string
  triggerLine: string
  plugin: string | null
  team: { id: string; name: string } | null
  owner: PersonRef | null
  status: string
  rungRequired: number
  version: number | string
  grade: { score: number; decision: string } | null
  boundaryBadge: "green" | "amber" | "red"
  activeUsers30d: number
  runs30d: number
  adoptedByMe?: boolean
  publishedAt: string | null
  updatedAt: string
  health: SkillHealthFlag[]
}
export type McSkills = {
  health: SkillCard[]
  mostUsed: SkillCard[]
  leastUsed: SkillCard[]
  byTeam: { teamId: string; teamName: string; skills?: number; activations30d: number; activeUsers30d?: number }[]
  unowned: SkillCard[]
  regradeQueue: (SkillCard & { previous?: number; current?: number; drop?: number; reason?: string })[]
} & Provenance

export type ComplianceBoundary = { allowedDataClasses: string[]; forbiddenDataClasses: string[]; readOnlySystems: string[]; humanReviewPoints: string[] }
export type Assignment = { plugin: string; team: { id: string; name: string } | string; teamId?: string; intendedMode: AssignmentMode; observedMode: AssignmentMode | null; drift: boolean }
/** API vocabulary is `auto`; `auto_installed` is kept for older payloads. */
export type AssignmentMode = "hidden" | "available" | "auto" | "auto_installed"
export type GovEvent = { at: string; type: string; actor: string | PersonRef | null; detail: string }
export type Governance = {
  policy: { text: string; version: number; updatedAt: string }
  boundary: ComplianceBoundary & { version?: number; updatedAt?: string }
  promotionLog: { at: string; skill: string | SkillCard; version: number | string; approvers: (string | PersonRef)[]; grade: number | null; decision: string }[]
  complianceTouch: SkillCard[]
  drift: Assignment[]
  events: GovEvent[]
  /** Assumed: the API tells us whether the Compliance API is wired; else we fall back to org settings. */
  complianceFeed?: { configured: boolean; events?: GovEvent[]; source?: "compliance_api" | "audit_log"; detail?: string }
  eventsSource?: "compliance_api" | "audit_log"
  exportUrl: string | null
}

export type WorkflowScore = { composite: number; readiness?: number; exposure?: number | string; hoursAtStake?: number; /** Scorer's hours/week at stake (the API field name). */ hours?: number; value?: number; frequency?: number; complexity?: number } | number | null
export type WorkflowSummary = {
  id: string
  name: string
  teamId: string | null
  teamName: string | null
  owner: PersonRef | null
  status: string
  completeness: number
  championVerified: boolean
  score: WorkflowScore
  nextWave: boolean
  linkedSkills: SkillCard[]
  baselineMinutesPerWeek: number | null
  measuredMinutesPerWeek: number | null
  hoursBackPerWeek: number | null
  hasBaseline?: boolean
  hasMeasurement?: boolean
  updatedAt: string
  exposure?: string
}
export type Backlog = {
  items: WorkflowSummary[]
  totals: { hoursAtStake: number; candidates: number; inBuild: number; shipped: number; nextWave: number }
  byTeam?: { teamId: string; teamName: string; hoursAtStake: number; candidates: number; nextWave?: number; shipped?: number }[]
  sowExport: { rows: Record<string, unknown>[] }
} & Provenance

export type CostInput = {
  seatPriceMonthly: number
  premiumSeatPriceMonthly: number
  loadedHourlyRate: number
  lightciFeesMonthly: number
  championHoursPerMonth: number
  updatedAt?: string
}
export type BaselineRef = { id: string | null; kind?: "baseline" | "measurement" | "cost_input"; detail?: string; workflow?: string; task?: string; method?: string; minutesPerWeek?: number }
export type ReturnRow = {
  teamId?: string
  teamName?: string
  skillId?: string
  skillName?: string
  name?: string
  hoursBackPerMonth: number
  valueUsd: number
  costUsd?: number
  roi?: number | null
  /** Baseline, measurement and cost-input rows the figure derives from (API field). */
  baselineRefs?: BaselineRef[]
  baselines?: BaselineRef[]
  baselineIds?: string[]
}
export type Cost = {
  inputs: CostInput
  seats: { total: number; active: number; inactive: number; costTotal: number; costInactive: number; costPerActive: number | null; byTeam: { teamId: string; teamName: string; seats: number; active: number; cost: number; costInactive?: number }[] }
  premium: { seats: number; unused: number; cost: number; costUnused?: number }
  program: { lightciFees: number; championHoursCost: number; learnerExerciseHoursCost: number; learnerExerciseMinutes?: number; total?: number }
  return: { hoursBackPerMonth: number; valueUsd: number; roi: number | null; hasCost?: boolean; hasBaseline?: boolean; perTeam: ReturnRow[]; perSkill: ReturnRow[]; baselineRefs?: BaselineRef[]; baselines?: BaselineRef[]; baselineIds?: string[]; baselineCoveragePct?: number }
  waste: { kind: string; count: number; costUsd: number }[]
} & Provenance

export type Readout = {
  id: string
  scopeType: "org" | "team" | "person"
  scopeId: string | null
  scopeName?: string | null
  title: string
  periodStart: string
  periodEnd: string
  metrics: Record<string, unknown>
  narrative: string
  footnotes: { ref: string; source: string; baseline?: string }[]
  exportedAt: string | null
  generatedAt: string
}

// ───────────────────────────── Company admin ─────────────────────────────

export type IntegrationKind = "anthropic" | "claude_compliance" | "claude_analytics" | "claude_admin" | "github"
export type IntegrationSummary = {
  kind: IntegrationKind
  configured: boolean
  source: "org" | "platform" | "none"
  last4: string | null
  status: "unverified" | "verified" | "invalid" | null
  verifiedAt: string | null
  verificationDetail: string | null
  config: Record<string, string>
}

export type OrgSettings = {
  usagePolicy?: string
  /** Bumped by PATCH /org when the policy text changes (see org-settings.ts). */
  policyVersion?: number
  policyUpdatedAt?: string | null
  /** @deprecated older payloads; prefer policyVersion */
  usagePolicyVersion?: number
  boundary?: ComplianceBoundary
  boundaryVersion?: number
  boundaryUpdatedAt?: string | null
  leaderboardsEnabled?: boolean
  stalledAfterDays?: number
  baselineMethod?: "time_diary" | "interview_estimate"
  claudeAnalyticsConfigured?: boolean
  claudeAdminConfigured?: boolean
  claudeComplianceConfigured?: boolean
  connectorVerifiedAt?: string | null
}
export type MarketplaceRepo = { provider: "github" | "local"; owner?: string; repo?: string; defaultBranch: string; autoSync: boolean; linkedAt?: string }
export type Org = {
  id: string
  name: string
  slug: string
  workosOrganizationId: string | null
  residencyMode: "client_hosted" | "lightci_hosted"
  industry: string | null
  sponsorName: string | null
  settings: OrgSettings
  marketplaceRepo: MarketplaceRepo | null
  seats: number
  premiumSeats: number
  isDemo: boolean
  createdAt: string
  updatedAt: string
}

export type Team = {
  id: string
  orgId: string
  name: string
  slug: string
  rbacGroupId: string | null
  pluginName: string | null
  championPersonId: string | null
  champion?: PersonRef | null
  inProgram: boolean
  purpose: string | null
  programStartedOn: string | null
  memberCount?: number
  /** GET /teams returns the member count as `members`. */
  members?: number
}
export type Person = {
  id: string
  orgId: string | null
  teamId: string | null
  teamName?: string | null
  email: string
  name: string
  title: string | null
  roles: Role[]
  avatarUrl: string | null
  status: "invited" | "active" | "inactive"
  rung?: number
  lastActiveAt: string | null
  premiumSeat?: boolean
}

export type SetupStep = { key: string; label: string; done: boolean; detail: string | null }
export type Setup = { steps: SetupStep[] }

export type MarketplaceStatus = { repo: string | null; branch: string; head: string | null; dirty: boolean; pluginCount: number; skillCount: number; lastSyncAt: string | null; mode: "local" | "github" }

// ───────────────────────────── LightCI lead ─────────────────────────────

export type OrgRef = { id: string; name: string; slug: string }
export type Escalation = {
  id: string
  orgId: string
  org?: OrgRef
  sourceAgent: "coach" | "builder" | "interviewer" | "promoter" | "grader" | "system"
  kind: "escalation" | "approval" | "stalled" | "access_request"
  subjectType: "person" | "exercise" | "skill" | "workflow" | "promotion_request" | "team"
  subjectId: string | null
  /** /escalations returns a person summary; /lead/queue returns `{ id, name, type, slug? }` (older builds: a plain label string). */
  subject?: string | { id: string; name: string; type?: string; slug?: string | null; href?: string } | null
  reason: string
  assigneePersonId: string | null
  assignee?: PersonRef | null
  state: "open" | "in_progress" | "resolved"
  slaDueAt: string | null
  resolution: string | null
  resolvedAt: string | null
  createdAt: string
}
export type PromotionView = {
  id: string
  org?: OrgRef
  skill: SkillCard
  version: number | string
  requestedBy: PersonRef
  prNumber: number | null
  prUrl: string | null
  branch: string
  grade: { score: number; decision: string } | null
  boundaryCheck: unknown
  diffSummary: string
  approvals: unknown[]
  requiredApproverRoles: string[]
  decision: string | null
  highExposure: boolean
  testResults: unknown
  createdAt: string
  decidedAt: string | null
  slaDueAt?: string | null
}
export type StalledItem = {
  id?: string
  org: OrgRef
  team?: { id: string; name: string } | null
  person?: PersonRef | null
  metric: string
  value: number
  threshold: number
  since?: string
  slaDueAt?: string | null
}
export type Wave = {
  id: string
  orgId: string
  name: string
  number: number
  teamIds: string[]
  startsOn: string
  endsOn: string
  targets: { skillsShipped: number; activePct: number; baselineCoveragePct: number; hoursBackPerPerson: number }
  status: "planned" | "active" | "complete"
}
export type WaveStatus = { org: OrgRef; wave: Wave; week: number; skillsShipped: number; target: number; baselineCoveragePct: number; activePct: number; status: string }
export type LeadQueue = { escalations: Escalation[]; approvals: PromotionView[]; stalled: StalledItem[]; waves: WaveStatus[] }

export type LeadClient = {
  org: OrgRef & Partial<Org>
  seats: number
  activePct: number
  rungDistribution: number[]
  skillsPublished: number
  openEscalations: number
  wave: Wave | null
}
export type LeadClientDetail = LeadClient & {
  setup?: Setup
  checklist?: Setup
  integrations?: IntegrationSummary[]
  teams?: Team[]
  sponsorName?: string | null
  industry?: string | null
}
