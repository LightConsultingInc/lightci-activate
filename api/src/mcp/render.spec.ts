import {
  renderError,
  renderInterview,
  renderLadder,
  renderLibrary,
  renderOrg,
  renderPromotionQueue,
  renderSkillDetail,
  renderSubmitArtifact,
  renderSubmitSkill,
  renderTeam,
  rungLabel,
} from './tools/render';
import { frontmatter, slugify } from './tools/helpers';

const ladder = {
  person: { id: 'p1', name: 'Priya Nair', rung: 2 },
  rung: 2,
  nextRung: 3,
  progress: {
    toNextRung: 0.68,
    gate: { masteryThreshold: 0.75, minContexts: 2, minJudgement: 0.6 },
    met: { mastery: false, contexts: true, judgement: true, retention: true },
  },
  nextUp: {
    id: 'e1',
    title: 'Build a Project for RMD letters',
    brief: "Turn last week's prompt into a reusable Project.",
    estimatedMinutes: 25,
  },
  revisitsDue: [
    {
      id: 'r1',
      competencyCode: 'L1.discern',
      competencyName: 'Discernment',
      overdue: true,
    },
    {
      id: 'r2',
      competencyCode: 'L2.ctx',
      competencyName: 'Context selection',
      overdue: false,
    },
  ],
  hoursBack: {
    thisMonthMinutes: 204,
    baselineMinutesPerWeek: 300,
    currentMinutesPerWeek: 240,
    series: [],
  },
  judgement: { score: 0.71, calibration: 0.8, trend: 'up' },
  streak: { activeDays: 6 },
  recentGrades: [
    { exerciseTitle: 'Meeting brief', score: 0.82, decision: 'pass' },
  ],
};

describe('text renderers', () => {
  it('rungLabel', () => {
    expect(rungLabel(2)).toBe('L2 Context');
    expect(rungLabel(null)).toBe('unplaced');
  });

  it('my_ladder reads like a coach', () => {
    const text = renderLadder(ladder);
    expect(text).toContain("You're L2 Context, 68% to L3.");
    expect(text).toContain(
      'Next up: Build a Project for RMD letters (~25 min)',
    );
    expect(text).toContain(
      '2 revisits due (1 overdue): Discernment, Context selection.',
    );
    expect(text).toContain(
      '3.4h back this month vs a 5.0h/week baseline (now 4.0h/week).',
    );
    expect(text).toContain('Judgement 71%, calibration 80%, trend up.');
    expect(text).toContain('Streak: 6 active days.');
    expect(text).toContain('Recent: Meeting brief 82% pass.');
  });

  it('my_ladder handles top rung and empty payload', () => {
    expect(
      renderLadder({ rung: 5, nextRung: null, revisitsDue: [] }),
    ).toContain("You're L5 Champion, the top rung.");
    expect(renderLadder(null)).toContain('No ladder yet');
  });

  it('library lists skills and empty state', () => {
    const text = renderLibrary(
      {
        skills: [
          {
            slug: 'advisor-meeting-prep',
            name: 'Advisor meeting prep',
            triggerLine: 'Use when preparing a client review meeting.',
            owner: { name: 'Daniel Okafor' },
            team: { name: 'Financial Planning' },
            version: 3,
            activeUsers30d: 14,
            grade: { score: 0.88, decision: 'pass' },
            boundaryBadge: 'amber',
            status: 'published',
            adoptedByMe: true,
          },
        ],
      },
      { team: 'Financial Planning' },
    );
    expect(text).toContain('1 skill (team=Financial Planning):');
    expect(text).toContain(
      '- Advisor meeting prep (advisor-meeting-prep) — Use when preparing a client review meeting.',
    );
    expect(text).toContain(
      'owner Daniel Okafor, Financial Planning · v3 · 14 active users/30d · 88% pass · boundary amber · published · adopted',
    );
    expect(renderLibrary({ skills: [] }, { rung: 1 })).toContain(
      'No skills match (rung=1)',
    );
  });

  it('skill_detail includes boundary, versions, usage and SKILL.md', () => {
    const text = renderSkillDetail({
      slug: 'rmd-letter',
      name: 'RMD letter',
      triggerLine: 'Draft RMD reminder letters.',
      owner: null,
      version: 2,
      boundary: {
        readsDataClasses: ['client name', 'account type'],
        humanReview: ['before sending'],
      },
      versions: [
        { version: 2, gradeScore: 0.9, author: { name: 'Elena Marsh' } },
      ],
      usageByTeam: [{ teamName: 'Financial Planning', activations30d: 31 }],
      skillMd: '---\nname: rmd-letter\n---\n# RMD letter\n',
    });
    expect(text).toContain('owner unassigned');
    expect(text).toContain(
      'Boundary: readsDataClasses: client name, account type; humanReview: before sending',
    );
    expect(text).toContain('Versions: v2 (90%) by Elena Marsh');
    expect(text).toContain('Used by: Financial Planning 31 (activations/30d)');
    expect(text).toContain('--- SKILL.md ---\n---\nname: rmd-letter');
  });

  it('grade cards for submit_skill and submit_artifact', () => {
    const grade = {
      score: 0.72,
      decision: 'revise',
      rubric: [
        {
          criterion: 'trigger',
          label: 'Trigger precision',
          score: 0.5,
          note: 'Too broad',
        },
        { criterion: 'examples', label: 'Canonical examples', score: 0.9 },
      ],
      feedback: 'Narrow the trigger.',
      teachingMoment: 'Minimal triggers beat maximal ones.',
      securityFindings: [],
    };
    const skill = renderSubmitSkill({
      skill: { name: 'RMD letter', version: 3, status: 'draft' },
      grade,
    });
    expect(skill).toContain('Submitted RMD letter v3 (draft).');
    expect(skill).toContain('Grade: 72% — REVISE');
    expect(skill).toContain('  Trigger precision: 50% — Too broad');
    expect(skill).toContain('Needs revision');

    const artifact = renderSubmitArtifact({
      exercise: { title: 'Meeting brief' },
      submission: { attempt: 2 },
      grade: { ...grade, score: 0.86, decision: 'pass' },
      promotion: { newRung: 3 },
      nextUp: { title: 'Write a cold skill', estimatedMinutes: 40 },
    });
    expect(artifact).toContain('Submitted Meeting brief (attempt 2).');
    expect(artifact).toContain('Grade: 86% — PASS');
    expect(artifact).toContain('Promoted to L3 Skill!');
    expect(artifact).toContain('Next up: Write a cold skill (~40 min).');
  });

  it('map_workflow shows completeness, scribe and next question', () => {
    const text = renderInterview({
      mode: 'workflow',
      status: 'active',
      completeness: 0.9,
      turnCount: 6,
      scribe: {
        name: 'Quarterly review prep',
        steps: [1, 2, 3],
        systems: [],
        minutesPerRun: 45,
      },
      checkerFlags: [],
      nextQuestion: 'Who signs off before it goes to the client?',
    });
    expect(text).toContain('90% complete after 6 turns.');
    expect(text).toContain(
      'Captured so far: name: Quarterly review prep, steps (3), minutesPerRun.',
    );
    expect(text).toContain('Enough captured to finish');
    expect(text).toContain(
      'Next question: Who signs off before it goes to the client?',
    );
  });

  it('team, org and promotion queue', () => {
    const team = renderTeam({
      team: { name: 'Financial Planning', champion: { name: 'Daniel Okafor' } },
      stats: {
        activePct7d: 0.75,
        hoursBackPerWeek: 6.5,
        skillsPublished: 4,
        promotionsPending: 1,
        rungDistribution: [0, 2, 3, 1, 0, 1],
      },
      roster: [
        { name: 'Priya Nair', stalled: false },
        { name: 'Marcus Reid', stalled: true, stalledDays: 9 },
      ],
      backlogTop: [{ name: 'Annual review deck', score: { composite: 0.81 } }],
      reviewQueue: [
        {
          person: { name: 'Priya Nair' },
          exercise: { title: 'Meeting brief' },
        },
      ],
    });
    expect(team).toContain('Financial Planning — champion Daniel Okafor.');
    expect(team).toContain(
      'Active 7d 75% · 6.5h/week back · 4 skills published · 1 promotions pending.',
    );
    expect(team).toContain('Rungs: L0:0 L1:2 L2:3 L3:1 L4:0 L5:1');
    expect(team).toContain('2 people; stalled: Marcus Reid (9d).');
    expect(team).toContain('Backlog top 1: Annual review deck (81%).');
    expect(team).toContain('Review queue (1): Priya Nair — Meeting brief.');

    const org = renderOrg({
      org: { name: 'Meridian Wealth Partners', seats: 120 },
      adoption: { active: { pctOfSeats: 0.62, trend: 'up' } },
      people: {
        people: [
          { rising: true },
          { stalled: true },
          { championCandidate: true, rising: true },
        ],
      },
      groups: {
        groups: [
          {
            teamName: 'Financial Planning',
            activePct: 0.75,
            skillsPublished: 4,
          },
        ],
      },
      cost: {
        seats: { costPerActive: 48.4, inactive: 20, costInactive: 600 },
        return: { roi: 3.2, hoursBackPerMonth: 410 },
      },
    });
    expect(org).toContain('Meridian Wealth Partners — 120 seats.');
    expect(org).toContain('Adoption: 62% of seats active (up).');
    expect(org).toContain(
      'People: 3 tracked, 2 rising, 1 stalled, 1 champion candidates.',
    );
    expect(org).toContain('Groups: Financial Planning 75% active, 4 skills.');
    expect(org).toContain(
      'Cost: $48/active seat, 20 inactive seats ($600). ROI 3.2x on 410h back/month.',
    );

    const queue = renderPromotionQueue({
      promotions: [
        {
          skill: { name: 'RMD letter' },
          version: 3,
          requestedBy: { name: 'Elena Marsh' },
          prNumber: 42,
          grade: { score: 0.9, decision: 'pass' },
          boundaryCheck: { ok: true },
          approvals: [],
          requiredApproverRoles: ['champion', 'compliance'],
          highExposure: true,
          decision: 'pending',
          diffSummary: 'Tightened trigger; added two cases.\nMore detail.',
        },
      ],
      acted: {
        skill: { name: 'Meeting prep' },
        version: 2,
        decision: 'approved',
      },
    });
    expect(queue).toContain('Meeting prep v2: approved.');
    expect(queue).toContain('1 pending promotion:');
    expect(queue).toContain(
      '- RMD letter v3 by Elena Marsh (PR #42) — 90% pass, boundary ok, HIGH EXPOSURE; 0 approvals, needs champion+compliance; pending',
    );
    expect(queue).toContain('  Tightened trigger; added two cases.');
    expect(renderPromotionQueue({ promotions: [] })).toBe(
      'Promotion queue is empty.',
    );
  });

  it('errors degrade to actionable text', () => {
    expect(
      renderError('my_ladder', {
        status: 401,
        title: 'Unauthorized',
        detail: 'token expired',
      }),
    ).toContain('Reconnect the Activate connector');
    expect(
      renderError('team', {
        status: 403,
        title: 'Forbidden',
        detail: 'Requires one of: champion',
      }),
    ).toBe('You do not have access to team (Requires one of: champion).');
    expect(
      renderError('skill_detail', {
        status: 404,
        title: 'Not Found',
        detail: 'No skill "foo"',
      }),
    ).toBe('skill_detail: No skill "foo"');
  });
});

describe('submit_skill helpers', () => {
  it('reads frontmatter name/description', () => {
    expect(
      frontmatter(
        '---\nname: rmd-letter\ndescription: "Draft RMD reminder letters."\n---\n# Body',
      ),
    ).toEqual({
      name: 'rmd-letter',
      description: 'Draft RMD reminder letters.',
    });
    expect(frontmatter('# no frontmatter')).toEqual({});
  });
  it('slugify', () => {
    expect(slugify('Advisor Meeting Prep!')).toBe('advisor-meeting-prep');
  });
});
