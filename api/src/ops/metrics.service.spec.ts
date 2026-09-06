import {
  activationScores,
  activeInWindow,
  bucketedActive,
  cohorts,
  dailyActive,
  detectStalled,
  funnel,
  hoursBack,
  isChampionCandidate,
  markRising,
  median,
  percentile,
  queueAgeDays,
  reworkRate,
  revisitCompliance,
  rungDistribution,
  rungGains,
  timeInRung,
  trendOf,
  weekStart,
} from './metrics.service';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const NOW = d('2026-09-05');

describe('statistics', () => {
  it('median handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it('percentile uses nearest rank', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(percentile([5], 90)).toBe(5);
    expect(percentile([], 50)).toBeNull();
  });
  it('weekStart is Monday', () => {
    expect(weekStart('2026-09-05')).toBe('2026-08-31'); // Saturday → Monday
    expect(weekStart('2026-08-31')).toBe('2026-08-31');
    expect(weekStart('2026-09-06')).toBe('2026-08-31'); // Sunday belongs to the same ISO week
  });
});

describe('active on real work', () => {
  const snaps = [
    { personId: 'a', day: '2026-09-01', active: true },
    { personId: 'b', day: '2026-09-01', active: true },
    { personId: 'a', day: '2026-09-02', active: true },
    { personId: 'c', day: '2026-09-02', active: false },
    { personId: 'b', day: '2026-08-25', active: true },
    { personId: 'c', day: '2026-08-20', active: true },
  ];
  it('daily counts distinct active people per day and fills gaps with zero', () => {
    const daily = dailyActive(snaps, '2026-09-01', '2026-09-03', 10);
    expect(daily).toEqual([
      { day: '2026-09-01', active: 2, seats: 10 },
      { day: '2026-09-02', active: 1, seats: 10 },
      { day: '2026-09-03', active: 0, seats: 10 },
    ]);
  });
  it('weekly buckets by ISO week with distinct people', () => {
    const weekly = bucketedActive(
      snaps,
      '2026-08-24',
      '2026-09-05',
      10,
      'week',
    );
    expect(weekly.map((w) => [w.day, w.active])).toEqual([
      ['2026-08-24', 1],
      ['2026-08-31', 2],
    ]);
  });
  it('monthly buckets by calendar month', () => {
    const monthly = bucketedActive(
      snaps,
      '2026-08-01',
      '2026-09-05',
      10,
      'month',
    );
    expect(monthly.map((m) => [m.day, m.active])).toEqual([
      ['2026-08-01', 2],
      ['2026-09-01', 2],
    ]);
  });
  it('WAU window is inclusive of the end day and 7 days long', () => {
    expect([...activeInWindow(snaps, '2026-09-05', 7)].sort()).toEqual([
      'a',
      'b',
    ]);
    expect([...activeInWindow(snaps, '2026-08-26', 7)].sort()).toEqual([
      'b',
      'c',
    ]);
  });
  it('trend uses a 5% band', () => {
    expect(
      trendOf([
        { day: '', active: 10, seats: 0 },
        { day: '', active: 11, seats: 0 },
      ]),
    ).toBe('up');
    expect(
      trendOf([
        { day: '', active: 100, seats: 0 },
        { day: '', active: 103, seats: 0 },
      ]),
    ).toBe('flat');
    expect(
      trendOf([
        { day: '', active: 10, seats: 0 },
        { day: '', active: 5, seats: 0 },
      ]),
    ).toBe('down');
    expect(
      trendOf([
        { day: '', active: 0, seats: 0 },
        { day: '', active: 2, seats: 0 },
      ]),
    ).toBe('up');
    expect(trendOf([])).toBe('flat');
  });
});

describe('funnel', () => {
  it('counts each step and takes the median days from the previous reached step', () => {
    const steps = funnel([
      {
        provisionedAt: d('2026-01-01'),
        firstLoginAt: d('2026-01-03'),
        firstRealWorkAt: d('2026-01-05'),
        rungReachedAt: { 1: d('2026-01-15'), 2: d('2026-02-15') },
      },
      {
        provisionedAt: d('2026-01-01'),
        firstLoginAt: d('2026-01-05'),
        firstRealWorkAt: null,
        rungReachedAt: {},
      },
      {
        provisionedAt: d('2026-01-01'),
        firstLoginAt: null,
        firstRealWorkAt: null,
        rungReachedAt: {},
      },
    ]);
    expect(steps.map((s) => [s.step, s.count])).toEqual([
      ['provisioned', 3],
      ['logged_in', 2],
      ['first_real_work', 1],
      ['L1', 1],
      ['L2', 1],
      ['L3', 0],
      ['L4', 0],
      ['L5', 0],
    ]);
    expect(steps[1].medianDays).toBe(3); // median of 2 and 4
    expect(steps[2].medianDays).toBe(2);
    expect(steps[3].medianDays).toBe(10);
    expect(steps[4].medianDays).toBe(31);
    expect(steps[5].medianDays).toBe(0);
    expect(steps[5].sampled).toBe(0);
  });
  it('skips over missing intermediate steps when a diagnostic placement jumps rungs', () => {
    const steps = funnel([
      {
        provisionedAt: d('2026-01-01'),
        firstLoginAt: null,
        firstRealWorkAt: null,
        rungReachedAt: {
          1: d('2026-01-11'),
          2: d('2026-01-11'),
          3: d('2026-01-11'),
        },
      },
    ]);
    expect(steps.find((s) => s.step === 'L1')!.medianDays).toBe(10);
    expect(steps.find((s) => s.step === 'L3')!.medianDays).toBe(0);
  });
});

describe('rungs', () => {
  const placements = [
    { personId: 'a', rung: 1, placedAt: d('2026-06-01') },
    { personId: 'a', rung: 2, placedAt: d('2026-07-01') },
    { personId: 'a', rung: 3, placedAt: d('2026-08-20') },
    { personId: 'b', rung: 1, placedAt: d('2026-05-01') },
    { personId: 'c', rung: 0, placedAt: d('2026-08-30') },
  ];
  it('rungDistribution clamps to 0..5', () => {
    expect(rungDistribution([0, 1, 1, 5, 7, -1])).toEqual([2, 2, 0, 0, 0, 2]);
  });
  it('timeInRung reports completed and current dwells and flags stuck people', () => {
    const rows = timeInRung(placements, NOW, 45);
    expect(rows[1].medianDays).toBe(median([30, 127])); // a: 30d at L1; b: 127d still at L1
    expect(rows[1].stuckPersonIds).toEqual(['b']);
    expect(rows[2].medianDays).toBe(50);
    expect(rows[3].medianDays).toBe(16);
    expect(rows[3].stuckPersonIds).toEqual([]);
    expect(rows[0].stuckPersonIds).toEqual([]); // c only 6 days at L0
    expect(rows[4].medianDays).toBe(0);
    expect(rows[4].sampled).toBe(0);
  });
  it('rungGains and markRising pick the fastest movers', () => {
    const gains = rungGains(placements, ['a', 'b', 'c'], NOW, 30);
    expect(gains.get('a')).toBe(1);
    expect(gains.get('b')).toBe(0);
    expect(gains.get('c')).toBe(0);
    expect([...markRising(gains)]).toEqual(['a']);
    expect(markRising(new Map([['x', 0]])).size).toBe(0);
    const mixed = markRising(
      new Map([
        ['p', 1],
        ['q', 1],
        ['r', 3],
        ['s', 2],
      ]),
    );
    expect([...mixed].sort()).toEqual(['r', 's']); // nearest-rank p75 of [1,1,2,3] = 2
  });
  it('rungGains treats a first (diagnostic) placement inside the window as the base, not a gain', () => {
    const gains = rungGains(
      [
        ...placements,
        { personId: 'n', rung: 4, placedAt: d('2026-08-25') }, // newcomer placed straight at L4 last week
        { personId: 'm', rung: 1, placedAt: d('2026-08-20') },
        { personId: 'm', rung: 2, placedAt: d('2026-08-28') }, // placed at L1 then passed to L2 inside the window
      ],
      ['a', 'n', 'm'],
      NOW,
      30,
    );
    expect(gains.get('n')).toBe(0);
    expect(gains.get('m')).toBe(1);
    expect(gains.get('a')).toBe(1);
  });
  it('cohorts group by onboarding ISO week', () => {
    expect(
      cohorts([
        { cohortWeek: '2026-08-05', rung: 1 },
        { cohortWeek: '2026-08-07', rung: 2 },
        { cohortWeek: null, rung: 0 },
      ]),
    ).toEqual([
      { cohortWeek: '2026-08-03', counts: [0, 1, 1, 0, 0, 0] },
      { cohortWeek: 'unknown', counts: [1, 0, 0, 0, 0, 0] },
    ]);
  });
});

describe('stalled', () => {
  const base = {
    activeDaysThisMonth: 5,
    activeDaysPriorMonth: 5,
    latestNoteTags: [] as string[],
    rung: 2,
    status: 'active' as const,
    roles: ['learner'],
  };
  it('flags no rung pass AND no submission beyond the threshold, with the coach reason when tagged and an SLA', () => {
    const r = detectStalled(
      {
        ...base,
        lastProgressionAt: d('2026-08-01'),
        lastSubmissionAt: d('2026-08-10'),
        latestNoteTags: ['blocked'],
      },
      NOW,
      14,
    );
    expect(r.stalled).toBe(true);
    expect(r.stalledDays).toBe(26); // since the last submission
    expect(r.reason).toBe('blocked');
    expect(r.stalledSince).toEqual(d('2026-08-24')); // last activity + 14 days
    expect(r.slaDueAt).toEqual(d('2026-08-27')); // + 3 days
  });
  it('a recent submission keeps a slow-progressing learner out of the stalled list unless activity collapsed', () => {
    const recent = {
      ...base,
      lastProgressionAt: d('2026-07-01'),
      lastSubmissionAt: d('2026-09-01'),
    };
    expect(detectStalled(recent, NOW, 14).stalled).toBe(false);
    const collapsed = detectStalled(
      { ...recent, activeDaysThisMonth: 2, activeDaysPriorMonth: 10 },
      NOW,
      14,
    );
    expect(collapsed.stalled).toBe(true);
    expect(collapsed.reason).toBe(
      'no rung passed; activity dropped >50% vs prior month',
    );
  });
  it('a recent rung pass is never stalled, even with no submissions and an activity drop', () => {
    expect(
      detectStalled(
        {
          ...base,
          lastProgressionAt: d('2026-09-01'),
          lastSubmissionAt: null,
          activeDaysThisMonth: 1,
          activeDaysPriorMonth: 10,
        },
        NOW,
        14,
      ).stalled,
    ).toBe(false);
  });
  it('does not flag a quiet prior month by itself', () => {
    expect(
      detectStalled(
        {
          ...base,
          lastProgressionAt: d('2026-07-01'),
          lastSubmissionAt: d('2026-09-01'),
          activeDaysThisMonth: 0,
          activeDaysPriorMonth: 0,
        },
        NOW,
        14,
      ).stalled,
    ).toBe(false);
  });
  it('excludes inactive people, non-learner sponsors/admins/leads and L5 champions', () => {
    const stale = {
      ...base,
      lastProgressionAt: d('2026-06-01'),
      lastSubmissionAt: null,
    };
    expect(detectStalled(stale, NOW, 14).stalled).toBe(true);
    expect(
      detectStalled({ ...stale, status: 'inactive' }, NOW, 14).stalled,
    ).toBe(false);
    expect(
      detectStalled({ ...stale, roles: ['sponsor', 'admin'] }, NOW, 14).stalled,
    ).toBe(false);
    expect(
      detectStalled({ ...stale, roles: ['sponsor', 'learner'] }, NOW, 14)
        .stalled,
    ).toBe(true);
    expect(detectStalled({ ...stale, rung: 5 }, NOW, 14).stalled).toBe(false);
  });
});

describe('hoursBack', () => {
  const baselines = [
    {
      id: 'b1',
      personId: 'a',
      workflowMapId: 'w1',
      task: 'Monday prep',
      minutesPerWeek: 120,
      reworkMinutesPerWeek: 30,
    },
    {
      id: 'b2',
      personId: 'a',
      workflowMapId: null,
      task: 'RMD letters',
      minutesPerWeek: 60,
      reworkMinutesPerWeek: 0,
    },
  ];
  it('uses the latest measurement per baseline and nets rework', () => {
    const r = hoursBack(baselines, [
      {
        id: 'm1',
        personId: 'a',
        workflowMapId: 'w1',
        baselineId: 'b1',
        task: 'Monday prep',
        minutesPerWeek: 60,
        reworkMinutesPerWeek: 10,
        periodEnd: '2026-08-01',
      },
      {
        id: 'm2',
        personId: 'a',
        workflowMapId: 'w1',
        baselineId: null,
        task: 'Monday prep',
        minutesPerWeek: 40,
        reworkMinutesPerWeek: 20,
        periodEnd: '2026-09-01',
      },
    ]);
    expect(r.measuredTasks).toBe(1);
    expect(r.baselineMinutesPerWeek).toBe(150);
    expect(r.currentMinutesPerWeek).toBe(60);
    expect(r.minutesBackPerWeek).toBe(90);
    expect(r.refs.map((x) => x.id)).toEqual(['b1', 'm2']);
  });
  it('ignores measurements without a baseline and baselines without a measurement', () => {
    const r = hoursBack(baselines, [
      {
        id: 'm9',
        personId: 'a',
        workflowMapId: null,
        baselineId: null,
        task: 'Something else',
        minutesPerWeek: 5,
        reworkMinutesPerWeek: 0,
        periodEnd: '2026-09-01',
      },
    ]);
    expect(r.measuredTasks).toBe(0);
    expect(r.minutesBackPerWeek).toBe(0);
    expect(r.refs).toEqual([]);
  });
  it('matches by task name when no ids are linked', () => {
    const r = hoursBack(baselines, [
      {
        id: 'm3',
        personId: 'a',
        workflowMapId: null,
        baselineId: null,
        task: 'RMD letters',
        minutesPerWeek: 15,
        reworkMinutesPerWeek: 5,
        periodEnd: '2026-09-01',
      },
    ]);
    expect(r.minutesBackPerWeek).toBe(40);
  });
});

describe('activation score', () => {
  it('normalises each component to 0..1 relative to the population and averages them', () => {
    const scores = activationScores([
      {
        id: 'a',
        rung: 5,
        hoursBackPerWeek: 4,
        skillsPublished: 2,
        influence: 6,
        gradeQuality: 0.9,
        activeDays30: 20,
      },
      {
        id: 'b',
        rung: 1,
        hoursBackPerWeek: null,
        skillsPublished: 0,
        influence: 0,
        gradeQuality: null,
        activeDays30: 5,
      },
    ]);
    expect(scores.get('a')).toEqual({
      composite: 0.983,
      components: {
        rung: 1,
        hoursBack: 1,
        skillsPublished: 1,
        influence: 1,
        gradeQuality: 0.9,
        activeDays: 1,
      },
    });
    expect(scores.get('b')!.components).toEqual({
      rung: 0.2,
      hoursBack: 0,
      skillsPublished: 0,
      influence: 0,
      gradeQuality: 0,
      activeDays: 0.25,
    });
    expect(scores.get('b')!.composite).toBe(0.075);
  });
  it('champion candidate needs influence, grade quality and rung below 5', () => {
    const s = {
      composite: 0.8,
      components: {
        rung: 0.6,
        hoursBack: 0.5,
        skillsPublished: 0.5,
        influence: 0.7,
        gradeQuality: 0.85,
        activeDays: 0.8,
      },
    };
    expect(isChampionCandidate(s, 3, 4)).toBe(true);
    expect(isChampionCandidate(s, 5, 4)).toBe(false);
    expect(
      isChampionCandidate(
        { ...s, components: { ...s.components, gradeQuality: 0.7 } },
        3,
        4,
      ),
    ).toBe(false);
    expect(isChampionCandidate(s, 3, 0)).toBe(false);
  });
});

describe('revisits, rework, queue age', () => {
  it('revisit compliance counts due vs done per team', () => {
    const m = revisitCompliance(
      [
        { teamId: 't1', dueAt: d('2026-09-01'), doneAt: d('2026-09-01') },
        { teamId: 't1', dueAt: d('2026-09-02'), doneAt: null },
        { teamId: 't1', dueAt: d('2026-09-20'), doneAt: null }, // not yet due
        { teamId: null, dueAt: d('2026-09-01'), doneAt: null },
      ],
      NOW,
    );
    expect(m.get('t1')).toEqual({ due: 2, done: 1 });
    expect(m.get('none')).toEqual({ due: 1, done: 0 });
  });
  it('rework rate is revise/pass', () => {
    expect(reworkRate(['pass', 'pass', 'revise'])).toBe(0.5);
    expect(reworkRate(['revise', 'revise'])).toBe(2);
    expect(reworkRate([])).toBe(0);
  });
  it('queue age is the mean age of pending items', () => {
    expect(
      queueAgeDays(
        [{ createdAt: d('2026-09-01') }, { createdAt: d('2026-09-03') }],
        NOW,
      ),
    ).toBe(3);
    expect(queueAgeDays([], NOW)).toBe(0);
  });
});
