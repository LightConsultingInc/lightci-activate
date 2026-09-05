/**
 * Cost and return arithmetic for Mission Control → Cost (spec §5.5). Pure; every
 * return figure carries the baseline/measurement/cost-input refs it derives from.
 */
import type { CostInput } from './entities/cost-input.entity';
import type { BaselineRef, CostView } from './ops.types';
import { round } from './metrics.service';

export const WEEKS_PER_MONTH = 52 / 12;

export interface SeatFacts {
  teamId: string | null;
  teamName: string | null;
  active: boolean;
  premium: boolean;
}

export interface ReturnFacts {
  key: string;
  label: string | null;
  minutesBackPerWeek: number;
  refs: BaselineRef[];
}

export interface CostFacts {
  inputs: CostInput;
  seats: SeatFacts[];
  /** Org-level seat counts from the Org row (may exceed people rows when seats are unassigned). */
  orgSeats: number;
  orgPremiumSeats: number;
  /** Learner minutes spent in exercises this month (estimatedMinutes of completed exercises). */
  learnerExerciseMinutes: number;
  hoursBackTotal: ReturnFacts;
  perTeam: ReturnFacts[];
  perSkill: ReturnFacts[];
  skillsUnadopted: number;
  exercisesAbandoned: number;
}

export function seatCost(count: number, price: number): number {
  return round(count * price, 2);
}

export function valueOfMinutesPerWeek(
  minutesPerWeek: number,
  loadedHourlyRate: number,
): { hoursPerMonth: number; valueUsd: number } {
  const hoursPerMonth = (minutesPerWeek / 60) * WEEKS_PER_MONTH;
  return {
    hoursPerMonth: round(hoursPerMonth, 1),
    valueUsd: round(hoursPerMonth * loadedHourlyRate, 2),
  };
}

/** ROI = (value − cost) ÷ cost; null when cost is zero (nothing to divide by). */
export function roi(valueUsd: number, costUsd: number): number | null {
  return costUsd > 0 ? round((valueUsd - costUsd) / costUsd) : null;
}

export function computeCost(f: CostFacts): CostView {
  const inputs = f.inputs;
  const total = Math.max(f.orgSeats, f.seats.length);
  const active = f.seats.filter((s) => s.active).length;
  const inactive = Math.max(0, total - active);
  const costTotal = seatCost(total, inputs.seatPriceMonthly);
  const costInactive = seatCost(inactive, inputs.seatPriceMonthly);

  const teams = new Map<
    string,
    { teamId: string; teamName: string; seats: number; active: number }
  >();
  for (const s of f.seats) {
    const key = s.teamId ?? 'none';
    const row =
      teams.get(key) ??
      teams
        .set(key, {
          teamId: key,
          teamName: s.teamName ?? 'Unassigned',
          seats: 0,
          active: 0,
        })
        .get(key)!;
    row.seats++;
    if (s.active) row.active++;
  }
  const byTeam = [...teams.values()].map((t) => ({
    ...t,
    cost: seatCost(t.seats, inputs.seatPriceMonthly),
    costInactive: seatCost(t.seats - t.active, inputs.seatPriceMonthly),
  }));

  const premiumSeats = Math.max(
    f.orgPremiumSeats,
    f.seats.filter((s) => s.premium).length,
  );
  const premiumUnused =
    f.seats.filter((s) => s.premium && !s.active).length +
    Math.max(0, f.orgPremiumSeats - f.seats.filter((s) => s.premium).length);
  const premium = {
    seats: premiumSeats,
    unused: premiumUnused,
    cost: seatCost(premiumSeats, inputs.premiumSeatPriceMonthly),
    costUnused: seatCost(premiumUnused, inputs.premiumSeatPriceMonthly),
  };

  const championHoursCost = round(
    inputs.championHoursPerMonth * inputs.loadedHourlyRate,
    2,
  );
  const learnerExerciseHoursCost = round(
    (f.learnerExerciseMinutes / 60) * inputs.loadedHourlyRate,
    2,
  );
  const program = {
    lightciFees: inputs.lightciFeesMonthly,
    championHoursCost,
    learnerExerciseHoursCost,
    learnerExerciseMinutes: f.learnerExerciseMinutes,
    total: round(
      inputs.lightciFeesMonthly +
        championHoursCost +
        learnerExerciseHoursCost +
        costTotal +
        premium.cost,
      2,
    ),
  };

  const costInputRef: BaselineRef = {
    kind: 'cost_input',
    id: inputs.id ?? null,
    detail: `loaded hourly rate $${inputs.loadedHourlyRate}/h; seat $${inputs.seatPriceMonthly}/mo`,
  };
  const totalReturn = valueOfMinutesPerWeek(
    f.hoursBackTotal.minutesBackPerWeek,
    inputs.loadedHourlyRate,
  );
  const ret = {
    hoursBackPerMonth: totalReturn.hoursPerMonth,
    valueUsd: totalReturn.valueUsd,
    roi: roi(totalReturn.valueUsd, program.total),
    baselineRefs: [...f.hoursBackTotal.refs, costInputRef],
    perTeam: f.perTeam.map((t) => {
      const v = valueOfMinutesPerWeek(
        t.minutesBackPerWeek,
        inputs.loadedHourlyRate,
      );
      return {
        teamId: t.key === 'none' ? null : t.key,
        teamName: t.label,
        hoursBackPerMonth: v.hoursPerMonth,
        valueUsd: v.valueUsd,
        baselineRefs: [...t.refs, costInputRef],
      };
    }),
    perSkill: f.perSkill.map((s) => {
      const v = valueOfMinutesPerWeek(
        s.minutesBackPerWeek,
        inputs.loadedHourlyRate,
      );
      return {
        skillId: s.key,
        skillName: s.label ?? s.key,
        hoursBackPerMonth: v.hoursPerMonth,
        valueUsd: v.valueUsd,
        baselineRefs: [...s.refs, costInputRef],
      };
    }),
  };

  const waste: CostView['waste'] = [
    { kind: 'inactive_seats', count: inactive, costUsd: costInactive },
    {
      kind: 'premium_unused',
      count: premiumUnused,
      costUsd: premium.costUnused,
    },
    { kind: 'skills_unadopted', count: f.skillsUnadopted, costUsd: 0 },
    { kind: 'exercises_abandoned', count: f.exercisesAbandoned, costUsd: 0 },
  ];

  return {
    inputs,
    seats: {
      total,
      active,
      inactive,
      costTotal,
      costInactive,
      costPerActive: active > 0 ? round(costTotal / active, 2) : null,
      byTeam,
    },
    premium,
    program,
    return: ret,
    waste,
  };
}
