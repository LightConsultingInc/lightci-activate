import {
  computeCost,
  roi,
  valueOfMinutesPerWeek,
  WEEKS_PER_MONTH,
  type CostFacts,
} from './cost-math';
import type { CostInput } from './entities/cost-input.entity';

const inputs: CostInput = {
  id: 'ci1',
  orgId: 'o1',
  seatPriceMonthly: 100,
  premiumSeatPriceMonthly: 200,
  loadedHourlyRate: 90,
  lightciFeesMonthly: 5000,
  championHoursPerMonth: 10,
  updatedAt: new Date('2026-09-01T00:00:00Z'),
};

function facts(overrides: Partial<CostFacts> = {}): CostFacts {
  return {
    inputs,
    seats: [
      { teamId: 't1', teamName: 'Advisors', active: true, premium: true },
      { teamId: 't1', teamName: 'Advisors', active: false, premium: false },
      { teamId: 't2', teamName: 'Ops', active: true, premium: false },
      { teamId: null, teamName: null, active: false, premium: true },
    ],
    orgSeats: 5,
    orgPremiumSeats: 2,
    learnerExerciseMinutes: 120,
    hoursBackTotal: {
      key: 'org',
      label: 'Org',
      minutesBackPerWeek: 600,
      refs: [
        { kind: 'baseline', id: 'b1', detail: 'x' },
        { kind: 'measurement', id: 'm1', detail: 'y' },
      ],
    },
    perTeam: [
      {
        key: 't1',
        label: 'Advisors',
        minutesBackPerWeek: 600,
        refs: [{ kind: 'baseline', id: 'b1', detail: 'x' }],
      },
    ],
    perSkill: [
      {
        key: 's1',
        label: 'Monday prep',
        minutesBackPerWeek: 300,
        refs: [{ kind: 'baseline', id: 'b1', detail: 'x' }],
      },
    ],
    skillsUnadopted: 2,
    exercisesAbandoned: 3,
    ...overrides,
  };
}

describe('cost math', () => {
  it('values minutes per week over a 52/12 month', () => {
    const v = valueOfMinutesPerWeek(600, 90);
    expect(v.hoursPerMonth).toBe(Math.round(10 * WEEKS_PER_MONTH * 10) / 10);
    expect(v.valueUsd).toBe(Math.round(10 * WEEKS_PER_MONTH * 90 * 100) / 100);
  });
  it('roi is (value - cost) / cost and null without cost', () => {
    expect(roi(200, 100)).toBe(1);
    expect(roi(50, 100)).toBe(-0.5);
    expect(roi(50, 0)).toBe(0);
  });
  it('seat cost splits active/inactive and uses org seats when they exceed people rows', () => {
    const c = computeCost(facts());
    expect(c.seats.total).toBe(5);
    expect(c.seats.active).toBe(2);
    expect(c.seats.inactive).toBe(3);
    expect(c.seats.costTotal).toBe(500);
    expect(c.seats.costInactive).toBe(300);
    expect(c.seats.costPerActive).toBe(250);
    expect(c.seats.byTeam.find((t) => t.teamId === 't1')).toEqual({
      teamId: 't1',
      teamName: 'Advisors',
      seats: 2,
      active: 1,
      cost: 200,
      costInactive: 100,
    });
  });
  it('premium seats count unused ones (inactive premium holders plus unassigned premium seats)', () => {
    const c = computeCost(facts());
    expect(c.premium).toEqual({
      seats: 2,
      unused: 1,
      cost: 400,
      costUnused: 200,
    });
  });
  it('program cost is the ROI denominator and every return figure carries baseline refs', () => {
    const c = computeCost(facts());
    expect(c.program.championHoursCost).toBe(900);
    expect(c.program.learnerExerciseHoursCost).toBe(180);
    expect(c.program.total).toBe(5000 + 900 + 180 + 500 + 400);
    expect(c.return.hoursBackPerMonth).toBe(43.3);
    expect(c.return.roi).toBe(roi(c.return.valueUsd, c.program.total));
    expect(c.return.baselineRefs.map((r) => r.kind)).toEqual([
      'baseline',
      'measurement',
      'cost_input',
    ]);
    expect(
      c.return.perTeam[0].baselineRefs.some((r) => r.kind === 'cost_input'),
    ).toBe(true);
    expect(c.return.perSkill[0].skillName).toBe('Monday prep');
    expect(c.return.perSkill[0].baselineRefs.length).toBe(2);
  });
  it('waste rows carry seat cost where it applies', () => {
    const c = computeCost(facts());
    expect(c.waste).toEqual([
      { kind: 'inactive_seats', count: 3, costUsd: 300 },
      { kind: 'premium_unused', count: 1, costUsd: 200 },
      { kind: 'skills_unadopted', count: 2, costUsd: 0 },
      { kind: 'exercises_abandoned', count: 3, costUsd: 0 },
    ]);
  });
  it('handles an org with nothing measured', () => {
    const c = computeCost(
      facts({
        seats: [],
        orgSeats: 0,
        orgPremiumSeats: 0,
        hoursBackTotal: {
          key: 'org',
          label: null,
          minutesBackPerWeek: 0,
          refs: [],
        },
        perTeam: [],
        perSkill: [],
      }),
    );
    expect(c.seats.costPerActive).toBe(0);
    expect(c.return.valueUsd).toBe(0);
    expect(c.return.roi).toBe(-1); // fees are still a cost
    expect(c.return.baselineRefs.map((r) => r.kind)).toEqual(['cost_input']);
    expect(c.return.hasBaseline).toBe(false);
    expect(c.return.hasCost).toBe(true);
  });
});
