import type { ToolEnvelope, ToolName } from '../lib/envelope';
import type {
  InterviewView, LadderView, LibraryPayload, OrgPayload, PromotionQueuePayload, SubmitArtifactPayload, SubmitSkillPayload, TeamView,
} from '../types';
import { WEB, daniel, elena, marcus, megan, priya, sofia, viewerChampion, viewerLearner, viewerSponsor } from './people';
import { gradePass, gradeRevise, promotions, skillCards, skillDetail } from './skills';

const weeks = ['2026-07-13', '2026-07-20', '2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'];

export const ladder: LadderView = {
  person: priya,
  rung: 2,
  nextRung: 3,
  progress: {
    toNextRung: 0.68,
    gate: { masteryThreshold: 0.75, minContexts: 2, minJudgement: 0.6 },
    met: { mastery: false, contexts: true, judgement: true, retention: true },
  },
  competencies: [
    { code: 'C2.1', name: 'Project scoping', rung: 2, mastery: 0.82, threshold: 0.75, minContexts: 2, status: 'mastered' },
    { code: 'C2.2', name: 'Include / leave out', rung: 2, mastery: 0.71, threshold: 0.75, minContexts: 2, status: 'in_progress' },
    { code: 'C2.3', name: 'Rationale writing', rung: 2, mastery: 0.58, threshold: 0.75, minContexts: 2, status: 'in_progress' },
    { code: 'C1.2', name: 'Predict-then-critique', rung: 1, mastery: 0.66, threshold: 0.7, minContexts: 2, status: 'decayed' },
  ],
  judgement: { score: 0.72, calibration: 0.7, critiqueQuality: 0.74, trend: 'up', overconfidentRate: 0.18 },
  hoursBack: {
    thisMonthMinutes: 204,
    baselineMinutesPerWeek: 240,
    currentMinutesPerWeek: 165,
    netOfReworkMinutes: 182,
    series: weeks.map((week, i) => ({ week, minutesBack: [20, 25, 35, 30, 48, 52, 60, 75][i] })),
  },
  streak: {
    activeDays: 6,
    last14: Array.from({ length: 14 }, (_, i) => ({ day: `2026-08-${String(23 + i).padStart(2, '0')}`, active: [1, 1, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1][i] === 1 })),
  },
  nextUp: {
    id: 'ex-7', title: 'Build a Project for annual review prep', rung: 2, kind: 'build', mode: 'in_claude', workSurface: 'projects', status: 'queued',
    brief: 'Set up a Claude Project that carries the annual-review template, your firm\'s compliance notes and one anonymised household summary. Write a 5-line rationale for what you left out.',
    rationale: 'C2.3 Rationale writing is your lowest L2 competency and this is a real task on your calendar for Thursday.',
    competencyCodes: ['C2.2', 'C2.3'], estimatedMinutes: 35, contextTag: 'annual-review', scheduledFor: null, createdAt: '2026-09-04T18:00:00Z',
  },
  revisitsDue: [
    { id: 'rv-1', competencyCode: 'C1.2', competencyName: 'Predict-then-critique', prompt: 'Before you run the next follow-up email, write the one thing you expect Claude to get wrong.', dueAt: '2026-09-04T09:00:00Z', intervalStep: 2, overdue: true },
    { id: 'rv-2', competencyCode: 'C2.1', competencyName: 'Project scoping', prompt: 'Name one file in your meeting-prep Project that could be removed without changing outputs.', dueAt: '2026-09-05T09:00:00Z', intervalStep: 3, overdue: false },
  ],
  queued: [
    { id: 'ex-8', title: 'Adopt advisor-meeting-prep on a real household', rung: 2, kind: 'adopt', mode: 'in_claude', status: 'queued', brief: 'Run the team skill on Thursday\'s meeting and critique the brief.', estimatedMinutes: 20, skillId: 's-1' },
  ],
  recentGrades: [
    { submissionId: 'sub-11', exerciseTitle: 'Critique a follow-up email draft', score: 0.79, decision: 'pass', gradedAt: '2026-09-02T14:00:00Z' },
    { submissionId: 'sub-10', exerciseTitle: 'Scope a Project for RMD season', score: 0.64, decision: 'revise', gradedAt: '2026-08-29T11:00:00Z' },
  ],
  coachNotes: [{ note: 'Tends to over-include: three of four Projects carry files never referenced.', tags: ['C2.2'], createdAt: '2026-08-30T10:00:00Z' }],
};

export const library: LibraryPayload = {
  skills: skillCards,
  facets: {
    teams: [
      { id: 't-fp', name: 'Financial Planning', count: 3 },
      { id: 't-wa', name: 'Wealth Advisors', count: 1 },
      { id: 't-cso', name: 'Client Service Ops', count: 1 },
    ],
    families: [{ name: 'meeting-prep', count: 3 }, { name: 'client-comms', count: 1 }, { name: 'operations', count: 1 }],
    rungs: [{ rung: 1, count: 2 }, { rung: 2, count: 2 }, { rung: 3, count: 1 }],
    statuses: [{ status: 'published', count: 4 }, { status: 'draft', count: 1 }],
  },
};

export const submitSkill: SubmitSkillPayload = {
  grade: gradeRevise,
  skill: { ...skillDetail, ...skillCards[1], skillMd: '# RMD reminder letter\n\nDraft…', versions: [], usageByTeam: [], grades: [gradeRevise], promotion: null },
};

export const submitArtifact: SubmitArtifactPayload = {
  submission: {
    id: 'sub-12', attempt: 1,
    expectationText: 'Claude will produce a clean brief but miss the stale action items from March.',
    expectationConfidence: 0.7,
    artifact: { type: 'text', text: '…' },
    critiqueText: 'It did miss the March items, and it also invented a "next review" date that was not in the notes.',
    coldAttempt: true, submittedAt: '2026-09-05T09:40:00Z', grade: gradePass,
  },
  grade: { ...gradePass, id: 'g-5', score: 0.81, feedback: 'Your expectation was specific and correct on the stale items. Your critique caught a hallucinated date the Grader also flagged. Rationale for what you left out of the Project was thin: one line, not five.' },
  exercise: { id: 'ex-7', title: 'Build a Project for annual review prep', rung: 2, kind: 'build', mode: 'in_claude', status: 'graded', brief: '', estimatedMinutes: 35 },
  nextUp: ladder.queued?.[0] ?? null,
  promotion: null,
};

export const interview: InterviewView = {
  id: 'iv-3',
  mode: 'workflow',
  status: 'active',
  completeness: 0.55,
  transcript: [
    { role: 'interviewer', content: 'Walk me through what happens between a client booking a review and you sitting down with them.', at: '2026-09-05T10:00:00Z' },
    { role: 'user', content: 'I pull the household from Redtail, re-read last year\'s notes, check the custodian for balances, then build a brief in Word. Maybe 90 minutes per meeting, five or six a week.', at: '2026-09-05T10:01:00Z' },
    { role: 'interviewer', content: 'Which of those steps produce a document someone else reads, and which are just for you?', at: '2026-09-05T10:01:30Z' },
    { role: 'user', content: 'Only the brief. Compliance skims it if the household has a trust.', at: '2026-09-05T10:02:00Z' },
  ],
  scribe: {
    name: 'Client review meeting preparation',
    trigger: 'Client books an annual or semi-annual review',
    steps: ['Pull household from Redtail', 'Re-read last review notes', 'Check custodian balances', 'Build brief in Word'],
    systems: ['Redtail CRM', 'Schwab custodian portal', 'Word'],
    outputs: ['Meeting brief (1 page)'],
    minutesPerRun: 90,
    runsPerWeek: 5.5,
    owner: 'Priya Nair',
    humanReviewPoints: ['Compliance skims brief when household has a trust'],
    sensitivities: null,
    painPoints: null,
    baselineMethod: null,
  },
  checkerFlags: [{ field: 'runsPerWeek', issue: 'Earlier you said "five or six"; recorded as 5.5. Confirm.' }],
  turnCount: 4,
  nextQuestion: 'What data in the brief would you never want pasted into Claude — account numbers, dates of birth, anything else?',
  result: null,
};

export const team: TeamView = {
  team: { id: 't-fp', name: 'Financial Planning', slug: 'fp', plugin: 'fp-meeting-prep', champion: daniel },
  roster: [
    { ...priya, lastActiveOnRealWork: '2026-09-04', hoursBackPerWeek: 2.1, baselineMinutesPerWeek: 240, stalled: false, stalledDays: 0, revisitsOverdue: 1, activeDays30: 19, masteryAvg: 0.7 },
    { ...marcus, lastActiveOnRealWork: '2026-08-22', hoursBackPerWeek: 0.4, baselineMinutesPerWeek: 180, stalled: true, stalledDays: 14, revisitsOverdue: 3, activeDays30: 6, masteryAvg: 0.41 },
    { ...megan, lastActiveOnRealWork: '2026-09-03', hoursBackPerWeek: 0.0, baselineMinutesPerWeek: 0, stalled: false, stalledDays: 0, revisitsOverdue: 0, activeDays30: 4, masteryAvg: 0.2 },
    { ...daniel, lastActiveOnRealWork: '2026-09-05', hoursBackPerWeek: 3.6, baselineMinutesPerWeek: 300, stalled: false, stalledDays: 0, revisitsOverdue: 0, activeDays30: 24, masteryAvg: 0.9 },
  ],
  backlogTop: [
    { id: 'w-2', name: 'RMD season letters', teamId: 't-fp', teamName: 'Financial Planning', owner: priya, status: 'in_build', completeness: 0.9, championVerified: true, score: { composite: 88 }, nextWave: true, baselineMinutesPerWeek: 300, measuredMinutesPerWeek: null, hoursBackPerWeek: null },
    { id: 'w-3', name: 'Annual review deck', teamId: 't-fp', teamName: 'Financial Planning', owner: marcus, status: 'candidate', completeness: 0.6, championVerified: false, score: { composite: 74 }, nextWave: true, baselineMinutesPerWeek: 200, measuredMinutesPerWeek: null, hoursBackPerWeek: null },
    { id: 'w-4', name: 'Beneficiary change confirmations', teamId: 't-fp', teamName: 'Financial Planning', owner: null, status: 'candidate', completeness: 0.3, championVerified: false, score: { composite: 61 }, nextWave: false, baselineMinutesPerWeek: 90, measuredMinutesPerWeek: null, hoursBackPerWeek: null },
    { id: 'w-1', name: 'Client meeting preparation', teamId: 't-fp', teamName: 'Financial Planning', owner: daniel, status: 'shipped', completeness: 1, championVerified: true, score: { composite: 82 }, nextWave: false, baselineMinutesPerWeek: 240, measuredMinutesPerWeek: 95, hoursBackPerWeek: 2.4 },
    { id: 'w-5', name: 'Quarterly performance commentary', teamId: 't-fp', teamName: 'Financial Planning', owner: null, status: 'candidate', completeness: 0.2, championVerified: false, score: { composite: 52 }, nextWave: false, baselineMinutesPerWeek: 120, measuredMinutesPerWeek: null, hoursBackPerWeek: null },
  ],
  reviewQueue: [
    {
      submission: submitArtifact.submission,
      exercise: submitArtifact.exercise,
      person: priya,
    },
    {
      submission: { id: 'sub-13', attempt: 2, expectationText: 'It will get the tone right but be too long.', expectationConfidence: 0.6, artifact: {}, critiqueText: 'Too long, as expected. Missed the fee disclosure line.', coldAttempt: false, submittedAt: '2026-09-04T16:00:00Z', grade: null },
      exercise: { id: 'ex-9', title: 'Critique a fee-change letter', rung: 1, kind: 'critique', mode: 'in_claude', status: 'submitted', brief: '', estimatedMinutes: 15 },
      person: marcus,
    },
  ],
  promotionQueue: [promotions[0]],
  library: skillCards.filter((s) => s.team?.id === 't-fp'),
  stats: { activePct7d: 0.75, rungDistribution: [1, 1, 1, 0, 0, 1], hoursBackPerWeek: 6.1, skillsPublished: 3, promotionsPending: 1 },
};

export const org: OrgPayload = {
  org: { id: 'o-1', name: 'Meridian Wealth Partners', slug: 'meridian', seats: 48, premiumSeats: 12 },
  adoption: {
    active: { pctOfSeats: 0.63, trend: 'up', daily: [] },
    depth: { sessionsPerActive: 4.2, connectors: 3, skillsActivated: 9 },
    inactiveSeats: Array.from({ length: 18 }, (_, i) => ({ id: `inactive-${i}`, name: `Seat ${i + 1}`, email: '' })),
    byTeam: [
      { teamId: 't-fp', teamName: 'Financial Planning', activePct: 0.75, hoursBack: 6.1 },
      { teamId: 't-wa', teamName: 'Wealth Advisors', activePct: 0.7, hoursBack: 8.4 },
      { teamId: 't-cso', teamName: 'Client Service Ops', activePct: 0.45, hoursBack: 2.2 },
    ],
  },
  people: {
    people: [
      { id: priya.id, name: priya.name, rising: true, stalled: false, championCandidate: true, hoursBackPerWeek: 2.1 },
      { id: marcus.id, name: marcus.name, rising: false, stalled: true, hoursBackPerWeek: 0.4 },
      { id: sofia.id, name: sofia.name, rising: true, stalled: false, hoursBackPerWeek: 4.0 },
      { id: 'p-x1', name: 'Rajesh Menon', rising: false, stalled: true, hoursBackPerWeek: 0.2 },
      { id: 'p-x2', name: 'Owen Castellano', rising: true, stalled: false, hoursBackPerWeek: 1.5 },
    ],
  },
  groups: {
    groups: [
      { teamId: 't-fp', teamName: 'Financial Planning', size: 12, activePct: 0.75, hoursBackPerPerson: 0.5, skillsPublished: 3, },
      { teamId: 't-wa', teamName: 'Wealth Advisors', size: 20, activePct: 0.7, hoursBackPerPerson: 0.42, skillsPublished: 4 },
      { teamId: 't-cso', teamName: 'Client Service Ops', size: 16, activePct: 0.45, hoursBackPerPerson: 0.14, skillsPublished: 2 },
    ],
  },
  cost: {
    seats: { total: 48, active: 30, inactive: 18, costTotal: 7200, costInactive: 2700, costPerActive: 240 },
    return: { hoursBackPerMonth: 268, valueUsd: 32160, roi: 2.9 },
    waste: [{ kind: 'inactive_seat', count: 18, costUsd: 2700 }, { kind: 'unused_premium', count: 4, costUsd: 800 }],
  },
};

export const promotionQueue: PromotionQueuePayload = { promotions };

export const FIXTURES: Record<ToolName, ToolEnvelope> = {
  my_ladder: { tool: 'my_ladder', data: ladder, links: { web: `${WEB}/` }, viewer: viewerLearner },
  library: { tool: 'library', data: library, links: { web: `${WEB}/library` }, viewer: viewerLearner, input: { team: 'Financial Planning' } },
  skill_detail: { tool: 'skill_detail', data: skillDetail, links: { web: `${WEB}/library/advisor-meeting-prep` }, viewer: viewerLearner, input: { slug: 'advisor-meeting-prep' } },
  submit_skill: { tool: 'submit_skill', data: submitSkill, links: { web: `${WEB}/library/rmd-letter` }, viewer: viewerLearner },
  submit_artifact: { tool: 'submit_artifact', data: submitArtifact, links: { web: `${WEB}/exercise/ex-7` }, viewer: viewerLearner },
  map_workflow: { tool: 'map_workflow', data: interview, links: { web: `${WEB}/workflows` }, viewer: viewerLearner, input: { interview_id: 'iv-3' } },
  team: { tool: 'team', data: team, links: { web: `${WEB}/team` }, viewer: viewerChampion },
  org: { tool: 'org', data: org, links: { web: `${WEB}/mission-control` }, viewer: viewerSponsor },
  promotion_queue: { tool: 'promotion_queue', data: promotionQueue, links: { web: `${WEB}/promotions` }, viewer: viewerChampion },
};

export const ERROR_FIXTURE: ToolEnvelope = {
  tool: 'my_ladder',
  data: null,
  links: { web: `${WEB}/` },
  viewer: viewerLearner,
  error: { status: 403, title: 'Forbidden', detail: 'Your account is not in an Activate program yet. Ask your champion for an invite.' },
};

/** Mock responder for the broker API in ?mock mode. Mirrors the small set of REST paths the cards call. */
export function mockApi(path: string, method: string, body: unknown): { status: number; body: unknown } {
  const m = method.toUpperCase();
  const p = path.replace(/\?.*$/, '');
  if (p === '/ladder/me') return { status: 200, body: ladder };
  if (p === '/library') return { status: 200, body: library };
  if (/^\/skills\/[^/]+$/.test(p) && m === 'GET') return { status: 200, body: skillDetail };
  if (/^\/skills\/[^/]+\/adopt$/.test(p)) {
    const id = p.split('/')[2];
    library.skills = library.skills.map((s) => (s.id === id ? { ...s, adoptedByMe: true, activeUsers30d: s.activeUsers30d + 1 } : s));
    return { status: 201, body: { adoption: { id: 'ad-1' }, exercise: ladder.queued?.[0] } };
  }
  if (/^\/skills\/[^/]+\/fork$/.test(p)) return { status: 201, body: { ...skillDetail, id: 's-fork', slug: `${skillDetail.slug}-fork`, status: 'draft', owner: priya } };
  if (/^\/skills\/[^/]+\/promotion-requests$/.test(p)) return { status: 201, body: promotions[0] };
  if (/^\/exercises\/[^/]+\/start$/.test(p)) return { status: 200, body: { ...ladder.nextUp, status: 'active' } };
  if (/^\/interviews\/[^/]+\/turns$/.test(p)) {
    const content = String((body as { content?: string } | null)?.content ?? '');
    const next: InterviewView = {
      ...interview,
      completeness: Math.min(1, interview.completeness + 0.15),
      turnCount: interview.turnCount + 2,
      transcript: [...interview.transcript, { role: 'user', content, at: new Date().toISOString() }, { role: 'interviewer', content: 'Noted. Roughly how often does the brief get sent back by compliance, and why?', at: new Date().toISOString() }],
      scribe: { ...interview.scribe, sensitivities: ['account numbers', 'dates of birth'] },
      nextQuestion: 'Roughly how often does the brief get sent back by compliance, and why?',
    };
    Object.assign(interview, next);
    return { status: 200, body: next };
  }
  if (/^\/interviews\/[^/]+\/complete$/.test(p)) return { status: 200, body: { interview: { ...interview, status: 'complete', completeness: 1 }, workflowMapIds: ['w-9'], exercises: [] } };
  if (/^\/promotions\/[^/]+\/(approve|send-back)$/.test(p)) {
    const [, , id, action] = p.split('/');
    const idx = promotions.findIndex((x) => x.id === id);
    if (idx === -1) return { status: 404, body: { status: 404, title: 'Not Found', detail: 'Promotion not found' } };
    const updated: typeof promotions[number] = {
      ...promotions[idx],
      decision: action === 'approve' ? 'merged' : 'sent_back',
      decidedAt: new Date().toISOString(),
      approvals: action === 'approve' ? [...promotions[idx].approvals, { person: daniel, role: 'champion', at: new Date().toISOString(), note: String((body as { note?: string } | null)?.note ?? '') }] : promotions[idx].approvals,
    };
    promotions[idx] = updated;
    return { status: 200, body: updated };
  }
  if (p === '/promotions') return { status: 200, body: promotions.filter((x) => x.decision === 'pending') };
  if (/^\/team\/reviews\/[^/]+\/grade$/.test(p)) {
    const sid = p.split('/')[3];
    team.reviewQueue = team.reviewQueue.filter((r) => r.submission.id !== sid);
    return { status: 200, body: { ...gradePass, id: 'g-champ', gradedBy: daniel } };
  }
  if (p === '/team') return { status: 200, body: team };
  if (p === '/org') return { status: 200, body: org.org };
  if (p.startsWith('/mc/')) return { status: 200, body: {} };
  return { status: 404, body: { status: 404, title: 'Not Found', detail: `No mock for ${m} ${p}` } };
}

export { elena };
