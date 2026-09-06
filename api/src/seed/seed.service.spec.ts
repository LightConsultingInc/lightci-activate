import {
  COMPETENCY_CATALOG,
  GRADER_RUBRIC_SKILL,
} from '../learning/competency-catalog';
import {
  compositeMastery,
  computeMastery,
  nextRevisitInterval,
  recencyWeightedScore,
} from '../learning/mastery-math';
import { DEMO_PEOPLE, DEMO_SKILLS, WORKOS_PERSON_KEYS } from './demo-data';
import { Rng } from './rng';
import {
  activeOnRealWork,
  buildSeedPlan,
  generateSkillUsage,
  generateUsageSeries,
  SCORE_HOURS_REFERENCE,
  scoreWorkflow,
  weightedScore,
} from './seed.service';

const TODAY = new Date(Date.UTC(2026, 8, 5)); // a Saturday

describe('rng', () => {
  it('is deterministic for the same seed and diverges for different seeds', () => {
    const a = new Rng('meridian');
    const b = new Rng('meridian');
    const c = new Rng('other');
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    const seqC = Array.from({ length: 5 }, () => c.next());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it('produces RFC-4122-shaped v4 uuids and 40-char shas', () => {
    const r = new Rng(42);
    expect(r.uuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(r.sha()).toMatch(/^[0-9a-f]{40}$/);
  });

  it('forks independent sub-streams keyed by name', () => {
    const root = new Rng('x');
    const f1 = root.fork('usage:priya').next();
    root.next();
    const f2 = new Rng('x').fork('usage:priya').next();
    expect(f1).toBe(f2);
  });
});

describe('generateUsageSeries', () => {
  const profile = {
    intensity: 9,
    code: false,
    cowork: false,
    trend: 'growing' as const,
    startDaysAgo: 63,
  };

  it('returns one row per day, deterministic for the same seed', () => {
    const a = generateUsageSeries(profile, new Rng('usage:priya'), TODAY, 90);
    const b = generateUsageSeries(profile, new Rng('usage:priya'), TODAY, 90);
    expect(a).toHaveLength(90);
    expect(a).toEqual(b);
    expect(a[0].day < a[89].day).toBe(true);
    expect(a[89].day).toBe('2026-09-05');
  });

  it('is quiet before the start day and weekday-heavy afterwards', () => {
    const rows = generateUsageSeries(profile, new Rng('u'), TODAY, 90);
    const before = rows.filter((r) => r.day < '2026-07-04');
    expect(
      before.every(
        (r) => r.metrics.messages === 0 && !r.metrics.activeOnRealWork,
      ),
    ).toBe(true);
    const after = rows.filter((r) => r.day >= '2026-07-10');
    const weekday = after.filter(
      (r) => ![0, 6].includes(new Date(r.day).getUTCDay()),
    );
    const weekend = after.filter((r) =>
      [0, 6].includes(new Date(r.day).getUTCDay()),
    );
    const avg = (xs: typeof rows) =>
      xs.reduce((s, r) => s + r.metrics.messages, 0) / Math.max(1, xs.length);
    expect(avg(weekday)).toBeGreaterThan(avg(weekend) * 3);
  });

  it('goes silent after quietAfterDaysAgo for inactive people', () => {
    const rows = generateUsageSeries(
      { ...profile, trend: 'flat', quietAfterDaysAgo: 49 },
      new Rng('owen'),
      TODAY,
      90,
    );
    const recent = rows.slice(-49);
    expect(recent.every((r) => !r.metrics.activeOnRealWork)).toBe(true);
    const earlier = rows.slice(90 - 63, 90 - 49);
    expect(earlier.some((r) => r.metrics.activeOnRealWork)).toBe(true);
  });

  it('drops by more than half in the last month for the stalled trend', () => {
    const rows = generateUsageSeries(
      { ...profile, trend: 'drop_last_month', intensity: 7, startDaysAgo: 89 },
      new Rng('laura'),
      TODAY,
      90,
    );
    const sum = (xs: typeof rows) =>
      xs.reduce((s, r) => s + r.metrics.messages, 0);
    const prior = sum(rows.slice(30, 60));
    const last = sum(rows.slice(60));
    expect(last).toBeLessThan(prior * 0.5);
  });

  it('applies the Anthropic definition of active on real work', () => {
    expect(
      activeOnRealWork({ messages: 0, codeSessions: 0, coworkSessions: 0 }),
    ).toBe(false);
    expect(
      activeOnRealWork({ messages: 1, codeSessions: 0, coworkSessions: 0 }),
    ).toBe(true);
    expect(
      activeOnRealWork({ messages: 0, codeSessions: 1, coworkSessions: 0 }),
    ).toBe(true);
    expect(
      activeOnRealWork({ messages: 0, codeSessions: 0, coworkSessions: 2 }),
    ).toBe(true);
  });
});

describe('generateSkillUsage', () => {
  it('only emits days with activations, none before the start, and ramps up', () => {
    const rows = generateSkillUsage(2, 60, 0, new Rng('s'), TODAY);
    expect(rows.every((r) => r.activations > 0)).toBe(true);
    expect(rows.every((r) => r.day >= '2026-07-07')).toBe(true);
    const firstWeek = rows
      .filter((r) => r.day < '2026-07-14')
      .reduce((s, r) => s + r.activations, 0);
    const lastWeek = rows
      .filter((r) => r.day >= '2026-08-29')
      .reduce((s, r) => s + r.activations, 0);
    expect(lastWeek).toBeGreaterThan(firstWeek);
  });
});

describe('scoreWorkflow and rubric maths', () => {
  it('normalises composite to 0..100 with the documented formula', () => {
    const s = scoreWorkflow({
      value: 1,
      hours: 20,
      readiness: 1,
      exposure: 0,
      rationale: 'max',
    });
    expect(s.composite).toBe(100);
    const t = scoreWorkflow({
      value: 0.85,
      hours: 9,
      readiness: 0.8,
      exposure: 0.3,
      rationale: 'prep',
    });
    expect(t.composite).toBe(
      Math.round(((0.85 * 9 * 0.8) / 1.3 / SCORE_HOURS_REFERENCE) * 100),
    );
    expect(t.rationale).toBe('prep');
  });

  it('weights the grader rubric to 1 and scores a perfect skill 1', () => {
    const total = GRADER_RUBRIC_SKILL.reduce((s, c) => s + c.weight, 0);
    expect(total).toBeCloseTo(1, 6);
    const perfect = Object.fromEntries(
      GRADER_RUBRIC_SKILL.map((c) => [c.key, 1]),
    );
    expect(weightedScore(GRADER_RUBRIC_SKILL, perfect)).toBe(1);
  });

  it('every competency rubric sums to 1 and thresholds follow the mastery model', () => {
    for (const c of COMPETENCY_CATALOG) {
      expect(c.rubric.reduce((s, r) => s + r.weight, 0)).toBeCloseTo(1, 6);
      expect(c.rubric.length).toBeGreaterThanOrEqual(3);
      expect(c.rubric.length).toBeLessThanOrEqual(5);
      const expected = c.rung <= 2 ? 0.8 : c.rung <= 4 ? 0.85 : 0.9;
      expect(c.masteryThreshold).toBe(expected);
    }
    expect(new Set(COMPETENCY_CATALOG.map((c) => c.code)).size).toBe(
      COMPETENCY_CATALOG.length,
    );
  });
});

describe('mastery-math', () => {
  it('reproduces the worked example weights from docs/mastery-model.md', () => {
    const artifacts = [
      { score: 0.72, daysAgo: 12 },
      { score: 0.81, daysAgo: 9.4 },
      { score: 0.9, daysAgo: 6.6 },
      { score: 0.85, daysAgo: 3.3 },
      { score: 0.93, daysAgo: 0 },
    ];
    expect(recencyWeightedScore(artifacts)).toBeCloseTo(0.87, 1);
    expect(
      compositeMastery({
        artifact: 0.87,
        consistency: 0.91,
        retention: 0.79,
        judgement: 0.68,
      }),
    ).toBeCloseTo(0.862, 2); // judgement retired 2026-09-06: 0.6 / 0.2 / 0.2
  });

  it('advances on pass and resets to the two-day interval on fail', () => {
    expect(nextRevisitInterval(1, 0.85)).toEqual({ step: 2, days: 21 });
    expect(nextRevisitInterval(3, 0.5)).toEqual({ step: 0, days: 2 });
    expect(nextRevisitInterval(4, 0.95)).toEqual({ step: 4, days: 120 });
  });

  it('computeMastery penalises overconfidence more than caution', () => {
    const base = {
      artifacts: [
        { score: 0.8, daysAgo: 1, context: 'a' },
        { score: 0.8, daysAgo: 2, context: 'b' },
      ],
      critiqueQuality: 0.8,
      requiredContexts: 2,
    };
    const over = computeMastery({
      ...base,
      predictions: [{ confidence: 0.9, outcome: 0 }],
    });
    const under = computeMastery({
      ...base,
      predictions: [{ confidence: 0.1, outcome: 1 }],
    });
    expect(over.components.judgement).toBeLessThan(under.components.judgement);
    expect(over.components.contexts).toBe(2);
  });
});

describe('buildSeedPlan', () => {
  const plan = buildSeedPlan(TODAY);

  it('is deterministic for the same day', () => {
    const again = buildSeedPlan(TODAY);
    expect(again.people).toEqual(plan.people);
    expect(again.usage.slice(0, 50)).toEqual(plan.usage.slice(0, 50));
    expect(again.mastery.length).toBe(plan.mastery.length);
  });

  it('gives every seeded exercise an in_app starter.practice whose kind matches its surface (practice v2)', () => {
    const kindFor: Record<string, string> = {
      orientation: 'prompt',
      prompt: 'prompt',
      project: 'project',
      skill: 'skill',
      workflow: 'workflow',
      review: 'review',
    };
    expect(plan.exercises.length).toBeGreaterThan(20);
    for (const e of plan.exercises) {
      expect(e.mode).toBe('in_app');
      const practice = (
        e.starter as {
          practice?: {
            ask: string;
            kind: string;
            workflowName: string;
            prefill: Record<string, unknown>;
          };
        }
      ).practice;
      expect(practice).toBeDefined();
      expect(practice!.kind).toBe(kindFor[e.workSurface as string]);
      expect(practice!.ask.length).toBeGreaterThan(0);
      expect(practice!.prefill).toBeDefined();
    }
    const review = plan.exercises.find(
      (e) =>
        e.workSurface === 'review' &&
        (e.starter as { submissionId?: string }).submissionId,
    );
    expect(
      (review!.starter as { practice: { prefill: { submissionId: string } } })
        .practice.prefill.submissionId,
    ).toBe((review!.starter as { submissionId: string }).submissionId);
  });

  it('seeds the org, teams, people and the five WorkOS users', () => {
    expect(plan.org).toHaveLength(1);
    expect(plan.teams).toHaveLength(3);
    expect(plan.people).toHaveLength(DEMO_PEOPLE.length);
    const workos = plan.people.filter((p) => p.workosUserId);
    expect(workos).toHaveLength(WORKOS_PERSON_KEYS.length);
    const lead = plan.people.find(
      (p) => p.email === 'zain+activate-lead@lightci.com',
    )!;
    expect(lead.orgId).toBeNull();
    expect(lead.roles).toEqual(['lead']);
  });

  it('gives every learner exercises and every non-lead 90 usage rows', () => {
    const learners = plan.people.filter((p) =>
      (p.roles as string[]).includes('learner'),
    );
    for (const l of learners)
      expect(plan.exercises.some((e) => e.personId === l.id)).toBe(true);
    expect(plan.usage.length).toBe((DEMO_PEOPLE.length - 1) * 90);
  });

  it('satisfies the Priya, Marcus and Daniel demo requirements', () => {
    const byEmail = (e: string) => plan.people.find((p) => p.email === e)!.id;
    const priya = byEmail('priya.nair@meridianwealth.demo');
    const marcus = byEmail('marcus.reid@meridianwealth.demo');
    const daniel = byEmail('daniel.okafor@meridianwealth.demo');
    const todayStr = '2026-09-05';
    expect(
      plan.exercises.filter(
        (e) => e.personId === priya && e.status === 'active' && e.rung === 2,
      ),
    ).toHaveLength(1);
    expect(
      plan.revisits.filter(
        (r) =>
          r.personId === priya &&
          !r.doneAt &&
          (r.dueAt as Date).toISOString().startsWith(todayStr),
      ),
    ).toHaveLength(2);
    expect(
      plan.grades.filter((g) => g.personId === priya && g.submissionId).length,
    ).toBeGreaterThanOrEqual(6);
    expect(
      plan.exercises.filter(
        (e) => e.personId === marcus && e.status === 'active' && e.rung === 1,
      ),
    ).toHaveLength(1);
    expect(
      plan.exercises.some(
        (e) => e.personId === marcus && e.status === 'revise',
      ),
    ).toBe(true);
    expect(
      plan.exercises.filter(
        (e) =>
          e.personId === daniel && e.kind === 'review' && e.status === 'active',
      ).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      plan.promotions.filter((p) => p.decision === 'pending'),
    ).toHaveLength(2);
    expect(plan.promotions.filter((p) => p.decision === 'merged')).toHaveLength(
      3,
    );
    expect(
      plan.promotions.filter((p) => p.decision === 'sent_back'),
    ).toHaveLength(1);
  });

  it('computes expectationAccuracy as 1 - brier and keeps skill grades weighted', () => {
    const graded = plan.grades.filter(
      (g) => g.submissionId && g.expectationAccuracy != null,
    );
    for (const g of graded) {
      expect(g.expectationAccuracy as number).toBeGreaterThanOrEqual(0);
      expect(g.expectationAccuracy as number).toBeLessThanOrEqual(1);
    }
    const published = DEMO_SKILLS.filter((s) => s.status === 'published');
    for (const s of published)
      expect(
        plan.skillUsage.some(
          (u) => u.skillId === plan.skills.find((k) => k.slug === s.slug)!.id,
        ),
      ).toBe(true);
  });

  it('writes 30 days of mastery snapshots for the WorkOS users only', () => {
    const workosIds = new Set(
      plan.people.filter((p) => p.workosUserId).map((p) => p.id),
    );
    expect(plan.mastery.every((m) => workosIds.has(m.personId as string))).toBe(
      true,
    );
    const priya = plan.people.find(
      (p) => p.email === 'priya.nair@meridianwealth.demo',
    )!.id;
    const days = new Set(
      plan.mastery
        .filter(
          (m) => m.personId === priya && m.competencyCode === 'L1.description',
        )
        .map((m) => m.day),
    );
    expect(days.size).toBe(30);
    const unique = new Set(
      plan.mastery.map((m) => `${m.personId}:${m.competencyCode}:${m.day}`),
    );
    expect(unique.size).toBe(plan.mastery.length);
  });
});
