/**
 * Pure mastery arithmetic from docs/mastery-model.md §6. No I/O, no dates from the clock:
 * callers pass "days ago" relative to whatever day they are computing for, which lets the
 * same functions produce historical snapshots and the seed's 30-day series.
 */

export const HALF_LIFE_DAYS = 14;
export const DECAY_LAMBDA = 0.01;
export const OVERCONFIDENCE_KAPPA = 1.5;
export const REVISIT_INTERVALS_DAYS = [2, 7, 21, 60, 120] as const;
export const REVISIT_PASS_SCORE = 0.8;
/**
 * Practice v2 (2026-09-06): the judgement component is retired. Mastery is artifact 0.6,
 * consistency 0.2, retention 0.2. `judgement` is still computed for legacy display but carries no weight.
 */
export const MASTERY_WEIGHTS = {
  artifact: 0.6,
  consistency: 0.2,
  retention: 0.2,
  judgement: 0,
} as const;
export const DECAY_REASSESS_THRESHOLD = 0.7;

export interface ScoredArtifact {
  score: number; // 0..1
  daysAgo: number; // relative to the day being computed
  context?: string; // distinct context tag (e.g. "meeting-prep")
}

export interface Prediction {
  confidence: number; // 0..1 stated probability of passing
  outcome: 0 | 1; // 1 = passed
}

export interface MasteryComponents {
  artifact: number;
  consistency: number;
  retention: number;
  judgement: number;
  contexts: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** wᵢ = 0.5^(Δtᵢ / h); S = Σ(wᵢ·sᵢ) / Σ(wᵢ). Returns 0 with no artifacts. */
export function recencyWeightedScore(
  artifacts: readonly ScoredArtifact[],
  halfLifeDays: number = HALF_LIFE_DAYS,
): number {
  if (artifacts.length === 0) return 0;
  let num = 0;
  let den = 0;
  for (const a of artifacts) {
    const w = Math.pow(0.5, Math.max(0, a.daysAgo) / halfLifeDays);
    num += w * a.score;
    den += w;
  }
  return den === 0 ? 0 : clamp01(num / den);
}

/** Population standard deviation. */
export function stdev(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Consistency = max(0, 1 − stdev(s)/mean(s)) × min(1, k / k_required).
 * `scores` are the per-artifact scores; `contexts` is the number of distinct contexts they span.
 */
export function consistency(
  scores: readonly number[],
  contexts: number,
  requiredContexts: number,
): number {
  if (scores.length === 0) return 0;
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  const spread = mean === 0 ? 1 : stdev(scores) / mean;
  const base = Math.max(0, 1 - spread);
  const diversity =
    requiredContexts <= 0 ? 1 : Math.min(1, contexts / requiredContexts);
  return clamp01(base * diversity);
}

/** Retention(t) = R_last · e^(−λt). */
export function retentionDecay(
  lastScore: number,
  daysSince: number,
  lambda: number = DECAY_LAMBDA,
): number {
  return clamp01(lastScore * Math.exp(-lambda * Math.max(0, daysSince)));
}

/** Brierᵢ = (cᵢ − oᵢ)² · (κ if cᵢ > oᵢ else 1). Overconfidence is penalised more steeply. */
export function brier(
  prediction: Prediction,
  kappa: number = OVERCONFIDENCE_KAPPA,
): number {
  const err = (prediction.confidence - prediction.outcome) ** 2;
  return prediction.confidence > prediction.outcome ? err * kappa : err;
}

export function meanBrier(
  predictions: readonly Prediction[],
  kappa: number = OVERCONFIDENCE_KAPPA,
): number {
  if (predictions.length === 0) return 0;
  return (
    predictions.reduce((s, p) => s + brier(p, kappa), 0) / predictions.length
  );
}

/** Judgement = 0.5·(1 − mean(Brier)) + 0.5·CritiqueQuality. With no predictions, judgement is the critique quality alone. */
export function judgementScore(
  predictions: readonly Prediction[],
  critiqueQuality: number,
  kappa: number = OVERCONFIDENCE_KAPPA,
): number {
  if (predictions.length === 0) return clamp01(critiqueQuality);
  const calibration = clamp01(1 - meanBrier(predictions, kappa));
  return clamp01(0.5 * calibration + 0.5 * clamp01(critiqueQuality));
}

/** Mastery = 0.60·artifact + 0.20·consistency + 0.20·retention (judgement retired 2026-09-06; accepted and ignored). */
export function compositeMastery(
  c: Pick<MasteryComponents, 'artifact' | 'consistency' | 'retention'> &
    Partial<Pick<MasteryComponents, 'judgement'>>,
): number {
  const m =
    MASTERY_WEIGHTS.artifact * c.artifact +
    MASTERY_WEIGHTS.consistency * c.consistency +
    MASTERY_WEIGHTS.retention * c.retention;
  return Math.round(clamp01(m) * 1000) / 1000;
}

/**
 * Leitner-style scheduler: advance one step on a pass (score ≥ 0.80), reset to step 0 (the
 * 2-day interval, not zero) on a fail. Returns the next step index and its interval in days.
 */
export function nextRevisitInterval(
  currentStep: number,
  score: number,
): { step: number; days: number } {
  const passed = score >= REVISIT_PASS_SCORE;
  const step = passed
    ? Math.min(REVISIT_INTERVALS_DAYS.length - 1, Math.max(0, currentStep) + 1)
    : 0;
  return { step, days: REVISIT_INTERVALS_DAYS[step] };
}

export interface MasteryInput {
  artifacts: readonly ScoredArtifact[];
  /** Last successful revisit for this competency, if any. */
  lastRevisit?: { score: number; daysAgo: number } | null;
  /** Legacy inputs; still summarised into components.judgement for display, never weighted. */
  predictions?: readonly Prediction[];
  critiqueQuality?: number | null;
  requiredContexts: number;
  halfLifeDays?: number;
  lambda?: number;
  kappa?: number;
}

/**
 * Composite mastery for one competency on one day. Retention falls back to the decayed
 * most-recent artifact when no revisit has been done yet, so a fresh competency is not
 * scored as fully forgotten.
 */
export function computeMastery(input: MasteryInput): {
  mastery: number;
  components: MasteryComponents;
} {
  const artifact = recencyWeightedScore(input.artifacts, input.halfLifeDays);
  const contexts = new Set(input.artifacts.map((a) => a.context ?? 'default'))
    .size;
  const cons = consistency(
    input.artifacts.map((a) => a.score),
    contexts,
    input.requiredContexts,
  );
  let retention = 0;
  if (input.lastRevisit) {
    retention = retentionDecay(
      input.lastRevisit.score,
      input.lastRevisit.daysAgo,
      input.lambda,
    );
  } else if (input.artifacts.length > 0) {
    const latest = input.artifacts.reduce((a, b) =>
      b.daysAgo < a.daysAgo ? b : a,
    );
    retention = retentionDecay(latest.score, latest.daysAgo, input.lambda);
  }
  const judgement = judgementScore(
    input.predictions ?? [],
    input.critiqueQuality ?? 0,
    input.kappa,
  );
  const components: MasteryComponents = {
    artifact: round3(artifact),
    consistency: round3(cons),
    retention: round3(retention),
    judgement: round3(judgement),
    contexts,
  };
  return { mastery: compositeMastery(components), components };
}

/** Promotion gate check from §6: mastery and contexts. Judgement is accepted for compatibility and ignored (retired 2026-09-06). */
export function meetsGate(
  m: { mastery: number; contexts: number; judgement?: number | null },
  gate: {
    masteryThreshold: number;
    minContexts: number;
    minJudgement?: number;
  },
): boolean {
  return m.mastery >= gate.masteryThreshold && m.contexts >= gate.minContexts;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
