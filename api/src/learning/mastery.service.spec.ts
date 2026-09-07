import { DAY_MS } from '../common/dates';
import { COMPETENCY_BY_CODE, RUNG_GATES } from './competency-catalog';
import type { Exercise } from './entities/exercise.entity';
import type { Grade } from './entities/grade.entity';
import type { Revisit } from './entities/revisit.entity';
import type { Submission } from './entities/submission.entity';
import type { CompetencyView } from './learning.types';
import {
  compositeMastery,
  consistency,
  recencyWeightedScore,
  retentionDecay,
} from './mastery-math';
import { MasteryService, type GradedArtifact } from './mastery.service';

const now = new Date('2026-09-05T12:00:00.000Z');
const svc = () =>
  new MasteryService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

function artifact(
  code: string,
  score: number,
  daysAgo: number,
  context: string,
  confidence: number,
  critiqueQuality: number,
  decision: 'pass' | 'revise' = score >= 0.8 ? 'pass' : 'revise',
): GradedArtifact {
  const gradedAt = new Date(now.getTime() - daysAgo * DAY_MS);
  return {
    exercise: {
      id: `ex-${context}-${daysAgo}`,
      competencyCodes: [code],
      contextTag: context,
      rung: 2,
    } as Exercise,
    submission: {
      id: `s-${daysAgo}`,
      expectationConfidence: confidence,
    } as Submission,
    grade: {
      id: `g-${daysAgo}`,
      score,
      decision,
      critiqueQuality,
      gradedAt,
    } as Grade,
  };
}

describe('mastery math (docs/mastery-model.md worked example: Priya, Context engineering, day 45)', () => {
  // weights 0.55, 0.63, 0.72, 0.85, 1.0 ⇔ Δt = −14·log2(w)
  const daysFor = (w: number) => -14 * Math.log2(w);
  const scores = [0.72, 0.81, 0.9, 0.85, 0.93];
  const weights = [0.55, 0.63, 0.72, 0.85, 1.0];

  it('recency-weighted artifact score Σ(wᵢsᵢ)/Σwᵢ = 0.855 (the brief rounds this to 0.87)', () => {
    const s = recencyWeightedScore(
      scores.map((score, i) => ({ score, daysAgo: daysFor(weights[i]) })),
    );
    const expected =
      scores.reduce((acc, v, i) => acc + v * weights[i], 0) /
      weights.reduce((a, b) => a + b, 0);
    expect(s).toBeCloseTo(expected, 3);
    expect(s).toBeCloseTo(0.855, 2);
  });

  it('consistency across 4 of 4 contexts ≈ 0.91', () => {
    expect(consistency(scores, 4, 4)).toBeCloseTo(0.91, 2);
  });

  it('retention decays exponentially with λ = 0.01/day', () => {
    expect(retentionDecay(0.88, 0)).toBeCloseTo(0.88, 3);
    expect(retentionDecay(0.88, 24)).toBeCloseTo(0.88 * Math.exp(-0.24), 3);
  });

  it('composite with the documented components is ≈ 0.86 (judgement retired 2026-09-06: 0.6 / 0.2 / 0.2)', () => {
    const composite = compositeMastery({
      artifact: 0.87,
      consistency: 0.91,
      retention: 0.79,
      judgement: 0.68,
    });
    expect(composite).toBeCloseTo(0.862, 3);
    expect(
      compositeMastery({ artifact: 0.87, consistency: 0.91, retention: 0.79 }),
    ).toBe(composite);
    expect(
      compositeMastery({
        artifact: 0.87,
        consistency: 0.91,
        retention: 0.79,
        judgement: 0,
      }),
    ).toBe(composite);
  });
});

describe('MasteryService.computeOne from Grade/Submission/Exercise/Revisit rows', () => {
  const def = COMPETENCY_BY_CODE.get('L2.project_design')!;
  const daysFor = (w: number) => -14 * Math.log2(w);
  const rows: GradedArtifact[] = [
    artifact(def.code, 0.72, daysFor(0.55), 'meeting-prep', 0.9, 0.6, 'revise'),
    artifact(def.code, 0.81, daysFor(0.63), 'client-summary', 0.8, 0.7),
    artifact(def.code, 0.9, daysFor(0.72), 'weekly-report', 0.85, 0.75),
    artifact(def.code, 0.85, daysFor(0.85), 'policy-check', 0.8, 0.7),
    artifact(def.code, 0.93, daysFor(1.0), 'meeting-prep', 0.9, 0.7),
  ];
  const revisit = {
    competencyCode: def.code,
    score: 0.88,
    doneAt: new Date(now.getTime() - 24 * DAY_MS),
  } as Revisit;

  it('reproduces Priya: artifact ≈ 0.855, consistency ≈ 0.91, 4 contexts, composite in the 0.80–0.88 band', () => {
    const view = svc().computeOne(def, 2, rows, [revisit], 0, now);
    expect(view.components.artifact).toBeCloseTo(0.855, 2);
    expect(view.components.consistency).toBeCloseTo(0.91, 2);
    expect(view.components.contexts).toBe(4);
    expect(view.components.retention).toBeCloseTo(0.88 * Math.exp(-0.24), 2);
    expect(view.mastery).toBeGreaterThanOrEqual(0.8);
    expect(view.mastery).toBeLessThanOrEqual(0.9);
    expect(view.mastery).toBeCloseTo(
      0.6 * view.components.artifact +
        0.2 * view.components.consistency +
        0.2 * view.components.retention,
      2,
    );
    expect(view.status).toBe('mastered');
  });

  it('ignores other competencies and locks rungs above the learner', () => {
    const other = COMPETENCY_BY_CODE.get('L3.trigger')!;
    const view = svc().computeOne(other, 2, rows, [], 0, now);
    expect(view.mastery).toBe(0);
    expect(view.status).toBe('locked');
  });

  it('flags decay when a previously mastered competency falls below 0.70', () => {
    const old = [
      artifact(def.code, 0.9, 200, 'meeting-prep', 0.9, 0.7),
      artifact(def.code, 0.88, 190, 'client-summary', 0.9, 0.7),
    ];
    const view = svc().computeOne(def, 2, old, [], 0.86, now);
    expect(view.mastery).toBeLessThan(0.7);
    expect(view.status).toBe('decayed');
  });
});

describe('judgement summary (legacy display only; never gating)', () => {
  it('penalises overconfidence and reports the overconfident rate', () => {
    const rows = [
      artifact('L1.description', 0.6, 3, 'a', 0.95, 0.3, 'revise'),
      artifact('L1.description', 0.9, 2, 'b', 0.9, 0.8, 'pass'),
      artifact('L1.description', 0.55, 1, 'c', 0.9, 0.4, 'revise'),
    ];
    const j = svc().judgementSummary(rows);
    expect(j.overconfidentRate).toBeCloseTo(2 / 3, 2);
    expect(j.calibration).toBeLessThan(0.6);
    expect(j.score).toBeLessThan(0.7);
  });

  it('expectationAccuracy = 1 − asymmetric Brier', () => {
    const s = svc();
    expect(s.expectationAccuracy(0.9, true)).toBeCloseTo(1 - 0.01, 3);
    expect(s.expectationAccuracy(0.9, false)).toBe(0); // overconfident: κ = 1.5 → 1 − 1.215 clamps to 0
    expect(s.expectationAccuracy(0.6, false)).toBeCloseTo(1 - 1.5 * 0.36, 3); // overconfident, unclamped
    expect(s.expectationAccuracy(0.2, true)).toBeCloseTo(1 - 0.64, 3); // underconfident: κ = 1
  });
});

describe('promotion gate logic (RUNG_GATES)', () => {
  const comp = (
    code: string,
    rung: number,
    mastery: number,
    contexts: number,
    status: CompetencyView['status'] = 'in_progress',
  ): CompetencyView => ({
    code,
    name: code,
    rung,
    mastery,
    components: {
      artifact: mastery,
      consistency: 1,
      retention: 1,
      judgement: 0.7,
      contexts,
    },
    threshold: RUNG_GATES[rung as 1].masteryThreshold || 0.8,
    minContexts: RUNG_GATES[rung as 1].minContexts,
    status,
  });
  const judgement = {
    score: 0.7,
    calibration: 0.7,
    critiqueQuality: 0.7,
    trend: 'flat' as const,
    overconfidentRate: 0,
  };

  it('L1 → L2 requires every L1 competency ≥ 0.80 across ≥ 2 contexts (judgement ignored)', () => {
    const ok = svc().gateCheck(
      1,
      [comp('L1.a', 1, 0.85, 2), comp('L1.b', 1, 0.81, 3)],
      judgement,
    );
    expect(ok.met).toEqual({
      mastery: true,
      contexts: true,
      judgement: true,
      retention: true,
    });
    expect(ok.gate).toEqual({
      masteryThreshold: 0.8,
      minContexts: 2,
      minJudgement: 0,
    });
    const short = svc().gateCheck(
      1,
      [comp('L1.a', 1, 0.85, 1), comp('L1.b', 1, 0.79, 3)],
      judgement,
    );
    expect(short.met.mastery).toBe(false);
    expect(short.met.contexts).toBe(false);
    expect(short.toNextRung).toBeGreaterThan(0.5);
    expect(short.toNextRung).toBeLessThan(1);
  });

  it('L2 → L3 also requires L1 retained (no decay flag)', () => {
    const comps = [
      comp('L1.a', 1, 0.6, 3, 'decayed'),
      comp('L2.a', 2, 0.9, 3),
      comp('L2.b', 2, 0.85, 3),
    ];
    const r = svc().gateCheck(2, comps, judgement);
    expect(r.met.mastery).toBe(true);
    expect(r.met.retention).toBe(false);
  });

  it('judgement never gates (retired 2026-09-06): L3 and L5 are met regardless of the judgement score', () => {
    const low = { ...judgement, score: 0 };
    expect(
      svc().gateCheck(3, [comp('L3.a', 3, 0.9, 3)], low).met.judgement,
    ).toBe(true);
    expect(
      svc().gateCheck(5, [comp('L5.a', 5, 0.95, 4)], low).met.judgement,
    ).toBe(true);
    expect(svc().gateCheck(5, [comp('L5.a', 5, 0.95, 4)], low).toNextRung).toBe(
      1,
    );
    expect(RUNG_GATES[5].minJudgement).toBe(0);
  });

  it('L0 is completion-only', () => {
    expect(
      svc().gateCheck(0, [comp('L0.a', 0, 0, 0)], judgement, false).met.mastery,
    ).toBe(false);
    expect(
      svc().gateCheck(0, [comp('L0.a', 0, 0, 0)], judgement, true).met,
    ).toEqual({
      mastery: true,
      contexts: true,
      judgement: true,
      retention: true,
    });
  });
});
