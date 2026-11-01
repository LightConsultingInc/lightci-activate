/**
 * Demo content for Meridian Wealth Partners, the seeded client org. Everything here is
 * keyed by stable string keys (person `key`, team `slug`, workflow `key`, skill `slug`,
 * competency `code`); SeedService resolves them to ids. Dates are expressed as days ago
 * relative to the seed anchor so "due today" stays true whenever the seed runs.
 *
 * Nothing in this file is real client data. Names, figures and documents are invented.
 */
import type { Role, Rung } from '../common/roles';
import type {
  ContextLayerKind,
  ContextSource,
} from '../context/entities/context-source.entity';
import type { InterviewTurn } from '../interviews/entities/interview-session.entity';
import type { Artifact } from '../learning/entities/submission.entity';
import type {
  Exercise,
  WorkSurface,
} from '../learning/entities/exercise.entity';
import type { Escalation } from '../ops/entities/escalation.entity';
import type {
  ComplianceBoundary,
  MarketplaceRepo,
  OrgSettings,
} from '../orgs/entities/org.entity';
import type { Person } from '../orgs/entities/person.entity';
import type { BoundaryCheck } from '../skills/entities/promotion-request.entity';
import type { AssignmentMode } from '../skills/entities/skill-assignment.entity';
import type {
  BoundaryDeclaration,
  SampleCase,
  SkillStatus,
} from '../skills/entities/skill.entity';
import type {
  WorkflowSchema,
  WorkflowStatus,
} from '../workflows/entities/workflow-map.entity';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * WorkOS org and the five sign-in users. Mirrors api/src/seed/workos-demo.json; the JSON is
 * read at runtime when present (src/ or dist/) so an updated file wins over these constants.
 */
const WORKOS_FALLBACK = {
  organizationId: 'org_01M1SKK4CFRCNC175QQRRJTAFG',
  users: {
    'priya.nair@meridianwealth.demo': 'user_01M1SKK4PRY6HQGAZ5YKXV94DQ',
    'marcus.reid@meridianwealth.demo': 'user_01M1SKK5AJ2H4QN05EB7CHMN6M',
    'daniel.okafor@meridianwealth.demo': 'user_01M1SKK5Y8C1M74S4EZS252VBD',
    'elena.marsh@meridianwealth.demo': 'user_01M1SKK6J0TJ4970VHBQDXG7Z0',
    'zain+activate-lead@lightci.com': 'user_01M1SKK7673EXSZV8MWQHWTV3Z',
  } as Record<string, string>,
};

function loadWorkosDemo(): {
  organizationId: string;
  users: Record<string, string>;
} {
  const candidates = [
    join(__dirname, 'workos-demo.json'),
    join(process.cwd(), 'src', 'seed', 'workos-demo.json'),
    join(process.cwd(), 'api', 'src', 'seed', 'workos-demo.json'),
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        const parsed = JSON.parse(readFileSync(p, 'utf8')) as {
          organizationId?: string;
          users?: Record<string, string>;
        };
        if (parsed.organizationId && parsed.users)
          return { organizationId: parsed.organizationId, users: parsed.users };
      }
    } catch {
      /* fall through to the embedded copy */
    }
  }
  return WORKOS_FALLBACK;
}
const workosDemo = loadWorkosDemo();

// ───────────────────────────────────────── types ─────────────────────────────────────────

export interface UsageProfile {
  /** Typical weekday messages at full engagement. */
  intensity: number;
  code: boolean;
  cowork: boolean;
  trend: 'flat' | 'growing' | 'drop_last_month';
  /** First day with any activity, in days ago. */
  startDaysAgo: number;
  /** Activity stops entirely after this many days ago (inactive people). */
  quietAfterDaysAgo?: number;
}

export interface DemoPerson {
  key: string;
  name: string;
  email: string;
  title: string;
  teamSlug: string | null;
  roles: Role[];
  rung: Rung;
  workosUserId?: string;
  premiumSeat?: boolean;
  cohortDaysAgo: number | null;
  lastActiveDaysAgo: number | null;
  status: Person['status'];
  profile: Person['profile'];
  /** Placement history oldest → newest. The last entry is the current rung. */
  placements: {
    rung: Rung;
    daysAgo: number;
    by: 'diagnostic' | 'promotion' | 'seed' | 'manual';
    evidence?: Record<string, unknown>;
  }[];
  usage: UsageProfile;
  /** Distinct context tags used when generating filler exercises for this person. */
  contexts: string[];
}

export interface DemoTeam {
  slug: string;
  name: string;
  pluginName: string;
  rbacGroupId: string;
  championKey: string;
  purpose: string;
  programStartedDaysAgo: number;
}

export interface DemoContextSource {
  layer: ContextLayerKind;
  ownerKey?: string; // team slug or person key depending on layer
  type: ContextSource['type'];
  title: string;
  uri?: string;
  content: string;
  reviewState: ContextSource['reviewState'];
  tags: Record<string, string>;
  ingestedDaysAgo: number;
}

export interface DemoContextLayer {
  layer: ContextLayerKind;
  ownerKey?: string;
  summary: string;
  vocabulary: { term: string; meaning: string }[];
  anchorWorkflows: string[];
  sensitivities: string[];
  systems: string[];
  version: number;
}

export interface DemoWorkflow {
  key: string;
  teamSlug: string;
  ownerKey: string;
  name: string;
  schema: Partial<WorkflowSchema>;
  completeness: number;
  championVerified: boolean;
  score: {
    value: number;
    hours: number;
    readiness: number;
    exposure: number;
    rationale: string;
  } | null;
  status: WorkflowStatus;
  nextWave: boolean;
  linkedSkillSlugs: string[];
  createdDaysAgo: number;
}

export interface DemoSkillGrade {
  /** Scores per GRADER_RUBRIC_SKILL key, 0..1. */
  scores: Record<string, number>;
  feedback: string;
  decision: 'pass' | 'revise';
  teachingMoment?: string;
  securityFindings?: { severity: 'low' | 'medium' | 'high'; finding: string }[];
}

export interface DemoSkillVersion {
  version: number;
  changelog: string;
  daysAgo: number;
  authorKey: string;
  grade?: DemoSkillGrade;
  approverKeys?: string[];
}

export interface DemoSkill {
  slug: string;
  name: string;
  triggerLine: string;
  plugin: string;
  teamSlug: string;
  ownerKey: string;
  status: SkillStatus;
  rungRequired: number;
  workflowFamily: string;
  workflowKey?: string;
  authoredBy: 'learner' | 'builder' | 'champion';
  boundary: BoundaryDeclaration;
  sampleCases: SampleCase[];
  skillMd: string;
  createdDaysAgo: number;
  publishedDaysAgo?: number;
  successorSlug?: string;
  versions: DemoSkillVersion[];
  /** Adoption curve: mean activations per adopter per weekday once ramped. */
  usageRate?: number;
}

export interface DemoGrade {
  /** criterion key → score 0..1; criteria come from the exercise's first competency rubric unless `rubricCodes` given. */
  scores: Record<string, number>;
  feedback: string;
  decision: 'pass' | 'revise';
  critiqueQuality: number;
  teachingMoment?: string;
  gradedByKey?: string;
  daysAgo: number;
}

export interface DemoSubmission {
  attempt: number;
  expectationText: string;
  expectationConfidence: number;
  artifact: Artifact;
  critiqueText: string | null;
  coldAttempt: boolean;
  daysAgo: number;
  grade?: DemoGrade;
}

export interface DemoExercise {
  key: string;
  personKey: string;
  rung: Rung;
  competencyCodes: string[];
  title: string;
  brief: string;
  rationale: string;
  kind: Exercise['kind'];
  mode: Exercise['mode'];
  workSurface: WorkSurface;
  contextTag: string;
  workflowKey?: string;
  skillSlug?: string;
  hints: string[];
  workedExample?: string;
  starter?: Record<string, unknown>;
  status: Exercise['status'];
  estimatedMinutes: number;
  scheduledDaysAgo?: number;
  completedDaysAgo?: number;
  generatedBy: Exercise['generatedBy'];
  hintsRevealed?: number;
  createdDaysAgo: number;
  submissions: DemoSubmission[];
}

export interface DemoRevisit {
  personKey: string;
  competencyCode: string;
  prompt: string;
  answerKey: string;
  intervalStep: number;
  dueDaysAgo: number; // negative = in the future
  doneDaysAgo?: number;
  score?: number;
  response?: string;
  feedback?: string;
}

export interface DemoCoachNote {
  personKey: string;
  note: string;
  tags: (
    | 'blocked'
    | 'no_time'
    | 'tool_issue'
    | 'progress'
    | 'escalated'
    | 'calibration'
  )[];
  author?: string;
  daysAgo: number;
}

export interface DemoBaseline {
  personKey: string;
  workflowKey?: string;
  task: string;
  method: 'time_diary' | 'interview_estimate';
  minutesPerWeek: number;
  reworkMinutesPerWeek: number;
  approvedByKey?: string;
  capturedDaysAgo: number;
  /** Three monthly measurement periods, oldest first. */
  measurements: {
    minutesPerWeek: number;
    reworkMinutesPerWeek: number;
    source: 'self' | 'auditor';
  }[];
}

export interface DemoEscalation {
  sourceAgent: Escalation['sourceAgent'];
  kind: Escalation['kind'];
  subjectType: Escalation['subjectType'];
  subjectRef?: {
    kind: 'person' | 'skill' | 'workflow' | 'promotion' | 'exercise' | 'team';
    key: string;
  };
  reason: string;
  assigneeKey?: string;
  state: Escalation['state'];
  slaDueDaysAgo?: number;
  resolution?: string;
  resolvedDaysAgo?: number;
  createdDaysAgo: number;
}

export interface DemoPromotion {
  key: string;
  skillSlug: string;
  version: number;
  requestedByKey: string;
  prNumber: number;
  boundaryCheck: BoundaryCheck;
  diffSummary: {
    filesChanged: number;
    additions: number;
    deletions: number;
    summary: string;
  };
  approvals: {
    personKey: string;
    role: string;
    decision: 'approve' | 'send_back';
    note?: string;
    daysAgo: number;
  }[];
  requiredApproverRoles: string[];
  decision: 'pending' | 'approved' | 'sent_back' | 'merged' | 'withdrawn';
  decidedDaysAgo?: number;
  testResults: string;
  highExposure: boolean;
  createdDaysAgo: number;
}

export interface DemoInterview {
  personKey: string;
  mode: 'intake' | 'champion' | 'workflow';
  teamSlug?: string;
  workflowKey?: string;
  transcript: Omit<InterviewTurn, 'at'>[];
  scribe: Record<string, unknown>;
  checkerFlags: { field: string; issue: string }[];
  completeness: number;
  status: 'active' | 'complete' | 'abandoned';
  voice: boolean;
  result?: {
    workflowKeys?: string[];
    placementRung?: number;
    profile?: Record<string, unknown>;
  };
  createdDaysAgo: number;
  completedDaysAgo?: number;
}

export interface DemoAgentRun {
  agent: string;
  task: string;
  personKey?: string;
  input: Record<string, unknown>;
  output: unknown;
  daysAgo: number;
  model?: 'claude-opus-5' | 'claude-sonnet-5';
}

// ───────────────────────────────────────── org ─────────────────────────────────────────

const WORKOS = workosDemo;

export const DEMO_BOUNDARY: ComplianceBoundary = {
  allowedDataClasses: [
    'aggregated_client_summaries',
    'internal_templates',
    'public_regulation',
    'calendar',
    'crm_summary_export',
  ],
  forbiddenDataClasses: [
    'client_pii_documents',
    'account_numbers',
    'ssn',
    'statements_raw',
  ],
  readOnlySystems: ['Salesforce', 'Orion', 'eMoney'],
  humanReviewPoints: [
    'before_send',
    'before_crm_entry',
    'before_client_meeting',
  ],
};

export const DEMO_ORG_SETTINGS: OrgSettings = {
  usagePolicy:
    'Claude Enterprise is approved at Meridian for drafting, summarising and structuring work that starts from internal templates, aggregated client summaries, CRM summary exports, calendars and public regulatory material. It is not approved for client identity documents, account numbers, Social Security numbers or raw custodial statements, none of which may be pasted, uploaded or connected. Salesforce, Orion and eMoney are read-only sources for Claude: nothing Claude produces is entered into a system of record until a named person has reviewed it. Every client-facing output (letters, emails, meeting materials) is reviewed by its sender before it leaves the firm, and Claude drafting does not change who is accountable for the content. Skills are published only through the Activate promotion queue with a compliance boundary declared; peer sharing outside the queue stays off. Questions go to the Client Service Ops champion or to Compliance.',
  boundary: DEMO_BOUNDARY,
  leaderboardsEnabled: false,
  stalledAfterDays: 10,
  baselineMethod: 'interview_estimate',
  claudeAnalyticsConfigured: false,
  claudeAdminConfigured: false,
  claudeComplianceConfigured: false,
  connectorVerifiedAt: null,
};

export const DEMO_MARKETPLACE: MarketplaceRepo = {
  provider: 'local',
  defaultBranch: 'main',
  autoSync: true,
};

export const DEMO_ORG = {
  name: 'Meridian Wealth Partners',
  slug: 'meridian',
  workosOrganizationId: WORKOS.organizationId,
  emailDomains: ['meridianwealth.demo'],
  residencyMode: 'lightci_hosted' as const,
  industry: 'Wealth management (PE-backed)',
  sponsorName: 'Elena Marsh, COO',
  seats: 48,
  premiumSeats: 6,
  isDemo: true,
  settings: DEMO_ORG_SETTINGS,
  marketplaceRepo: DEMO_MARKETPLACE,
};

export const DEMO_COST = {
  seatPriceMonthly: 60,
  premiumSeatPriceMonthly: 200,
  loadedHourlyRate: 145,
  lightciFeesMonthly: 25000,
  championHoursPerMonth: 24,
};

// ───────────────────────────────────────── teams ─────────────────────────────────────────

export const DEMO_TEAMS: DemoTeam[] = [
  {
    slug: 'fp',
    name: 'Financial Planning',
    pluginName: 'fp-meeting-prep',
    rbacGroupId: 'grp_fp_planning',
    championKey: 'daniel',
    purpose:
      'Builds and maintains financial plans for advisory clients: annual reviews, cash-flow and retirement projections, RMD and tax-aware distribution planning, and the meeting materials advisors present.',
    programStartedDaysAgo: 63,
  },
  {
    slug: 'wa',
    name: 'Wealth Advisors',
    pluginName: 'wa-client-comms',
    rbacGroupId: 'grp_wealth_advisors',
    championKey: 'sofia',
    purpose:
      'Owns client relationships: discovery and proposals for prospects, review meetings, follow-up communications, IPS refreshes and fee conversations.',
    programStartedDaysAgo: 63,
  },
  {
    slug: 'cso',
    name: 'Client Service Ops',
    pluginName: 'cso-operations',
    rbacGroupId: 'grp_client_service_ops',
    championKey: 'tom',
    purpose:
      'Runs onboarding, account maintenance, CRM hygiene, compliance attestations and the operational exceptions (rebalancing, transfers, distributions) that advisors depend on.',
    programStartedDaysAgo: 14,
  },
];

// ───────────────────────────────────────── people ─────────────────────────────────────────

const wos = (email: string) => WORKOS.users[email];

export const DEMO_PEOPLE: DemoPerson[] = [
  // ── WorkOS sign-in users ──
  {
    key: 'priya',
    name: 'Priya Nair',
    email: 'priya.nair@meridianwealth.demo',
    workosUserId: wos('priya.nair@meridianwealth.demo'),
    title: 'Senior Financial Planner',
    teamSlug: 'fp',
    roles: ['learner'],
    rung: 2,
    cohortDaysAgo: 63,
    lastActiveDaysAgo: 0,
    status: 'active',
    profile: {
      responsibilities: [
        'Monday client meeting prep for three advisors',
        'Annual review decks for ~40 households',
        'RMD letters each November and ad hoc',
        'CD memos when a plan changes materially',
      ],
      weeklyWorkflows: [
        'Monday client meeting prep',
        'Annual review deck assembly',
        'RMD letter drafting',
        'CD memo drafting',
      ],
      claudeUseToday:
        'Used chat for rewording client emails and summarising long eMoney reports. Had one Project she abandoned because she was not sure what to put in it.',
      selfRatedComfort: 3,
      systems: ['eMoney', 'Salesforce', 'Orion', 'Outlook'],
    },
    placements: [
      {
        rung: 1,
        daysAgo: 62,
        by: 'diagnostic',
        evidence: {
          tasks: ['meeting-agenda-from-crm-summary', 'boundary-sort'],
          graderScore: 0.71,
        },
      },
      {
        rung: 2,
        daysAgo: 30,
        by: 'promotion',
        evidence: {
          competencies: {
            'L1.delegation': 0.84,
            'L1.description': 0.86,
            'L1.discernment': 0.81,
            'L1.diligence': 0.88,
          },
          contexts: 4,
        },
      },
    ],
    usage: {
      intensity: 9,
      code: false,
      cowork: false,
      trend: 'growing',
      startDaysAgo: 63,
    },
    contexts: ['meeting-prep', 'rmd-letters', 'annual-review', 'cd-memo'],
  },
  {
    key: 'marcus',
    name: 'Marcus Reid',
    email: 'marcus.reid@meridianwealth.demo',
    workosUserId: wos('marcus.reid@meridianwealth.demo'),
    title: 'Wealth Advisor',
    teamSlug: 'wa',
    roles: ['learner'],
    rung: 1,
    cohortDaysAgo: 14,
    lastActiveDaysAgo: 1,
    status: 'active',
    profile: {
      responsibilities: [
        'Book of ~70 households',
        'Quarterly review meetings',
        'Prospect discovery and proposals',
        'Follow-up correspondence and CRM notes',
      ],
      weeklyWorkflows: [
        'Client follow-up emails',
        'Discovery-call summaries',
        'Quarterly review talking points',
        'Fee-change client comms',
      ],
      claudeUseToday:
        'Occasional. Pastes a rough email and asks Claude to make it sound better; rarely gives it any context about the client or the purpose.',
      selfRatedComfort: 2,
      systems: ['Salesforce', 'Orion', 'Outlook', 'Zoom'],
    },
    placements: [
      {
        rung: 1,
        daysAgo: 13,
        by: 'diagnostic',
        evidence: {
          tasks: ['follow-up-email-rewrite', 'boundary-sort'],
          graderScore: 0.66,
          note: 'Comfortable in chat; sends drafts without checking figures.',
        },
      },
    ],
    usage: {
      intensity: 5,
      code: false,
      cowork: false,
      trend: 'growing',
      startDaysAgo: 14,
    },
    contexts: ['follow-up', 'discovery', 'quarterly-review', 'fee-change'],
  },
  {
    key: 'daniel',
    name: 'Daniel Okafor',
    email: 'daniel.okafor@meridianwealth.demo',
    workosUserId: wos('daniel.okafor@meridianwealth.demo'),
    title: 'Director of Planning',
    teamSlug: 'fp',
    roles: ['champion', 'learner'],
    rung: 5,
    premiumSeat: true,
    cohortDaysAgo: 63,
    lastActiveDaysAgo: 0,
    status: 'active',
    profile: {
      responsibilities: [
        'Leads the six-person planning team',
        'Reviews every plan before it goes to an advisor',
        'Owns the planning templates and the CD memo standard',
        'Champion for Financial Planning in the Activate program',
      ],
      weeklyWorkflows: [
        'Plan review',
        'Monday client meeting prep (oversight)',
        'Template maintenance',
        'Review queue and promotion approvals',
      ],
      claudeUseToday:
        'Daily. Uses Projects for plan review checklists and Claude Code for a small set of eMoney export cleanups.',
      selfRatedComfort: 5,
      systems: ['eMoney', 'Salesforce', 'Orion', 'Confluence', 'GitHub'],
    },
    placements: [
      {
        rung: 3,
        daysAgo: 62,
        by: 'diagnostic',
        evidence: {
          tasks: ['skill-first-draft', 'project-review'],
          graderScore: 0.89,
        },
      },
      {
        rung: 4,
        daysAgo: 45,
        by: 'promotion',
        evidence: {
          workflow: 'monday-meeting-prep',
          promotionRequest: 'advisor-meeting-prep@v2',
          baselineApproved: true,
        },
      },
      {
        rung: 5,
        daysAgo: 24,
        by: 'promotion',
        evidence: {
          graderAgreement: 0.91,
          reviewsCompleted: 7,
          judgement: 0.82,
        },
      },
    ],
    usage: {
      intensity: 14,
      code: true,
      cowork: true,
      trend: 'flat',
      startDaysAgo: 63,
    },
    contexts: ['plan-review', 'meeting-prep', 'templates', 'review-queue'],
  },
  {
    key: 'elena',
    name: 'Elena Marsh',
    email: 'elena.marsh@meridianwealth.demo',
    workosUserId: wos('elena.marsh@meridianwealth.demo'),
    title: 'COO',
    teamSlug: null,
    roles: ['sponsor', 'admin'],
    rung: 0,
    cohortDaysAgo: 63,
    lastActiveDaysAgo: 2,
    status: 'active',
    profile: {
      responsibilities: [
        'Program sponsor for Activate',
        'Operations, compliance liaison and technology at Meridian',
        'Reports program results to the PE operating partner',
      ],
      weeklyWorkflows: [
        'Board and operating-partner reporting',
        'Compliance attestation review',
      ],
      claudeUseToday:
        'Light. Summaries of long documents and first drafts of board memos.',
      selfRatedComfort: 3,
      systems: ['Salesforce', 'Confluence'],
    },
    placements: [
      {
        rung: 0,
        daysAgo: 63,
        by: 'seed',
        evidence: { note: 'Sponsor; orientation only.' },
      },
    ],
    usage: {
      intensity: 3,
      code: false,
      cowork: false,
      trend: 'flat',
      startDaysAgo: 63,
    },
    contexts: ['reporting'],
  },
  {
    key: 'zain',
    name: 'Zain Lakhani',
    email: 'zain+activate-lead@lightci.com',
    workosUserId: wos('zain+activate-lead@lightci.com'),
    title: 'Activation Lead, LightCI',
    teamSlug: null,
    roles: ['lead'],
    rung: 5,
    cohortDaysAgo: null,
    lastActiveDaysAgo: 0,
    status: 'active',
    profile: {
      responsibilities: [
        'Supervises the exception queue across client engagements',
        'Approves high-exposure promotions where the champion is not yet trusted',
      ],
      weeklyWorkflows: [],
      claudeUseToday: 'Constant.',
      selfRatedComfort: 5,
      systems: [],
    },
    placements: [
      {
        rung: 5,
        daysAgo: 90,
        by: 'manual',
        evidence: { note: 'LightCI activation lead.' },
      },
    ],
    usage: {
      intensity: 0,
      code: false,
      cowork: false,
      trend: 'flat',
      startDaysAgo: 0,
    },
    contexts: [],
  },

  // ── Financial Planning ──
  {
    key: 'hannah',
    name: 'Hannah Whitfield',
    email: 'hannah.whitfield@meridianwealth.demo',
    title: 'Financial Planner',
    teamSlug: 'fp',
    roles: ['learner'],
    rung: 3,
    premiumSeat: true,
    cohortDaysAgo: 63,
    lastActiveDaysAgo: 0,
    status: 'active',
    profile: {
      responsibilities: [
        'Annual review decks for two advisors',
        'RMD letter batch each autumn',
        'Cash-flow projections',
      ],
      weeklyWorkflows: [
        'Annual review deck assembly',
        'RMD letter drafting',
        'Cash-flow projection write-ups',
      ],
      claudeUseToday:
        'Heavy. Built a Project for deck narratives in week two and has been asking to share it.',
      selfRatedComfort: 4,
      systems: ['eMoney', 'Salesforce', 'PowerPoint'],
    },
    placements: [
      {
        rung: 1,
        daysAgo: 61,
        by: 'diagnostic',
        evidence: { graderScore: 0.74 },
      },
      {
        rung: 2,
        daysAgo: 41,
        by: 'promotion',
        evidence: { contexts: 3, mastery: 0.85 },
      },
      {
        rung: 3,
        daysAgo: 22,
        by: 'promotion',
        evidence: {
          skill: 'annual-review-deck-outline',
          gradeScore: 0.87,
          coldAttempt: true,
        },
      },
    ],
    usage: {
      intensity: 12,
      code: true,
      cowork: false,
      trend: 'growing',
      startDaysAgo: 63,
    },
    contexts: ['annual-review', 'rmd-letters', 'cash-flow', 'deck-narrative'],
  },
  {
    key: 'rajesh',
    name: 'Rajesh Menon',
    email: 'rajesh.menon@meridianwealth.demo',
    title: 'Associate Planner',
    teamSlug: 'fp',
    roles: ['learner'],
    rung: 1,
    cohortDaysAgo: 56,
    lastActiveDaysAgo: 12,
    status: 'active',
    profile: {
      responsibilities: [
        'Data gathering for plans',
        'First-draft cash-flow tables',
        'Meeting note write-ups',
      ],
      weeklyWorkflows: ['Meeting note write-ups', 'Cash-flow table drafting'],
      claudeUseToday:
        'Tried it twice in week one. Says the plan season leaves no time.',
      selfRatedComfort: 2,
      systems: ['eMoney', 'Excel'],
    },
    placements: [
      {
        rung: 1,
        daysAgo: 55,
        by: 'diagnostic',
        evidence: { graderScore: 0.68 },
      },
    ],
    usage: {
      intensity: 3,
      code: false,
      cowork: false,
      trend: 'drop_last_month',
      startDaysAgo: 56,
    },
    contexts: ['meeting-notes', 'cash-flow'],
  },
  {
    key: 'grace',
    name: 'Grace Lindqvist',
    email: 'grace.lindqvist@meridianwealth.demo',
    title: 'Paraplanner',
    teamSlug: 'fp',
    roles: ['learner'],
    rung: 2,
    cohortDaysAgo: 49,
    lastActiveDaysAgo: 1,
    status: 'active',
    profile: {
      responsibilities: [
        'CD memo drafting',
        'Plan QA before director review',
        'eMoney data entry',
      ],
      weeklyWorkflows: ['CD memo drafting', 'Plan QA checklist'],
      claudeUseToday:
        'Weekly. Uses a Project with the CD memo template for first drafts.',
      selfRatedComfort: 3,
      systems: ['eMoney', 'Salesforce', 'Word'],
    },
    placements: [
      {
        rung: 1,
        daysAgo: 48,
        by: 'diagnostic',
        evidence: { graderScore: 0.7 },
      },
      {
        rung: 2,
        daysAgo: 20,
        by: 'promotion',
        evidence: { contexts: 3, mastery: 0.82 },
      },
    ],
    usage: {
      intensity: 7,
      code: false,
      cowork: false,
      trend: 'growing',
      startDaysAgo: 49,
    },
    contexts: ['cd-memo', 'plan-qa', 'data-entry'],
  },
  {
    key: 'owen',
    name: 'Owen Castellano',
    email: 'owen.castellano@meridianwealth.demo',
    title: 'Financial Planner',
    teamSlug: 'fp',
    roles: ['learner'],
    rung: 0,
    cohortDaysAgo: 63,
    lastActiveDaysAgo: 49,
    status: 'inactive',
    profile: {
      responsibilities: ['Retirement income plans'],
      weeklyWorkflows: ['Retirement income projections'],
      claudeUseToday: 'None.',
      selfRatedComfort: 1,
      systems: ['eMoney'],
    },
    placements: [
      {
        rung: 0,
        daysAgo: 63,
        by: 'seed',
        evidence: { note: 'Attended orientation; on leave from week 3.' },
      },
    ],
    usage: {
      intensity: 3,
      code: false,
      cowork: false,
      trend: 'flat',
      startDaysAgo: 63,
      quietAfterDaysAgo: 49,
    },
    contexts: ['retirement-income'],
  },

  // ── Wealth Advisors ──
  {
    key: 'sofia',
    name: 'Sofia Alvarez',
    email: 'sofia.alvarez@meridianwealth.demo',
    title: 'Senior Wealth Advisor',
    teamSlug: 'wa',
    roles: ['champion', 'learner'],
    rung: 4,
    premiumSeat: true,
    cohortDaysAgo: 63,
    lastActiveDaysAgo: 0,
    status: 'active',
    profile: {
      responsibilities: [
        'Book of ~110 households',
        'Leads prospect proposals for the advisor team',
        'Champion for Wealth Advisors',
      ],
      weeklyWorkflows: [
        'Proposal assembly',
        'Client follow-up emails',
        'IPS refresh',
      ],
      claudeUseToday:
        'Daily. Authored the follow-up summary skill the whole team now uses.',
      selfRatedComfort: 5,
      systems: ['Salesforce', 'Orion', 'eMoney', 'Outlook'],
    },
    placements: [
      {
        rung: 2,
        daysAgo: 62,
        by: 'diagnostic',
        evidence: { graderScore: 0.83 },
      },
      {
        rung: 3,
        daysAgo: 44,
        by: 'promotion',
        evidence: { skill: 'client-followup-notes', gradeScore: 0.88 },
      },
      {
        rung: 4,
        daysAgo: 25,
        by: 'promotion',
        evidence: {
          workflow: 'client-followup',
          baseline: true,
          promotion: 'client-followup-notes@v3',
        },
      },
    ],
    usage: {
      intensity: 13,
      code: false,
      cowork: true,
      trend: 'flat',
      startDaysAgo: 63,
    },
    contexts: ['proposal', 'follow-up', 'ips', 'review-queue'],
  },
  {
    key: 'nathan',
    name: 'Nathan Brooks',
    email: 'nathan.brooks@meridianwealth.demo',
    title: 'Wealth Advisor',
    teamSlug: 'wa',
    roles: ['learner'],
    rung: 2,
    cohortDaysAgo: 56,
    lastActiveDaysAgo: 1,
    status: 'active',
    profile: {
      responsibilities: ['Book of ~80 households', 'Quarterly reviews'],
      weeklyWorkflows: [
        'Client follow-up emails',
        'Quarterly review talking points',
      ],
      claudeUseToday:
        'Adopted the follow-up skill in week 3; runs it after most meetings.',
      selfRatedComfort: 3,
      systems: ['Salesforce', 'Orion', 'Outlook'],
    },
    placements: [
      {
        rung: 1,
        daysAgo: 55,
        by: 'diagnostic',
        evidence: { graderScore: 0.72 },
      },
      {
        rung: 2,
        daysAgo: 26,
        by: 'promotion',
        evidence: { contexts: 3, mastery: 0.81 },
      },
    ],
    usage: {
      intensity: 8,
      code: false,
      cowork: false,
      trend: 'growing',
      startDaysAgo: 56,
    },
    contexts: ['follow-up', 'quarterly-review', 'prospect'],
  },
  {
    key: 'isabelle',
    name: 'Isabelle Fontaine',
    email: 'isabelle.fontaine@meridianwealth.demo',
    title: 'Associate Advisor',
    teamSlug: 'wa',
    roles: ['learner'],
    rung: 1,
    cohortDaysAgo: 42,
    lastActiveDaysAgo: 2,
    status: 'active',
    profile: {
      responsibilities: [
        'Supports two senior advisors',
        'Discovery-call notes and proposal inputs',
      ],
      weeklyWorkflows: ['Discovery-call summaries', 'Proposal inputs'],
      claudeUseToday: 'Chat for summarising call recordings.',
      selfRatedComfort: 3,
      systems: ['Salesforce', 'Zoom'],
    },
    placements: [
      {
        rung: 1,
        daysAgo: 41,
        by: 'diagnostic',
        evidence: { graderScore: 0.69 },
      },
    ],
    usage: {
      intensity: 6,
      code: false,
      cowork: false,
      trend: 'growing',
      startDaysAgo: 42,
    },
    contexts: ['discovery', 'proposal', 'meeting-notes'],
  },
  {
    key: 'kevin',
    name: 'Kevin Osei',
    email: 'kevin.osei@meridianwealth.demo',
    title: 'Wealth Advisor',
    teamSlug: 'wa',
    roles: ['learner'],
    rung: 3,
    cohortDaysAgo: 63,
    lastActiveDaysAgo: 0,
    status: 'active',
    profile: {
      responsibilities: [
        'Book of ~90 households',
        'Leads the fee schedule migration comms',
      ],
      weeklyWorkflows: [
        'Fee-change client comms',
        'IPS refresh',
        'Client follow-up emails',
      ],
      claudeUseToday:
        'Daily; drafted the fee-change skill during the migration.',
      selfRatedComfort: 4,
      systems: ['Salesforce', 'Orion', 'Outlook'],
    },
    placements: [
      {
        rung: 1,
        daysAgo: 62,
        by: 'diagnostic',
        evidence: { graderScore: 0.77 },
      },
      {
        rung: 2,
        daysAgo: 38,
        by: 'promotion',
        evidence: { contexts: 3, mastery: 0.83 },
      },
      {
        rung: 3,
        daysAgo: 12,
        by: 'promotion',
        evidence: { skill: 'fee-change-comms', gradeScore: 0.86 },
      },
    ],
    usage: {
      intensity: 10,
      code: false,
      cowork: false,
      trend: 'flat',
      startDaysAgo: 63,
    },
    contexts: ['fee-change', 'ips', 'follow-up', 'quarterly-review'],
  },
  {
    key: 'laura',
    name: 'Laura Chen',
    email: 'laura.chen@meridianwealth.demo',
    title: 'Client Associate',
    teamSlug: 'wa',
    roles: ['learner'],
    rung: 0,
    cohortDaysAgo: 35,
    lastActiveDaysAgo: 9,
    status: 'active',
    profile: {
      responsibilities: [
        'Scheduling and meeting logistics for four advisors',
        'Client paperwork follow-through',
      ],
      weeklyWorkflows: [
        'Meeting scheduling emails',
        'Paperwork status chasers',
      ],
      claudeUseToday:
        'Was using it daily for scheduling emails; tapered off after a template change broke her prompt.',
      selfRatedComfort: 2,
      systems: ['Outlook', 'Salesforce', 'DocuSign'],
    },
    placements: [
      {
        rung: 0,
        daysAgo: 35,
        by: 'diagnostic',
        evidence: {
          graderScore: 0.58,
          note: 'Chat-only; no boundary awareness yet.',
        },
      },
    ],
    usage: {
      intensity: 7,
      code: false,
      cowork: false,
      trend: 'drop_last_month',
      startDaysAgo: 35,
    },
    contexts: ['scheduling', 'paperwork'],
  },

  // ── Client Service Ops ──
  {
    key: 'tom',
    name: 'Tom Becker',
    email: 'tom.becker@meridianwealth.demo',
    title: 'Head of Client Service',
    teamSlug: 'cso',
    roles: ['champion', 'learner'],
    rung: 4,
    premiumSeat: true,
    cohortDaysAgo: 14,
    lastActiveDaysAgo: 0,
    status: 'active',
    profile: {
      responsibilities: [
        'Leads onboarding, account maintenance and CRM hygiene',
        'Compliance attestations liaison',
        'Champion for Client Service Ops',
      ],
      weeklyWorkflows: [
        'Onboarding packet QA',
        'Compliance attestation summaries',
        'Exception review',
      ],
      claudeUseToday: 'Daily including Cowork for document QA.',
      selfRatedComfort: 4,
      systems: ['Salesforce', 'Orion', 'DocuSign', 'SharePoint'],
    },
    placements: [
      {
        rung: 4,
        daysAgo: 13,
        by: 'diagnostic',
        evidence: {
          graderScore: 0.86,
          note: 'Prior experience at previous firm; mapped onboarding QA in intake.',
        },
      },
    ],
    usage: {
      intensity: 11,
      code: false,
      cowork: true,
      trend: 'growing',
      startDaysAgo: 14,
    },
    contexts: ['onboarding', 'attestation', 'exceptions', 'review-queue'],
  },
  {
    key: 'amara',
    name: 'Amara Diallo',
    email: 'amara.diallo@meridianwealth.demo',
    title: 'Client Service Manager',
    teamSlug: 'cso',
    roles: ['learner'],
    rung: 3,
    cohortDaysAgo: 14,
    lastActiveDaysAgo: 0,
    status: 'active',
    profile: {
      responsibilities: ['CRM data quality', 'Service request triage'],
      weeklyWorkflows: ['CRM note cleanup', 'Service request triage'],
      claudeUseToday:
        'Daily. Wrote the exception-memo skill with Jonas in her first week from an existing Project.',
      selfRatedComfort: 4,
      systems: ['Salesforce', 'Outlook'],
    },
    placements: [
      {
        rung: 3,
        daysAgo: 13,
        by: 'diagnostic',
        evidence: {
          graderScore: 0.85,
          note: 'Arrived with a working Project; first skill draft passed.',
        },
      },
    ],
    usage: {
      intensity: 9,
      code: false,
      cowork: false,
      trend: 'growing',
      startDaysAgo: 14,
    },
    contexts: ['crm-cleanup', 'triage', 'service-requests'],
  },
  {
    key: 'jonas',
    name: 'Jonas Petersen',
    email: 'jonas.petersen@meridianwealth.demo',
    title: 'Operations Analyst',
    teamSlug: 'cso',
    roles: ['learner'],
    rung: 2,
    premiumSeat: true,
    cohortDaysAgo: 14,
    lastActiveDaysAgo: 0,
    status: 'active',
    profile: {
      responsibilities: [
        'Rebalancing exception review',
        'Orion data exports and reconciliations',
      ],
      weeklyWorkflows: [
        'Rebalancing exception memos',
        'Reconciliation summaries',
      ],
      claudeUseToday: 'Claude Code for Orion export cleanups; chat for memos.',
      selfRatedComfort: 4,
      systems: ['Orion', 'Excel', 'Salesforce'],
    },
    placements: [
      {
        rung: 2,
        daysAgo: 13,
        by: 'diagnostic',
        evidence: { graderScore: 0.8 },
      },
    ],
    usage: {
      intensity: 8,
      code: true,
      cowork: false,
      trend: 'growing',
      startDaysAgo: 14,
    },
    contexts: ['rebalancing', 'reconciliation', 'exports'],
  },
  {
    key: 'megan',
    name: 'Megan Tully',
    email: 'megan.tully@meridianwealth.demo',
    title: 'Client Service Associate',
    teamSlug: 'cso',
    roles: ['learner'],
    rung: 1,
    cohortDaysAgo: 14,
    lastActiveDaysAgo: 1,
    status: 'active',
    profile: {
      responsibilities: [
        'Onboarding packet assembly',
        'Client paperwork chasers',
      ],
      weeklyWorkflows: [
        'Onboarding packet assembly',
        'Paperwork status emails',
      ],
      claudeUseToday:
        'New to it. Wants the meeting-prep skill the planners have.',
      selfRatedComfort: 2,
      systems: ['Salesforce', 'DocuSign'],
    },
    placements: [
      {
        rung: 1,
        daysAgo: 12,
        by: 'diagnostic',
        evidence: { graderScore: 0.7 },
      },
    ],
    usage: {
      intensity: 5,
      code: false,
      cowork: false,
      trend: 'growing',
      startDaysAgo: 14,
    },
    contexts: ['onboarding', 'paperwork'],
  },
  {
    key: 'victor',
    name: 'Victor Alonso',
    email: 'victor.alonso@meridianwealth.demo',
    title: 'Onboarding Specialist',
    teamSlug: 'cso',
    roles: ['learner'],
    rung: 2,
    cohortDaysAgo: 14,
    lastActiveDaysAgo: 8,
    status: 'inactive',
    profile: {
      responsibilities: ['New-account onboarding'],
      weeklyWorkflows: ['Onboarding packet assembly'],
      claudeUseToday:
        'Was active in week one; left the firm on day 8 of the wave.',
      selfRatedComfort: 3,
      systems: ['Salesforce', 'DocuSign'],
    },
    placements: [
      {
        rung: 2,
        daysAgo: 13,
        by: 'diagnostic',
        evidence: { graderScore: 0.79 },
      },
    ],
    usage: {
      intensity: 7,
      code: false,
      cowork: false,
      trend: 'flat',
      startDaysAgo: 14,
      quietAfterDaysAgo: 8,
    },
    contexts: ['onboarding'],
  },
];

export const WORKOS_PERSON_KEYS = [
  'priya',
  'marcus',
  'daniel',
  'elena',
  'zain',
] as const;

// ───────────────────────────────────────── context ─────────────────────────────────────────

export const DEMO_CONTEXT_SOURCES: DemoContextSource[] = [
  {
    layer: 'company',
    type: 'transcript',
    title:
      'Scoping call with Elena Marsh and PE operating partner (Granola excerpt)',
    uri: 'granola://meridian/scoping-2026-06-24',
    reviewState: 'reviewed',
    tags: {
      source: 'granola',
      meeting: 'scoping',
      attendees: 'Elena Marsh; Sam Whitlock (Halcyon Partners); LightCI',
    },
    ingestedDaysAgo: 70,
    content: `ELENA: The honest picture is that everyone has a Claude seat and about a third of people use it for anything real. The planners use it the most because their work is document-heavy. The advisors use it to fix emails. Ops barely touches it because they are scared of putting something in they shouldn't.

SAM: From the fund's side the question is simple. We paid for 48 seats. What are we getting back in hours, and can I see it without someone building a slide?

LIGHTCI: The number we report is hours back net of rework, against a baseline we capture before anything ships. If a planner spent three hours on Monday meeting prep before and ninety minutes after, but forty of those minutes are fixing what Claude got wrong, the number is fifty minutes, not ninety.

ELENA: The compliance boundary matters more than the speed. Nothing client-identifying goes in. No account numbers, no statements. Salesforce, Orion and eMoney are read-only as far as Claude is concerned, and a person reviews anything that goes to a client.

LIGHTCI: That becomes a declaration every skill has to fill before it can be published. Who approves?

ELENA: The team champion, and Compliance when a skill touches anything on the restricted list. I want that in the audit log, not in email.

SAM: Two waves. Planning and Advisors first because that's where the hours are. Ops second. If wave two costs what wave one costs, we stop.`,
  },
  {
    layer: 'company',
    type: 'proposal',
    title: 'LightCI Activate proposal: Meridian Wealth Partners (excerpt)',
    uri: 'drive://lightci/proposals/meridian-activate-v3.pdf',
    reviewState: 'reviewed',
    tags: { source: 'drive', version: 'v3', signed: '2026-07-01' },
    ingestedDaysAgo: 68,
    content: `Scope. Two waves over roughly twelve weeks. Wave 1 (six weeks): Financial Planning and Wealth Advisors, 12 seats, one champion per team. Wave 2 (six weeks): Client Service Ops joins, all three teams active, champions take the review queue with LightCI supervising by exception.

Outcomes we commit to measure. (1) Weekly active on real work, by Anthropic's own definition, at or above 60% of program seats by the end of Wave 1. (2) At least four skills promoted through the governed queue in Wave 1, each with a boundary declaration, a grade and a named approver. (3) Baselines captured for every workflow a learner names in intake, before any skill ships against it. (4) Hours back per person per week, net of rework, reported against those baselines with source and method on every figure.

What we will not do. We will not report a productivity number without a baseline. We will not publish a skill outside the promotion queue. We will not hold client records: Activate sees workflow descriptions, artifacts learners submit, and usage metadata from the Analytics API, never chats or client documents.

Commercials. Pilot fee $25,000 per month for the program period, inclusive of the activation lead and the Activate platform. Champion time is estimated at 24 hours per month per champion and is the client's contribution.`,
  },
  {
    layer: 'company',
    type: 'org_chart',
    title: 'Meridian org chart (program scope)',
    uri: 'confluence://meridian/People/Org-Chart',
    reviewState: 'reviewed',
    tags: { source: 'confluence', space: 'People' },
    ingestedDaysAgo: 68,
    content: `CEO: Robert Hale
  COO: Elena Marsh (program sponsor)
    Head of Client Service: Tom Becker (champion, Client Service Ops)
      Client Service Manager: Amara Diallo
      Operations Analyst: Jonas Petersen
      Client Service Associate: Megan Tully
      Onboarding Specialist: Victor Alonso
    Chief Compliance Officer: Margaret Osei-Bonsu (approver for restricted-class skills)
  Head of Advisory: Christopher Lang
    Senior Wealth Advisor: Sofia Alvarez (champion, Wealth Advisors)
    Wealth Advisors: Marcus Reid, Nathan Brooks, Kevin Osei
    Associate Advisor: Isabelle Fontaine
    Client Associate: Laura Chen
  Director of Planning: Daniel Okafor (champion, Financial Planning)
    Senior Financial Planner: Priya Nair
    Financial Planners: Hannah Whitfield, Owen Castellano
    Associate Planner: Rajesh Menon
    Paraplanner: Grace Lindqvist

Program seats: 48 (18 in the three in-program teams, remainder across Advisory and Operations not yet in a wave).`,
  },
  {
    layer: 'company',
    type: 'sop',
    title: 'SOP: Client meeting preparation (Confluence excerpt)',
    uri: 'confluence://meridian/Planning/SOP-Client-Meeting-Prep',
    reviewState: 'reviewed',
    tags: {
      source: 'confluence',
      space: 'Planning',
      owner: 'Daniel Okafor',
      lastUpdated: '2026-03-11',
    },
    ingestedDaysAgo: 66,
    content: `Purpose. Every client review meeting is preceded by a prep brief so the advisor walks in knowing what changed, what to raise and what the client asked for last time.

Timing. Prep briefs for the week's meetings are completed by 11:00 Monday. The planner assigned to the advisor owns the brief.

Inputs. (a) Salesforce meeting record and last two meeting notes (summary export, not the full note body). (b) Orion household summary: allocation vs target, YTD performance, cash position (summary page only). (c) eMoney plan status: last update date, open action items. (d) Calendar entry with attendees. (e) Any open service requests.

Brief structure. One page. 1. Since last meeting (life events, money in/out, market context in one line). 2. Portfolio vs plan (drift, cash, upcoming RMDs or distributions). 3. Open items from last meeting. 4. Suggested agenda (3–5 items). 5. Questions to ask.

Never in the brief. Account numbers, full statements, SSNs, or copies of client identity documents. Reference accounts by household and account type ("Hale IRA") only.

Review. The advisor reads and edits the brief before the meeting. The brief is not entered into Salesforce; the post-meeting note is.`,
  },
  {
    layer: 'company',
    type: 'sop',
    title: 'SOP: Required Minimum Distribution letters (excerpt)',
    uri: 'confluence://meridian/Planning/SOP-RMD-Letters',
    reviewState: 'reviewed',
    tags: {
      source: 'confluence',
      space: 'Planning',
      owner: 'Daniel Okafor',
      lastUpdated: '2025-10-02',
    },
    ingestedDaysAgo: 66,
    content: `Scope. Annual RMD letters to clients aged 73+ with IRA or inherited-IRA balances, plus ad hoc letters when a distribution strategy changes.

Batch timing. First week of November for the annual batch. Ad hoc within five business days of a plan change.

Letter content. Plain-English explanation of the RMD, the household's required amount for the year (from the Orion RMD report, rounded, no account numbers), the distribution method already on file or a recommendation, tax-withholding reminder, and the deadline. Tone: warm, unhurried, no jargon without a gloss. Under one page.

Data handling. The letter is drafted from the Orion RMD summary export (household, age, required amount). The full report and any statement pages are not shared beyond Planning.

Review. The planner drafts; the advisor reviews before send (before_send). The letter is logged in Salesforce by Client Service after the advisor confirms it was sent (before_crm_entry).`,
  },
  {
    layer: 'company',
    type: 'policy',
    title: 'Meridian Claude Enterprise usage policy v2',
    uri: 'confluence://meridian/Compliance/Claude-Usage-Policy',
    reviewState: 'reviewed',
    tags: {
      source: 'confluence',
      space: 'Compliance',
      version: '2',
      approvedBy: 'Margaret Osei-Bonsu',
    },
    ingestedDaysAgo: 40,
    content: DEMO_ORG_SETTINGS.usagePolicy!,
  },
  {
    layer: 'team',
    ownerKey: 'fp',
    type: 'interview',
    title: 'Champion interview: Daniel Okafor, Financial Planning',
    reviewState: 'reviewed',
    tags: { mode: 'champion', turns: '14' },
    ingestedDaysAgo: 60,
    content: `INTERVIEWER: What does the team do every week that you would most like to take off their plates?
DANIEL: Monday meeting prep. Three planners spend most of Monday morning pulling summaries from Salesforce, Orion and eMoney into a one-page brief for each meeting that week. It's the same shape every time and every brief starts from a blank page.
INTERVIEWER: How long per brief, and how many?
DANIEL: Forty-five minutes to an hour each if the household is straightforward. Eight to twelve briefs a week across the team.
INTERVIEWER: What goes wrong?
DANIEL: Missed open items from the last meeting, mostly. And inconsistent structure so the advisors have to hunt for the RMD line.
INTERVIEWER: What must never happen?
DANIEL: Account numbers in the brief. Full statements pasted anywhere. And nobody enters a brief into Salesforce, the post-meeting note is what gets entered.
INTERVIEWER: Other recurring work?
DANIEL: Annual review decks, that's the big one by hours. RMD letters in November. CD memos when a plan changes, maybe four a week across the team. Cash-flow write-ups.
INTERVIEWER: Who reviews?
DANIEL: I review every plan. Advisors review anything client-facing before it goes out.`,
  },
  {
    layer: 'team',
    ownerKey: 'wa',
    type: 'interview',
    title: 'Champion interview: Sofia Alvarez, Wealth Advisors',
    reviewState: 'reviewed',
    tags: { mode: 'champion', turns: '12' },
    ingestedDaysAgo: 60,
    content: `SOFIA: The advisors' week is meetings and what happens after them. The follow-up email and the CRM note are where time leaks: the meeting ends at four, the email goes out at seven, and the Salesforce note gets written on Friday from memory.
INTERVIEWER: What does a good follow-up look like?
SOFIA: Three parts. What we discussed, what we agreed to do, what the client needs to send us. Warm, short, no performance numbers unless we quoted them in the meeting.
INTERVIEWER: What about proposals?
SOFIA: A proposal takes me four hours from discovery notes. Most of that is assembling the same sections: who they are, what they said matters, the recommended structure, our fees, next steps. The judgement is in the middle section; the rest is assembly.
INTERVIEWER: Sensitivities?
SOFIA: Fee conversations. Anything about fees goes to Compliance before it goes to a client. And IPS documents: the summary is fine to draft, the signed IPS itself never leaves the vault.`,
  },
  {
    layer: 'team',
    ownerKey: 'cso',
    type: 'interview',
    title: 'Champion interview: Tom Becker, Client Service Ops (in progress)',
    reviewState: 'pending',
    tags: { mode: 'champion', turns: '6', status: 'active' },
    ingestedDaysAgo: 10,
    content: `TOM: Onboarding packet QA is the one everyone hates. Twelve to fifteen documents per new household, a checklist of forty items, and the same six things are wrong every time: a missing signature page, a beneficiary form with a blank percentage, a trust doc without the certification.
INTERVIEWER: How is QA done now?
TOM: By eye, against the checklist, in DocuSign and SharePoint. About ninety minutes per packet, six to eight packets a week in a normal month.
INTERVIEWER: What could Claude see?
TOM: The checklist and the document names and page counts. Not the documents themselves; they're full of PII and account numbers. That's the constraint I keep coming back to.`,
  },
  {
    layer: 'person',
    ownerKey: 'priya',
    type: 'intake',
    title: 'Intake notes: Priya Nair',
    reviewState: 'reviewed',
    tags: { mode: 'intake', turns: '10' },
    ingestedDaysAgo: 62,
    content:
      'Senior planner supporting three advisors. Owns Monday meeting prep (8–10 briefs a week, ~45 min each), annual review decks (~40 households a year, 3–4 hours each), RMD letters in November, CD memos ad hoc. Uses Claude for rewording emails and summarising eMoney reports; abandoned a Project because she was unsure what to put in it. Self-rated comfort 3/5. Placed L1 by diagnostic.',
  },
  {
    layer: 'person',
    ownerKey: 'marcus',
    type: 'intake',
    title: 'Intake notes: Marcus Reid',
    reviewState: 'reviewed',
    tags: { mode: 'intake', turns: '9' },
    ingestedDaysAgo: 13,
    content:
      'Wealth advisor, ~70 households. Weekly: follow-up emails after review meetings (5–6 a week, ~20 min each plus a Salesforce note), discovery-call summaries for prospects, quarterly review talking points. Uses Claude to polish emails without giving it context. Wants to sound less templated. Self-rated comfort 2/5. Placed L1 by diagnostic; sends drafts without checking them.',
  },
  {
    layer: 'person',
    ownerKey: 'hannah',
    type: 'intake',
    title: 'Intake notes: Hannah Whitfield',
    reviewState: 'reviewed',
    tags: { mode: 'intake', turns: '11' },
    ingestedDaysAgo: 61,
    content:
      'Planner supporting two advisors. Annual review decks are most of her hours (3–4 hours each, 2–3 a week in season). Already built a Project for deck narratives and wants to share it with the team. Comfortable; asks good questions about what to leave out. Placed L1 by diagnostic with a note to fast-track.',
  },
];

export const DEMO_CONTEXT_LAYERS: DemoContextLayer[] = [
  {
    layer: 'company',
    summary:
      'Meridian Wealth Partners is a PE-backed RIA with three teams in program: Financial Planning (document-heavy, highest Claude use), Wealth Advisors (client communication, proposals, fee conversations) and Client Service Ops (onboarding, CRM hygiene, exceptions; most boundary-sensitive). The sponsor wants hours back net of rework against baselines, and an audit trail of who approved what. The compliance boundary forbids client PII documents, account numbers, SSNs and raw statements; Salesforce, Orion and eMoney are read-only; humans review before send, before CRM entry and before client meetings.',
    vocabulary: [
      {
        term: 'CD memo',
        meaning:
          'Change of Direction memo: a one-page note recording why a plan changed materially and what the client agreed.',
      },
      {
        term: 'RMD letter',
        meaning:
          "Annual or ad hoc letter explaining a client's Required Minimum Distribution amount, method and deadline.",
      },
      {
        term: 'annual review deck',
        meaning:
          "The slide deck presented at a household's yearly review: progress vs plan, allocation, cash flow, action items.",
      },
      {
        term: 'IPS',
        meaning:
          'Investment Policy Statement; the signed original never leaves the vault, summaries may be drafted.',
      },
      {
        term: 'prep brief',
        meaning:
          "The one-page Monday brief a planner writes for each of the week's client meetings.",
      },
      {
        term: 'household',
        meaning:
          'The client unit: one or more people and their accounts, referenced by family name plus account type, never by number.',
      },
      {
        term: 'onboarding packet',
        meaning:
          "The 12–15 documents a new household signs; QA'd against a 40-item checklist before accounts open.",
      },
      {
        term: 'attestation',
        meaning:
          'Quarterly compliance attestations staff sign; Ops summarises exceptions for the CCO.',
      },
    ],
    anchorWorkflows: [
      'Monday client meeting prep',
      'Annual review deck assembly',
      'RMD letter drafting',
      'Client follow-up email and CRM note',
      'Proposal assembly',
      'Onboarding packet QA',
    ],
    sensitivities: [
      'No account numbers, SSNs, identity documents or raw statements in any prompt',
      'Fee communications require Compliance approval',
      'Signed IPS documents stay in the vault',
      'Nothing entered into Salesforce, Orion or eMoney without a person reviewing',
    ],
    systems: [
      'Salesforce',
      'Orion',
      'eMoney',
      'Outlook',
      'DocuSign',
      'SharePoint',
      'Confluence',
    ],
    version: 3,
  },
  {
    layer: 'team',
    ownerKey: 'fp',
    summary:
      'Six planners supporting the advisor team. Work is template-shaped and document-heavy; Monday prep briefs and annual review decks are the hours, RMD letters and CD memos are the boundary-sensitive pieces. Daniel reviews every plan.',
    vocabulary: [
      {
        term: 'prep brief',
        meaning: 'One-page Monday brief per meeting; five fixed sections.',
      },
      {
        term: 'drift',
        meaning:
          'Allocation vs target deviation from the Orion household summary.',
      },
      {
        term: 'open items',
        meaning:
          'Action items from the last meeting note, carried forward until closed.',
      },
    ],
    anchorWorkflows: [
      'Monday client meeting prep',
      'Annual review deck assembly',
      'RMD letter drafting',
      'CD memo drafting',
      'Cash-flow projection write-ups',
    ],
    sensitivities: [
      'Briefs reference accounts by household and type only',
      'RMD amounts rounded; no account numbers',
      'Briefs are never entered into Salesforce',
    ],
    systems: ['eMoney', 'Salesforce', 'Orion', 'PowerPoint', 'Word'],
    version: 2,
  },
  {
    layer: 'team',
    ownerKey: 'wa',
    summary:
      'Five advisors and one associate. Time leaks after meetings (follow-up email, CRM note) and in proposal assembly. Fee conversations and IPS documents are the sensitivities.',
    vocabulary: [
      {
        term: 'follow-up',
        meaning:
          'Same-day email after a review meeting: discussed, agreed, needed from you.',
      },
      {
        term: 'discovery notes',
        meaning:
          "Advisor's notes from a first prospect conversation; the input to a proposal.",
      },
      {
        term: 'fee schedule',
        meaning:
          'The tiered advisory fee; any client communication about it needs Compliance sign-off.',
      },
    ],
    anchorWorkflows: [
      'Client follow-up email and CRM note',
      'Proposal assembly',
      'Fee-change client comms',
      'IPS refresh summary',
      'Quarterly review talking points',
    ],
    sensitivities: [
      'Fee comms: Compliance before send',
      'No performance figures in follow-ups unless quoted in the meeting',
      'Signed IPS never leaves the vault',
    ],
    systems: ['Salesforce', 'Orion', 'eMoney', 'Outlook', 'Zoom'],
    version: 2,
  },
  {
    layer: 'team',
    ownerKey: 'cso',
    summary:
      'Client Service Ops joined in Wave 2. Onboarding packet QA, CRM note cleanup and attestation summaries are the candidates; almost every input is close to the boundary, so skills work from checklists, document names and summary exports, never the documents.',
    vocabulary: [
      {
        term: 'packet',
        meaning: 'The onboarding document set for a new household.',
      },
      {
        term: 'exception memo',
        meaning:
          'Short note explaining why a rebalancing trade was held or overridden.',
      },
      {
        term: 'note cleanup',
        meaning:
          "Standardising free-text Salesforce notes into the firm's structured format.",
      },
    ],
    anchorWorkflows: [
      'Onboarding packet QA',
      'CRM note cleanup',
      'Compliance attestation summaries',
      'Rebalancing exception memos',
    ],
    sensitivities: [
      'Documents in packets are PII: only names and page counts may be shared',
      'CRM note bodies may contain account numbers and must be scrubbed first',
      'Attestation exceptions name staff; summaries go to the CCO only',
    ],
    systems: ['Salesforce', 'Orion', 'DocuSign', 'SharePoint', 'Excel'],
    version: 1,
  },
  {
    layer: 'person',
    ownerKey: 'priya',
    summary:
      'Priya owns Monday meeting prep for three advisors and the annual review decks for their households. Her fastest win is a Project for prep briefs; her L3 candidate is the CD memo. She tends to include too much context and is learning what to leave out.',
    vocabulary: [
      {
        term: 'my three',
        meaning: 'The three advisors Priya supports: Lang, Alvarez, Osei.',
      },
    ],
    anchorWorkflows: [
      'Monday client meeting prep',
      'Annual review deck assembly',
      'RMD letter drafting',
      'CD memo drafting',
    ],
    sensitivities: ['Orion summary page only; never the full report'],
    systems: ['eMoney', 'Salesforce', 'Orion', 'Outlook'],
    version: 2,
  },
  {
    layer: 'person',
    ownerKey: 'marcus',
    summary:
      'Marcus writes five or six follow-up emails a week and a Salesforce note for each, plus discovery summaries. He asks Claude to "make this better" without saying what better means. Coach is teaching Description on his own emails first.',
    vocabulary: [
      {
        term: 'the Hendersons',
        meaning:
          'A household Marcus uses as his running example; a retired couple with an inherited IRA.',
      },
    ],
    anchorWorkflows: [
      'Client follow-up email and CRM note',
      'Discovery-call summaries',
      'Quarterly review talking points',
    ],
    sensitivities: [
      'No performance figures in follow-ups unless quoted',
      'Fee questions go to Compliance',
    ],
    systems: ['Salesforce', 'Orion', 'Outlook'],
    version: 1,
  },
  {
    layer: 'person',
    ownerKey: 'daniel',
    summary:
      'Daniel reviews every plan and grades every planning-team artifact in the review queue. He authored advisor-meeting-prep with Builder and approves promotions for Wealth Advisors as cross-team champion. Grader agreement 0.91 over seven reviews.',
    vocabulary: [],
    anchorWorkflows: [
      'Plan review',
      'Monday client meeting prep',
      'Template maintenance',
    ],
    sensitivities: [],
    systems: ['eMoney', 'Salesforce', 'Orion', 'Confluence', 'GitHub'],
    version: 2,
  },
];

// ───────────────────────────────────────── workflows ─────────────────────────────────────────

export const DEMO_WORKFLOWS: DemoWorkflow[] = [
  {
    key: 'monday-meeting-prep',
    teamSlug: 'fp',
    ownerKey: 'priya',
    name: 'Monday client meeting prep',
    createdDaysAgo: 60,
    completeness: 1.0,
    championVerified: true,
    status: 'measured',
    nextWave: false,
    linkedSkillSlugs: ['advisor-meeting-prep'],
    score: {
      value: 0.85,
      hours: 9,
      readiness: 0.8,
      exposure: 0.3,
      rationale:
        'Eight to twelve briefs a week, identical structure, all inputs already summary exports; only exposure is the household summary, which is an allowed class.',
    },
    schema: {
      purpose:
        'Give each advisor a one-page brief for every client meeting that week so nothing from the last meeting is dropped and the RMD or cash position is never a surprise.',
      trigger: "Monday 08:00; the week's meeting list is final in Salesforce.",
      frequency: 'weekly',
      minutesPerRun: 50,
      runsPerWeek: 10,
      inputs: [
        {
          name: 'Meeting record and last two meeting notes',
          source: 'Salesforce summary export',
          dataClass: 'crm_summary_export',
        },
        {
          name: 'Household summary page (allocation vs target, YTD, cash)',
          source: 'Orion',
          dataClass: 'aggregated_client_summaries',
        },
        {
          name: 'Plan status and open action items',
          source: 'eMoney',
          dataClass: 'aggregated_client_summaries',
        },
        {
          name: 'Calendar entry with attendees',
          source: 'Outlook',
          dataClass: 'calendar',
        },
        {
          name: 'Prep brief template',
          source: 'Confluence',
          dataClass: 'internal_templates',
        },
      ],
      steps: [
        {
          order: 1,
          action:
            "Pull the week's meeting list and export the summary for each household",
          actor: 'human',
          system: 'Salesforce',
        },
        {
          order: 2,
          action: 'Copy the Orion household summary page and eMoney open items',
          actor: 'human',
          system: 'Orion',
        },
        {
          order: 3,
          action:
            'Draft the five-section brief from the summaries using the template',
          actor: 'claude',
        },
        {
          order: 4,
          action:
            'Check every figure against the source summary; remove anything account-specific',
          actor: 'human',
        },
        {
          order: 5,
          action: 'Send the brief to the advisor by 11:00',
          actor: 'human',
          system: 'Outlook',
        },
      ],
      decisions: [
        {
          point: 'Household has an RMD due this year',
          rule: 'Section 2 must state the rounded required amount and whether a method is on file.',
        },
        {
          point: 'Open item older than two meetings',
          rule: 'Move to the top of section 3 and flag as overdue.',
        },
      ],
      exceptions: [
        {
          case: 'Household summary not refreshed in Orion',
          handling:
            'Brief marks the allocation section as stale and the planner notes the last refresh date.',
        },
        {
          case: 'Prospect meeting (no household yet)',
          handling: 'Use the discovery-notes variant; skip sections 2 and 3.',
        },
      ],
      systems: ['Salesforce', 'Orion', 'eMoney', 'Outlook'],
      mustNeverLeave: [
        'account_numbers',
        'statements_raw',
        'client_pii_documents',
      ],
      outputs: [
        {
          name: 'Prep brief (one page)',
          destination: 'Advisor inbox; never entered into Salesforce',
        },
      ],
      humanReview: ['before_client_meeting'],
    },
  },
  {
    key: 'annual-review-deck',
    teamSlug: 'fp',
    ownerKey: 'hannah',
    name: 'Annual review deck assembly',
    createdDaysAgo: 58,
    completeness: 0.95,
    championVerified: true,
    status: 'shipped',
    nextWave: false,
    linkedSkillSlugs: ['annual-review-deck-outline'],
    score: {
      value: 0.9,
      hours: 12,
      readiness: 0.6,
      exposure: 0.3,
      rationale:
        'Largest block of planner hours; the narrative and structure are automatable, the charts and numbers are not, so readiness is moderate.',
    },
    schema: {
      purpose:
        'Assemble the yearly review deck for a household: progress against plan, allocation, cash flow, tax items, action list.',
      trigger:
        'Annual review meeting scheduled; planner assigned two weeks ahead.',
      frequency: 'weekly',
      minutesPerRun: 210,
      runsPerWeek: 3,
      inputs: [
        {
          name: 'Plan progress summary',
          source: 'eMoney',
          dataClass: 'aggregated_client_summaries',
        },
        {
          name: 'Allocation and performance summary',
          source: 'Orion',
          dataClass: 'aggregated_client_summaries',
        },
        {
          name: "Last year's deck and action items",
          source: 'SharePoint',
          dataClass: 'internal_templates',
        },
        {
          name: 'Deck template',
          source: 'PowerPoint',
          dataClass: 'internal_templates',
        },
      ],
      steps: [
        {
          order: 1,
          action: 'Export plan progress and allocation summaries',
          actor: 'human',
          system: 'eMoney',
        },
        {
          order: 2,
          action:
            'Draft the slide-by-slide outline and speaker narrative from the summaries',
          actor: 'claude',
        },
        {
          order: 3,
          action: 'Build charts and populate figures in the template',
          actor: 'human',
          system: 'PowerPoint',
        },
        {
          order: 4,
          action: 'Director review of the plan content',
          actor: 'human',
        },
        {
          order: 5,
          action: 'Advisor review before the meeting',
          actor: 'human',
        },
      ],
      decisions: [
        {
          point: 'Plan off track by more than 10%',
          rule: 'Add a "what changed" slide before recommendations.',
        },
      ],
      exceptions: [
        {
          case: 'Household had a life event (death, divorce, sale of business)',
          handling:
            'Deck opens with a revised goals slide; narrative drafted by the planner, not Claude.',
        },
      ],
      systems: ['eMoney', 'Orion', 'PowerPoint', 'SharePoint'],
      mustNeverLeave: ['account_numbers', 'statements_raw'],
      outputs: [
        {
          name: 'Annual review deck',
          destination: 'Advisor; presented in meeting',
        },
      ],
      humanReview: ['before_client_meeting'],
    },
  },
  {
    key: 'rmd-letter-drafting',
    teamSlug: 'fp',
    ownerKey: 'hannah',
    name: 'RMD letter drafting',
    createdDaysAgo: 40,
    completeness: 0.9,
    championVerified: true,
    status: 'in_build',
    nextWave: false,
    linkedSkillSlugs: ['rmd-letter-draft'],
    score: {
      value: 0.7,
      hours: 3,
      readiness: 0.75,
      exposure: 0.5,
      rationale:
        'Seasonal (November batch of ~120 letters) plus ad hoc; highly templated, but the letters go to clients and quote a dollar figure, so before_send review is essential.',
    },
    schema: {
      purpose:
        "Explain each eligible client's RMD amount, method and deadline in plain English.",
      trigger:
        'First week of November (batch) or a plan change affecting distributions (ad hoc).',
      frequency: 'monthly',
      minutesPerRun: 20,
      runsPerWeek: 8,
      inputs: [
        {
          name: 'RMD summary export (household, age, required amount)',
          source: 'Orion',
          dataClass: 'aggregated_client_summaries',
        },
        {
          name: 'RMD letter template',
          source: 'Word',
          dataClass: 'internal_templates',
        },
        {
          name: 'IRS RMD guidance',
          source: 'irs.gov',
          dataClass: 'public_regulation',
        },
      ],
      steps: [
        {
          order: 1,
          action:
            'Export the RMD summary; strip anything beyond household, age, amount',
          actor: 'human',
          system: 'Orion',
        },
        {
          order: 2,
          action: 'Draft the letter from the template and summary row',
          actor: 'claude',
        },
        {
          order: 3,
          action: 'Planner checks amount and deadline',
          actor: 'human',
        },
        {
          order: 4,
          action: 'Advisor reviews and sends',
          actor: 'human',
          system: 'Outlook',
        },
        {
          order: 5,
          action: 'Client Service logs the send in Salesforce',
          actor: 'human',
          system: 'Salesforce',
        },
      ],
      decisions: [
        {
          point: 'Inherited IRA',
          rule: 'Use the inherited-IRA paragraph; do not mention the 10-year rule unless the plan notes confirm it applies.',
        },
      ],
      exceptions: [
        {
          case: 'Client already took the distribution',
          handling: 'Letter becomes a confirmation, not a reminder.',
        },
      ],
      systems: ['Orion', 'Word', 'Outlook', 'Salesforce'],
      mustNeverLeave: ['account_numbers', 'statements_raw', 'ssn'],
      outputs: [{ name: 'RMD letter', destination: 'Client, via advisor' }],
      humanReview: ['before_send', 'before_crm_entry'],
    },
  },
  {
    key: 'cd-memo-drafting',
    teamSlug: 'fp',
    ownerKey: 'grace',
    name: 'CD memo drafting',
    createdDaysAgo: 30,
    completeness: 0.8,
    championVerified: false,
    status: 'scored',
    nextWave: true,
    linkedSkillSlugs: [],
    score: {
      value: 0.6,
      hours: 4,
      readiness: 0.7,
      exposure: 0.4,
      rationale:
        "Four memos a week across the team, well templated; value is moderate because the memo is internal, but consistency matters for the director's review.",
    },
    schema: {
      purpose:
        "Record why a plan changed materially and what the client agreed, in one page, for the director's review and the file.",
      trigger:
        'Advisor tells Planning a plan changed direction after a meeting.',
      frequency: 'weekly',
      minutesPerRun: 60,
      runsPerWeek: 4,
      inputs: [
        {
          name: "Advisor's meeting note summary",
          source: 'Salesforce',
          dataClass: 'crm_summary_export',
        },
        {
          name: 'Before/after plan summary',
          source: 'eMoney',
          dataClass: 'aggregated_client_summaries',
        },
        {
          name: 'CD memo template',
          source: 'Word',
          dataClass: 'internal_templates',
        },
      ],
      steps: [
        {
          order: 1,
          action: 'Collect the note summary and plan deltas',
          actor: 'human',
        },
        {
          order: 2,
          action:
            'Draft the memo sections: context, change, rationale, client agreement, next steps',
          actor: 'claude',
        },
        {
          order: 3,
          action: 'Paraplanner edits; director reviews',
          actor: 'human',
        },
      ],
      decisions: [],
      exceptions: [],
      systems: ['Salesforce', 'eMoney', 'Word'],
      mustNeverLeave: ['account_numbers'],
      outputs: [{ name: 'CD memo', destination: 'Plan file; director review' }],
      humanReview: [],
    },
  },
  {
    key: 'client-followup',
    teamSlug: 'wa',
    ownerKey: 'sofia',
    name: 'Client follow-up email and CRM note',
    createdDaysAgo: 60,
    completeness: 1.0,
    championVerified: true,
    status: 'measured',
    nextWave: false,
    linkedSkillSlugs: ['client-followup-notes', 'crm-note-cleanup'],
    score: {
      value: 0.8,
      hours: 10,
      readiness: 0.85,
      exposure: 0.35,
      rationale:
        "Every advisor, every meeting, same three-part structure; input is the advisor's own notes so readiness is high. Before-send review already exists.",
    },
    schema: {
      purpose:
        'Send the client a same-day follow-up and write the Salesforce note from the same source, so both are consistent and neither waits until Friday.',
      trigger: 'Review meeting ends.',
      frequency: 'daily',
      minutesPerRun: 25,
      runsPerWeek: 24,
      inputs: [
        {
          name: "Advisor's meeting notes (typed or dictated)",
          source: 'Advisor',
          dataClass: 'aggregated_client_summaries',
        },
        {
          name: 'Follow-up template',
          source: 'Confluence',
          dataClass: 'internal_templates',
        },
      ],
      steps: [
        {
          order: 1,
          action:
            'Advisor types or dictates notes within an hour of the meeting',
          actor: 'human',
        },
        {
          order: 2,
          action:
            'Draft the follow-up email (discussed / agreed / needed from you) and the structured CRM note',
          actor: 'claude',
        },
        {
          order: 3,
          action: 'Advisor edits and sends the email',
          actor: 'human',
          system: 'Outlook',
        },
        {
          order: 4,
          action: 'Advisor pastes the reviewed note into Salesforce',
          actor: 'human',
          system: 'Salesforce',
        },
      ],
      decisions: [
        {
          point: 'Performance figure mentioned in the meeting',
          rule: 'Quote only what the advisor said, verbatim from the notes; otherwise omit performance.',
        },
      ],
      exceptions: [
        {
          case: 'Fee discussion occurred',
          handling:
            'Fee content is removed from the email and routed to the fee-change workflow.',
        },
      ],
      systems: ['Outlook', 'Salesforce'],
      mustNeverLeave: ['account_numbers', 'statements_raw'],
      outputs: [
        { name: 'Follow-up email', destination: 'Client' },
        {
          name: 'Structured CRM note',
          destination: 'Salesforce (after review)',
        },
      ],
      humanReview: ['before_send', 'before_crm_entry'],
    },
  },
  {
    key: 'proposal-assembly',
    teamSlug: 'wa',
    ownerKey: 'sofia',
    name: 'Proposal assembly',
    createdDaysAgo: 58,
    completeness: 0.9,
    championVerified: true,
    status: 'shipped',
    nextWave: false,
    linkedSkillSlugs: ['proposal-assembly'],
    score: {
      value: 0.9,
      hours: 8,
      readiness: 0.6,
      exposure: 0.4,
      rationale:
        'Four hours per proposal and directly tied to revenue; the middle (recommendation) stays human, the assembly sections are repeatable. Fee section requires Compliance wording.',
    },
    schema: {
      purpose:
        'Turn discovery notes into a first-draft proposal for a prospect household.',
      trigger: 'Discovery meeting complete; advisor decides to propose.',
      frequency: 'weekly',
      minutesPerRun: 240,
      runsPerWeek: 2,
      inputs: [
        {
          name: 'Discovery notes',
          source: 'Advisor',
          dataClass: 'aggregated_client_summaries',
        },
        {
          name: 'Proposal template and approved fee language',
          source: 'Compliance / Confluence',
          dataClass: 'internal_templates',
        },
      ],
      steps: [
        { order: 1, action: 'Advisor writes discovery notes', actor: 'human' },
        {
          order: 2,
          action:
            'Draft: who they are, what matters, recommended structure outline, next steps; insert approved fee language unchanged',
          actor: 'claude',
        },
        {
          order: 3,
          action: 'Advisor writes the recommendation section',
          actor: 'human',
        },
        { order: 4, action: 'Senior advisor reviews', actor: 'human' },
      ],
      decisions: [
        {
          point: 'Prospect assets above $5M',
          rule: 'Route to the senior advisor before drafting.',
        },
      ],
      exceptions: [
        {
          case: 'Prospect asks for a fee deviation',
          handling: 'Compliance approves wording before the proposal goes out.',
        },
      ],
      systems: ['Salesforce', 'Word'],
      mustNeverLeave: [
        'account_numbers',
        'statements_raw',
        'client_pii_documents',
      ],
      outputs: [
        {
          name: 'Proposal draft',
          destination: 'Advisor review; then prospect',
        },
      ],
      humanReview: ['before_send'],
    },
  },
  {
    key: 'fee-change-comms',
    teamSlug: 'wa',
    ownerKey: 'kevin',
    name: 'Fee-change client comms',
    createdDaysAgo: 35,
    completeness: 0.85,
    championVerified: true,
    status: 'in_build',
    nextWave: false,
    linkedSkillSlugs: ['fee-change-comms'],
    score: {
      value: 0.7,
      hours: 2.5,
      readiness: 0.7,
      exposure: 0.8,
      rationale:
        'Fee schedule migration touches ~300 households this quarter; letters are templated but any fee communication is Compliance-reviewed, so exposure is the highest in the backlog.',
    },
    schema: {
      purpose:
        "Notify households of a fee schedule change with the approved explanation and their advisor's personal note.",
      trigger:
        'Fee schedule change approved by Compliance; household list issued.',
      frequency: 'weekly',
      minutesPerRun: 15,
      runsPerWeek: 10,
      inputs: [
        {
          name: 'Approved fee-change explanation',
          source: 'Compliance',
          dataClass: 'internal_templates',
        },
        {
          name: 'Household tier (old and new)',
          source: 'Salesforce summary export',
          dataClass: 'crm_summary_export',
        },
      ],
      steps: [
        {
          order: 1,
          action:
            'Draft the letter using the approved explanation verbatim and a personal opening',
          actor: 'claude',
        },
        {
          order: 2,
          action: 'Advisor personalises and checks tier',
          actor: 'human',
        },
        {
          order: 3,
          action: 'Compliance spot-checks the batch',
          actor: 'human',
        },
        { order: 4, action: 'Send', actor: 'human', system: 'Outlook' },
      ],
      decisions: [
        {
          point: 'Household fee increases',
          rule: 'Letter must offer a call; no comparative performance claims.',
        },
      ],
      exceptions: [
        {
          case: 'Household on a negotiated fee',
          handling: 'Excluded from the batch; advisor writes individually.',
        },
      ],
      systems: ['Salesforce', 'Outlook'],
      mustNeverLeave: ['account_numbers', 'statements_raw'],
      outputs: [{ name: 'Fee-change letter', destination: 'Client' }],
      humanReview: ['before_send'],
    },
  },
  {
    key: 'ips-refresh',
    teamSlug: 'wa',
    ownerKey: 'kevin',
    name: 'IPS refresh checklist',
    createdDaysAgo: 20,
    completeness: 0.6,
    championVerified: false,
    status: 'scored',
    nextWave: true,
    linkedSkillSlugs: ['ips-refresh-checklist'],
    score: {
      value: 0.6,
      hours: 3,
      readiness: 0.5,
      exposure: 0.6,
      rationale:
        "Annual per household; the summary of changes is draftable but the signed IPS never leaves the vault, so inputs must be the advisor's own change notes.",
    },
    schema: {
      purpose:
        "Summarise what changed in a household's Investment Policy Statement at annual refresh for the client and the file.",
      trigger: 'Annual review identifies IPS changes.',
      frequency: 'weekly',
      minutesPerRun: 45,
      runsPerWeek: 4,
      inputs: [
        {
          name: "Advisor's change notes",
          source: 'Advisor',
          dataClass: 'aggregated_client_summaries',
        },
      ],
      steps: [
        {
          order: 1,
          action: 'Advisor lists changes (risk band, constraints, liquidity)',
          actor: 'human',
        },
        { order: 2, action: 'Draft the change summary', actor: 'claude' },
      ],
      decisions: [],
      exceptions: [],
      systems: ['Word', 'SharePoint'],
      mustNeverLeave: ['client_pii_documents'],
      outputs: [{ name: 'IPS change summary', destination: 'Client and file' }],
      humanReview: ['before_send'],
    },
  },
  {
    key: 'onboarding-packet-qa',
    teamSlug: 'cso',
    ownerKey: 'tom',
    name: 'Onboarding packet QA',
    createdDaysAgo: 13,
    completeness: 0.95,
    championVerified: true,
    status: 'shipped',
    nextWave: false,
    linkedSkillSlugs: ['onboarding-packet-qa'],
    score: {
      value: 0.85,
      hours: 10,
      readiness: 0.55,
      exposure: 0.7,
      rationale:
        'Ninety minutes per packet, seven a week; Claude can run the checklist against document names and page counts but never the documents, so readiness is limited and exposure is high.',
    },
    schema: {
      purpose:
        'Catch the six recurring packet defects before accounts open, from the checklist and document inventory rather than the documents themselves.',
      trigger: 'DocuSign envelope completed for a new household.',
      frequency: 'daily',
      minutesPerRun: 90,
      runsPerWeek: 7,
      inputs: [
        {
          name: '40-item QA checklist',
          source: 'SharePoint',
          dataClass: 'internal_templates',
        },
        {
          name: 'Document inventory (names, page counts, signer status)',
          source: 'DocuSign export',
          dataClass: 'aggregated_client_summaries',
        },
      ],
      steps: [
        {
          order: 1,
          action: 'Export the envelope inventory (no document content)',
          actor: 'human',
          system: 'DocuSign',
        },
        {
          order: 2,
          action:
            'Run the checklist against the inventory; list gaps and likely defects',
          actor: 'claude',
        },
        {
          order: 3,
          action: 'Specialist opens each flagged document and confirms',
          actor: 'human',
          system: 'SharePoint',
        },
        {
          order: 4,
          action: 'Request corrections from the client',
          actor: 'human',
        },
      ],
      decisions: [
        {
          point: 'Trust account in packet',
          rule: 'Trust certification must be present; otherwise hold the whole packet.',
        },
      ],
      exceptions: [
        {
          case: 'Envelope partially signed',
          handling:
            'QA runs on what exists; output marks the packet incomplete.',
        },
      ],
      systems: ['DocuSign', 'SharePoint', 'Salesforce'],
      mustNeverLeave: ['client_pii_documents', 'account_numbers', 'ssn'],
      outputs: [{ name: 'QA gap list', destination: 'Onboarding specialist' }],
      humanReview: ['before_crm_entry'],
    },
  },
  {
    key: 'crm-note-cleanup',
    teamSlug: 'cso',
    ownerKey: 'amara',
    name: 'CRM note cleanup',
    createdDaysAgo: 13,
    completeness: 0.9,
    championVerified: true,
    status: 'measured',
    nextWave: false,
    linkedSkillSlugs: [],
    score: {
      value: 0.6,
      hours: 6,
      readiness: 0.8,
      exposure: 0.6,
      rationale:
        'Free-text notes standardised into the firm format; high readiness, but note bodies sometimes contain account numbers so a scrub step is mandatory before Claude sees them.',
    },
    schema: {
      purpose:
        "Convert free-text advisor notes into the firm's structured note format (summary, decisions, actions, follow-up date).",
      trigger: 'Weekly note-quality report lists non-conforming notes.',
      frequency: 'weekly',
      minutesPerRun: 8,
      runsPerWeek: 45,
      inputs: [
        {
          name: 'Scrubbed note text (account numbers redacted by the export macro)',
          source: 'Salesforce export',
          dataClass: 'crm_summary_export',
        },
      ],
      steps: [
        {
          order: 1,
          action: 'Run the redaction macro on the export',
          actor: 'system',
          system: 'Salesforce',
        },
        {
          order: 2,
          action: 'Restructure each note into the format',
          actor: 'claude',
        },
        {
          order: 3,
          action: 'Manager reviews and pastes back',
          actor: 'human',
          system: 'Salesforce',
        },
      ],
      decisions: [
        {
          point: 'Note mentions a complaint',
          rule: 'Flag for Compliance; do not restructure.',
        },
      ],
      exceptions: [
        {
          case: 'Redaction macro fails',
          handling: 'Note is skipped and listed for manual cleanup.',
        },
      ],
      systems: ['Salesforce'],
      mustNeverLeave: ['account_numbers', 'ssn'],
      outputs: [
        { name: 'Structured notes', destination: 'Salesforce (after review)' },
      ],
      humanReview: ['before_crm_entry'],
    },
  },
  {
    key: 'compliance-attestation-summaries',
    teamSlug: 'cso',
    ownerKey: 'tom',
    name: 'Compliance attestation summaries',
    createdDaysAgo: 11,
    completeness: 0.7,
    championVerified: false,
    status: 'in_build',
    nextWave: true,
    linkedSkillSlugs: ['attestation-summary'],
    score: {
      value: 0.7,
      hours: 3,
      readiness: 0.4,
      exposure: 0.75,
      rationale:
        "Quarterly summaries for the CCO; exceptions name staff and reference personal trading, so Builder's confidence is low and the CCO must approve any skill.",
    },
    schema: {
      purpose:
        'Summarise quarterly attestation exceptions for the CCO with counts, themes and open follow-ups.',
      trigger: 'Attestation window closes.',
      frequency: 'monthly',
      minutesPerRun: 180,
      runsPerWeek: 1,
      inputs: [
        {
          name: 'Attestation exception export (de-identified)',
          source: 'Compliance system',
          dataClass: 'aggregated_client_summaries',
        },
      ],
      steps: [
        {
          order: 1,
          action: 'De-identify the export (staff ids only)',
          actor: 'human',
        },
        {
          order: 2,
          action: 'Draft the summary: counts, themes, open items',
          actor: 'claude',
        },
        { order: 3, action: 'CCO reviews', actor: 'human' },
      ],
      decisions: [],
      exceptions: [],
      systems: ['Excel', 'SharePoint'],
      mustNeverLeave: ['client_pii_documents', 'ssn'],
      outputs: [{ name: 'Attestation summary', destination: 'CCO' }],
      humanReview: ['before_send'],
    },
  },
  {
    key: 'rebalancing-exception-memo',
    teamSlug: 'cso',
    ownerKey: 'jonas',
    name: 'Rebalancing exception memos',
    createdDaysAgo: 9,
    completeness: 0.45,
    championVerified: false,
    status: 'in_build',
    nextWave: true,
    linkedSkillSlugs: ['rebalancing-exception-memo'],
    score: null,
    schema: {
      purpose:
        'Explain why a rebalancing trade was held or overridden, for the advisor and the file.',
      trigger: 'Orion rebalancer flags an exception.',
      frequency: 'daily',
      minutesPerRun: 30,
      runsPerWeek: 8,
      inputs: [
        {
          name: 'Exception row (household, model, drift, reason code)',
          source: 'Orion export',
          dataClass: 'aggregated_client_summaries',
        },
      ],
      steps: [
        {
          order: 1,
          action: "Export the day's exceptions",
          actor: 'human',
          system: 'Orion',
        },
        { order: 2, action: 'Draft the memo', actor: 'claude' },
      ],
      systems: ['Orion', 'Salesforce'],
      mustNeverLeave: ['account_numbers'],
      outputs: [{ name: 'Exception memo', destination: 'Advisor' }],
      humanReview: [],
    },
  },
];

// ───────────────────────────────────────── skills ─────────────────────────────────────────

const B = {
  meetingPrep: {
    mayRead: [
      'calendar',
      'crm_summary_export',
      'aggregated_client_summaries',
      'internal_templates',
    ],
    mustNeverReceive: [
      'client_pii_documents',
      'account_numbers',
      'ssn',
      'statements_raw',
    ],
    humanReview: ['before_client_meeting'],
  },
  clientComms: {
    mayRead: ['aggregated_client_summaries', 'internal_templates'],
    mustNeverReceive: [
      'client_pii_documents',
      'account_numbers',
      'ssn',
      'statements_raw',
    ],
    humanReview: ['before_send', 'before_crm_entry'],
  },
  feeComms: {
    mayRead: ['internal_templates', 'crm_summary_export'],
    mustNeverReceive: [
      'client_pii_documents',
      'account_numbers',
      'ssn',
      'statements_raw',
    ],
    humanReview: ['before_send'],
  },
  ops: {
    mayRead: [
      'internal_templates',
      'aggregated_client_summaries',
      'crm_summary_export',
    ],
    mustNeverReceive: [
      'client_pii_documents',
      'account_numbers',
      'ssn',
      'statements_raw',
    ],
    humanReview: ['before_crm_entry'],
  },
} satisfies Record<string, BoundaryDeclaration>;

export const DEMO_SKILLS: DemoSkill[] = [
  {
    slug: 'advisor-meeting-prep',
    name: 'Advisor meeting prep brief',
    triggerLine:
      'Use when a planner asks for a Monday prep brief for a client review meeting from Salesforce, Orion and eMoney summaries.',
    plugin: 'fp-meeting-prep',
    teamSlug: 'fp',
    ownerKey: 'daniel',
    status: 'published',
    rungRequired: 1,
    workflowFamily: 'meeting-prep',
    workflowKey: 'monday-meeting-prep',
    authoredBy: 'builder',
    boundary: B.meetingPrep,
    createdDaysAgo: 55,
    publishedDaysAgo: 46,
    usageRate: 1.6,
    sampleCases: [
      {
        input:
          'Prep brief for the Hale review on Wednesday. Here is the Salesforce summary, the Orion household page and the eMoney open items.',
        shouldTrigger: 'yes',
        expected:
          'Five-section brief; RMD line present because Mr Hale is 74; open items carried forward with ages.',
      },
      {
        input: 'Write the post-meeting note for the Hale review.',
        shouldTrigger: 'no',
        expected:
          'Not a prep brief; client-followup-notes handles post-meeting notes.',
      },
      {
        input:
          'Can you summarise what changed for the Nakamura household since last quarter?',
        shouldTrigger: 'ambiguous',
        expected:
          'Ask whether this is for an upcoming meeting; if yes, produce section 1 of the brief only.',
      },
      {
        input: 'Prep brief for the Ortiz meeting, statement PDFs attached.',
        shouldTrigger: 'yes',
        expected:
          'Refuse the statements; ask for the Orion household summary page instead, then draft.',
      },
    ],
    skillMd: `---
name: advisor-meeting-prep
description: Draft the one-page Monday prep brief for a client review meeting from Salesforce, Orion and eMoney summary exports. Use when a planner names a household and an upcoming meeting and provides the summaries. Do not use for post-meeting notes, prospect discovery, or when the only inputs are raw statements.
---

# Advisor meeting prep brief

## When to use
A planner asks for the prep brief for a named household's upcoming review meeting and supplies (or will supply) the Salesforce meeting summary, the Orion household summary page and the eMoney open items. If any of those is missing, ask for it once and draft with what you have, marking the gap.

Not for: post-meeting notes or follow-up emails (client-followup-notes), prospect meetings (use the discovery-notes variant in references/prospect-brief.md), or annual review decks.

## Inputs
- Salesforce meeting summary export: date, attendees, last two meeting notes (summary form).
- Orion household summary page: allocation vs target, YTD, cash position, RMD status.
- eMoney open action items with dates.
- Calendar entry (attendees, time).
The brief template is in references/brief-template.md.

## Steps
1. Read the last two meeting notes and list every open item with the meeting it came from.
2. From the Orion page, note drift over 5 percentage points, cash above target, and any RMD due this year (state the rounded amount and whether a method is on file).
3. Write the five sections in order: Since last meeting; Portfolio vs plan; Open items (oldest first, flag anything older than two meetings); Suggested agenda (3–5 items); Questions to ask.
4. Reference accounts as "household + type" (Hale IRA), never by number. If an input contains an account number or statement pages, stop and ask for the summary page instead.
5. Keep to one page. End with "Prepared for [advisor]; review before the meeting."

## Output format
Markdown with the five numbered section headings from the template. No tables. Figures rounded to the nearest thousand.

## Boundaries
- may_read: calendar, crm_summary_export, aggregated_client_summaries, internal_templates
- must_never_receive: client_pii_documents, account_numbers, ssn, statements_raw
- human_review: before_client_meeting. The brief is read and edited by the advisor; it is never entered into Salesforce.

## Examples
**Example 1: straightforward household.** Input: Hale household, review Wednesday, summaries attached; Mr Hale 74, IRA RMD $38,400, method on file; one open item (update beneficiary on the Roth) from the last meeting. Output section 2 includes "RMD due this year: about $38,000 from the Hale IRA; monthly method on file." Section 3 lists the beneficiary item as open since the last meeting. Agenda has four items.

**Example 2: stale data.** Input: Nakamura household, Orion summary last refreshed 47 days ago. Output marks section 2 "Allocation as of [date]; refresh before the meeting" and adds "Confirm cash position" to Questions to ask, rather than reporting stale drift as current.
`,
    versions: [
      {
        version: 1,
        daysAgo: 55,
        authorKey: 'daniel',
        changelog:
          'Builder draft from the Monday prep workflow map and the Confluence SOP.',
        grade: {
          scores: {
            trigger_clarity: 0.7,
            scope: 0.8,
            progressive_disclosure: 0.6,
            boundary_declaration: 0.9,
            canonical_examples: 0.6,
            tight_context: 0.7,
            sample_cases: 0.7,
          },
          decision: 'revise',
          feedback:
            'What worked: the boundary is complete and every step respects it, which is the hard part.\nWhat to change: the description lists the skill\'s own steps instead of when a planner would use it, and the full brief template sits in the body, doubling its length; both examples are odd cases with no ordinary brief shown.\nTry next: move the template to references/, rewrite the description as "use when a planner names a household and an upcoming meeting", and add one example of a normal brief.',
          teachingMoment:
            'Rewrite the description in the words a planner would say when they need it, not as a list of what the skill does.',
        },
      },
      {
        version: 2,
        daysAgo: 48,
        authorKey: 'daniel',
        changelog:
          'Rewrote the description as when-to-use; moved the brief template to references/; added a typical example; tightened the steps.',
        grade: {
          scores: {
            trigger_clarity: 0.9,
            scope: 0.85,
            progressive_disclosure: 0.85,
            boundary_declaration: 0.95,
            canonical_examples: 0.85,
            tight_context: 0.85,
            sample_cases: 0.85,
          },
          decision: 'pass',
          feedback:
            'What worked: the description now reads as a planner would say it and names what it is not for; the template lives in references/ and the body is one page.\nWhat to change: nothing blocking; the two examples (normal and stale data) are the right pair.\nTry next: watch the first week of real briefs for anything the sample requests did not cover.',
        },
        approverKeys: ['sofia'],
      },
      {
        version: 3,
        daysAgo: 21,
        authorKey: 'priya',
        changelog:
          'Added RMD-method line to section 2 and the "older than two meetings" flag in open items, from four weeks of use.',
        grade: {
          scores: {
            trigger_clarity: 0.9,
            scope: 0.85,
            progressive_disclosure: 0.85,
            boundary_declaration: 0.95,
            canonical_examples: 0.9,
            tight_context: 0.85,
            sample_cases: 0.9,
          },
          decision: 'pass',
          feedback:
            'What worked: a small change that follows the rules Daniel verified in the workflow map, with the boundary unchanged.\nWhat to change: nothing.\nTry next: update the sample request for the Hale household so it shows the new RMD-method line.',
        },
        approverKeys: ['sofia'],
      },
    ],
  },
  {
    slug: 'annual-review-deck-outline',
    name: 'Annual review deck outline',
    triggerLine:
      "Use when a planner needs the slide-by-slide outline and speaker narrative for a household's annual review deck from eMoney and Orion summaries.",
    plugin: 'fp-meeting-prep',
    teamSlug: 'fp',
    ownerKey: 'priya',
    status: 'published',
    rungRequired: 2,
    workflowFamily: 'annual-review',
    workflowKey: 'annual-review-deck',
    authoredBy: 'learner',
    boundary: B.meetingPrep,
    createdDaysAgo: 24,
    publishedDaysAgo: 17,
    usageRate: 0.6,
    sampleCases: [
      {
        input:
          'Outline the annual review deck for the Brennan household; plan progress and allocation summaries attached.',
        shouldTrigger: 'yes',
        expected:
          'Twelve-slide outline with narrative per slide; "what changed" slide inserted because the plan is 14% behind.',
      },
      {
        input: 'Build the charts for the Brennan deck.',
        shouldTrigger: 'no',
        expected:
          'Charts are built by the planner in PowerPoint from source data; the skill produces outline and narrative only.',
      },
      {
        input: 'The Brennans sold their business in March. Start the deck.',
        shouldTrigger: 'ambiguous',
        expected:
          'Life event: produce the outline but leave the revised-goals narrative for the planner, and say so.',
      },
    ],
    skillMd: `---
name: annual-review-deck-outline
description: Produce the slide-by-slide outline and speaker narrative for a household's annual review deck from the eMoney plan-progress summary and the Orion allocation summary. Use when a planner is starting an annual review deck. Not for building charts, not for quarterly reviews, not when a major life event means goals must be re-set first.
---

# Annual review deck outline

## When to use
A planner is starting the annual review deck for a named household and has the eMoney plan-progress summary and the Orion allocation summary. The skill gives them the outline and a narrative paragraph per slide; they build the charts and fill the figures.

Not for: quarterly review talking points (shorter, different structure), chart building, or households with a major life event this year (the planner writes the revised-goals narrative; the skill can outline the rest).

## Inputs
- eMoney plan-progress summary: probability of success, funded ratio, goals on/off track.
- Orion allocation summary: current vs target by asset class, YTD performance, cash.
- Last year's action items (from the previous deck's final slide).
Slide template and standard order: references/deck-order.md.

## Steps
1. Decide whether the plan is on track (within 10% of funded target). If off track, insert the "what changed" slide before recommendations.
2. Write the outline in the standard order, one line per slide.
3. For each slide, write a 2–4 sentence speaker narrative in the advisor's voice: plain English, no jargon without a gloss, no performance numbers beyond what the summary gives.
4. Carry last year's action items into the "where we left off" slide with status.
5. Finish with an action-items slide of no more than five items.

## Output format
Numbered slide list. Under each: a bold slide title, a one-line content note ("chart: allocation vs target"), then the narrative paragraph. Total under two pages.

## Boundaries
- may_read: aggregated_client_summaries, internal_templates, calendar
- must_never_receive: client_pii_documents, account_numbers, ssn, statements_raw
- human_review: before_client_meeting; the director reviews plan content and the advisor reviews the deck.

## Examples
**Example 1: on track.** Brennan household, funded ratio 104%, allocation within 3 points of target. Output: eleven slides, no "what changed" slide; narrative for the allocation slide reads "You are within a few points of target across the board, so this year we are not proposing changes to the mix."

**Example 2: off track.** Kowalski household, funded ratio 86% after a large withdrawal. Output: twelve slides with "What changed this year" as slide 4, narrative naming the withdrawal (as the summary describes it) and its effect, followed by recommendations.
`,
    versions: [
      {
        version: 1,
        daysAgo: 24,
        authorKey: 'hannah',
        changelog: 'First draft from my deck-narrative Project.',
        grade: {
          scores: {
            trigger_clarity: 0.85,
            scope: 0.9,
            progressive_disclosure: 0.8,
            boundary_declaration: 0.9,
            canonical_examples: 0.9,
            tight_context: 0.85,
            sample_cases: 0.85,
          },
          decision: 'pass',
          feedback:
            'What worked: the skill does exactly one job and says what it will not do (charts, quarterly reviews, life events); the two examples show an on-track deck and an off-track one, and the voice notes are specific.\nWhat to change: the slide order is only implied; put it in a file called references/deck-order.md and point to it.\nTry next: ask a teammate to run it on one of their households and note their first question.',
          teachingMoment:
            'Put the slide order in its own file and have the skill point to it, so the main file says what to do and the file shows what it looks like.',
        },
      },
      {
        version: 2,
        daysAgo: 18,
        authorKey: 'hannah',
        changelog:
          "Added references/deck-order.md; capped action items at five after Daniel's review.",
        grade: {
          scores: {
            trigger_clarity: 0.9,
            scope: 0.9,
            progressive_disclosure: 0.9,
            boundary_declaration: 0.9,
            canonical_examples: 0.9,
            tight_context: 0.9,
            sample_cases: 0.85,
          },
          decision: 'pass',
          feedback:
            'What worked: the slide order now lives in its own file and nothing in the main file could be removed without changing the result.\nWhat to change: nothing.\nTry next: publish, then check usage after two weeks.',
        },
        approverKeys: ['daniel'],
      },
    ],
  },
  {
    slug: 'rmd-letter-draft',
    name: 'RMD letter draft',
    triggerLine:
      'Use when a planner needs an RMD letter for a household from the Orion RMD summary row and the firm template.',
    plugin: 'fp-meeting-prep',
    teamSlug: 'fp',
    ownerKey: 'priya',
    status: 'in_review',
    rungRequired: 2,
    workflowFamily: 'rmd-letters',
    workflowKey: 'rmd-letter-drafting',
    authoredBy: 'learner',
    boundary: {
      mayRead: [
        'aggregated_client_summaries',
        'internal_templates',
        'public_regulation',
      ],
      mustNeverReceive: [
        'client_pii_documents',
        'account_numbers',
        'ssn',
        'statements_raw',
      ],
      humanReview: ['before_send', 'before_crm_entry'],
    },
    createdDaysAgo: 6,
    sampleCases: [
      {
        input:
          'RMD letter for the Delgado household: age 76, traditional IRA, required amount 27,310, quarterly method on file.',
        shouldTrigger: 'yes',
        expected:
          'Plain-English letter under one page quoting "about $27,000", confirming the quarterly method, reminding on withholding and the 31 December deadline.',
      },
      {
        input: 'Explain how RMDs work for a client presentation.',
        shouldTrigger: 'no',
        expected:
          'General education, not a client letter; answer in chat without the skill.',
      },
      {
        input:
          'Letter for Mrs Ferreira, inherited IRA from her sister in 2023.',
        shouldTrigger: 'ambiguous',
        expected:
          'Use the inherited-IRA paragraph; do not assert the 10-year rule applies unless the plan notes say so; flag for the planner.',
      },
    ],
    skillMd: `---
name: rmd-letter-draft
description: Draft a Required Minimum Distribution letter for one household from the Orion RMD summary row (household, age, account type, required amount, method on file) and the firm template. Use when a planner asks for an RMD letter or the November batch. Not for general RMD education or tax advice.
---

# RMD letter draft

## When to use
A planner asks for an RMD letter (or a batch of them) and provides, per household: family name, age, account type (traditional or inherited IRA), rounded required amount, and distribution method on file if any.

Not for: explaining RMD rules in general, tax-withholding advice beyond the standard reminder, or any account not in the summary row.

## Inputs
- One summary row per household. If the input includes an account number or statement pages, stop and ask for the summary row only.
- Letter template and paragraph variants: references/letter-template.md (standard, inherited-IRA, already-distributed).

## Steps
1. Pick the variant: inherited-IRA if the account type says so; already-distributed if the row says the amount has been taken.
2. Round the amount to the nearest thousand and write it as "about $27,000".
3. Write the four paragraphs: what an RMD is in one sentence; the household's amount and deadline; the method on file or a recommendation to call; the withholding reminder.
4. Keep under one page, warm and unhurried. Sign off in the advisor's name with "reviewed before sending" as a footer for the planner to remove.

## Output format
Plain prose letter, four paragraphs, no headings, no tables.

## Boundaries
- may_read: aggregated_client_summaries, internal_templates, public_regulation
- must_never_receive: client_pii_documents, account_numbers, ssn, statements_raw
- human_review: before_send (advisor), before_crm_entry (Client Service logs the send).

## Examples
**Example 1: standard.** Delgado, 76, traditional IRA, $27,310, quarterly on file. Output opens "Each year after age 73 the IRS requires a minimum withdrawal from traditional retirement accounts", quotes "about $27,000", confirms the quarterly arrangement, and closes with the deadline and withholding reminder.

**Example 2: inherited IRA.** Ferreira, inherited IRA, $9,850, no method on file. Output uses the inherited paragraph, does not mention the 10-year rule, and asks Mrs Ferreira to call to choose a method.
`,
    versions: [
      {
        version: 1,
        daysAgo: 6,
        authorKey: 'hannah',
        changelog:
          "First draft after the November batch planning session; sample cases from last year's letters.",
      },
    ],
  },
  {
    slug: 'crm-note-cleanup',
    name: 'CRM note cleanup',
    triggerLine:
      'Use when an advisor wants a pasted Salesforce note tidied into the firm format. Retired: client-followup-notes writes the note directly.',
    plugin: 'shared',
    teamSlug: 'shared',
    ownerKey: 'marcus',
    status: 'deprecated',
    rungRequired: 1,
    workflowFamily: 'follow-up',
    workflowKey: 'client-followup',
    authoredBy: 'builder',
    boundary: B.ops,
    createdDaysAgo: 54,
    publishedDaysAgo: 47,
    successorSlug: 'client-followup-notes',
    usageRate: 0.3,
    sampleCases: [
      {
        input: 'Tidy this Salesforce note into our format.',
        shouldTrigger: 'yes',
        expected: 'Summary / Decisions / Actions / Follow-up date.',
      },
      {
        input: 'Prep brief for the Hale meeting.',
        shouldTrigger: 'no',
        expected: 'advisor-meeting-prep.',
      },
      {
        input: 'Write up the Hale meeting.',
        shouldTrigger: 'ambiguous',
        expected:
          'Overlaps with client-followup-notes; this is why the skill was retired.',
      },
    ],
    skillMd: `---
name: crm-note-cleanup
description: RETIRED. Tidy a pasted Salesforce meeting note into the firm format (Summary, Decisions, Actions, Follow-up date). Superseded by client-followup-notes, which writes the Salesforce note from the meeting notes in the first place.
---

# CRM note cleanup (retired)

Use client-followup-notes instead. This skill tidied a note after the fact; the follow-up skill now produces the email and the Salesforce note from the same meeting notes, so there is nothing left to tidy.

## When to use
Do not. Kept for version history.
`,
    versions: [
      {
        version: 1,
        daysAgo: 54,
        authorKey: 'marcus',
        changelog:
          'Builder draft: tidy a pasted Salesforce note into the firm format.',
        grade: {
          scores: {
            trigger_clarity: 0.6,
            scope: 0.65,
            progressive_disclosure: 0.8,
            boundary_declaration: 0.9,
            canonical_examples: 0.7,
            tight_context: 0.8,
            sample_cases: 0.7,
          },
          decision: 'pass',
          feedback:
            'What worked: the boundary is right and the body is short.\nWhat to change: "write up the meeting" also fires client-followup-notes in the advisors\' plugin, so both may answer the same request.\nTry next: agree with Sofia which skill owns post-meeting write-ups.',
          teachingMoment:
            'Two skills that fire on the same phrase make both worse; merge them or give each a different audience.',
        },
        approverKeys: ['sofia'],
      },
      {
        version: 2,
        daysAgo: 20,
        authorKey: 'sofia',
        changelog:
          'Retired in favour of client-followup-notes after usage showed both firing on the same meetings.',
        approverKeys: ['sofia'],
      },
    ],
  },
  {
    slug: 'client-followup-notes',
    name: 'Client follow-up notes',
    triggerLine:
      'Use after a client review meeting when an advisor pastes their notes and wants the follow-up email and the structured Salesforce note.',
    plugin: 'wa-client-comms',
    teamSlug: 'wa',
    ownerKey: 'sofia',
    status: 'published',
    rungRequired: 1,
    workflowFamily: 'follow-up',
    workflowKey: 'client-followup',
    authoredBy: 'champion',
    boundary: B.clientComms,
    createdDaysAgo: 56,
    publishedDaysAgo: 44,
    usageRate: 2.2,
    sampleCases: [
      {
        input:
          'Notes from the Henderson review: discussed the inherited IRA distribution plan, agreed to move to quarterly, they will send the updated beneficiary form. Follow-up please.',
        shouldTrigger: 'yes',
        expected:
          'Three-part email (discussed / agreed / needed from you) plus a structured CRM note with a follow-up date.',
      },
      {
        input: "Draft the proposal for the Hendersons' daughter.",
        shouldTrigger: 'no',
        expected: 'proposal-assembly.',
      },
      {
        input:
          'They asked about our fees; I said we would follow up. Write the email.',
        shouldTrigger: 'ambiguous',
        expected:
          'Draft the non-fee parts; state that fee content is removed and must go through fee-change-comms or Compliance.',
      },
      {
        input:
          'Here is the Zoom transcript of the Henderson meeting, write the follow-up.',
        shouldTrigger: 'yes',
        expected:
          'Work from the transcript but omit anything quoted about performance that the advisor did not clearly state; still three parts.',
      },
    ],
    skillMd: `---
name: client-followup-notes
description: From an advisor's meeting notes, draft the same-day client follow-up email (what we discussed, what we agreed, what we need from you) and the structured Salesforce note. Use right after a review meeting. Not for proposals, fee communications or prep briefs.
---

# Client follow-up summary

## When to use
An advisor has just finished a client review meeting and pastes notes or a transcript. They want two things from one source: the email to the client and the note for Salesforce.

Not for: proposals (proposal-assembly), anything about fees (route to Compliance), or pre-meeting prep.

## Inputs
- The advisor's notes, dictation or transcript.
- Optional: the household name and who attended.
Email tone guide and CRM note format: references/formats.md.

## Steps
1. Extract three lists from the notes: discussed, agreed, needed from the client. Drop small talk.
2. If fees were discussed, remove that content from both outputs and add a one-line flag to the advisor.
3. Quote performance only where the notes show the advisor stated a figure; otherwise say nothing about performance.
4. Write the email: warm opening, the three lists as short paragraphs, a closing that names the next touchpoint.
5. Write the CRM note in the firm format: Summary (two sentences), Decisions, Actions (owner and date), Follow-up date.

## Output format
Two blocks separated by a horizontal rule: "Email" then "Salesforce note". Email under 200 words.

## Boundaries
- may_read: aggregated_client_summaries, internal_templates
- must_never_receive: client_pii_documents, account_numbers, ssn, statements_raw
- human_review: before_send (advisor edits the email), before_crm_entry (advisor pastes the note).

## Examples
**Example 1.** Notes: "Hendersons. Went through the inherited IRA. Agreed quarterly distributions from Jan. They'll send the new beneficiary form. Asked about the grandkids' 529s, said I'd send info." Output email: three short paragraphs, closes with "I will send the 529 information this week." CRM note: Decisions "Quarterly distributions from January"; Actions "Client: beneficiary form (by 30 Sept); Advisor: 529 info (this week)"; Follow-up date next quarter.

**Example 2: fee mention.** Notes include "asked whether our fee drops above $2M". Output omits it from the email and note and adds "Flag: fee question raised; handle via Compliance-approved language" for the advisor.
`,
    versions: [
      {
        version: 1,
        daysAgo: 56,
        authorKey: 'sofia',
        changelog:
          'First draft from the follow-up template Sofia has used for years.',
        grade: {
          scores: {
            trigger_clarity: 0.8,
            scope: 0.8,
            progressive_disclosure: 0.7,
            boundary_declaration: 0.85,
            canonical_examples: 0.8,
            tight_context: 0.7,
            sample_cases: 0.8,
          },
          decision: 'revise',
          feedback:
            'What worked: the three-part structure is exactly what advisors need and the examples are real.\nWhat to change: the firm\'s boundary is repeated three times in the body (say it once under Boundaries), the CRM note format is inline (move it to references/), and the fee-mention rule is missing as a step.\nTry next: add "if fees were discussed, remove that content and flag it" as step 2 and resubmit.',
          teachingMoment:
            'Say the boundary once under Boundaries; repeating it in the body adds length without changing what Claude does.',
        },
      },
      {
        version: 2,
        daysAgo: 50,
        authorKey: 'sofia',
        changelog:
          'Moved formats to references/; added the fee-mention step; single Boundaries section.',
        grade: {
          scores: {
            trigger_clarity: 0.85,
            scope: 0.85,
            progressive_disclosure: 0.9,
            boundary_declaration: 0.9,
            canonical_examples: 0.85,
            tight_context: 0.85,
            sample_cases: 0.85,
          },
          decision: 'pass',
          feedback:
            'What worked: short, specific, and the fee-mention step is now the second thing the skill does.\nWhat to change: nothing.\nTry next: publish and watch the first ten follow-ups for anything the sample requests missed.',
        },
        approverKeys: ['daniel'],
      },
      {
        version: 3,
        daysAgo: 30,
        authorKey: 'sofia',
        changelog:
          'Performance rule made explicit (quote only what the advisor stated) after Compliance feedback.',
        grade: {
          scores: {
            trigger_clarity: 0.85,
            scope: 0.85,
            progressive_disclosure: 0.9,
            boundary_declaration: 0.95,
            canonical_examples: 0.85,
            tight_context: 0.85,
            sample_cases: 0.9,
          },
          decision: 'pass',
          feedback:
            'What worked: the performance rule is precise and one of the sample requests exercises it.\nWhat to change: nothing.\nTry next: none needed.',
        },
        approverKeys: ['daniel'],
      },
      {
        version: 4,
        daysAgo: 12,
        authorKey: 'nathan',
        changelog:
          "Transcript input supported; closing names the next touchpoint (Nathan's suggestion from twenty runs).",
        grade: {
          scores: {
            trigger_clarity: 0.9,
            scope: 0.85,
            progressive_disclosure: 0.9,
            boundary_declaration: 0.95,
            canonical_examples: 0.9,
            tight_context: 0.85,
            sample_cases: 0.9,
          },
          decision: 'pass',
          feedback:
            'What worked: transcripts are handled without loosening the performance rule.\nWhat to change: nothing.\nTry next: none needed.',
        },
        approverKeys: ['daniel'],
      },
    ],
  },
  {
    slug: 'fee-change-comms',
    name: 'Fee-change client letter',
    triggerLine:
      'Use when an advisor needs a fee schedule change letter for a household using the Compliance-approved explanation.',
    plugin: 'wa-client-comms',
    teamSlug: 'wa',
    ownerKey: 'marcus',
    status: 'in_review',
    rungRequired: 2,
    workflowFamily: 'fee-change',
    workflowKey: 'fee-change-comms',
    authoredBy: 'learner',
    boundary: B.feeComms,
    createdDaysAgo: 18,
    sampleCases: [
      {
        input:
          'Fee-change letter for the Park household: moving from tier 2 to tier 3, effective 1 January. Approved explanation attached.',
        shouldTrigger: 'yes',
        expected:
          'Letter with personal opening, approved explanation verbatim, tier change stated, offer of a call, no performance claims.',
      },
      {
        input: 'The Parks asked why fees went up; write a reply.',
        shouldTrigger: 'no',
        expected:
          'Ad hoc fee question: advisor handles with Compliance; skill is for the scheduled change only.',
      },
      {
        input:
          'Letter for the Parks about the fee change; they are on a negotiated rate.',
        shouldTrigger: 'ambiguous',
        expected:
          'Negotiated households are excluded from the batch; tell the advisor to write individually.',
      },
    ],
    skillMd: `---
name: fee-change-comms
description: Draft a fee schedule change letter for one household using the Compliance-approved explanation verbatim, the household's old and new tier, and a personal opening from the advisor. Use only for the approved scheduled change. Not for ad hoc fee questions or negotiated-fee households.
---

# Fee-change client letter

## When to use
Compliance has approved a fee schedule change and issued the explanation text. An advisor names a household with its old and new tier and wants the letter.

Not for: answering a client's fee question, negotiated-fee households (excluded from the batch), or proposals.

## Inputs
- The approved explanation (paste; it must be used unchanged).
- Household name, old tier, new tier, effective date.
- One or two lines from the advisor for the personal opening.
Letter frame: references/fee-letter-frame.md.

## Steps
1. If the household is marked negotiated, stop and say the advisor writes this one individually.
2. Open with the advisor's personal lines.
3. Insert the approved explanation exactly as provided. Do not paraphrase, shorten or add examples.
4. State the household's change in one sentence. If the fee increases, offer a call in the next sentence.
5. Never mention performance, returns or comparisons to other firms.
6. Footer for the advisor: "Compliance spot-check before send."

## Output format
Letter, under one page, approved text set off as its own paragraph.

## Boundaries
- may_read: internal_templates, crm_summary_export
- must_never_receive: client_pii_documents, account_numbers, ssn, statements_raw
- human_review: before_send (advisor, then Compliance spot-check of the batch).

## Examples
**Example 1: increase.** Park household, tier 2 to tier 3 from 1 January. Output: two-line personal opening, the approved paragraph verbatim, "For your household this means moving from our second to our third tier from 1 January," then "I would welcome a call to walk through it."

**Example 2: decrease.** Adeyemi household, tier 3 to tier 2. Output: same frame, no call offer required, closes with thanks.
`,
    versions: [
      {
        version: 1,
        daysAgo: 18,
        authorKey: 'kevin',
        changelog: 'First draft during the fee migration planning.',
        grade: {
          scores: {
            trigger_clarity: 0.85,
            scope: 0.85,
            progressive_disclosure: 0.8,
            boundary_declaration: 0.85,
            canonical_examples: 0.85,
            tight_context: 0.85,
            sample_cases: 0.8,
          },
          decision: 'pass',
          feedback:
            'What worked: the scope is exactly right and "use the approved text word for word" is the correct centre of the skill.\nWhat to change: the letters go to clients about fees, which the firm treats as Compliance-reviewed, so the promotion needs a Compliance approver; add the negotiated-fee household as a sample request.\nTry next: say in the description that the output is Compliance-reviewed so approvers see it at a glance.',
          teachingMoment:
            'Add one line to the description saying the letters are reviewed by Compliance before sending.',
        },
      },
      {
        version: 2,
        daysAgo: 9,
        authorKey: 'kevin',
        changelog:
          'Added negotiated-fee stop step and sample case; Compliance footer.',
        grade: {
          scores: {
            trigger_clarity: 0.9,
            scope: 0.9,
            progressive_disclosure: 0.85,
            boundary_declaration: 0.9,
            canonical_examples: 0.85,
            tight_context: 0.85,
            sample_cases: 0.9,
          },
          decision: 'pass',
          feedback:
            'What worked: the negotiated-fee stop step and the Compliance footer close the two gaps from v1.\nWhat to change: nothing.\nTry next: request promotion; Compliance sign-off is required before merge.',
        },
      },
    ],
  },
  {
    slug: 'proposal-assembly',
    name: 'Proposal assembly',
    triggerLine:
      'Use when an advisor has discovery notes for a prospect and wants the assembled proposal sections, leaving the recommendation to them.',
    plugin: 'wa-client-comms',
    teamSlug: 'wa',
    ownerKey: 'sofia',
    status: 'published',
    rungRequired: 2,
    workflowFamily: 'proposal',
    workflowKey: 'proposal-assembly',
    authoredBy: 'champion',
    boundary: B.clientComms,
    createdDaysAgo: 40,
    publishedDaysAgo: 31,
    usageRate: 0.5,
    sampleCases: [
      {
        input:
          'Discovery notes for the Okonkwo family attached; assemble the proposal.',
        shouldTrigger: 'yes',
        expected:
          "Sections 1, 2, 4, 5 drafted; section 3 (recommendation) left as a labelled placeholder with the notes' key facts listed under it.",
      },
      {
        input: 'Write the recommendation section for the Okonkwo proposal.',
        shouldTrigger: 'no',
        expected:
          "The recommendation is the advisor's; the skill declines and offers to assemble the rest.",
      },
      {
        input: 'The Okonkwos are around $6M. Start the proposal.',
        shouldTrigger: 'ambiguous',
        expected:
          'Above the $5M rule: remind the advisor to route to the senior advisor before drafting, then assemble if confirmed.',
      },
    ],
    skillMd: `---
name: proposal-assembly
description: Assemble a prospect proposal's repeatable sections (who they are, what they told us matters, our approach, fees with approved language, next steps) from an advisor's discovery notes, leaving the recommendation section for the advisor. Use when discovery is done and the advisor wants to propose. Not for writing the recommendation or for existing clients.
---

# Proposal assembly

## When to use
An advisor has discovery notes for a prospect household and wants a first draft of the proposal. The skill assembles every section except the recommendation, which stays with the advisor.

Not for: the recommendation itself, existing-client reviews, or fee deviations (Compliance).

## Inputs
- Discovery notes (the advisor's own words).
- Approved fee language (from references/fee-language.md; do not alter).
Section order and headings: references/proposal-outline.md.

## Steps
1. If assets are above $5M in the notes, remind the advisor of the senior-advisor routing rule before continuing.
2. Section 1, who they are: two paragraphs from the notes; family, situation, what brought them to us.
3. Section 2, what matters to you: their goals and worries as they said them, lightly edited.
4. Section 3, our recommendation: leave a labelled placeholder and list the five facts from the notes most relevant to it.
5. Section 4, how we work and what it costs: our approach paragraph from the outline, then the approved fee language unchanged.
6. Section 5, next steps: three steps with owners.

## Output format
Headed sections in the outline order. Placeholder for section 3 in brackets.

## Boundaries
- may_read: aggregated_client_summaries, internal_templates
- must_never_receive: client_pii_documents, account_numbers, ssn, statements_raw
- human_review: before_send.

## Examples
**Example 1.** Okonkwo family: two physicians, three children, concentrated employer stock, want to retire at 60. Output section 2 reads back their words ("we do not want to think about this every week"); section 3 placeholder lists concentration, retirement age, education funding, tax bracket, liquidity need.

**Example 2.** Retired couple selling a second home. Output section 1 leads with the sale; next steps include "confirm proceeds timing" owned by the client.
`,
    versions: [
      {
        version: 1,
        daysAgo: 40,
        authorKey: 'sofia',
        changelog: "From Sofia's proposal Project.",
        grade: {
          scores: {
            trigger_clarity: 0.85,
            scope: 0.9,
            progressive_disclosure: 0.75,
            boundary_declaration: 0.9,
            canonical_examples: 0.85,
            tight_context: 0.8,
            sample_cases: 0.8,
          },
          decision: 'pass',
          feedback:
            'What worked: leaving the recommendation section to the advisor is the right call and the skill enforces it.\nWhat to change: the fee language is pasted inline; move it to a file so Compliance can update one place.\nTry next: add the $5M routing rule as step 1.',
        },
      },
      {
        version: 2,
        daysAgo: 32,
        authorKey: 'sofia',
        changelog:
          'Fee language moved to references/fee-language.md; $5M routing step added.',
        grade: {
          scores: {
            trigger_clarity: 0.9,
            scope: 0.9,
            progressive_disclosure: 0.9,
            boundary_declaration: 0.9,
            canonical_examples: 0.85,
            tight_context: 0.85,
            sample_cases: 0.85,
          },
          decision: 'pass',
          feedback:
            'What worked: fee language is now in one file and the $5M routing step is first.\nWhat to change: nothing.\nTry next: none needed.',
        },
        approverKeys: ['daniel'],
      },
    ],
  },
  {
    slug: 'ips-refresh-checklist',
    name: 'IPS refresh checklist',
    triggerLine:
      "Use when an advisor lists the changes to a household's IPS at annual refresh and wants the client-facing change summary.",
    plugin: 'wa-client-comms',
    teamSlug: 'wa',
    ownerKey: 'sofia',
    status: 'draft',
    rungRequired: 2,
    workflowFamily: 'ips',
    workflowKey: 'ips-refresh',
    authoredBy: 'learner',
    boundary: B.clientComms,
    createdDaysAgo: 4,
    sampleCases: [
      {
        input:
          'IPS refresh for the Lindgrens: risk band moderate to conservative, added a 24-month liquidity reserve, removed the ESG constraint.',
        shouldTrigger: 'yes',
        expected:
          'Three-change summary in plain English with the "why" from the advisor\'s notes.',
      },
      {
        input: 'Here is the signed IPS PDF, summarise it.',
        shouldTrigger: 'no',
        expected:
          "Signed IPS documents stay in the vault; ask for the advisor's change notes instead.",
      },
    ],
    skillMd: `---
name: ips-refresh-checklist
description: Draft the client-facing summary of changes to a household's Investment Policy Statement from the advisor's change notes. Use at annual refresh when the advisor lists what changed. Never from the IPS document itself.
---

# IPS refresh summary (draft)

## When to use
Annual review produced IPS changes and the advisor has listed them.

## Inputs
- Change list: risk band, constraints, liquidity, anything else, each with a reason.

## Steps
1. One paragraph per change: what it was, what it is now, why.
2. Close with what the client should do (sign the refreshed IPS at the meeting).

## Output format
Short letter.

## Boundaries
- may_read: aggregated_client_summaries, internal_templates
- must_never_receive: client_pii_documents, account_numbers, ssn, statements_raw
- human_review: before_send.

## Examples
(To be added before grading.)
`,
    versions: [
      {
        version: 1,
        daysAgo: 4,
        authorKey: 'kevin',
        changelog: 'Draft; examples and sample cases incomplete.',
      },
    ],
  },
  {
    slug: 'onboarding-packet-qa',
    name: 'Onboarding packet QA',
    triggerLine:
      'Use when Client Service exports a DocuSign envelope inventory for a new household and wants the QA checklist run against it.',
    plugin: 'cso-operations',
    teamSlug: 'cso',
    ownerKey: 'tom',
    status: 'published',
    rungRequired: 1,
    workflowFamily: 'onboarding',
    workflowKey: 'onboarding-packet-qa',
    authoredBy: 'champion',
    boundary: {
      mayRead: ['internal_templates', 'aggregated_client_summaries'],
      mustNeverReceive: [
        'client_pii_documents',
        'account_numbers',
        'ssn',
        'statements_raw',
      ],
      humanReview: ['before_crm_entry'],
    },
    createdDaysAgo: 12,
    publishedDaysAgo: 7,
    usageRate: 1.1,
    sampleCases: [
      {
        input:
          'Envelope inventory for the Marchetti household: 13 documents, names and page counts below. Run QA.',
        shouldTrigger: 'yes',
        expected:
          'Gap list against the 40-item checklist: trust certification missing, beneficiary form page count short by one, two signer statuses incomplete.',
      },
      {
        input: 'Here are the Marchetti documents as PDFs, check them.',
        shouldTrigger: 'no',
        expected:
          'Refuse the documents; ask for the inventory export (names, page counts, signer status) only.',
      },
      {
        input: 'Did the Marchettis finish signing?',
        shouldTrigger: 'ambiguous',
        expected:
          'Signer status is in the inventory; answer that part, offer the full QA if they want it.',
      },
    ],
    skillMd: `---
name: onboarding-packet-qa
description: Run the onboarding QA checklist against a DocuSign envelope inventory (document names, page counts, signer status) for a new household and list gaps and likely defects. Use when Client Service has the inventory export. Never accepts the documents themselves.
---

# Onboarding packet QA

## When to use
A new household's DocuSign envelope is complete or nearly complete and the specialist has exported the inventory: document names, page counts, signer status.

Not for: reading or checking document contents (the specialist does that in SharePoint), or existing-account maintenance forms.

## Inputs
- Inventory export: one row per document with name, pages, signers, status.
- Account types in the packet (individual, joint, IRA, trust).
Checklist: references/qa-checklist.md (40 items, grouped by account type).

## Steps
1. If any input looks like document content (names, SSNs, account numbers), stop and ask for the inventory only.
2. Determine which checklist groups apply from the account types.
3. For each applicable item, mark present, missing or unverifiable-from-inventory.
4. Apply the six known-defect checks: signature page count, beneficiary form present with two pages, trust certification present for any trust account, joint account has both signers complete, IRA has a beneficiary designation, W-9 present.
5. Output the gap list first, then the "open and confirm" list for items the inventory cannot prove.

## Output format
Two lists with checklist item numbers. Packet verdict at the top: Complete, Incomplete, or Hold (trust certification missing).

## Boundaries
- may_read: internal_templates, aggregated_client_summaries
- must_never_receive: client_pii_documents, account_numbers, ssn, statements_raw
- human_review: before_crm_entry (the specialist confirms and records the outcome).

## Examples
**Example 1: hold.** Marchetti: trust account present, no document named "Certification of Trust". Verdict Hold; gap list leads with item 31.

**Example 2: complete with confirmations.** Reyes: all documents present, beneficiary form two pages, both joint signers complete. Verdict Complete; "open and confirm" lists item 12 (beneficiary percentages sum to 100) because the inventory cannot show it.
`,
    versions: [
      {
        version: 1,
        daysAgo: 12,
        authorKey: 'tom',
        changelog:
          'First draft from the intake interview and the QA checklist.',
        grade: {
          scores: {
            trigger_clarity: 0.85,
            scope: 0.85,
            progressive_disclosure: 0.85,
            boundary_declaration: 0.9,
            canonical_examples: 0.85,
            tight_context: 0.85,
            sample_cases: 0.85,
          },
          decision: 'pass',
          feedback:
            'What worked: working from the document inventory instead of the documents is what makes this publishable in Ops at all, and step 1 refuses anything else.\nWhat to change: the output should say which checklist items the inventory cannot prove, so it does not claim more than it knows.\nTry next: add an "open and confirm" list under the gaps.',
          teachingMoment:
            'Add a section to the output for items the skill cannot confirm from its inputs.',
        },
      },
      {
        version: 2,
        daysAgo: 8,
        authorKey: 'tom',
        changelog: 'Added the "open and confirm" list and the Hold verdict.',
        grade: {
          scores: {
            trigger_clarity: 0.9,
            scope: 0.9,
            progressive_disclosure: 0.85,
            boundary_declaration: 0.95,
            canonical_examples: 0.9,
            tight_context: 0.85,
            sample_cases: 0.9,
          },
          decision: 'pass',
          feedback:
            'What worked: the verdict line at the top makes the result usable at a glance, and the "open and confirm" list is honest about what the inventory cannot show.\nWhat to change: nothing.\nTry next: publish and time the first five packets against the baseline.',
        },
        approverKeys: ['daniel'],
      },
    ],
  },
  {
    slug: 'rebalancing-exception-memo',
    name: 'Rebalancing exception memo',
    triggerLine:
      'Use when Operations pastes stripped Orion exception rows and wants the memo explaining why each trade was held or overridden.',
    plugin: 'cso-operations',
    teamSlug: 'cso',
    ownerKey: 'tom',
    status: 'published',
    rungRequired: 2,
    workflowFamily: 'exceptions',
    workflowKey: 'rebalancing-exception-memo',
    authoredBy: 'learner',
    boundary: B.ops,
    createdDaysAgo: 12,
    publishedDaysAgo: 9,
    usageRate: 1.5,
    sampleCases: [
      {
        input:
          "Eight exception rows from this morning's rebalancer run, account numbers stripped. Memos please.",
        shouldTrigger: 'yes',
        expected:
          'One short memo per row: household and model, what the rebalancer wanted, why it was held or overridden, what happens next.',
      },
      {
        input: 'Here is the raw rebalancer output, I skipped the export step.',
        shouldTrigger: 'no',
        expected:
          'Raw output carries account numbers: stop and ask for the stripped export.',
      },
      {
        input:
          'The Okonkwo trade was held because they are mid-transfer. Write it up.',
        shouldTrigger: 'ambiguous',
        expected:
          'One row given in prose; draft the memo but mark the reason as "as reported by Operations" since it is not a rebalancer reason code.',
      },
    ],
    skillMd: `---
name: rebalancing-exception-memo
description: Draft the short memo that explains why a rebalancing trade was held or overridden, from stripped Orion exception rows (household, model, drift, reason code, action taken). Use when Operations has the daily exception export with account numbers removed. Not for raw rebalancer output or for deciding whether to trade.
---

# Rebalancing exception memo

## When to use
The morning rebalancer run has produced exceptions and Operations has exported them with account numbers stripped. Each row needs a memo the advisor can read in thirty seconds.

Not for: raw rebalancer output (it carries account numbers), or deciding whether a trade should go ahead; the memo records a decision Operations already made.

## Inputs
- Exception rows: household, model, drift, reason code, action taken (held / overridden / traded), one line of notes if any.
Reason codes and their plain-English meaning: references/reason-codes.md.

## Steps
1. If any row contains a string that looks like an account number, stop and say the export was not stripped.
2. For each row, write three sentences: what the rebalancer wanted to do; why it was held or overridden, using the reason code's plain-English meaning; what happens next and when it will be looked at again.
3. If the reason is not a reason code (typed by Operations), write it as "as reported by Operations".
4. Refer to accounts as household plus model, never by number.

## Output format
One block per row, headed by household and model. Under 60 words each.

## Boundaries
- may_read: aggregated_client_summaries, internal_templates, crm_summary_export
- must_never_receive: account_numbers, ssn, client_pii_documents, statements_raw
- human_review: before_crm_entry (the analyst pastes the memo into the household record after reading it).

## Examples
**Example 1: held.** Row: Dunn household, Balanced 60/40, drift 6.2%, code TLH (tax-loss window), held. Memo: "The rebalancer proposed trimming equities by about 6% to return to target. The trade was held because the household is inside its tax-loss harvesting window and selling now would realise gains. It will be reviewed at the next run after the window closes on 15 October."

**Example 2: overridden.** Row: Reyes household, Growth 80/20, drift 4.1%, code XFER (transfer in progress), overridden to trade cash only. Memo names the transfer, says only the incoming cash was invested, and gives the date the full rebalance will run.
`,
    versions: [
      {
        version: 1,
        daysAgo: 12,
        authorKey: 'amara',
        changelog:
          'First draft from the exception-memo Project Amara and Jonas built in week one.',
        grade: {
          scores: {
            trigger_clarity: 0.85,
            scope: 0.85,
            progressive_disclosure: 0.85,
            boundary_declaration: 0.9,
            canonical_examples: 0.9,
            tight_context: 0.9,
            sample_cases: 0.85,
          },
          decision: 'pass',
          feedback:
            'What worked: the check for account numbers and the "as reported by Operations" rule are written as steps, not warnings, which is what makes this safe.\nWhat to change: nothing.\nTry next: keep step 1 in every future version; it is the only thing standing between Claude and account numbers.',
        },
        approverKeys: ['tom'],
      },
      {
        version: 2,
        daysAgo: 3,
        authorKey: 'amara',
        changelog:
          'Allow pasting the raw rebalancer output directly to skip the export step.',
        grade: {
          scores: {
            trigger_clarity: 0.85,
            scope: 0.8,
            progressive_disclosure: 0.85,
            boundary_declaration: 0.5,
            canonical_examples: 0.85,
            tight_context: 0.85,
            sample_cases: 0.7,
          },
          decision: 'revise',
          feedback:
            'What worked: the memo steps are unchanged and still good.\nWhat to change: this version invites raw rebalancer output and drops the step-1 check, so account numbers can reach the model while the skill still promises they never will.\nTry next: put the stripped-export step back, or add a check in step 1 that stops on anything resembling an account number, and resubmit.',
          securityFindings: [
            {
              severity: 'high',
              finding:
                'Instructs the user to paste raw rebalancer output, which contains account numbers, and removes the step-1 check.',
            },
          ],
        },
      },
    ],
  },
  {
    slug: 'attestation-summary',
    name: 'Compliance attestation summary',
    triggerLine:
      'Use when Ops has the de-identified quarterly attestation exception export and needs the CCO summary.',
    plugin: 'cso-operations',
    teamSlug: 'cso',
    ownerKey: 'tom',
    status: 'draft',
    rungRequired: 3,
    workflowFamily: 'attestation',
    workflowKey: 'compliance-attestation-summaries',
    authoredBy: 'builder',
    boundary: {
      mayRead: ['aggregated_client_summaries', 'internal_templates'],
      mustNeverReceive: [
        'client_pii_documents',
        'account_numbers',
        'ssn',
        'statements_raw',
      ],
      humanReview: ['before_send'],
    },
    createdDaysAgo: 5,
    sampleCases: [
      {
        input:
          'Q3 attestation exceptions, de-identified export attached. Summary for Margaret.',
        shouldTrigger: 'yes',
        expected:
          'Counts by theme, top three themes with one-line descriptions, open follow-ups by staff id.',
      },
      {
        input: 'Who missed their attestation this quarter?',
        shouldTrigger: 'no',
        expected:
          'Naming individuals is a Compliance function; not this skill.',
      },
    ],
    skillMd: `---
name: attestation-summary
description: Draft the quarterly attestation exception summary for the CCO from a de-identified export (staff ids, exception type, status). Use when the attestation window has closed and Ops has run the de-identification. Builder draft; not yet graded.
---

# Compliance attestation summary (draft)

## When to use
Attestation window closed; export de-identified to staff ids.

## Inputs
- Exception rows: staff id, exception type, date, status.

## Steps
1. Count exceptions by type.
2. Describe the top three themes in one line each.
3. List open follow-ups by staff id and age.
4. Do not infer names, teams or reasons not in the export.

## Output format
One page: counts table, themes, open items.

## Boundaries
- may_read: aggregated_client_summaries, internal_templates
- must_never_receive: client_pii_documents, account_numbers, ssn, statements_raw
- human_review: before_send (CCO).

## Examples
(Builder confidence 0.42: the export format was not confirmed in the interview.)
`,
    versions: [
      {
        version: 1,
        daysAgo: 5,
        authorKey: 'tom',
        changelog:
          'Builder draft from an incomplete workflow map; escalated for lead review.',
      },
    ],
  },
];

// ───────────────────────────────────────── library relations ─────────────────────────────────────────

export const DEMO_ADOPTIONS: {
  skillSlug: string;
  personKey: string;
  daysAgo: number;
}[] = [
  { skillSlug: 'advisor-meeting-prep', personKey: 'priya', daysAgo: 40 },
  { skillSlug: 'advisor-meeting-prep', personKey: 'hannah', daysAgo: 38 },
  { skillSlug: 'advisor-meeting-prep', personKey: 'grace', daysAgo: 30 },
  { skillSlug: 'advisor-meeting-prep', personKey: 'rajesh', daysAgo: 45 },
  { skillSlug: 'annual-review-deck-outline', personKey: 'priya', daysAgo: 15 },
  { skillSlug: 'annual-review-deck-outline', personKey: 'grace', daysAgo: 10 },
  { skillSlug: 'client-followup-notes', personKey: 'marcus', daysAgo: 8 },
  { skillSlug: 'client-followup-notes', personKey: 'nathan', daysAgo: 40 },
  { skillSlug: 'client-followup-notes', personKey: 'isabelle', daysAgo: 35 },
  { skillSlug: 'client-followup-notes', personKey: 'kevin', daysAgo: 42 },
  { skillSlug: 'client-followup-notes', personKey: 'priya', daysAgo: 20 },
  { skillSlug: 'proposal-assembly', personKey: 'kevin', daysAgo: 28 },
  { skillSlug: 'proposal-assembly', personKey: 'nathan', daysAgo: 25 },
  { skillSlug: 'proposal-assembly', personKey: 'isabelle', daysAgo: 20 },
  { skillSlug: 'onboarding-packet-qa', personKey: 'megan', daysAgo: 6 },
  { skillSlug: 'onboarding-packet-qa', personKey: 'jonas', daysAgo: 5 },
  { skillSlug: 'rebalancing-exception-memo', personKey: 'tom', daysAgo: 8 },
  { skillSlug: 'rebalancing-exception-memo', personKey: 'megan', daysAgo: 7 },
  { skillSlug: 'rebalancing-exception-memo', personKey: 'jonas', daysAgo: 8 },
  { skillSlug: 'crm-note-cleanup', personKey: 'nathan', daysAgo: 45 },
];

export const DEMO_ASSIGNMENTS: {
  plugin: string;
  teamSlug: string;
  intendedMode: AssignmentMode;
  observedMode: AssignmentMode | null;
  observedDaysAgo: number;
}[] = [
  {
    plugin: 'fp-meeting-prep',
    teamSlug: 'fp',
    intendedMode: 'auto',
    observedMode: 'auto',
    observedDaysAgo: 1,
  },
  {
    plugin: 'wa-client-comms',
    teamSlug: 'wa',
    intendedMode: 'available',
    observedMode: 'available',
    observedDaysAgo: 1,
  },
  {
    plugin: 'wa-client-comms',
    teamSlug: 'fp',
    intendedMode: 'available',
    observedMode: 'available',
    observedDaysAgo: 1,
  },
  {
    plugin: 'cso-operations',
    teamSlug: 'cso',
    intendedMode: 'auto',
    observedMode: 'available',
    observedDaysAgo: 1,
  },
];

export const DEMO_COMMENTS: {
  skillSlug: string;
  personKey: string;
  body: string;
  kind: 'feedback' | 'grader' | 'system';
  daysAgo: number;
}[] = [
  {
    skillSlug: 'advisor-meeting-prep',
    personKey: 'priya',
    body: 'Section 2 should say whether an RMD method is on file, not just the amount. Advisors keep asking me. Proposed in v3.',
    kind: 'feedback',
    daysAgo: 23,
  },
  {
    skillSlug: 'advisor-meeting-prep',
    personKey: 'grace',
    body: 'Works well for my two advisors. One thing: when the Orion page is more than a month old it should say so louder. It does now, but only in section 2.',
    kind: 'feedback',
    daysAgo: 14,
  },
  {
    skillSlug: 'client-followup-notes',
    personKey: 'nathan',
    body: 'After about twenty runs: the email closing was always generic. Suggest it name the next touchpoint from the notes. Sofia let me ship that as v4.',
    kind: 'feedback',
    daysAgo: 13,
  },
  {
    skillSlug: 'rebalancing-exception-memo',
    personKey: 'tom',
    body: 'Sending v2 back. Pasting the raw rebalancer output is the convenience everyone wants and exactly the thing we cannot allow: it carries account numbers. Happy to look at a check inside the skill instead.',
    kind: 'feedback',
    daysAgo: 3,
  },
  {
    skillSlug: 'rebalancing-exception-memo',
    personKey: 'amara',
    body: 'Grader security review on v2: high severity, invites raw rebalancer output with account numbers. Decision: revise.',
    kind: 'grader',
    daysAgo: 3,
  },
  {
    skillSlug: 'crm-note-cleanup',
    personKey: 'sofia',
    body: 'Retired. This tidied a Salesforce note after the fact; client-followup-notes now writes the note from the meeting notes in the first place, so both were answering the same request.',
    kind: 'system',
    daysAgo: 20,
  },
];

export const DEMO_PROMOTIONS: DemoPromotion[] = [
  {
    key: 'pr-meeting-prep-v3',
    skillSlug: 'advisor-meeting-prep',
    version: 3,
    requestedByKey: 'priya',
    prNumber: 14,
    createdDaysAgo: 21,
    decision: 'merged',
    decidedDaysAgo: 20,
    highExposure: false,
    requiredApproverRoles: ['champion'],
    boundaryCheck: {
      ok: true,
      touchesRestrictedClasses: [],
      missingDeclarations: [],
      humanReviewRequired: true,
      notes:
        'Boundary unchanged from v2; review point before_client_meeting declared.',
    },
    diffSummary: {
      filesChanged: 3,
      additions: 18,
      deletions: 4,
      summary:
        'RMD method line in section 2; overdue flag on open items; two sample cases updated.',
    },
    approvals: [
      {
        personKey: 'sofia',
        role: 'champion',
        decision: 'approve',
        note: 'Follows the workflow decision rules Daniel verified. Approving as cross-team champion since Daniel owns the skill.',
        daysAgo: 20,
      },
    ],
    testResults:
      '4/4 sample cases judged consistent with expected behaviour. Security review: no findings.',
  },
  {
    key: 'pr-followup-v4',
    skillSlug: 'client-followup-notes',
    version: 4,
    requestedByKey: 'nathan',
    prNumber: 19,
    createdDaysAgo: 12,
    decision: 'merged',
    decidedDaysAgo: 11,
    highExposure: false,
    requiredApproverRoles: ['champion'],
    boundaryCheck: {
      ok: true,
      touchesRestrictedClasses: [],
      missingDeclarations: [],
      humanReviewRequired: true,
      notes:
        "Transcript input is the advisor's own recording; performance rule retained.",
    },
    diffSummary: {
      filesChanged: 2,
      additions: 11,
      deletions: 3,
      summary: 'Transcript input; closing names next touchpoint.',
    },
    approvals: [
      {
        personKey: 'daniel',
        role: 'champion',
        decision: 'approve',
        note: 'Small, evidence-based change from a heavy user. Approve.',
        daysAgo: 11,
      },
    ],
    testResults: '4/4 sample cases consistent. Security review: no findings.',
  },
  {
    key: 'pr-onboarding-v2',
    skillSlug: 'onboarding-packet-qa',
    version: 2,
    requestedByKey: 'tom',
    prNumber: 22,
    createdDaysAgo: 8,
    decision: 'merged',
    decidedDaysAgo: 7,
    highExposure: false,
    requiredApproverRoles: ['champion'],
    boundaryCheck: {
      ok: true,
      touchesRestrictedClasses: [],
      missingDeclarations: [],
      humanReviewRequired: true,
      notes: 'Inventory-only input; step 1 refuses document content.',
    },
    diffSummary: {
      filesChanged: 2,
      additions: 14,
      deletions: 2,
      summary: 'Hold verdict; open-and-confirm list.',
    },
    approvals: [
      {
        personKey: 'daniel',
        role: 'champion',
        decision: 'approve',
        note: 'Tom cannot approve his own skill; reviewed the inventory-only design and the stop step. Approve.',
        daysAgo: 7,
      },
    ],
    testResults: '3/3 sample cases consistent. Security review: no findings.',
  },
  {
    key: 'pr-rmd-v1',
    skillSlug: 'rmd-letter-draft',
    version: 1,
    requestedByKey: 'hannah',
    prNumber: 25,
    createdDaysAgo: 5,
    decision: 'pending',
    highExposure: false,
    requiredApproverRoles: ['champion'],
    boundaryCheck: {
      ok: true,
      touchesRestrictedClasses: [],
      missingDeclarations: [],
      humanReviewRequired: true,
      notes: 'Declares before_send and before_crm_entry, matching the RMD SOP.',
    },
    diffSummary: {
      filesChanged: 3,
      additions: 96,
      deletions: 0,
      summary: 'New skill: RMD letter draft with three template variants.',
    },
    approvals: [],
    testResults: "Awaiting Grader (submission in Daniel's review queue).",
  },
  {
    key: 'pr-fee-v2',
    skillSlug: 'fee-change-comms',
    version: 2,
    requestedByKey: 'kevin',
    prNumber: 23,
    createdDaysAgo: 8,
    decision: 'pending',
    highExposure: true,
    requiredApproverRoles: ['champion', 'compliance'],
    boundaryCheck: {
      ok: true,
      touchesRestrictedClasses: [],
      missingDeclarations: [],
      humanReviewRequired: true,
      notes:
        'No restricted input classes, but output is a client fee communication; firm policy requires Compliance approval. Flagged high exposure.',
    },
    diffSummary: {
      filesChanged: 3,
      additions: 22,
      deletions: 5,
      summary:
        'Negotiated-fee stop step; Compliance footer; sample case added.',
    },
    approvals: [
      {
        personKey: 'sofia',
        role: 'champion',
        decision: 'approve',
        note: 'Approved on the advisory side. Needs Margaret (Compliance) before merge.',
        daysAgo: 6,
      },
    ],
    testResults:
      '3/3 sample cases consistent. Security review: no findings. Compliance approval outstanding.',
  },
  {
    key: 'pr-crm-v2',
    skillSlug: 'rebalancing-exception-memo',
    version: 2,
    requestedByKey: 'amara',
    prNumber: 26,
    createdDaysAgo: 3,
    decision: 'sent_back',
    decidedDaysAgo: 3,
    highExposure: true,
    requiredApproverRoles: ['champion', 'compliance'],
    boundaryCheck: {
      ok: false,
      touchesRestrictedClasses: ['account_numbers', 'ssn'],
      missingDeclarations: [],
      humanReviewRequired: true,
      notes:
        'Steps invite raw rebalancer output; the declaration says must_never_receive account_numbers. Steps do not honour the declaration.',
    },
    diffSummary: {
      filesChanged: 1,
      additions: 6,
      deletions: 9,
      summary: 'Removed the stripped-export prerequisite and the step-1 check.',
    },
    approvals: [
      {
        personKey: 'tom',
        role: 'champion',
        decision: 'send_back',
        note: 'The stripped export is the control. Put it back, or build a check into step 1 that stops on anything resembling an account number, and resubmit.',
        daysAgo: 3,
      },
    ],
    testResults:
      '2/3 sample cases consistent. Security review: 1 high finding.',
  },
];

// ───────────────────────────────────────── learning history ─────────────────────────────────────────

const HALE_SUMMARY =
  'Salesforce summary: Hale household, review Wed 10:00, attendees Robert and Joan Hale, advisor Lang. Last meeting (June): discussed Roth conversion, agreed to revisit in Q4; open item: update beneficiary on Roth. Orion summary: allocation 62/35/3 vs target 60/35/5, YTD +6.1%, cash $41k vs $60k target, RMD due 2026: $38,400, monthly method on file. eMoney: plan updated 12 Aug, open item: confirm 2027 travel budget.';

export const DEMO_EXERCISES: DemoExercise[] = [
  // ───── Priya (L2) ─────
  {
    key: 'priya-cd-memo-cover',
    personKey: 'priya',
    rung: 1,
    competencyCodes: ['L1.description', 'L1.discernment'],
    title: 'Draft the Ortiz CD memo cover note',
    brief:
      'For your CD memos, write the prompt that gets Claude to draft the one-paragraph cover note for the Ortiz plan change.',
    rationale:
      'You write three or four CD memos a month and the cover note is the part you rewrite most.',
    kind: 'artifact',
    mode: 'in_app',
    workSurface: 'prompt',
    contextTag: 'cd-memo',
    workflowKey: 'cd-memo-drafting',
    hints: [
      'Say who reads the note and what they decide from it.',
      'Give only the two numbers that changed, not the whole plan summary.',
      'Ask for one paragraph under 80 words, no bullets.',
    ],
    status: 'passed',
    estimatedMinutes: 15,
    completedDaysAgo: 58,
    createdDaysAgo: 60,
    generatedBy: 'coach',
    hintsRevealed: 1,
    submissions: [
      {
        attempt: 1,
        daysAgo: 58,
        expectationText:
          'Good enough if Daniel can see what changed and why in ten seconds.',
        expectationConfidence: 0.6,
        coldAttempt: true,
        artifact: {
          type: 'prompt_run',
          content:
            "You are drafting the cover note for a Change of Direction memo at a wealth management firm. Reader: the Director of Planning, who decides in ten seconds whether to read the full memo. Household: Ortiz. Change: target allocation moved from 60/40 to 50/50 after the June review, at the clients' request following retirement of Mr Ortiz. Write one paragraph, under 80 words, no bullets, plain and direct. State what changed, why, and what the director needs to check.",
          output:
            "The Ortiz household's target allocation has moved from 60/40 to 50/50 following Mr Ortiz's retirement, at the clients' request during the June review. The change reduces equity exposure ahead of drawdown beginning in 2027. Please confirm the revised withdrawal assumptions in eMoney reflect the new allocation and that the IPS refresh is scheduled for the annual review.",
        },
        critiqueText:
          'It added a reason I never gave it (equity exposure ahead of drawdown). True here, but I should state the reason myself.',
        grade: {
          daysAgo: 58,
          scores: { goal: 0.85, format: 0.85, context: 0.8, vocabulary: 0.8 },
          decision: 'pass',
          critiqueQuality: 0.75,
          feedback:
            'What worked: you said who reads the note and what they decide from it, so the draft is short and usable.\nWhat to change: Claude made up the reason for the change; the reason should come from you.\nTry next: add one line starting "The reason for the change is" before you run it.',
          teachingMoment:
            'Write the reason for the change into the prompt so Claude does not have to guess it.',
        },
      },
    ],
  },
  {
    key: 'priya-rmd-batch-summary',
    personKey: 'priya',
    rung: 1,
    competencyCodes: ['L1.delegation', 'L1.diligence'],
    title: 'Draft one RMD letter from a summary row',
    brief:
      'For your RMD letters, write the prompt that drafts the Delgado letter from its summary row, then check the draft against the SOP.',
    rationale:
      'RMD letters are your biggest single week of work and they quote a dollar figure to a client.',
    kind: 'artifact',
    mode: 'in_app',
    workSurface: 'prompt',
    contextTag: 'rmd-letters',
    workflowKey: 'rmd-letter-drafting',
    hints: [
      'Tell Claude the rounding rule once instead of checking it 118 times.',
      'Give only household, age, account type, amount and method; never an account number.',
      'Check every figure in the draft against the row before you call it done.',
    ],
    status: 'passed',
    estimatedMinutes: 20,
    completedDaysAgo: 52,
    createdDaysAgo: 54,
    generatedBy: 'coach',
    hintsRevealed: 0,
    submissions: [
      {
        attempt: 1,
        daysAgo: 52,
        expectationText:
          'Good enough if the amount, deadline and method are right and it reads warmly.',
        expectationConfidence: 0.7,
        coldAttempt: true,
        artifact: {
          type: 'prompt_run',
          content:
            'Draft an RMD letter for the Delgado household using our template rules. Age 76, traditional IRA, required amount 27,310, quarterly distribution method on file. Round to the nearest thousand and write it as "about $27,000". Four paragraphs: what an RMD is in one sentence; their amount and the 31 December deadline; confirm the quarterly method; withholding reminder. Warm, plain English, under one page, no headings. You will not be given account numbers; refer to the account as the Delgado IRA.',
          output:
            'Dear Mr and Mrs Delgado,\n\nEach year after age 73 the IRS requires a minimum withdrawal from traditional retirement accounts, called a required minimum distribution.\n\nFor 2026 your required amount is about $27,000, and it must be withdrawn by 31 December.\n\nYou already receive quarterly distributions, which will satisfy this requirement with no action needed on your part.\n\nAs a reminder, federal tax withholding applies to these withdrawals; please call us if you would like to review the rate.\n\nWarm regards,',
        },
        critiqueText:
          'Amount and deadline right. One sentence says the quarterly payments will satisfy the amount, which I cannot know from the row.',
        grade: {
          daysAgo: 52,
          scores: {
            split: 0.9,
            kept: 0.9,
            explicit: 0.85,
            verified: 0.85,
            review: 0.85,
            ownership: 0.8,
          },
          decision: 'pass',
          critiqueQuality: 0.85,
          feedback:
            'What worked: the prompt carries the template rules and gives Claude only the five facts it needs, so the letter is right on amount and deadline.\nWhat to change: the third paragraph promises the quarterly payments cover the amount, which the row does not say; change it to "are set up to cover".\nTry next: add "do not say the payments will satisfy the amount unless I tell you so" and run it again.',
        },
      },
    ],
  },
  {
    key: 'priya-agenda-from-crm',
    personKey: 'priya',
    rung: 1,
    competencyCodes: ['L1.description', 'L1.discernment'],
    title: 'Write the Hale meeting agenda from the summary',
    brief:
      'For your Monday meeting prep, write the prompt that produces the agenda section of the Hale brief from the Salesforce and Orion summaries.',
    rationale:
      'You write ten of these a week; if Claude can draft the agenda reliably, Monday morning gets shorter.',
    kind: 'artifact',
    mode: 'in_app',
    workSurface: 'prompt',
    contextTag: 'meeting-prep',
    workflowKey: 'monday-meeting-prep',
    hints: [
      'Say how many items you want and what order they go in.',
      'Tell Claude the beneficiary item has been open since June; it cannot work that out.',
      'State the RMD amount and that a method is on file.',
    ],
    status: 'passed',
    estimatedMinutes: 15,
    completedDaysAgo: 44,
    createdDaysAgo: 48,
    generatedBy: 'coach',
    hintsRevealed: 2,
    submissions: [
      {
        attempt: 1,
        daysAgo: 47,
        expectationText:
          'Good enough if the agenda has the right items for the Hales.',
        expectationConfidence: 0.85,
        coldAttempt: true,
        artifact: {
          type: 'prompt_run',
          content:
            'Here is the client summary. Write an agenda for the meeting.\n\n' +
            HALE_SUMMARY,
          output:
            '1. Review portfolio performance year to date\n2. Discuss current allocation and rebalancing\n3. Review cash position\n4. Discuss Roth conversion strategy\n5. Review financial plan progress\n6. Discuss beneficiary designations\n7. Questions and next steps',
        },
        critiqueText:
          "Every item could be on any household's agenda. No RMD line, and the June beneficiary item is buried at number six.",
        grade: {
          daysAgo: 47,
          scores: { goal: 0.5, format: 0.5, context: 0.7, vocabulary: 0.6 },
          decision: 'revise',
          critiqueQuality: 0.8,
          feedback:
            'What worked: you pasted the right summaries, so every fact Claude needed was there.\nWhat to change: "write an agenda" gave Claude no idea what belongs on this one, so it wrote a generic list with no RMD line and the June item at the bottom.\nTry next: add three rules to the prompt: 3–5 items, open items from last meeting first, name anything due this year.',
          teachingMoment:
            'Add "open items from the last meeting come first" to the prompt and run it again.',
        },
      },
      {
        attempt: 2,
        daysAgo: 44,
        expectationText:
          'Good enough if the June items are first and the RMD line is there.',
        expectationConfidence: 0.65,
        coldAttempt: false,
        artifact: {
          type: 'prompt_run',
          content:
            'Write the "Suggested agenda" section of a one-page prep brief for advisor Lang\'s Wednesday review with the Hale household. Rules: 3–5 items; open items from the last meeting come first and are marked as open since June; if an RMD is due this year, one item names the rounded amount and whether a method is on file; reference accounts as household + type (Hale IRA), never by number; one line per item, no sub-bullets.\n\nSummary:\n' +
            HALE_SUMMARY,
          output:
            'Suggested agenda\n1. Open since June: update beneficiary on the Hale Roth.\n2. Open since June: revisit Roth conversion for Q4 (plan updated 12 Aug).\n3. RMD due this year: about $38,000 from the Hale IRA; monthly method on file.\n4. Cash at $41k vs $60k target; confirm the 2027 travel budget assumption.\n5. Allocation slightly overweight equities (62 vs 60); no action unless the Hales want to rebalance.',
        },
        critiqueText:
          "This is the agenda I would have written. Item 5 makes the advisor's call for them; I would cut that half-line.",
        grade: {
          daysAgo: 44,
          scores: { goal: 0.9, format: 0.85, context: 0.85, vocabulary: 0.85 },
          decision: 'pass',
          critiqueQuality: 0.8,
          feedback:
            'What worked: the three rules turned a generic list into the agenda you would have written yourself.\nWhat to change: item 5 decides for the advisor ("no action unless"); cut everything after the semicolon.\nTry next: add "do not recommend actions; the advisor decides" so the next brief stops there on its own.',
        },
      },
    ],
  },
  {
    key: 'priya-annual-review-talking-points',
    personKey: 'priya',
    rung: 1,
    competencyCodes: ['L1.discernment', 'L1.diligence'],
    title: 'Check the Brennan review talking points',
    brief:
      'For your annual review decks, run your talking-points prompt for the Brennans and check every figure against the eMoney and Orion summaries.',
    rationale:
      'Your last two tasks were strong on the prompt; this one is about the check you do before an advisor presents the result.',
    kind: 'artifact',
    mode: 'in_app',
    workSurface: 'prompt',
    contextTag: 'annual-review',
    workflowKey: 'annual-review-deck',
    hints: [
      'Any figure without a source line is "not in source", even if it sounds right.',
      'Funded ratio and probability of success are different numbers; check Claude kept them apart.',
      'Ask yourself what the advisor would say if a client challenged the figure.',
    ],
    status: 'passed',
    estimatedMinutes: 20,
    completedDaysAgo: 38,
    createdDaysAgo: 40,
    generatedBy: 'coach',
    hintsRevealed: 0,
    submissions: [
      {
        attempt: 1,
        daysAgo: 38,
        expectationText:
          'Good enough if every figure traces back to the two summaries.',
        expectationConfidence: 0.7,
        coldAttempt: true,
        artifact: {
          type: 'prompt_run',
          content:
            'Draft five talking points for the Brennan annual review from these summaries. Each point: one sentence the advisor can say, plus the figure it relies on in brackets. eMoney: funded ratio 104%, probability of success 88%, goals on track: retirement, education; off track: none. Orion: allocation 58/38/4 vs target 60/35/5, YTD +5.4%, cash $72k vs $50k target.',
          output:
            "1. You remain fully funded for your goals, with a small cushion [funded ratio 104%].\n2. The plan's probability of success is strong and unchanged from last year [88%].\n3. Your allocation is within a couple of points of target; no changes proposed [58/38/4 vs 60/35/5].\n4. Returns this year have been solid [+5.4% YTD].\n5. Cash is running above target; we could put about $20k to work [$72k vs $50k].",
        },
        critiqueText:
          'Confirmed 1, 3, 4, 5. Point 2 says "unchanged from last year"; I only gave it this year.',
        grade: {
          daysAgo: 38,
          scores: {
            prediction: 0.85,
            real_issues: 0.9,
            actionable: 0.85,
            calibration: 0.85,
            verified: 0.9,
            review: 0.85,
            ownership: 0.85,
          },
          decision: 'pass',
          critiqueQuality: 0.9,
          feedback:
            'What worked: you traced every figure to its source and caught the one comparison that came from nowhere.\nWhat to change: point 2 claims "unchanged from last year" with no last-year figure; delete the comparison or give Claude last year\'s number.\nTry next: end your prompt with "use only the figures above; do not compare to periods I have not given you".',
        },
      },
    ],
  },
  {
    key: 'priya-project-meeting-prep-v1',
    personKey: 'priya',
    rung: 2,
    competencyCodes: ['L2.selection', 'L2.project_design'],
    title: 'Set up a Project for Monday meeting prep',
    brief:
      'For your Monday meeting prep, set up a Project with your standing rules in the instructions and only the files every brief needs, then run it for one household.',
    rationale:
      'You run Monday prep every week for three advisors; a Project means each brief starts from your rules instead of a blank page.',
    kind: 'artifact',
    mode: 'in_app',
    workSurface: 'project',
    contextTag: 'meeting-prep',
    workflowKey: 'monday-meeting-prep',
    hints: [
      'What do you retype every Monday? That goes in the instructions.',
      'The SOP is four pages; add only the paragraphs that change how the brief is written.',
      "Leave last week's household summaries out; next week's brief must never see them.",
    ],
    status: 'passed',
    estimatedMinutes: 40,
    completedDaysAgo: 27,
    createdDaysAgo: 30,
    generatedBy: 'coach',
    hintsRevealed: 1,
    submissions: [
      {
        attempt: 1,
        daysAgo: 27,
        expectationText:
          'Good enough if the first run gives me a brief I could send after light edits.',
        expectationConfidence: 0.75,
        coldAttempt: true,
        artifact: {
          type: 'project',
          content:
            'PROJECT INSTRUCTIONS\nYou draft one-page Monday prep briefs for client review meetings at Meridian, for advisors Lang, Alvarez and Osei. I will paste the Salesforce meeting summary, the Orion household page and the eMoney open items for one household; you produce the brief.\nAlways: five sections in the template order; open items oldest first with the meeting they came from; RMD line if due this year (rounded, method on file yes/no); accounts as household + type, never numbers; one page; end with "Prepared for [advisor]; review before the meeting."\nNever: use anything from a previous household in this Project; report stale Orion data as current (say the refresh date instead); enter or suggest entering the brief into Salesforce.',
          files: [
            {
              name: 'brief-template.md',
              content:
                'The five-section template with one example line per section.',
            },
            {
              name: 'sop-excerpt-brief-structure.md',
              content:
                'Paragraphs "Brief structure", "Never in the brief" and "Review" from the Confluence SOP.',
            },
            {
              name: 'example-brief-hale.md',
              content:
                'A finished Hale brief from last month, with figures replaced by placeholders.',
            },
          ],
          rationale:
            "Included: the template (used every run), the three SOP paragraphs that change the writing (structure, never-list, review), and one example brief so Claude sees the register. Excluded: the rest of the SOP (timing and inputs are my job, not Claude's), all household summaries (they change weekly and mixing households is the failure I fear most), and the RMD SOP (different workflow; it would tempt Claude to write letter language into a brief).",
        },
        critiqueText:
          'Close to sendable. The example brief made it copy the same agenda phrasing, and I want the "older than two meetings" flag in the instructions.',
        grade: {
          daysAgo: 27,
          scores: {
            included: 0.85,
            excluded: 0.9,
            tight: 0.8,
            rationale: 0.9,
            instructions: 0.85,
            run_pattern: 0.85,
            improvement: 0.8,
            maintainable: 0.75,
          },
          decision: 'pass',
          critiqueQuality: 0.8,
          feedback:
            'What worked: the instructions carry every rule you used to retype, and keeping household summaries out means one brief can never bleed into the next.\nWhat to change: the full example brief makes every new brief echo its wording; replace it with two short fragments that show the format.\nTry next: put a date in each file name so you can see at a glance when something is stale.',
        },
      },
    ],
  },
  {
    key: 'priya-project-rmd',
    personKey: 'priya',
    rung: 2,
    competencyCodes: ['L2.selection'],
    title: 'Set up a Project for RMD letters',
    brief:
      "For your RMD letters, set up a Project and decide which of the template, the SOP, the IRS page, last year's letters and the Orion export belong in it.",
    rationale:
      'RMD letters go to clients and quote a figure, so what you put in the Project matters even more than for briefs.',
    kind: 'artifact',
    mode: 'in_app',
    workSurface: 'project',
    contextTag: 'rmd-letters',
    workflowKey: 'rmd-letter-drafting',
    hints: [
      'Which of these does Claude need to write a letter, and which do you need to check one?',
      "Last year's letters contain names and amounts; keep them out.",
      'The IRS page is 40 pages; the letter relies on two paragraphs.',
    ],
    status: 'passed',
    estimatedMinutes: 30,
    completedDaysAgo: 16,
    createdDaysAgo: 19,
    generatedBy: 'coach',
    hintsRevealed: 0,
    submissions: [
      {
        attempt: 1,
        daysAgo: 16,
        expectationText:
          'Good enough if the letters come out plain and short without me trimming them.',
        expectationConfidence: 0.8,
        coldAttempt: true,
        artifact: {
          type: 'project',
          content:
            'PROJECT INSTRUCTIONS\nYou draft RMD letters for Meridian planning from a single summary row I paste: household, age, account type, rounded required amount, method on file. Four paragraphs, plain English, warm, under one page, no headings. Round to nearest thousand as "about $X". Use the inherited-IRA paragraph when the row says inherited. Never mention the 10-year rule unless I say it applies. Footer: "Reviewed by advisor before sending".',
          files: [
            {
              name: 'letter-template-2026.md',
              content:
                'Standard, inherited-IRA and already-distributed variants.',
            },
            {
              name: 'irs-rmd-two-paragraphs-2026.md',
              content:
                'The two paragraphs from the IRS RMD page on the age-73 start and the 31 December deadline.',
            },
          ],
          rationale:
            "Included: the template with its three variants (every run), and two paragraphs from the IRS page so the one-sentence explanation is correct this year. Excluded: the SOP (timing and review are mine), last year's letters (they contain household names and amounts, and I do not want last year's amounts anywhere near this year's letters), the full Orion export (I paste one row per run; the export is the thing that must never be uploaded).",
        },
        critiqueText:
          'Letters came out plain and short. I had to add the 10-year-rule line after the first inherited-IRA run; the template alone did not stop it.',
        grade: {
          daysAgo: 16,
          scores: {
            included: 0.9,
            excluded: 0.95,
            tight: 0.9,
            rationale: 0.85,
          },
          decision: 'pass',
          critiqueQuality: 0.8,
          feedback:
            "What worked: two IRS paragraphs instead of forty pages, and last year's letters kept out so old amounts cannot leak into new ones.\nWhat to change: nothing structural; the 10-year-rule line you added after the first run belongs in the instructions from day one.\nTry next: run one inherited-IRA row and one already-distributed row back to back to check both variants pick correctly.",
        },
      },
    ],
  },
  {
    key: 'priya-project-annual-review',
    personKey: 'priya',
    rung: 2,
    competencyCodes: ['L2.project_design', 'L2.selection'],
    title: "Set up a deck Project using Hannah's skill",
    brief:
      "For your annual review decks, set up a Project that uses Hannah's deck-outline skill and adds only what it does not know: your advisors' preferences and the chart list.",
    rationale:
      "Building on a teammate's skill instead of copying it is the fastest route to sharing your own work later.",
    kind: 'artifact',
    mode: 'in_app',
    workSurface: 'project',
    contextTag: 'annual-review',
    workflowKey: 'annual-review-deck',
    skillSlug: 'annual-review-deck-outline',
    hints: [
      'Anything the skill already does should not be repeated in your instructions.',
      'Advisor preferences change rarely; put them in a file.',
      "Per run, paste only the two summaries and last year's action items.",
    ],
    status: 'passed',
    estimatedMinutes: 35,
    completedDaysAgo: 7,
    createdDaysAgo: 10,
    generatedBy: 'coach',
    hintsRevealed: 0,
    submissions: [
      {
        attempt: 1,
        daysAgo: 7,
        expectationText:
          'Good enough if the Kowalski outline comes out with my three advisor tweaks applied.',
        expectationConfidence: 0.7,
        coldAttempt: true,
        artifact: {
          type: 'project',
          content:
            "PROJECT INSTRUCTIONS\nUse the annual-review-deck-outline skill for outline and narrative. After it runs, apply the advisor preferences in advisor-prefs.md (Lang: no probability-of-success slide; Alvarez: cash-flow slide before allocation; Osei: action items as a table) and produce the chart list from chart-list.md for the slides present. Per run I paste: eMoney plan-progress summary, Orion allocation summary, last year's action items.",
          files: [
            {
              name: 'advisor-prefs-2026-08.md',
              content: 'One line per advisor.',
            },
            {
              name: 'chart-list.md',
              content:
                'Which chart each standard slide uses and its data source page.',
            },
          ],
          rationale:
            "Included: only what the skill does not know (my advisors' preferences and the chart list). Excluded: the deck order, narrative voice rules and life-event handling, because the skill owns them and repeating them would drift from Hannah's version when she updates it. Excluded the template PPTX: Claude does not build the slides.",
        },
        critiqueText:
          "The outline came out as the skill's version plus my three adjustments. The chart list has a source column Claude does not need; I do.",
        grade: {
          daysAgo: 7,
          scores: {
            instructions: 0.9,
            run_pattern: 0.9,
            improvement: 0.9,
            maintainable: 0.9,
            included: 0.9,
            excluded: 0.9,
            tight: 0.85,
            rationale: 0.9,
          },
          decision: 'pass',
          critiqueQuality: 0.85,
          feedback:
            "What worked: the Project holds only what Hannah's skill cannot know, so when she updates the skill your decks improve too.\nWhat to change: the chart list carries source pages that are for you, not Claude; move that column to your own checklist.\nTry next: run the Kowalski deck once with the skill alone and once with the Project to see exactly what your additions change.",
          teachingMoment:
            'Move the source-page column out of chart-list.md into your own checklist and re-run the Kowalski deck.',
        },
      },
    ],
  },
  {
    key: 'priya-next-up',
    personKey: 'priya',
    rung: 2,
    competencyCodes: ['L2.selection', 'L2.project_design'],
    title: 'Trim your Monday meeting-prep Project',
    brief:
      "For your Monday meeting prep, remove the files your Project no longer needs and run it for next Monday's Nakamura meeting.",
    rationale:
      'Your Project has grown to seven files and the extra example briefs are making every brief sound the same.',
    kind: 'artifact',
    mode: 'in_app',
    workSurface: 'project',
    contextTag: 'meeting-prep',
    workflowKey: 'monday-meeting-prep',
    skillSlug: 'advisor-meeting-prep',
    hints: [
      'Go file by file: did the last three briefs actually use it?',
      'Two of the examples are from the same advisor; one is enough.',
      'The calendar export lists every meeting for three advisors; paste just the attendees for this one.',
    ],
    starter: {
      currentFiles: [
        'brief-template.md',
        'sop-excerpt-brief-structure.md',
        'sop-rmd-letters.md',
        'example-brief-hale.md',
        'example-brief-nakamura.md',
        'example-brief-ortiz.md',
        'calendar-export-sept.csv',
      ],
      testTask:
        'Draft the Monday prep brief for the Nakamura review on Tuesday. Summaries below.\n\n[paste the Salesforce summary, Orion household page and eMoney open items for the Nakamura household]',
    },
    status: 'active',
    estimatedMinutes: 25,
    scheduledDaysAgo: 0,
    createdDaysAgo: 1,
    generatedBy: 'coach',
    hintsRevealed: 0,
    submissions: [],
  },
  {
    key: 'priya-adopt-meeting-prep-v3',
    personKey: 'priya',
    rung: 2,
    competencyCodes: ['L2.project_design'],
    title: "Use advisor-meeting-prep v3 for Monday's briefs",
    brief:
      "For your Monday meeting prep, use version 3 of advisor-meeting-prep for all of next Monday's briefs and note where it disagrees with your Project.",
    rationale:
      'You suggested the change in version 3; using it on real briefs shows whether it holds up across three advisors.',
    kind: 'adopt',
    mode: 'in_app',
    workSurface: 'project',
    contextTag: 'meeting-prep',
    workflowKey: 'monday-meeting-prep',
    skillSlug: 'advisor-meeting-prep',
    hints: [],
    status: 'queued',
    estimatedMinutes: 20,
    scheduledDaysAgo: -3,
    createdDaysAgo: 1,
    generatedBy: 'adopt',
    submissions: [],
  },

  // ───── Marcus (L1) ─────
  {
    key: 'marcus-discovery-summary',
    personKey: 'marcus',
    rung: 1,
    competencyCodes: ['L1.description', 'L1.delegation'],
    title: 'Write the Whitaker discovery summary',
    brief:
      'For your discovery-call summaries, write the prompt that turns your Whitaker call notes into the one-page summary Sofia expects.',
    rationale:
      'You said you ask Claude to "make this better"; this time say what better means and who it is for.',
    kind: 'artifact',
    mode: 'in_app',
    workSurface: 'prompt',
    contextTag: 'discovery',
    workflowKey: 'proposal-assembly',
    hints: [
      'Say who reads the summary and what they decide from it.',
      "Give Claude the five headings Sofia's proposals start from.",
      'Their approximate net worth is fine to include; account numbers at the old firm are not.',
    ],
    status: 'passed',
    estimatedMinutes: 15,
    completedDaysAgo: 10,
    createdDaysAgo: 12,
    generatedBy: 'coach',
    hintsRevealed: 2,
    submissions: [
      {
        attempt: 1,
        daysAgo: 10,
        expectationText:
          'Good enough if Sofia can decide from it whether we propose.',
        expectationConfidence: 0.5,
        coldAttempt: true,
        artifact: {
          type: 'prompt_run',
          content:
            'Turn my notes into a one-page discovery summary for Sofia Alvarez, who decides from it whether we propose and who leads. Headings: Who they are; What matters to them (their words where I have them); Current situation (approximate figures only); Concerns; Suggested next step. Plain, no marketing language. Notes: [Whitakers, both 58, she is a surgeon, he sold a dental practice last year, approx $4.2M investable, worried about tax on the sale proceeds, want to retire at 62, two kids in college, said "we don\'t want to be sold anything", current advisor never calls].',
          output:
            'Who they are: Dr and Mr Whitaker, both 58...\nWhat matters to them: "We don\'t want to be sold anything." Retirement at 62; predictable income; being called back...\nCurrent situation: roughly $4.2M investable following the sale of a dental practice last year; two children in college...\nConcerns: tax on sale proceeds; lack of contact from current advisor...\nSuggested next step: propose; Sofia to lead given the tax question.',
        },
        critiqueText:
          "It kept their words, which Sofia wants. It also suggested Sofia lead, which is my call, not Claude's.",
        grade: {
          daysAgo: 10,
          scores: {
            goal: 0.85,
            format: 0.8,
            context: 0.8,
            vocabulary: 0.7,
            split: 0.8,
            kept: 0.75,
            explicit: 0.7,
          },
          decision: 'pass',
          critiqueQuality: 0.75,
          feedback:
            'What worked: you told Claude who reads the summary and what she decides from it, and gave it the five headings; that is why it reads like one of Sofia\'s.\nWhat to change: Claude decided who should lead, which is not its job; say "next steps are mine to decide".\nTry next: paste your notes for the next discovery call into the same prompt and see if it needs any change.',
        },
      },
    ],
  },
  {
    key: 'marcus-fee-explainer',
    personKey: 'marcus',
    rung: 1,
    competencyCodes: ['L1.description', 'L1.discernment'],
    title: 'Draft the Park fee-change email',
    brief:
      'For your fee-change emails, write the prompt for a short email telling the Parks their tier changes in January.',
    rationale:
      'Fee emails are the most sensitive thing you write, and what must not go in matters as much as what should.',
    kind: 'artifact',
    mode: 'in_app',
    workSurface: 'prompt',
    contextTag: 'fee-change',
    workflowKey: 'fee-change-comms',
    hints: [
      'Fee wording comes from the Compliance-approved text; paste it in.',
      'Tell Claude what it must not say: no comparisons to other firms, no performance.',
      'Say who reviews the email before it goes out.',
    ],
    status: 'revise',
    estimatedMinutes: 15,
    createdDaysAgo: 9,
    generatedBy: 'coach',
    hintsRevealed: 0,
    submissions: [
      {
        attempt: 1,
        daysAgo: 7,
        expectationText:
          'Good enough if it is friendly and explains the change.',
        expectationConfidence: 0.8,
        coldAttempt: true,
        artifact: {
          type: 'prompt_run',
          content:
            'Write a friendly email to the Park family explaining that their advisory fee tier is changing from tier 2 (0.85%) to tier 3 (0.95%) from January because of our new fee schedule. Make it reassuring.',
          output:
            'Dear Mr and Mrs Park,\n\nI wanted to let you know about an update to our fee schedule... your tier will move from 0.85% to 0.95% from January. While this is a modest increase, it reflects the enhanced planning services... Our fees remain competitive with other firms of our size, and our portfolios have performed well...\n\nPlease do not hesitate to reach out.',
        },
        critiqueText: 'Reads fine to me. Maybe a bit long.',
        grade: {
          daysAgo: 7,
          scores: {
            goal: 0.6,
            format: 0.6,
            context: 0.4,
            vocabulary: 0.5,
            prediction: 0.5,
            real_issues: 0.3,
            actionable: 0.3,
            calibration: 0.3,
          },
          decision: 'revise',
          critiqueQuality: 0.3,
          feedback:
            'What worked: the tone is friendly and the tiers and date are correct.\nWhat to change: the draft compares us to other firms and mentions performance, which Compliance does not allow in fee emails, and it rewords the approved explanation instead of using it.\nTry next: paste the Compliance-approved paragraph into the prompt, add "use this text word for word", and add "do not mention other firms or performance".',
          teachingMoment:
            'Paste the approved fee paragraph into your prompt and tell Claude to use it word for word.',
        },
      },
    ],
  },
  {
    key: 'marcus-henderson-followup',
    personKey: 'marcus',
    rung: 1,
    competencyCodes: ['L1.description', 'L1.discernment'],
    title: 'Draft the Henderson follow-up email',
    brief:
      'For your client follow-up emails, write the prompt for the Henderson review.',
    rationale:
      'You write five or six of these a week; writing the prompt yourself once shows you what the follow-up skill does for you.',
    kind: 'artifact',
    mode: 'in_app',
    workSurface: 'prompt',
    contextTag: 'follow-up',
    workflowKey: 'client-followup',
    skillSlug: 'client-followup-notes',
    hints: [
      "Use Sofia's three parts: what we discussed, what we agreed, what we need from you.",
      'Say there were no performance figures in the meeting, so Claude does not add any.',
      'Give a length: under 200 words.',
    ],
    starter: {
      starterPrompt:
        "Write the follow-up email to the Hendersons after yesterday's review.\n\nNotes: inherited IRA distribution plan; agreed to move to quarterly from January; they will send the updated beneficiary form; asked about 529s for the grandchildren.\n\n[add who reads it, the structure, the length, and what must not appear]",
    },
    status: 'active',
    estimatedMinutes: 15,
    scheduledDaysAgo: 0,
    createdDaysAgo: 2,
    generatedBy: 'coach',
    hintsRevealed: 1,
    submissions: [],
  },
  {
    key: 'marcus-quarterly-points',
    personKey: 'marcus',
    rung: 1,
    competencyCodes: ['L1.diligence'],
    title: 'Check the quarterly review talking points',
    brief:
      'For your quarterly review talking points, run your prompt for the Okafor-Lang review and check every figure against the Orion summary.',
    rationale:
      'A third piece of your own work, and the first where the check matters more than the prompt.',
    kind: 'artifact',
    mode: 'in_app',
    workSurface: 'prompt',
    contextTag: 'quarterly-review',
    hints: [
      'Every figure needs a line in the summary it came from.',
      'Look for comparisons to a period you did not give Claude.',
      'Ask: would I say this sentence in the room?',
    ],
    starter: { workflowName: 'Quarterly review talking points' },
    status: 'queued',
    estimatedMinutes: 15,
    scheduledDaysAgo: -2,
    createdDaysAgo: 1,
    generatedBy: 'coach',
    submissions: [],
  },

  // ───── Hannah (L3, rising) ─────
  {
    key: 'hannah-project-deck-narrative',
    personKey: 'hannah',
    rung: 2,
    competencyCodes: ['L2.selection', 'L2.project_design'],
    title: 'Trim your deck-narrative Project',
    brief:
      'For your annual review decks, cut your deck-narrative Project down to what every run needs and run it for the Kowalski deck.',
    rationale:
      'You arrived with a working Project; trimming it and writing down why is the step before turning it into a skill.',
    kind: 'artifact',
    mode: 'in_app',
    workSurface: 'project',
    contextTag: 'deck-narrative',
    workflowKey: 'annual-review-deck',
    hints: [
      'Which files did the last five decks actually use?',
      'Is the slide order written down or only implied by the examples?',
      'Where would a teammate look to change the advisor voice notes?',
    ],
    status: 'passed',
    estimatedMinutes: 30,
    completedDaysAgo: 42,
    createdDaysAgo: 46,
    generatedBy: 'coach',
    hintsRevealed: 0,
    submissions: [
      {
        attempt: 1,
        daysAgo: 42,
        expectationText:
          'Good enough if the Kowalski narratives read less templated than before.',
        expectationConfidence: 0.8,
        coldAttempt: true,
        artifact: {
          type: 'project',
          content:
            "PROJECT INSTRUCTIONS: narrative per slide in the advisor's voice; plain English; no figures beyond the summaries; carry last year's action items forward.",
          files: [
            { name: 'deck-order.md', content: 'Standard slide order.' },
            {
              name: 'voice-guide.md',
              content: 'Three paragraphs on register.',
            },
          ],
          rationale:
            "Cut four of six example narratives: two are enough to set the register and six anchored the output to one household's story. Kept the deck order as a file so it is one place to change.",
        },
        critiqueText:
          'Narratives feel less templated. The voice guide is in both the instructions and a file; one should go.',
        grade: {
          daysAgo: 42,
          scores: {
            included: 0.85,
            excluded: 0.9,
            tight: 0.8,
            rationale: 0.9,
            instructions: 0.85,
            run_pattern: 0.9,
            improvement: 0.85,
            maintainable: 0.85,
          },
          decision: 'pass',
          critiqueQuality: 0.85,
          feedback:
            'What worked: cutting four of six examples stopped every deck sounding like the same household.\nWhat to change: the voice guide is in two places; keep the file and delete it from the instructions.\nTry next: the deck-order file is already most of a skill; that is your next task.',
        },
      },
    ],
  },
  {
    key: 'hannah-skill-annual-review',
    personKey: 'hannah',
    rung: 3,
    competencyCodes: [
      'L3.trigger',
      'L3.disclosure',
      'L3.examples',
      'L3.boundary',
    ],
    title: 'Write the annual review deck outline skill',
    brief:
      'For your annual review decks, write the skill the whole planning team can use to get the outline and narrative.',
    rationale:
      'Grace and Priya have asked for your deck Project; a skill lets them use it without copying it.',
    kind: 'artifact',
    mode: 'in_app',
    workSurface: 'skill',
    contextTag: 'annual-review',
    workflowKey: 'annual-review-deck',
    skillSlug: 'annual-review-deck-outline',
    hints: [
      'Start the description with when a planner would reach for this, then say when they should not.',
      'Put the slide order in a separate file the skill points to.',
      'Two examples are enough: one household on track, one off track.',
    ],
    status: 'passed',
    estimatedMinutes: 60,
    completedDaysAgo: 23,
    createdDaysAgo: 26,
    generatedBy: 'coach',
    hintsRevealed: 1,
    submissions: [
      {
        attempt: 1,
        daysAgo: 23,
        expectationText:
          'Good enough if a planner could run it for a new household without asking me anything.',
        expectationConfidence: 0.7,
        coldAttempt: true,
        artifact: {
          type: 'skill',
          content: '(SKILL.md as submitted: see annual-review-deck-outline v1)',
          sampleCases: [
            {
              input:
                'Outline the annual review deck for the Brennan household; summaries attached.',
              shouldTrigger: 'yes',
              expected: 'Twelve-slide outline with narrative.',
            },
            {
              input: 'Build the charts for the Brennan deck.',
              shouldTrigger: 'no',
              expected: 'Not this skill.',
            },
            {
              input:
                'The Brennans sold their business in March. Start the deck.',
              shouldTrigger: 'ambiguous',
              expected:
                'Outline but leave the revised-goals narrative to the planner.',
            },
          ],
          boundary: {
            may_read: [
              'aggregated_client_summaries',
              'internal_templates',
              'calendar',
            ],
            must_never_receive: [
              'client_pii_documents',
              'account_numbers',
              'ssn',
              'statements_raw',
            ],
            human_review: ['before_client_meeting'],
          },
        },
        critiqueText:
          'The slide order is buried in the steps rather than in its own file. Examples are two and typical.',
        grade: {
          daysAgo: 23,
          scores: {
            trigger: 0.85,
            negative: 0.85,
            one_job: 0.9,
            name: 0.9,
            body_tight: 0.85,
            layered: 0.75,
            structure: 0.85,
            no_dup: 0.85,
            canonical: 0.9,
            coverage: 0.85,
            realistic: 0.9,
            declared: 0.9,
            consistent: 0.9,
            firm_match: 0.9,
          },
          decision: 'pass',
          critiqueQuality: 0.85,
          feedback:
            'What worked: the skill does one job, says plainly what it will not do (charts, quarterly reviews, life events), and the two examples show a normal deck and an off-track one.\nWhat to change: the slide order lives inside the steps; move it to a file called deck-order.md and point to it.\nTry next: ask Grace to run it on one of her households and note the first question she asks you.',
        },
      },
    ],
  },
  {
    key: 'hannah-skill-rmd',
    personKey: 'hannah',
    rung: 3,
    competencyCodes: ['L3.trigger', 'L3.boundary', 'L3.examples'],
    title: 'Write the RMD letter skill',
    brief:
      'For your RMD letters, write the skill for the planning team before the November batch.',
    rationale:
      'A client-facing letter with a dollar figure is a harder skill than the deck outline, and the batch is eight weeks away.',
    kind: 'artifact',
    mode: 'in_app',
    workSurface: 'skill',
    contextTag: 'rmd-letters',
    workflowKey: 'rmd-letter-drafting',
    skillSlug: 'rmd-letter-draft',
    hints: [
      'The three letter variants (standard, inherited, already distributed) are a choice in step 1; their text goes in a separate file.',
      'Spell out the exact input row so the skill can refuse anything more.',
      'Make one of your sample requests an inherited IRA and say what the skill should do about the 10-year rule.',
    ],
    status: 'submitted',
    estimatedMinutes: 60,
    createdDaysAgo: 8,
    generatedBy: 'coach',
    hintsRevealed: 0,
    submissions: [
      {
        attempt: 1,
        daysAgo: 6,
        expectationText:
          'Good enough if the Delgado and Ferreira letters come out right without edits.',
        expectationConfidence: 0.75,
        coldAttempt: true,
        artifact: {
          type: 'skill',
          content: '(SKILL.md as submitted: see rmd-letter-draft v1)',
          sampleCases: [
            {
              input:
                'RMD letter for the Delgado household: age 76, traditional IRA, required amount 27,310, quarterly method on file.',
              shouldTrigger: 'yes',
              expected:
                'Four-paragraph letter, "about $27,000", quarterly confirmed.',
            },
            {
              input: 'Explain how RMDs work for a client presentation.',
              shouldTrigger: 'no',
              expected: 'General education; not this skill.',
            },
            {
              input:
                'Letter for Mrs Ferreira, inherited IRA from her sister in 2023.',
              shouldTrigger: 'ambiguous',
              expected:
                'Inherited paragraph; no 10-year-rule claim; flag for planner.',
            },
          ],
          boundary: {
            may_read: [
              'aggregated_client_summaries',
              'internal_templates',
              'public_regulation',
            ],
            must_never_receive: [
              'client_pii_documents',
              'account_numbers',
              'ssn',
              'statements_raw',
            ],
            human_review: ['before_send', 'before_crm_entry'],
          },
        },
        critiqueText:
          'None of my sample requests covers the already-distributed variant; that may be a gap.',
      },
    ],
  },

  // ───── Grace (L2, attempting L3) ─────
  {
    key: 'grace-project-cd-memo',
    personKey: 'grace',
    rung: 2,
    competencyCodes: ['L2.selection', 'L2.project_design'],
    title: 'Set up a Project for CD memos',
    brief:
      'For your CD memos, rebuild your Project with a line on why each file and instruction is there, then run it for the Ortiz memo.',
    rationale:
      'You already use a Project for CD memos; writing down why each piece is there is what lets you hand it to someone else.',
    kind: 'artifact',
    mode: 'in_app',
    workSurface: 'project',
    contextTag: 'cd-memo',
    workflowKey: 'cd-memo-drafting',
    hints: [
      'Which SOP paragraphs change how the memo is written?',
      'Old memos contain household details; leave them out.',
      'What does Daniel check first when he reviews a memo? Put that in.',
    ],
    status: 'passed',
    estimatedMinutes: 30,
    completedDaysAgo: 21,
    createdDaysAgo: 24,
    generatedBy: 'coach',
    hintsRevealed: 1,
    submissions: [
      {
        attempt: 1,
        daysAgo: 21,
        expectationText:
          "Good enough if the Ortiz memo passes Daniel's review without changes.",
        expectationConfidence: 0.7,
        coldAttempt: true,
        artifact: {
          type: 'project',
          content:
            'PROJECT INSTRUCTIONS: five memo sections; state the plan delta in the first line; client agreement in their words where the note has them; under one page.',
          files: [
            { name: 'cd-memo-template.md', content: 'Template.' },
            {
              name: 'daniel-review-checklist.md',
              content: 'The six things Daniel checks.',
            },
          ],
          rationale:
            "Included the template and Daniel's checklist (so the memo is written to pass review). Excluded previous memos (household data) and the full plan exports (I paste the delta).",
        },
        critiqueText:
          "The checklist file was the best addition; the first draft passed Daniel's review unchanged.",
        grade: {
          daysAgo: 21,
          scores: {
            included: 0.85,
            excluded: 0.85,
            tight: 0.85,
            rationale: 0.8,
            instructions: 0.85,
            run_pattern: 0.85,
            improvement: 0.9,
            maintainable: 0.75,
          },
          decision: 'pass',
          critiqueQuality: 0.7,
          feedback:
            'What worked: putting Daniel\'s review checklist in the Project means the memo is written to pass review, and it did.\nWhat to change: the file names have no dates, so you will not notice when the template changes.\nTry next: run the next memo from a bare advisor note and see whether the "agreement not recorded" case is handled.',
        },
      },
    ],
  },
  {
    key: 'grace-skill-cd-memo',
    personKey: 'grace',
    rung: 3,
    competencyCodes: [
      'L3.trigger',
      'L3.disclosure',
      'L3.examples',
      'L3.boundary',
    ],
    title: 'Write the CD memo skill',
    brief:
      "For your CD memos, write the skill the planning team can use to draft a memo from the advisor's note and the plan change.",
    rationale:
      "Your CD memo Project passes Daniel's review first time and the team writes four memos a week.",
    kind: 'artifact',
    mode: 'in_app',
    workSurface: 'skill',
    contextTag: 'cd-memo',
    workflowKey: 'cd-memo-drafting',
    hints: [
      'Say when not to use it: plan updates that are not a change of direction.',
      "Daniel's checklist goes in a separate file, not a paragraph.",
      "Make one sample request an advisor note that describes a change but not the client's agreement.",
    ],
    status: 'submitted',
    estimatedMinutes: 60,
    createdDaysAgo: 5,
    generatedBy: 'coach',
    hintsRevealed: 2,
    submissions: [
      {
        attempt: 1,
        daysAgo: 2,
        expectationText:
          'Good enough if the Ortiz memo comes out in our five sections with the change on the first line.',
        expectationConfidence: 0.45,
        coldAttempt: true,
        artifact: {
          type: 'skill',
          content:
            '---\nname: cd-memo-draft\ndescription: Draft a Change of Direction memo (context, change, rationale, client agreement, next steps) from the advisor\'s note summary and the before/after plan summary. Use when an advisor reports a material plan change after a meeting. Not for routine plan updates or annual review changes.\n---\n\n# CD memo draft\n\n## When to use\nAn advisor has told Planning a plan changed direction and there is a note summary and a plan delta.\n\n## Inputs\n- Advisor note summary (Salesforce export).\n- Before/after plan summary (eMoney).\nTemplate and Daniel\'s review checklist: references/.\n\n## Steps\n1. First line states the delta.\n2. Five sections from the template.\n3. Client agreement in their words if the note has them; otherwise write "agreement not recorded in note" and flag.\n4. Under one page.\n\n## Output format\nMemo, five headed sections.\n\n## Boundaries\n- may_read: crm_summary_export, aggregated_client_summaries, internal_templates\n- must_never_receive: account_numbers, client_pii_documents, ssn, statements_raw\n- human_review: director review before filing.\n\n## Examples\n**Example 1.** Ortiz 60/40 to 50/50 on retirement. **Example 2.** Brennan: added a 529 funding goal after a grandchild was born.\n',
          sampleCases: [
            {
              input:
                'CD memo for the Ortiz change, note summary and plan delta attached.',
              shouldTrigger: 'yes',
              expected: 'Five-section memo, delta first.',
            },
            {
              input: 'Update the Ortiz plan with the new salary figure.',
              shouldTrigger: 'no',
              expected: 'Routine update; not a change of direction.',
            },
            {
              input:
                'The Brennans want more in bonds, memo please. No note yet.',
              shouldTrigger: 'ambiguous',
              expected:
                'Draft with "agreement not recorded" flagged, or ask for the note.',
            },
          ],
          boundary: {
            may_read: [
              'crm_summary_export',
              'aggregated_client_summaries',
              'internal_templates',
            ],
            must_never_receive: [
              'account_numbers',
              'client_pii_documents',
              'ssn',
              'statements_raw',
            ],
            human_review: ['director_review'],
          },
        },
        critiqueText:
          'My examples are one line each, and "director_review" is not one of our named review points.',
      },
    ],
  },

  // ───── Daniel (L5 champion): review queue and history ─────
  {
    key: 'daniel-review-hannah-rmd',
    personKey: 'daniel',
    rung: 5,
    competencyCodes: ['L5.grading', 'L5.feedback'],
    title: "Review Hannah's RMD letter skill",
    brief:
      "For the team's RMD letters, review Hannah's skill draft: give it a score and three lines she can act on.",
    rationale:
      'This is in your review queue and it blocks PR #25 before the November batch.',
    kind: 'review',
    mode: 'in_app',
    workSurface: 'review',
    contextTag: 'review-queue',
    skillSlug: 'rmd-letter-draft',
    starter: {
      reviewSubmissionKey: 'hannah-skill-rmd',
      workflowName: 'RMD letter drafting',
    },
    hints: [
      'Does any sample request cover the already-distributed case?',
      'From how the skill describes its input, could it refuse a statement page?',
      'Give her the smallest change first.',
    ],
    status: 'active',
    estimatedMinutes: 25,
    scheduledDaysAgo: 0,
    createdDaysAgo: 6,
    generatedBy: 'coach',
    hintsRevealed: 0,
    submissions: [],
  },
  {
    key: 'daniel-review-grace-cd-memo',
    personKey: 'daniel',
    rung: 5,
    competencyCodes: ['L5.grading', 'L5.feedback'],
    title: "Review Grace's CD memo skill",
    brief:
      "For the team's CD memos, review Grace's first skill draft and write feedback that tells her the two things to fix without rewriting it for her.",
    rationale:
      "It is Grace's first skill; how this feedback lands decides whether she tries again this week or next month.",
    kind: 'review',
    mode: 'in_app',
    workSurface: 'review',
    contextTag: 'review-queue',
    workflowKey: 'cd-memo-drafting',
    starter: { reviewSubmissionKey: 'grace-skill-cd-memo' },
    hints: [
      'Her examples are one line each; what is the smallest change that makes them real examples?',
      '"director_review" is not one of the firm\'s review points; which one is it?',
      'She spotted both problems herself in her notes; say so first.',
    ],
    status: 'active',
    estimatedMinutes: 25,
    scheduledDaysAgo: 0,
    createdDaysAgo: 2,
    generatedBy: 'coach',
    hintsRevealed: 0,
    submissions: [],
  },
  {
    key: 'daniel-review-kevin-fee',
    personKey: 'daniel',
    rung: 5,
    competencyCodes: ['L5.grading', 'L5.feedback', 'L5.stewardship'],
    title: "Review Kevin's fee-change letter skill",
    brief:
      "For the advisors' fee-change letters, review Kevin's skill as a second champion and decide whether Compliance needs to approve it.",
    rationale:
      'Sofia asked for a second pair of eyes because the letters go to clients about fees.',
    kind: 'review',
    mode: 'in_app',
    workSurface: 'review',
    contextTag: 'review-queue',
    skillSlug: 'fee-change-comms',
    starter: { workflowName: 'Fee-change client comms' },
    hints: [],
    status: 'passed',
    estimatedMinutes: 25,
    completedDaysAgo: 15,
    createdDaysAgo: 17,
    generatedBy: 'coach',
    hintsRevealed: 0,
    submissions: [
      {
        attempt: 1,
        daysAgo: 15,
        expectationText:
          "Good enough if my score lands near the grader's and Kevin gets one clear next step.",
        expectationConfidence: 0.8,
        coldAttempt: true,
        artifact: {
          type: 'review',
          content:
            'Scores: trigger 0.85, scope 0.9, layering 0.8, boundary 0.8 (declared correctly, but the description should say the letters are Compliance-reviewed), examples 0.85, tight 0.85, sample requests 0.8. Decision: pass, with the negotiated-fee exclusion added as a sample request. Promotion needs a Compliance approver.\nTo Kevin: What worked: the "approved text word for word" rule is exactly the right centre. What to change: add a sample request for a household on a negotiated fee. Try next: say in the description that the output is Compliance-reviewed so approvers see it.',
        },
        critiqueText:
          'Grader gave boundary 0.85 to my 0.80 and otherwise matched. I was slightly harder for the reason I expected.',
        grade: {
          daysAgo: 15,
          scores: {
            agreement: 0.92,
            decision: 1.0,
            consistency: 0.9,
            specific: 0.9,
            actionable: 0.9,
            teaches: 0.85,
            sla: 0.9,
            escalation: 0.95,
            library: 0.85,
          },
          decision: 'pass',
          critiqueQuality: 0.9,
          feedback:
            "What worked: your scores are within 0.05 of the grader on every line, same decision, and you asked for Compliance before Promoter did.\nWhat to change: nothing on this one; your note to Kevin already names the smallest changes.\nTry next: review Amara's exception memo skill alongside Tom so he can see how you score.",
        },
      },
    ],
  },
  {
    key: 'daniel-review-amara-crm-v1',
    personKey: 'daniel',
    rung: 5,
    competencyCodes: ['L5.grading', 'L5.feedback'],
    title: "Review Amara's exception memo skill",
    brief:
      "For Client Service's rebalancing exception memos, review Amara's v1 alongside Tom so he can compare his scores with yours.",
    rationale:
      'Tom is new to reviewing; scoring the same skill side by side is the quickest way to get him confident.',
    kind: 'review',
    mode: 'in_app',
    workSurface: 'review',
    contextTag: 'review-queue',
    skillSlug: 'rebalancing-exception-memo',
    starter: { workflowName: 'Rebalancing exception memos' },
    hints: [],
    status: 'passed',
    estimatedMinutes: 20,
    completedDaysAgo: 10,
    createdDaysAgo: 12,
    generatedBy: 'champion',
    hintsRevealed: 0,
    submissions: [
      {
        attempt: 1,
        daysAgo: 10,
        expectationText:
          'Good enough if Tom and I land within a few points of each other and the grader.',
        expectationConfidence: 0.9,
        coldAttempt: true,
        artifact: {
          type: 'review',
          content:
            'Scores: all lines 0.85–0.9. Decision: pass. The account-number check and the "as reported by Operations" rule are written as steps rather than warnings, which is what makes this safe.\nTo Amara: What worked: step 1 refuses anything that looks like an account number. What to change: nothing now. Try next: keep step 1 in every future version.',
        },
        critiqueText:
          'Matched the grader. My note about future versions turned out to matter (v2).',
        grade: {
          daysAgo: 10,
          scores: {
            agreement: 0.95,
            decision: 1.0,
            consistency: 0.9,
            specific: 0.85,
            actionable: 0.8,
            teaches: 0.8,
          },
          decision: 'pass',
          critiqueQuality: 0.85,
          feedback:
            'What worked: you matched the grader on every line and kept the note short because the skill was good.\nWhat to change: nothing here.\nTry next: when Tom scores his next skill alone, compare afterwards rather than before so he forms his own view.',
        },
      },
    ],
  },
];

/** Templates for exercises for learners without hand-written history. `{workflow}` is replaced with one of the person's weekly workflows. */
export const FILLER_EXERCISES: Record<
  number,
  {
    title: string;
    brief: string;
    rationale: string;
    competencyCodes: string[];
    workSurface: WorkSurface;
    hints: string[];
    artifactType: Artifact['type'];
    expectation: string;
    critique: string;
    feedback: string;
    feedbackRevise: string;
  }[]
> = {
  0: [
    {
      title: 'Try one real thing: {workflow}',
      brief:
        'For {workflow}, write what you would ask Claude and run it once on a real example.',
      rationale:
        'The first session ends with one finished piece of your own work.',
      competencyCodes: ['L0.surfaces', 'L0.boundary'],
      workSurface: 'orientation',
      hints: [
        'Pick the instance you would do today anyway.',
        'Say who the result is for and what shape you want.',
        "Leave out account numbers, statements and anything with a client's ID on it.",
      ],
      artifactType: 'text',
      expectation: 'Good enough if I can use the result today.',
      critique: 'Usable after a couple of edits. I had to add who it was for.',
      feedback:
        'What worked: you finished a real piece of work and kept client details out.\nWhat to change: say who the result is for at the start; the draft had to guess.\nTry next: the same task next week, with the reader named in the first line.',
      feedbackRevise:
        'What worked: you picked a real task and ran it.\nWhat to change: the ask had no reader and no shape, so the result was generic.\nTry next: start with "This is for [who]. I need [what], about [length]".',
    },
  ],
  1: [
    {
      title: 'Write the prompt for {workflow}',
      brief:
        'For {workflow}, write the prompt you would give Claude for one real instance and run it.',
      rationale:
        'You do {workflow} every week; a clear ask is the quickest win.',
      competencyCodes: ['L1.description', 'L1.discernment'],
      workSurface: 'prompt',
      hints: [
        'Say who reads the result and what they do with it.',
        'Give the format a number: words, items or paragraphs.',
        'Include the one input that changes how the result should read.',
      ],
      artifactType: 'prompt_run',
      expectation:
        'Good enough if the structure is right and the tone fits the reader.',
      critique:
        'Structure was right. One sentence claimed something I never gave it.',
      feedback:
        'What worked: you named the reader and the format, so the result was usable.\nWhat to change: one sentence states a fact that was not in your inputs; cut it.\nTry next: add "use only the facts I give you" to the end of the prompt.',
      feedbackRevise:
        'What worked: the material Claude needed was in the prompt.\nWhat to change: the ask does not say who it is for or how long it should be, so the result is generic.\nTry next: add one line: "For [reader], [length], [tone]".',
    },
    {
      title: 'Give Claude the three facts for {workflow}',
      brief:
        'For {workflow}, decide which parts Claude drafts and which you keep, then run the draft and check every figure against its source.',
      rationale:
        'The check before anything leaves is what makes a fast draft safe to send.',
      competencyCodes: ['L1.delegation', 'L1.diligence'],
      workSurface: 'prompt',
      hints: [
        'What is the same every time, and what is unique to this instance?',
        'Where does a person have to check before anything leaves?',
        'A figure with no source line does not go out.',
      ],
      artifactType: 'prompt_run',
      expectation: 'Good enough if every figure traces to its source.',
      critique:
        'Every figure traced. Claude added a comparison I did not give it.',
      feedback:
        'What worked: the split is clear, client details stayed with you, and every figure was checked.\nWhat to change: the draft compares to a period you did not give it; delete that line.\nTry next: add "do not compare to periods I have not given you".',
      feedbackRevise:
        'What worked: the parts you handed to Claude were the right ones.\nWhat to change: two figures in the draft were not checked against the source and one is wrong.\nTry next: read the draft with the source open beside it before you call it done.',
    },
  ],
  2: [
    {
      title: 'Set up a Project for {workflow}',
      brief:
        'For {workflow}, set up a Project with your standing rules in the instructions and only the files every run needs, then run it once.',
      rationale:
        'You repeat {workflow} weekly; a Project means each run starts from your rules.',
      competencyCodes: ['L2.selection', 'L2.project_design'],
      workSurface: 'project',
      hints: [
        'What do you retype every time? That goes in the instructions.',
        "Would you want last week's inputs in the Project this week?",
        'Add only the pages of the SOP that change how the result is written.',
      ],
      artifactType: 'project',
      expectation: 'Good enough if the first run is usable after light edits.',
      critique:
        'First run close to usable. One example file made the wording repeat.',
      feedback:
        'What worked: the instructions carry the rules and per-run data stays out, so runs cannot bleed into each other.\nWhat to change: one example file is making every result echo its wording; cut it to a short fragment.\nTry next: put a date in each file name so stale material shows.',
      feedbackRevise:
        "What worked: the instructions have the right rules.\nWhat to change: the Project holds last week's inputs and a four-page SOP; keep only what every run needs.\nTry next: remove everything you did not use in the last three runs and run it again.",
    },
  ],
  3: [
    {
      title: 'Write the skill for {workflow}',
      brief:
        'For {workflow}, write the skill your team can use, with three sample requests it should and should not answer.',
      rationale:
        'Your Project for {workflow} works; a skill lets the team use it too.',
      competencyCodes: [
        'L3.trigger',
        'L3.disclosure',
        'L3.examples',
        'L3.boundary',
      ],
      workSurface: 'skill',
      hints: [
        'Start the description with the sentence a teammate would say when they need this.',
        'Long templates go in a separate file the skill points to.',
        'Two examples: the normal case and the most common exception.',
      ],
      artifactType: 'skill',
      expectation:
        'Good enough if a teammate could run it without asking me anything.',
      critique:
        'The description reads as a trigger. The template is inline and should be a file.',
      feedback:
        'What worked: one job, the boundary is respected in every step, and the examples are typical rather than odd cases.\nWhat to change: the template is inline; move it to a file the skill points to.\nTry next: ask a teammate to run one of your sample requests and note their first question.',
      feedbackRevise:
        'What worked: the steps are in the right order and the boundary is declared.\nWhat to change: the description lists what the skill does instead of when to use it, so it will fire on the wrong requests.\nTry next: rewrite the description as "Use when [situation]. Not for [nearby task]".',
    },
  ],
  4: [
    {
      title: 'Map {workflow}',
      brief:
        'For {workflow}, fill in the workflow form (inputs, steps, decisions, exceptions, systems, outputs, review points) and set its baseline.',
      rationale: 'The map and the before-measure come before any skill ships.',
      competencyCodes: ['L4.schema', 'L4.baseline', 'L4.governance'],
      workSurface: 'workflow',
      hints: [
        'Every place you make a call needs a written rule.',
        'Time yourself for frequent short tasks; estimate with your champion for rare long ones.',
        'Any step touching restricted data is a human step.',
      ],
      artifactType: 'workflow',
      expectation: 'Good enough if a new hire could run it from the map.',
      critique:
        'Two exceptions I had not written down surfaced when the champion read it.',
      feedback:
        'What worked: every field is filled, the decisions have rules, and the baseline includes rework time.\nWhat to change: the compliance exposure is optimistic; the letter goes to clients, so mark it high.\nTry next: have your champion read the map and add the exceptions they ask about.',
      feedbackRevise:
        'What worked: inputs, steps and systems are complete.\nWhat to change: decisions and exceptions are empty, so nobody could run this from the map.\nTry next: write one rule for each place you make a call, starting with the most common.',
    },
  ],
};

/** Short recap prompts per competency, used for revisits when no explicit prompt is given. */
export const REVISIT_PROMPTS: Record<
  string,
  { prompt: string; answerKey: string }
> = {
  'L0.surfaces': {
    prompt:
      'A colleague asks Claude the same question every Monday with a new attachment each time. What should they set up instead, and why?',
    answerKey:
      'A Project: the task repeats, the rules stay the same, only the attachment changes.',
  },
  'L0.boundary': {
    prompt:
      'Name two things that may never be pasted into Claude at Meridian and one system it may only read from. Where must a person check before a client sees anything?',
    answerKey:
      'Any two of client ID documents, account numbers, SSNs, raw statements; Salesforce, Orion or eMoney; before sending, before CRM entry, before a client meeting.',
  },
  'L1.delegation': {
    prompt:
      'For your next RMD letter (or a similar task), write one sentence on what Claude drafts and one on what you keep.',
    answerKey:
      'Claude drafts from the summary row using the template rules; the person checks the amount, picks the variant, and the advisor reviews before sending.',
  },
  'L1.description': {
    prompt:
      'Rewrite "write an agenda for the Hale meeting" so Claude cannot produce a generic agenda.',
    answerKey:
      'Names the reader, the number of items, the order (open items first), the facts that must appear (RMD), and how to refer to accounts.',
  },
  'L1.discernment': {
    prompt:
      'Before you send your next Claude draft, list the two things you will check first.',
    answerKey:
      'Concrete checks: figures against the source, anything not in the inputs, tone for the reader.',
  },
  'L1.diligence': {
    prompt:
      'A Claude draft says "unchanged from last year". You only gave it this year\'s figures. What do you do?',
    answerKey:
      'Delete the comparison; nothing that is not in the source goes out.',
  },
  'L2.selection': {
    prompt:
      "Should last year's client letters live in your letter Project? Answer and give the reason.",
    answerKey:
      "No: they contain names and amounts that could leak into this year's letters; the template and rules are enough.",
  },
  'L2.project_design': {
    prompt:
      "What goes in a Project's instructions and what do you paste each time? One example of each from your own work.",
    answerKey:
      "Instructions: the role, format and rules that never change. Each time: this week's summaries.",
  },
  'L3.trigger': {
    prompt:
      'Write the description line for a skill you use so that a nearby task would not set it off.',
    answerKey:
      "Says when to use it in the user's words and names the nearby tasks it is not for.",
  },
  'L3.disclosure': {
    prompt:
      'Your skill file has grown to three pages. What do you move out and where?',
    answerKey:
      'Templates, long reference material and rare cases go to separate files the skill points to; the main file keeps the steps.',
  },
  'L3.boundary': {
    prompt:
      'A skill says it must never receive account numbers but step 2 says "paste the full note". What is wrong and how do you fix it?',
    answerKey:
      "The steps break the skill's own rule; add a redaction step first or a check in step 1 that stops on anything like an account number.",
  },
  'L3.examples': {
    prompt: 'How many examples does a skill need, and what should the two be?',
    answerKey:
      'Two or three: the normal case and the most common exception; not a list of odd cases.',
  },
  'L4.schema': {
    prompt:
      'Name the two parts of a workflow map most often left empty and why they matter when someone else runs the workflow.',
    answerKey:
      'Decisions and exceptions; without written rules the next person cannot ask the question a new hire would.',
  },
  'L4.baseline': {
    prompt:
      'Why do you time the task before the skill ships, and what must the timing include besides the first pass?',
    answerKey:
      'So the after-measure can be compared; it must include rework and say how it was measured and who signed it off.',
  },
  'L4.governance': {
    prompt:
      'A skill takes no restricted data but its output is a fee letter to clients. Does it need extra approval? From whom?',
    answerKey:
      'Yes, because of who reads the output; the champion plus Compliance.',
  },
  'L5.grading': {
    prompt:
      'You score a line 0.7 and the grader scores it 0.9. What do you do before deciding?',
    answerKey:
      'Re-read the rubric line and argue from it; disagreeing is fine when you can point to the text.',
  },
  'L5.feedback': {
    prompt:
      'Write one line of feedback on a weak skill description that tells the author what to change without rewriting it for them.',
    answerKey:
      'Points at the line, says what to change, and says why in one clause.',
  },
  'L5.stewardship': {
    prompt:
      'Two skills fire on the same phrase. What are your options and which do you pick first?',
    answerKey:
      'Merge them, give each a different audience, or retire one and point to the other; retire the narrower one first.',
  },
};

export const DEMO_REVISITS: DemoRevisit[] = [
  // Priya
  {
    personKey: 'priya',
    competencyCode: 'L1.description',
    intervalStep: 2,
    dueDaysAgo: 0,
    prompt: REVISIT_PROMPTS['L1.description'].prompt,
    answerKey: REVISIT_PROMPTS['L1.description'].answerKey,
  },
  {
    personKey: 'priya',
    competencyCode: 'L1.discernment',
    intervalStep: 1,
    dueDaysAgo: 0,
    prompt:
      'Your Nakamura brief is about to run. Name the two things you will check first when it comes back.',
    answerKey: REVISIT_PROMPTS['L1.discernment'].answerKey,
  },
  {
    personKey: 'priya',
    competencyCode: 'L1.diligence',
    intervalStep: 1,
    dueDaysAgo: 3,
    prompt: REVISIT_PROMPTS['L1.diligence'].prompt,
    answerKey: REVISIT_PROMPTS['L1.diligence'].answerKey,
  },
  {
    personKey: 'priya',
    competencyCode: 'L1.description',
    intervalStep: 0,
    dueDaysAgo: 30,
    doneDaysAgo: 30,
    score: 0.85,
    response:
      'For Lang; 3–5 items; open items first, marked with the meeting they came from; RMD named with amount and method; accounts as household + type.',
    feedback: 'All five rules present.',
    prompt: REVISIT_PROMPTS['L1.description'].prompt,
    answerKey: REVISIT_PROMPTS['L1.description'].answerKey,
  },
  {
    personKey: 'priya',
    competencyCode: 'L1.description',
    intervalStep: 1,
    dueDaysAgo: 23,
    doneDaysAgo: 22,
    score: 0.9,
    response: 'Same as before plus one line per item.',
    feedback: 'Good; next recap in three weeks.',
    prompt: REVISIT_PROMPTS['L1.description'].prompt,
    answerKey: REVISIT_PROMPTS['L1.description'].answerKey,
  },
  {
    personKey: 'priya',
    competencyCode: 'L1.delegation',
    intervalStep: 0,
    dueDaysAgo: 25,
    doneDaysAgo: 25,
    score: 0.8,
    response:
      'Claude drafts from the row; I check the amount and pick the variant; Lang reviews.',
    feedback: 'Complete.',
    prompt: REVISIT_PROMPTS['L1.delegation'].prompt,
    answerKey: REVISIT_PROMPTS['L1.delegation'].answerKey,
  },
  {
    personKey: 'priya',
    competencyCode: 'L1.discernment',
    intervalStep: 0,
    dueDaysAgo: 12,
    doneDaysAgo: 12,
    score: 0.7,
    response: "I'll read it through.",
    feedback:
      'Too vague: name what you will check (the figures, the open items, the RMD line). Back to a two-day recap.',
    prompt: REVISIT_PROMPTS['L1.discernment'].prompt,
    answerKey: REVISIT_PROMPTS['L1.discernment'].answerKey,
  },
  {
    personKey: 'priya',
    competencyCode: 'L2.selection',
    intervalStep: 0,
    dueDaysAgo: -5,
    prompt: REVISIT_PROMPTS['L2.selection'].prompt,
    answerKey: REVISIT_PROMPTS['L2.selection'].answerKey,
  },
  // Marcus
  {
    personKey: 'marcus',
    competencyCode: 'L1.description',
    intervalStep: 0,
    dueDaysAgo: 1,
    prompt: REVISIT_PROMPTS['L1.description'].prompt,
    answerKey: REVISIT_PROMPTS['L1.description'].answerKey,
  },
  {
    personKey: 'marcus',
    competencyCode: 'L1.delegation',
    intervalStep: 0,
    dueDaysAgo: -1,
    prompt: REVISIT_PROMPTS['L1.delegation'].prompt,
    answerKey: REVISIT_PROMPTS['L1.delegation'].answerKey,
  },
  {
    personKey: 'marcus',
    competencyCode: 'L0.boundary',
    intervalStep: 0,
    dueDaysAgo: 9,
    doneDaysAgo: 9,
    score: 0.85,
    response: 'Account numbers and SSNs; Orion is read-only; before sending.',
    feedback: 'Correct; also before CRM entry and before client meetings.',
    prompt: REVISIT_PROMPTS['L0.boundary'].prompt,
    answerKey: REVISIT_PROMPTS['L0.boundary'].answerKey,
  },
  // Daniel
  {
    personKey: 'daniel',
    competencyCode: 'L3.trigger',
    intervalStep: 3,
    dueDaysAgo: 20,
    doneDaysAgo: 20,
    score: 0.95,
    response:
      '"Use when a planner names a household and an upcoming meeting... Not for post-meeting notes (client-followup-notes)."',
    feedback: 'Names when to use it and the nearby skill it is not for.',
    prompt: REVISIT_PROMPTS['L3.trigger'].prompt,
    answerKey: REVISIT_PROMPTS['L3.trigger'].answerKey,
  },
  {
    personKey: 'daniel',
    competencyCode: 'L4.baseline',
    intervalStep: 2,
    dueDaysAgo: -10,
    prompt: REVISIT_PROMPTS['L4.baseline'].prompt,
    answerKey: REVISIT_PROMPTS['L4.baseline'].answerKey,
  },
  {
    personKey: 'daniel',
    competencyCode: 'L5.stewardship',
    intervalStep: 1,
    dueDaysAgo: 0,
    prompt: REVISIT_PROMPTS['L5.stewardship'].prompt,
    answerKey: REVISIT_PROMPTS['L5.stewardship'].answerKey,
  },
  // Hannah
  {
    personKey: 'hannah',
    competencyCode: 'L2.selection',
    intervalStep: 2,
    dueDaysAgo: 0,
    prompt: REVISIT_PROMPTS['L2.selection'].prompt,
    answerKey: REVISIT_PROMPTS['L2.selection'].answerKey,
  },
  {
    personKey: 'hannah',
    competencyCode: 'L3.trigger',
    intervalStep: 1,
    dueDaysAgo: 8,
    doneDaysAgo: 8,
    score: 0.88,
    response:
      'The description says when a planner needs it and what it is not for.',
    feedback: 'Good.',
    prompt: REVISIT_PROMPTS['L3.trigger'].prompt,
    answerKey: REVISIT_PROMPTS['L3.trigger'].answerKey,
  },
  // Others
  {
    personKey: 'kevin',
    competencyCode: 'L3.boundary',
    intervalStep: 1,
    dueDaysAgo: 2,
    prompt: REVISIT_PROMPTS['L3.boundary'].prompt,
    answerKey: REVISIT_PROMPTS['L3.boundary'].answerKey,
  },
  {
    personKey: 'nathan',
    competencyCode: 'L2.project_design',
    intervalStep: 1,
    dueDaysAgo: -3,
    prompt: REVISIT_PROMPTS['L2.project_design'].prompt,
    answerKey: REVISIT_PROMPTS['L2.project_design'].answerKey,
  },
  {
    personKey: 'rajesh',
    competencyCode: 'L1.description',
    intervalStep: 0,
    dueDaysAgo: 14,
    prompt: REVISIT_PROMPTS['L1.description'].prompt,
    answerKey: REVISIT_PROMPTS['L1.description'].answerKey,
  },
  {
    personKey: 'amara',
    competencyCode: 'L3.boundary',
    intervalStep: 0,
    dueDaysAgo: 0,
    prompt: REVISIT_PROMPTS['L3.boundary'].prompt,
    answerKey: REVISIT_PROMPTS['L3.boundary'].answerKey,
  },
];

export const DEMO_COACH_NOTES: DemoCoachNote[] = [
  {
    personKey: 'priya',
    daysAgo: 30,
    tags: ['progress'],
    note: 'Moved up to the Project step after four different tasks passed. Prompts and checking are strong; she tends to undersell her own drafts before running them.',
  },
  {
    personKey: 'priya',
    daysAgo: 12,
    tags: ['calibration'],
    note: 'Recap on checking drafts scored 7/10: "I\'ll read it through" is not a check. Two-day recap set; her next task asks her to name what she will look at first.',
  },
  {
    personKey: 'priya',
    daysAgo: 1,
    tags: ['progress'],
    note: 'Three Project tasks passed (meeting prep, RMD letters, annual review). Next up trims the meeting-prep Project she said had grown too big. One more workflow opens the skill step; the CD memo is the obvious candidate.',
  },
  {
    personKey: 'marcus',
    daysAgo: 7,
    tags: ['calibration', 'progress'],
    note: 'Fee email needs another go: the draft compared us to other firms and mentioned performance, and he read it as fine. Trusts drafts without checking them against the rules. Next task is the Henderson follow-up written without the skill.',
  },
  {
    personKey: 'marcus',
    daysAgo: 10,
    tags: ['progress'],
    note: 'First prompt task passed at 8/10; he named the reader for the first time. Thought it would score lower than it did.',
  },
  {
    personKey: 'rajesh',
    daysAgo: 20,
    tags: ['no_time'],
    note: 'Two nudges, one reply: "plan season, no time until October." One task passed (meeting notes) in week two; nothing since day 24.',
  },
  {
    personKey: 'rajesh',
    daysAgo: 8,
    tags: ['blocked', 'escalated'],
    note: 'Third session with nothing finished. Offered a five-minute task on the cash-flow table he is already building; declined. Sent to Daniel: this needs a conversation about time, not more coaching.',
  },
  {
    personKey: 'laura',
    daysAgo: 6,
    tags: ['tool_issue'],
    note: 'Usage fell sharply after the scheduling template changed on the shared drive; her prompt pointed at the old file name and started producing wrong output. Fix is a Project with the template attached; a task that builds it is queued.',
  },
  {
    personKey: 'hannah',
    daysAgo: 22,
    tags: ['progress'],
    note: 'First skill scored 8.7/10, and she reached the skill step in 39 days. Spotted the one gap in her own draft before the grader did. Champion candidate for Planning when Daniel steps back.',
  },
  {
    personKey: 'owen',
    daysAgo: 45,
    tags: ['blocked'],
    note: 'No activity since week 2; Daniel confirms parental leave. Marked inactive; start again on return.',
  },
  {
    personKey: 'grace',
    daysAgo: 2,
    tags: ['progress', 'calibration'],
    note: 'First skill submitted. She expects it to need another go and her own notes name both problems (one-line examples, wrong review point). Whatever Daniel decides, she can see what is wrong with her own work, which is the harder half.',
  },
  {
    personKey: 'kevin',
    daysAgo: 6,
    tags: ['progress'],
    note: 'Fee-change skill v2 is ready and waiting on Compliance. Rather than leave him idle, queued a task to map the IPS refresh workflow.',
  },
  {
    personKey: 'jonas',
    daysAgo: 4,
    tags: ['blocked', 'escalated'],
    note: 'Interview on rebalancing exceptions ran 12 turns with the decision rules and exceptions still empty; Jonas says the rules live in the rebalancer settings the trading desk owns. Sent to Tom to bring the trading desk in.',
  },
  {
    personKey: 'amara',
    daysAgo: 3,
    tags: ['calibration'],
    note: "v2 of her skill removed the step that keeps account numbers out. She was sure it was fine and the grader found a serious problem. Her first miss; Tom's note landed well.",
  },
];

export const DEMO_BASELINES: DemoBaseline[] = [
  {
    personKey: 'priya',
    workflowKey: 'monday-meeting-prep',
    task: 'Monday client meeting prep',
    method: 'interview_estimate',
    minutesPerWeek: 480,
    reworkMinutesPerWeek: 45,
    approvedByKey: 'daniel',
    capturedDaysAgo: 60,
    measurements: [
      { minutesPerWeek: 390, reworkMinutesPerWeek: 60, source: 'self' },
      { minutesPerWeek: 300, reworkMinutesPerWeek: 40, source: 'self' },
      { minutesPerWeek: 240, reworkMinutesPerWeek: 30, source: 'auditor' },
    ],
  },
  {
    personKey: 'priya',
    workflowKey: 'annual-review-deck',
    task: 'Annual review deck assembly',
    method: 'interview_estimate',
    minutesPerWeek: 420,
    reworkMinutesPerWeek: 60,
    approvedByKey: 'daniel',
    capturedDaysAgo: 60,
    measurements: [
      { minutesPerWeek: 410, reworkMinutesPerWeek: 60, source: 'self' },
      { minutesPerWeek: 360, reworkMinutesPerWeek: 50, source: 'self' },
      { minutesPerWeek: 300, reworkMinutesPerWeek: 45, source: 'auditor' },
    ],
  },
  {
    personKey: 'priya',
    workflowKey: 'rmd-letter-drafting',
    task: 'RMD letter drafting',
    method: 'interview_estimate',
    minutesPerWeek: 90,
    reworkMinutesPerWeek: 15,
    approvedByKey: 'daniel',
    capturedDaysAgo: 60,
    measurements: [
      { minutesPerWeek: 90, reworkMinutesPerWeek: 15, source: 'self' },
      { minutesPerWeek: 80, reworkMinutesPerWeek: 10, source: 'self' },
      { minutesPerWeek: 60, reworkMinutesPerWeek: 10, source: 'self' },
    ],
  },
  {
    personKey: 'hannah',
    workflowKey: 'annual-review-deck',
    task: 'Annual review deck assembly',
    method: 'time_diary',
    minutesPerWeek: 600,
    reworkMinutesPerWeek: 90,
    approvedByKey: 'daniel',
    capturedDaysAgo: 58,
    measurements: [
      { minutesPerWeek: 540, reworkMinutesPerWeek: 80, source: 'self' },
      { minutesPerWeek: 420, reworkMinutesPerWeek: 60, source: 'self' },
      { minutesPerWeek: 360, reworkMinutesPerWeek: 45, source: 'auditor' },
    ],
  },
  {
    personKey: 'grace',
    workflowKey: 'cd-memo-drafting',
    task: 'CD memo drafting',
    method: 'interview_estimate',
    minutesPerWeek: 240,
    reworkMinutesPerWeek: 40,
    approvedByKey: 'daniel',
    capturedDaysAgo: 46,
    measurements: [
      { minutesPerWeek: 230, reworkMinutesPerWeek: 40, source: 'self' },
      { minutesPerWeek: 180, reworkMinutesPerWeek: 25, source: 'self' },
      { minutesPerWeek: 170, reworkMinutesPerWeek: 20, source: 'self' },
    ],
  },
  {
    personKey: 'marcus',
    workflowKey: 'client-followup',
    task: 'Client follow-up emails and CRM notes',
    method: 'interview_estimate',
    minutesPerWeek: 150,
    reworkMinutesPerWeek: 20,
    approvedByKey: 'sofia',
    capturedDaysAgo: 13,
    measurements: [
      { minutesPerWeek: 120, reworkMinutesPerWeek: 25, source: 'self' },
    ],
  },
  {
    personKey: 'sofia',
    workflowKey: 'proposal-assembly',
    task: 'Proposal assembly',
    method: 'time_diary',
    minutesPerWeek: 480,
    reworkMinutesPerWeek: 60,
    approvedByKey: 'daniel',
    capturedDaysAgo: 58,
    measurements: [
      { minutesPerWeek: 450, reworkMinutesPerWeek: 60, source: 'self' },
      { minutesPerWeek: 330, reworkMinutesPerWeek: 45, source: 'self' },
      { minutesPerWeek: 300, reworkMinutesPerWeek: 40, source: 'auditor' },
    ],
  },
  {
    personKey: 'nathan',
    workflowKey: 'client-followup',
    task: 'Client follow-up emails and CRM notes',
    method: 'interview_estimate',
    minutesPerWeek: 180,
    reworkMinutesPerWeek: 30,
    approvedByKey: 'sofia',
    capturedDaysAgo: 55,
    measurements: [
      { minutesPerWeek: 150, reworkMinutesPerWeek: 30, source: 'self' },
      { minutesPerWeek: 100, reworkMinutesPerWeek: 15, source: 'self' },
      { minutesPerWeek: 90, reworkMinutesPerWeek: 15, source: 'auditor' },
    ],
  },
  {
    personKey: 'kevin',
    workflowKey: 'fee-change-comms',
    task: 'Fee-change client comms',
    method: 'interview_estimate',
    minutesPerWeek: 150,
    reworkMinutesPerWeek: 30,
    approvedByKey: 'sofia',
    capturedDaysAgo: 35,
    measurements: [
      { minutesPerWeek: 150, reworkMinutesPerWeek: 30, source: 'self' },
      { minutesPerWeek: 140, reworkMinutesPerWeek: 35, source: 'self' },
      { minutesPerWeek: 160, reworkMinutesPerWeek: 45, source: 'self' },
    ],
  },
  {
    personKey: 'tom',
    workflowKey: 'onboarding-packet-qa',
    task: 'Onboarding packet QA',
    method: 'time_diary',
    minutesPerWeek: 630,
    reworkMinutesPerWeek: 90,
    approvedByKey: 'elena',
    capturedDaysAgo: 13,
    measurements: [
      { minutesPerWeek: 540, reworkMinutesPerWeek: 80, source: 'self' },
    ],
  },
  {
    personKey: 'amara',
    workflowKey: 'crm-note-cleanup',
    task: 'CRM note cleanup',
    method: 'time_diary',
    minutesPerWeek: 360,
    reworkMinutesPerWeek: 30,
    approvedByKey: 'tom',
    capturedDaysAgo: 13,
    measurements: [
      { minutesPerWeek: 200, reworkMinutesPerWeek: 40, source: 'self' },
    ],
  },
  {
    personKey: 'jonas',
    workflowKey: 'rebalancing-exception-memo',
    task: 'Rebalancing exception memos',
    method: 'interview_estimate',
    minutesPerWeek: 240,
    reworkMinutesPerWeek: 30,
    approvedByKey: 'tom',
    capturedDaysAgo: 12,
    measurements: [
      { minutesPerWeek: 260, reworkMinutesPerWeek: 50, source: 'self' },
    ],
  },
];

export const DEMO_ESCALATIONS: DemoEscalation[] = [
  {
    sourceAgent: 'coach',
    kind: 'escalation',
    subjectType: 'person',
    subjectRef: { kind: 'person', key: 'rajesh' },
    reason:
      'Could not unblock: three sessions without an artifact; learner reports no time during plan season. Needs a manager conversation, not more coaching.',
    assigneeKey: 'daniel',
    state: 'open',
    slaDueDaysAgo: -2,
    createdDaysAgo: 8,
  },
  {
    sourceAgent: 'builder',
    kind: 'escalation',
    subjectType: 'skill',
    subjectRef: { kind: 'skill', key: 'attestation-summary' },
    reason:
      'Builder confidence 0.42: attestation export format unconfirmed in the interview and exceptions reference staff by id; drafted with a de-identification step but unsure it is sufficient for the CCO.',
    assigneeKey: 'zain',
    state: 'open',
    slaDueDaysAgo: -1,
    createdDaysAgo: 5,
  },
  {
    sourceAgent: 'interviewer',
    kind: 'escalation',
    subjectType: 'workflow',
    subjectRef: { kind: 'workflow', key: 'rebalancing-exception-memo' },
    reason:
      'Schema incomplete after 12 turns: decisions and exceptions still empty. Owner says the rules live in the Orion rebalancer configuration owned by the trading desk.',
    assigneeKey: 'tom',
    state: 'in_progress',
    slaDueDaysAgo: 0,
    createdDaysAgo: 4,
  },
  {
    sourceAgent: 'promoter',
    kind: 'approval',
    subjectType: 'promotion_request',
    subjectRef: { kind: 'promotion', key: 'pr-fee-v2' },
    reason:
      'High exposure: fee-change-comms v2 produces client fee communications. Champion approved; Compliance approval required before merge.',
    assigneeKey: 'elena',
    state: 'open',
    slaDueDaysAgo: 1,
    createdDaysAgo: 8,
  },
  {
    sourceAgent: 'system',
    kind: 'stalled',
    subjectType: 'person',
    subjectRef: { kind: 'person', key: 'laura' },
    reason:
      'Activity down 58% versus prior month and no artifact in 14 days at L0. Coach note suggests a tool issue (template change).',
    assigneeKey: 'sofia',
    state: 'open',
    slaDueDaysAgo: -3,
    createdDaysAgo: 2,
  },
  {
    sourceAgent: 'system',
    kind: 'access_request',
    subjectType: 'skill',
    subjectRef: { kind: 'skill', key: 'advisor-meeting-prep' },
    reason:
      'Megan Tully (Client Service Ops) requested access to fp-meeting-prep / advisor-meeting-prep for onboarding-meeting prep. Plugin is assigned to Financial Planning only.',
    assigneeKey: 'daniel',
    state: 'open',
    slaDueDaysAgo: -4,
    createdDaysAgo: 1,
  },
  {
    sourceAgent: 'coach',
    kind: 'escalation',
    subjectType: 'person',
    subjectRef: { kind: 'person', key: 'owen' },
    reason: 'No login since week 2 and no response to nudges.',
    assigneeKey: 'elena',
    state: 'resolved',
    slaDueDaysAgo: 41,
    resolution:
      'Parental leave confirmed by Daniel. Seat paused; re-onboard on return.',
    resolvedDaysAgo: 44,
    createdDaysAgo: 46,
  },
  {
    sourceAgent: 'grader',
    kind: 'escalation',
    subjectType: 'skill',
    subjectRef: { kind: 'skill', key: 'rebalancing-exception-memo' },
    reason:
      'Security review on v2: high severity. Instructs pasting raw rebalancer output, which carries account numbers, and removes the step-1 check; steps no longer honour the boundary declaration.',
    assigneeKey: 'tom',
    state: 'resolved',
    slaDueDaysAgo: 2,
    resolution:
      'Promotion sent back with note; Amara restoring the stripped-export step.',
    resolvedDaysAgo: 3,
    createdDaysAgo: 3,
  },
];

export const DEMO_WAVES = [
  {
    name: 'Wave 1: Planning and Advisors',
    number: 1,
    teamSlugs: ['fp', 'wa'],
    startsDaysAgo: 63,
    endsDaysAgo: 21,
    targets: {
      skillsShipped: 4,
      activePct: 60,
      baselineCoveragePct: 80,
      hoursBackPerPerson: 2,
    },
    status: 'complete' as const,
  },
  {
    name: 'Wave 2: All teams, champions in the queue',
    number: 2,
    teamSlugs: ['fp', 'wa', 'cso'],
    startsDaysAgo: 14,
    endsDaysAgo: -28,
    targets: {
      skillsShipped: 6,
      activePct: 65,
      baselineCoveragePct: 85,
      hoursBackPerPerson: 2.5,
    },
    status: 'active' as const,
  },
];

export const DEMO_READOUTS = [
  {
    scopeType: 'org' as const,
    scopeKey: null as string | null,
    title: 'Wave 1 readout: Meridian Wealth Partners',
    periodStartDaysAgo: 63,
    periodEndDaysAgo: 21,
    metrics: {
      seatsInProgram: 12,
      weeklyActiveOnRealWorkPct: 67,
      weeklyActiveOnRealWorkPctBaseline: 33,
      skillsPromoted: 4,
      skillsTarget: 4,
      baselineCoveragePct: 83,
      hoursBackPerPersonPerWeekNet: 2.1,
      hoursBackTotalNetWave: 148,
      reworkMinutesPerWeekAvgBefore: 48,
      reworkMinutesPerWeekAvgAfter: 33,
      rungDistribution: { L0: 1, L1: 3, L2: 4, L3: 2, L4: 1, L5: 1 },
      stalled: 2,
      promotionsApproved: 4,
      promotionsSentBack: 0,
      championHoursLogged: 71,
      programCostUsd: 50000,
      returnUsdAtLoadedRate: 21460,
    },
    narrative:
      "Over the six weeks of Wave 1, weekly active on real work across the twelve Financial Planning and Wealth Advisor seats rose from 33% at the scoping call to 67% in the final week [1], clearing the 60% target. Four skills were promoted through the governed queue, each with a boundary declaration, a Grader pass and a named approver [2]; the two most used, advisor-meeting-prep and client-followup-notes, now account for the majority of skill activations in the org [3]. Baselines were captured for ten of the twelve workflows learners named at intake (83%) [4]. Against those baselines, participants returned 2.1 hours per person per week net of rework in the final measurement period, 148 hours across the wave [5]; rework fell from 48 to 33 minutes per week on measured workflows, which is the figure that distinguishes hours back from hours moved [5]. Two learners stalled, one for leave and one for workload, and both are recorded with reasons rather than counted as attrition [6]. At the client's loaded rate of $145 per hour the return in the wave was $21,460 against $50,000 of program fees; the return compounds as skills stay in use after the wave while the fee does not, and the Wave 2 measurement period will report the run-rate [7].",
    footnotes: [
      {
        ref: '[1]',
        source:
          'Analytics API, per-user daily metrics; "active" = message sent or Code/Cowork session with tool use (Anthropic definition). Seeded stand-in until the key is configured.',
        baseline: '33% from the scoping-call estimate, 24 June.',
      },
      {
        ref: '[2]',
        source:
          'Activate promotion_requests with decision=merged and audit_log promotion.approved entries, Wave 1 window.',
      },
      {
        ref: '[3]',
        source: 'SkillUsage daily activations joined to skills by name.',
      },
      {
        ref: '[4]',
        source:
          'Baseline records with approvedByPersonId set, against the workflow maps created from intake.',
        baseline:
          'Method: interview estimate with champion sign-off (default), time diary where marked.',
      },
      {
        ref: '[5]',
        source:
          'Measurement records, period 3, source=auditor where available else self; hours back = (baseline minutes − measured minutes) − (measured rework − baseline rework), summed.',
        baseline: 'Per-person baselines listed in the appendix.',
      },
      {
        ref: '[6]',
        source: 'Escalations of kind stalled/escalation with Coach notes.',
      },
      {
        ref: '[7]',
        source:
          'CostInput: loadedHourlyRate 145, lightciFeesMonthly 25000 × 2 months.',
      },
    ],
  },
  {
    scopeType: 'team' as const,
    scopeKey: 'fp' as string | null,
    title: 'Financial Planning: last 30 days',
    periodStartDaysAgo: 30,
    periodEndDaysAgo: 0,
    metrics: {
      seats: 6,
      weeklyActiveOnRealWorkPct: 67,
      rungDistribution: { L0: 1, L1: 1, L2: 2, L3: 1, L5: 1 },
      skillsPublished: 2,
      skillsInReview: 1,
      skillsDeprecated: 1,
      hoursBackPerPersonPerWeekNet: 2.9,
      reviewQueueOpen: 2,
      reviewQueueMedianAgeDays: 4,
      revisitsDue: 4,
      revisitsOverdue: 1,
      stalled: 1,
      inactive: 1,
    },
    narrative:
      "Financial Planning is the most advanced team: four of six seats are active on real work weekly [1], two skills are published from this team and a third (rmd-letter-draft) is awaiting Daniel Okafor's review before the November batch [2]. Hours back net of rework average 2.9 per active person per week, driven by Monday meeting prep, where Priya Nair's measured time fell from 480 to 240 minutes per week with rework down from 45 to 30 minutes [3]. Hannah Whitfield progressed from L1 to L3 in 39 days and is a champion candidate [4]. Two people are not progressing: Rajesh Menon (no artifact in 24 days, workload) is escalated to Daniel, and Owen Castellano is on leave and marked inactive [5]. The review queue holds two items with a median age of four days, inside the team's five-day SLA [6].",
    footnotes: [
      { ref: '[1]', source: 'UsageSnapshot, last 7 days, team fp.' },
      {
        ref: '[2]',
        source: 'Skills with teamId=fp by status; PromotionRequest #25.',
      },
      {
        ref: '[3]',
        source:
          'Measurement period 3 vs Baseline for Priya Nair, workflow monday-meeting-prep.',
        baseline:
          '480 min/week, 45 min rework, interview estimate approved by Daniel Okafor.',
      },
      { ref: '[4]', source: 'Placements for Hannah Whitfield.' },
      { ref: '[5]', source: 'Escalations and Coach notes.' },
      {
        ref: '[6]',
        source:
          'Exercises of kind review with status active for the fp champion.',
      },
    ],
  },
];

export const DEMO_AUDIT: {
  actorKey?: string;
  action: string;
  subjectType: string;
  subjectRef?: {
    kind: 'skill' | 'promotion' | 'org' | 'wave' | 'team';
    key: string;
  };
  meta: Record<string, unknown>;
  daysAgo: number;
}[] = [
  {
    actorKey: 'elena',
    action: 'policy.updated',
    subjectType: 'org',
    subjectRef: { kind: 'org', key: 'meridian' },
    meta: {
      version: 2,
      approvedBy: 'Margaret Osei-Bonsu',
      change:
        'Added explicit read-only clause for Salesforce, Orion and eMoney; named the three human review points.',
    },
    daysAgo: 40,
  },
  {
    actorKey: 'elena',
    action: 'boundary.updated',
    subjectType: 'org',
    subjectRef: { kind: 'org', key: 'meridian' },
    meta: {
      added: { allowedDataClasses: ['calendar'] },
      reason:
        'Meeting-prep skill needs attendee lists; calendar entries carry no restricted data.',
    },
    daysAgo: 50,
  },
  {
    actorKey: 'zain',
    action: 'wave.started',
    subjectType: 'wave',
    subjectRef: { kind: 'wave', key: '1' },
    meta: { teams: ['fp', 'wa'], seats: 12 },
    daysAgo: 63,
  },
  {
    actorKey: 'sofia',
    action: 'promotion.approved',
    subjectType: 'promotion_request',
    subjectRef: { kind: 'promotion', key: 'pr-meeting-prep-v3' },
    meta: { skill: 'advisor-meeting-prep', version: 3, gradeScore: 0.89 },
    daysAgo: 20,
  },
  {
    actorKey: 'zain',
    action: 'promotion.merged',
    subjectType: 'promotion_request',
    subjectRef: { kind: 'promotion', key: 'pr-meeting-prep-v3' },
    meta: {
      skill: 'advisor-meeting-prep',
      tag: 'advisor-meeting-prep@v3',
      prNumber: 14,
    },
    daysAgo: 20,
  },
  {
    actorKey: 'daniel',
    action: 'promotion.approved',
    subjectType: 'promotion_request',
    subjectRef: { kind: 'promotion', key: 'pr-followup-v4' },
    meta: { skill: 'client-followup-notes', version: 4, gradeScore: 0.89 },
    daysAgo: 11,
  },
  {
    actorKey: 'zain',
    action: 'promotion.merged',
    subjectType: 'promotion_request',
    subjectRef: { kind: 'promotion', key: 'pr-followup-v4' },
    meta: {
      skill: 'client-followup-notes',
      tag: 'client-followup-notes@v4',
      prNumber: 19,
    },
    daysAgo: 11,
  },
  {
    actorKey: 'daniel',
    action: 'promotion.approved',
    subjectType: 'promotion_request',
    subjectRef: { kind: 'promotion', key: 'pr-onboarding-v2' },
    meta: { skill: 'onboarding-packet-qa', version: 2, gradeScore: 0.9 },
    daysAgo: 7,
  },
  {
    actorKey: 'zain',
    action: 'promotion.merged',
    subjectType: 'promotion_request',
    subjectRef: { kind: 'promotion', key: 'pr-onboarding-v2' },
    meta: {
      skill: 'onboarding-packet-qa',
      tag: 'onboarding-packet-qa@v2',
      prNumber: 22,
    },
    daysAgo: 7,
  },
  {
    actorKey: 'tom',
    action: 'promotion.sent_back',
    subjectType: 'promotion_request',
    subjectRef: { kind: 'promotion', key: 'pr-crm-v2' },
    meta: {
      skill: 'rebalancing-exception-memo',
      version: 2,
      securityFindings: 1,
    },
    daysAgo: 3,
  },
  {
    actorKey: 'sofia',
    action: 'skill.deprecated',
    subjectType: 'skill',
    subjectRef: { kind: 'skill', key: 'crm-note-cleanup' },
    meta: { successor: 'client-followup-notes', reason: 'duplicate trigger' },
    daysAgo: 20,
  },
  {
    actorKey: 'zain',
    action: 'wave.started',
    subjectType: 'wave',
    subjectRef: { kind: 'wave', key: '2' },
    meta: { teams: ['fp', 'wa', 'cso'], seats: 18 },
    daysAgo: 14,
  },
];

export const DEMO_INTERVIEWS: DemoInterview[] = [
  {
    personKey: 'priya',
    mode: 'intake',
    status: 'complete',
    voice: false,
    completeness: 1,
    createdDaysAgo: 62,
    completedDaysAgo: 62,
    result: {
      workflowKeys: [
        'monday-meeting-prep',
        'annual-review-deck',
        'rmd-letter-drafting',
      ],
      placementRung: 1,
      profile: { selfRatedComfort: 3 },
    },
    checkerFlags: [],
    scribe: {
      role: 'Senior Financial Planner supporting three advisors (Lang, Alvarez, Osei)',
      responsibilities: [
        'Monday client meeting prep',
        'Annual review decks',
        'RMD letters',
        'CD memos',
      ],
      weeklyWorkflows: [
        {
          name: 'Monday client meeting prep',
          minutesPerRun: 50,
          runsPerWeek: 10,
          systems: ['Salesforce', 'Orion', 'eMoney'],
        },
        {
          name: 'Annual review deck assembly',
          minutesPerRun: 210,
          runsPerWeek: 2,
          systems: ['eMoney', 'Orion', 'PowerPoint'],
        },
        {
          name: 'RMD letter drafting',
          minutesPerRun: 20,
          runsPerWeek: 4,
          systems: ['Orion', 'Word'],
          seasonal: 'November batch',
        },
      ],
      claudeUseToday:
        'Rewording emails; summarising eMoney reports; one abandoned Project',
      sensitivities: ['Never the full Orion report; summary page only'],
      selfRatedComfort: 3,
    },
    transcript: [
      {
        role: 'interviewer',
        content:
          'Thanks for making time, Priya. To start: what does a normal week look like for you, and which parts of it repeat?',
      },
      {
        role: 'user',
        content:
          'Monday is meeting prep for my three advisors, eight to ten briefs. Tuesday to Thursday is mostly plan work, and this time of year that means annual review decks, two or three a week. RMD letters take over in November. And CD memos whenever a plan changes, maybe one a week for me.',
      },
      {
        role: 'scribe',
        content:
          'Captured four recurring workflows: Monday meeting prep (8–10/week), annual review decks (2–3/week, seasonal), RMD letters (November batch), CD memos (~1/week).',
      },
      {
        role: 'interviewer',
        content:
          'Take the Monday briefs. Walk me through one, from the first thing you open to the moment the advisor has it.',
      },
      {
        role: 'user',
        content:
          'I open the Salesforce meeting record and pull the summary of the last two notes. Then the Orion household page for allocation, cash and RMD status, and eMoney for open action items. Then I write the five sections from our template. Forty-five minutes to an hour if it is straightforward. The advisor reads it before the meeting; it never goes into Salesforce.',
      },
      {
        role: 'scribe',
        content:
          'Monday meeting prep: inputs Salesforce summary export, Orion household summary page, eMoney open items, calendar. Steps: gather (human), draft five sections (human today), advisor review (human). Output: one-page brief, not entered into CRM. 50 min/run.',
      },
      {
        role: 'checker',
        content:
          'Missing: what must never appear in the brief, and any decision rules (e.g. RMD handling).',
      },
      {
        role: 'interviewer',
        content:
          'What must never appear in a brief, and what do you do when a household has an RMD due?',
      },
      {
        role: 'user',
        content:
          'No account numbers, ever; we say "Hale IRA", not the number. No statement pages. If there is an RMD due this year the brief has to say the rounded amount and whether they already have a method set up, because that is the first thing the advisor gets asked.',
      },
      {
        role: 'scribe',
        content:
          'mustNeverLeave: account_numbers, statements_raw. Decision: RMD due this year → section 2 states rounded amount and method on file.',
      },
      { role: 'interviewer', content: 'How do you use Claude today?' },
      {
        role: 'user',
        content:
          'Rewording client emails, summarising long eMoney reports. I tried a Project but I did not know what to put in it, so I stopped.',
      },
      {
        role: 'interviewer',
        content:
          'That is exactly what the Project step teaches, and your Monday briefs are the perfect case for it. Last question: on a scale of one to five, how comfortable are you with Claude today?',
      },
      {
        role: 'user',
        content:
          'Three. I can get things out of it but I do not trust it without reading every line.',
      },
      {
        role: 'scribe',
        content:
          'Self-rated comfort 3. Recommend diagnostic at L1; likely L2 path via Monday prep Project.',
      },
    ],
  },
  {
    personKey: 'tom',
    mode: 'champion',
    teamSlug: 'cso',
    status: 'active',
    voice: true,
    completeness: 0.55,
    createdDaysAgo: 10,
    checkerFlags: [
      {
        field: 'workflows[1].decisions',
        issue:
          'CRM note cleanup: no rule for notes mentioning complaints (later supplied by Amara).',
      },
      {
        field: 'workflows[2]',
        issue:
          'Attestation summaries: export format and de-identification method not confirmed.',
      },
      {
        field: 'team.priorities',
        issue: 'Ranking of the four candidates not yet stated by champion.',
      },
    ],
    scribe: {
      teamPurpose:
        'Onboarding, account maintenance, CRM hygiene, compliance attestations, operational exceptions.',
      workflows: [
        {
          name: 'Onboarding packet QA',
          minutesPerRun: 90,
          runsPerWeek: 7,
          inputsClaudeMaySee: 'checklist, document names and page counts',
          mustNever: 'the documents themselves',
        },
        { name: 'CRM note cleanup', minutesPerRun: 8, runsPerWeek: 45 },
        {
          name: 'Compliance attestation summaries',
          minutesPerRun: 180,
          runsPerWeek: 0.25,
        },
        {
          name: 'Rebalancing exception memos',
          minutesPerRun: 30,
          runsPerWeek: 8,
        },
      ],
      sensitivities: [
        'Packets are PII',
        'Note bodies may contain account numbers',
        'Attestation exceptions name staff',
      ],
    },
    transcript: [
      {
        role: 'interviewer',
        content:
          'Tom, what does Client Service Ops do every week that you would most like to hand to a well-behaved assistant?',
      },
      {
        role: 'user',
        content:
          'Onboarding packet QA is the one everyone hates. Twelve to fifteen documents per new household, a forty-item checklist, and the same six things wrong every time.',
      },
      {
        role: 'scribe',
        content:
          'Workflow 1: Onboarding packet QA. 12–15 docs, 40-item checklist, six recurring defects.',
      },
      {
        role: 'interviewer',
        content: 'How is QA done now, and how long does it take?',
      },
      {
        role: 'user',
        content:
          'By eye against the checklist, in DocuSign and SharePoint. About ninety minutes a packet, six to eight a week.',
      },
      { role: 'interviewer', content: 'What could Claude be allowed to see?' },
      {
        role: 'user',
        content:
          'The checklist and the document names and page counts. Not the documents. They are full of PII and account numbers. That is the constraint I keep coming back to.',
      },
      {
        role: 'scribe',
        content:
          'Boundary for workflow 1: may_read checklist + inventory; must_never_receive documents. Readiness moderate.',
      },
      {
        role: 'checker',
        content:
          "Ask for the other recurring workflows and the team's ranking before closing.",
      },
      {
        role: 'interviewer',
        content:
          'What else repeats? And when we have the list, I will ask you to rank them.',
      },
      {
        role: 'user',
        content:
          'CRM note cleanup, Amara owns that and already has something working. Quarterly attestation summaries for Margaret. And Jonas does the rebalancing exception memos every day. Ranking... let me think about it and come back.',
      },
      {
        role: 'scribe',
        content: 'Workflows 2–4 captured at headline level. Ranking pending.',
      },
    ],
  },
  {
    personKey: 'jonas',
    mode: 'workflow',
    teamSlug: 'cso',
    workflowKey: 'rebalancing-exception-memo',
    status: 'active',
    voice: false,
    completeness: 0.45,
    createdDaysAgo: 9,
    checkerFlags: [
      {
        field: 'decisions',
        issue:
          'No rule stated for when a drift exception is held vs traded; owner says rules live in the rebalancer config.',
      },
      {
        field: 'exceptions',
        issue: 'No exception handling captured after 12 turns.',
      },
      {
        field: 'humanReview',
        issue: 'Who reviews the memo before the advisor sees it?',
      },
    ],
    scribe: {
      purpose: 'Explain why a rebalancing trade was held or overridden.',
      trigger: 'Orion rebalancer flags an exception.',
      frequency: 'daily',
      minutesPerRun: 30,
      runsPerWeek: 8,
      inputs: [
        {
          name: 'Exception row',
          source: 'Orion export',
          dataClass: 'aggregated_client_summaries',
        },
      ],
      steps: [
        { order: 1, action: 'Export exceptions', actor: 'human' },
        { order: 2, action: 'Draft memo', actor: 'claude' },
      ],
      systems: ['Orion', 'Salesforce'],
    },
    transcript: [
      {
        role: 'interviewer',
        content:
          'Jonas, when the rebalancer flags an exception, what decides whether you hold it or let it trade?',
      },
      {
        role: 'user',
        content:
          'Mostly the reason code. Some codes we always hold, some we trade unless the advisor says otherwise.',
      },
      {
        role: 'interviewer',
        content: 'Can you list the codes and which bucket each is in?',
      },
      {
        role: 'user',
        content:
          'Not from memory. They are in the rebalancer configuration; the trading desk maintains that.',
      },
      {
        role: 'checker',
        content:
          'Decision rule not captured; source is a system configuration owned by another team.',
      },
      {
        role: 'interviewer',
        content:
          'What about exceptions to the exceptions: a case where the code says trade but you held anyway?',
      },
      {
        role: 'user',
        content:
          'Tax-loss season, sometimes. Or if the household is mid-transfer. But those are judgement calls.',
      },
      {
        role: 'interviewer',
        content:
          'Who makes that judgement call, and is there a rule you could write down for it?',
      },
      {
        role: 'user',
        content: 'Me, usually. I do not think there is a written rule.',
      },
      {
        role: 'scribe',
        content:
          'Exceptions: tax-loss season hold; mid-transfer hold. Rules unwritten.',
      },
      {
        role: 'checker',
        content:
          '12 turns; decisions and exceptions still incomplete. Recommend escalation to champion to bring the trading desk into the session.',
      },
      {
        role: 'interviewer',
        content:
          'I am going to pause here and ask Tom to bring the trading desk in, so we capture the rules from the people who own them rather than guess.',
      },
    ],
  },
];

export const DEMO_AGENT_RUNS: DemoAgentRun[] = [
  {
    agent: 'grader',
    task: 'grader.submission',
    personKey: 'priya',
    input: {
      exercise: 'priya-project-annual-review',
      rubric: ['L2.project_design', 'L2.selection'],
    },
    output: { score: 0.9, decision: 'pass' },
    daysAgo: 7,
  },
  {
    agent: 'grader',
    task: 'grader.submission',
    personKey: 'priya',
    input: { exercise: 'priya-project-rmd' },
    output: { score: 0.9, decision: 'pass' },
    daysAgo: 16,
  },
  {
    agent: 'grader',
    task: 'grader.submission',
    personKey: 'marcus',
    input: { exercise: 'marcus-fee-explainer' },
    output: { score: 0.5, decision: 'revise', tryNext: true },
    daysAgo: 7,
  },
  {
    agent: 'grader',
    task: 'grader.submission',
    personKey: 'marcus',
    input: { exercise: 'marcus-discovery-summary' },
    output: { score: 0.79, decision: 'pass' },
    daysAgo: 10,
  },
  {
    agent: 'grader',
    task: 'grader.skill',
    personKey: 'amara',
    input: { skill: 'rebalancing-exception-memo', version: 2 },
    output: { score: 0.76, decision: 'revise', securityFindings: 1 },
    daysAgo: 3,
  },
  {
    agent: 'grader',
    task: 'grader.skill',
    personKey: 'kevin',
    input: { skill: 'fee-change-comms', version: 2 },
    output: { score: 0.88, decision: 'pass' },
    daysAgo: 9,
  },
  {
    agent: 'grader',
    task: 'grader.skill',
    personKey: 'tom',
    input: { skill: 'onboarding-packet-qa', version: 2 },
    output: { score: 0.9, decision: 'pass' },
    daysAgo: 8,
  },
  {
    agent: 'grader',
    task: 'grader.security-review',
    personKey: 'amara',
    input: { skill: 'rebalancing-exception-memo', version: 2 },
    output: { findings: [{ severity: 'high' }] },
    daysAgo: 3,
    model: 'claude-sonnet-5',
  },
  {
    agent: 'coach',
    task: 'coach.next-exercise',
    personKey: 'priya',
    input: {
      rung: 2,
      contextsPassed: ['meeting-prep', 'rmd-letters', 'annual-review'],
      flags: ['project-too-big'],
    },
    output: {
      title: 'Tighten your Monday prep Project: what to leave out',
      contextTag: 'meeting-prep',
    },
    daysAgo: 1,
  },
  {
    agent: 'coach',
    task: 'coach.next-exercise',
    personKey: 'marcus',
    input: { rung: 1, lastDecision: 'revise' },
    output: { title: 'Draft the Henderson follow-up email' },
    daysAgo: 2,
  },
  {
    agent: 'coach',
    task: 'coach.hint',
    personKey: 'marcus',
    input: { exercise: 'marcus-henderson-followup', hintIndex: 0 },
    output: {
      hint: "Use Sofia's three parts: what we discussed, what we agreed, what we need from you.",
    },
    daysAgo: 1,
    model: 'claude-sonnet-5',
  },
  {
    agent: 'coach',
    task: 'coach.revisit-schedule',
    personKey: 'priya',
    input: { competency: 'L1.discernment', lastScore: 0.7 },
    output: { step: 0, days: 2 },
    daysAgo: 12,
    model: 'claude-sonnet-5',
  },
  {
    agent: 'coach',
    task: 'coach.escalate',
    personKey: 'rajesh',
    input: { sessionsWithoutArtifact: 3 },
    output: { escalation: 'could not unblock', assignee: 'daniel' },
    daysAgo: 8,
  },
  {
    agent: 'coach',
    task: 'coach.escalate',
    personKey: 'jonas',
    input: { interviewTurns: 12, completeness: 0.45 },
    output: { escalation: 'schema incomplete', assignee: 'tom' },
    daysAgo: 4,
  },
  {
    agent: 'coach',
    task: 'coach.teaching-moment',
    personKey: 'marcus',
    input: {
      exercise: 'marcus-fee-explainer',
      issue: 'fee email compared us to other firms and mentioned performance',
    },
    output: {
      lesson: 'Paste the approved fee paragraph and say what must not appear.',
    },
    daysAgo: 7,
  },
  {
    agent: 'scorer',
    task: 'scorer.workflow',
    input: { workflow: 'compliance-attestation-summaries' },
    output: { value: 0.7, hours: 3, readiness: 0.4, exposure: 0.75 },
    daysAgo: 11,
  },
  {
    agent: 'scorer',
    task: 'scorer.workflow',
    input: { workflow: 'ips-refresh' },
    output: { value: 0.6, hours: 3, readiness: 0.5, exposure: 0.6 },
    daysAgo: 20,
  },
  {
    agent: 'scorer',
    task: 'scorer.nightly-rescore',
    input: { org: 'meridian', workflows: 11 },
    output: { changed: 2 },
    daysAgo: 1,
    model: 'claude-sonnet-5',
  },
  {
    agent: 'builder',
    task: 'builder.draft-skill',
    personKey: 'tom',
    input: { workflow: 'compliance-attestation-summaries' },
    output: {
      skill: 'attestation-summary',
      confidence: 0.42,
      escalated: true,
    },
    daysAgo: 5,
  },
  {
    agent: 'builder',
    task: 'builder.draft-skill',
    personKey: 'daniel',
    input: { workflow: 'monday-meeting-prep' },
    output: { skill: 'advisor-meeting-prep', confidence: 0.81 },
    daysAgo: 55,
  },
  {
    agent: 'interviewer',
    task: 'interviewer.turn',
    personKey: 'jonas',
    input: { session: 'rebalancing-exception-memo', turn: 12 },
    output: { completeness: 0.45, checkerFlags: 3 },
    daysAgo: 4,
  },
  {
    agent: 'interviewer',
    task: 'interviewer.turn',
    personKey: 'tom',
    input: { session: 'champion-cso', turn: 6 },
    output: { completeness: 0.55, checkerFlags: 3 },
    daysAgo: 10,
  },
  {
    agent: 'interviewer',
    task: 'interviewer.complete',
    personKey: 'priya',
    input: { session: 'intake-priya', turns: 10 },
    output: { workflowMaps: 3, placementRung: 1 },
    daysAgo: 62,
  },
  {
    agent: 'promoter',
    task: 'promoter.package',
    personKey: 'kevin',
    input: { skill: 'fee-change-comms', version: 2 },
    output: {
      prNumber: 23,
      highExposure: true,
      requiredApproverRoles: ['champion', 'compliance'],
    },
    daysAgo: 8,
  },
  {
    agent: 'promoter',
    task: 'promoter.package',
    personKey: 'hannah',
    input: { skill: 'rmd-letter-draft', version: 1 },
    output: { prNumber: 25, highExposure: false },
    daysAgo: 5,
  },
  {
    agent: 'auditor',
    task: 'auditor.readout',
    personKey: 'elena',
    input: { scope: 'org', period: 'wave-1' },
    output: { footnotes: 7, hoursBackNet: 148 },
    daysAgo: 20,
  },
  {
    agent: 'auditor',
    task: 'auditor.readout',
    personKey: 'daniel',
    input: { scope: 'team', team: 'fp', period: 'last-30-days' },
    output: { footnotes: 6 },
    daysAgo: 1,
  },
  {
    agent: 'auditor',
    task: 'auditor.measure',
    personKey: 'priya',
    input: { workflow: 'monday-meeting-prep', period: 3 },
    output: { minutesPerWeek: 240, reworkMinutesPerWeek: 30 },
    daysAgo: 2,
    model: 'claude-sonnet-5',
  },
];
