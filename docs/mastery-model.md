# Mastery Score & Fluency Ladder — Learning-Science Design Brief

*LightCI Activate · research brief compiled September 2026. This document is the citable basis for `api/src/learning/mastery.service.ts` and the revisit scheduler.*

## 1. Mastery models

Classical **mastery learning** (Bloom; operationalized by Guskey) uses a formative-assessment-then-corrective cycle: learners are assessed, those below a mastery criterion (typically 80–90%) receive correctives targeted at the missed objectives, then a parallel reassessment follows, repeating until the criterion is met; those who pass early get enrichment. This gives us the corrective/enrichment loop but only a single-shot threshold: no notion of decay or context generalisation.

**Bayesian Knowledge Tracing (BKT)**, used in Carnegie Learning's Cognitive Tutors, models each skill as a latent binary state updated by Bayes' rule from four parameters: P(L₀) prior, P(T) learn rate, P(G) guess, P(S) slip. Mastery is declared when posterior P(Lₙ) crosses a threshold, canonically **0.95**. BKT's strength is that it explicitly discounts lucky guesses and careless slips: directly relevant since a single well-graded artifact could be a fluke.

**Performance Factors Analysis (PFA)** replaces BKT's latent-state HMM with logistic regression over counts of prior successes and failures per competency, handling multi-skill items more gracefully and remaining fully interpretable.

**Elo-style ratings** treat each artifact-grading event as a "match" between learner skill and task difficulty, updating both with a simple win/loss rule. Cheap, online, requires no large calibration sample, and performs comparably to Rasch/IRT models.

Across all of these the recurring insight, and the one most relevant to delegating work to Claude, is that **mastery means consistent, low-variance performance across varied contexts**, not one good artifact. A single excellent prompt-engineering exercise proves competence with that task, not the competency.

**Decision:** an explainable weighted composite rather than a full HMM. BKT/PFA need volumes of attempts per skill that a working professional producing a handful of artifacts per week will not generate. We borrow BKT's guess/slip scepticism (weight by grader confidence and artifact stakes), Elo's recency sensitivity, and mastery learning's threshold-with-corrective-loop, then add two enterprise-specific dimensions: **context diversity** and **judgement calibration**, because a competency in this product is validated by transferring it to a novel workflow, not by repeating the same task.

## 2. Spacing and retention

**SM-2** sets interval = previous interval × ease factor, adjusted by a 0–5 recall-quality rating; the first two reviews are fixed at 1 and 6 days. **FSRS** models Difficulty/Stability/Retrievability directly and schedules to hit a target recall probability (e.g. 90%), achieving the same retention with roughly 20–30% fewer reviews than SM-2. The **Leitner system** is the simplest: correct answers promote a card to a less-frequent box, failure resets it to box 1.

Underlying all three is Bjork's **desirable difficulties** (spacing, interleaving, retrieval, generation, varied practice slow acquisition but improve durable retention and transfer) and Roediger & Karpicke's **testing effect**: retrieval practice beat re-reading 61% to 40% after one week despite trailing at five minutes.

**Decision:** a Leitner-style expanding schedule, simple enough for busy professionals, with FSRS-like reset-on-failure severity. Revisit intervals of **2, 7, 21, 60, 120 days**, advancing one step on a pass and **resetting to the 2-day interval** (not to zero) on failure, since a single slip should not erase Elo-style progress. Each revisit is a fresh, distinctly-worded retrieval task in a varied context, never a repeat of the original artifact. This operationalises spacing and interleaving at once.

## 3. Ladder and levels

The **Dreyfus model** (novice → advanced beginner → competent → proficient → expert) tracks a shift from rule-following to intuitive, context-sensitive judgement. **Competency-based education** gates progression on artifact evidence, not time-in-seat. Guskey's corrective/enrichment loop supplies the remediation mechanic at each gate. Ericsson's **deliberate practice** is the theoretical case for graded real-work artifacts rather than quizzes, though replications found smaller effects than originally claimed, so hours practised are necessary but not sufficient.

| Rung | Dreyfus analogue | Gate to enter next rung |
|---|---|---|
| L0 Orientation | Pre-novice | Completion only (first finished piece of real work) |
| L1 Conversational | Novice → Advanced beginner | Mastery ≥ 0.80 on the L1 competencies, ≥ 2 distinct contexts |
| L2 Context | Advanced beginner → Competent | Mastery ≥ 0.80 on the L2 competencies, ≥ 3 contexts, L1 retained (no decay flag) |
| L3 Skill | Competent | Mastery ≥ 0.85 on the L3 competencies, ≥ 3 contexts, judgement ≥ 0.60 |
| L4 Workflow | Proficient | Mastery ≥ 0.85 on the L4 competencies, ≥ 4 contexts, L1–L3 all retained |
| L5 Champion | Expert | Mastery ≥ 0.90 across all competencies, sustained through ≥ 2 revisit cycles, judgement ≥ 0.75, grades others with grader agreement |

**Decay rule:** apply exponential time decay to each competency's mastery between revisits (§6) and drop the learner's *rung eligibility flag* (never their historical rung label) if any gating competency decays below 0.70 without a successful revisit. This mirrors Guskey's reassessment loop rather than a hard demotion, and avoids a punitive feel in regulated firms.

## 4. Judgement and metacognition

This is the highest-risk area for an AI-delegation product because the mechanism of harm is specific: **cognitive offloading**. Gerlich (2025, n = 666) found frequent AI use correlated with lower critical-thinking scores, mediated by offloading. Fan et al. (2025) coin **"metacognitive laziness"**: generative-AI support reduced self-regulated learning engagement in a randomised writing-task study. The Microsoft/CMU CHI 2025 survey of 319 knowledge workers found **higher trust in AI correlates with less critical thinking, while higher self-confidence correlates with more**; critical thinking shifted toward verification, integration and stewardship of AI output rather than disappearing.

This is why the pre-run prediction and post-run critique loop matters: it forces the verification/stewardship behaviour the CHI study identifies as the surviving form of critical thinking under AI use. **Calibration** is measured with the **Brier score** (mean squared error between stated confidence and outcome). The **hypercorrection effect** shows confident-wrong predictions, once corrected, are remembered better than low-confidence-wrong ones, and the benefit persists for a week. That directly justifies requiring a prediction before every artifact is graded, not only a critique after.

**Judgement score:** combine (a) Brier-based calibration of pre-run confidence against grader outcome and (b) critique quality (grader-scored: did the learner identify the artifact's real weaknesses?). Overconfidence is penalised more steeply than underconfidence (κ = 1.5), matching the asymmetric risk of regulated work: an overconfident learner shipping ungraded AI output is the failure mode this product exists to prevent.

## 5. Learning analytics for admins

Meaningful aggregates: **time-in-rung** distributions (systemic stalls, not just individual ones), **stall detection** (no artifact in N days at the current rung, or repeated sub-threshold scores on one competency), **retention curves** (revisit score against days elapsed, per competency), and **calibration trends** (is the cohort's Brier score improving, i.e. is trust in AI output becoming better founded).

Pitfalls: **Goodhart's law** (once mastery is a target, people optimise its proxies, e.g. padding context diversity), **leaderboards** in regulated firms (shame and anxiety in low-ranked staff, and suppression of the reporting behaviour compliance depends on; prefer cohort trends, default leaderboards off), and **vanity metrics** (artifacts submitted, logins, streaks must never gate promotion).

## Worked example

Learner Priya, competency "Context engineering", day 45.

| Component | Value | Note |
|---|---|---|
| Artifact scores (last 5, recency-weighted, half-life 14 d) | 0.72, 0.81, 0.90, 0.85, 0.93 | weights 0.55, 0.63, 0.72, 0.85, 1.0 |
| Weighted mean artifact score | **0.87** | Σ(wᵢsᵢ)/Σwᵢ |
| Distinct contexts covered | 4 of 4 target | full credit |
| Consistency (1 − stdev/mean across contexts) | 0.91 | low variance |
| Retention (last revisit day 21, decayed to day 45) | 0.88 → 0.79 | exponential decay, λ = 0.01/day |
| Judgement (Brier calibration + critique quality) | 0.68 | slightly overconfident on 2 of 8 predictions |
| **Composite mastery** | **0.83** | §6 |

Priya clears the L2 ≥ 0.80 threshold but her judgement score (0.68) is flagged. She is promoted to L3 eligibility but Coach routes a calibration-focused corrective (a predict-then-critique drill) before the gate fully opens.

## 6. Recommended formulas (implemented in `mastery.service.ts`)

> **Update 2026-09-06 (practice model v2, `docs/practice-model.md`).** The judgement component is retired: practice no longer asks for a prediction or a self-check, so there is no Brier calibration or critique-quality signal to weight. `Mastery = 0.60·S_artifact + 0.20·Consistency + 0.20·Retention`, and the promotion gate is `Mastery ≥ threshold(rung)` AND `contexts ≥ min_required(rung)` (plus retention of earlier rungs). `RUNG_GATES.minJudgement` is 0 and ignored; `LadderView.judgement` and `components.judgement` are still reported from legacy grades for display only. The worked example above therefore composes to 0.86 under the new weights. §4 remains as the research rationale for the retired component.

**Recency-weighted artifact score** (half-life h = 14 days): `wᵢ = 0.5^(Δtᵢ / h)`; `S_artifact = Σ(wᵢ · scoreᵢ) / Σ(wᵢ)`

**Consistency across contexts** (k distinct contexts): `Consistency = max(0, 1 − stdev(s) / mean(s))`, with a diversity factor `min(1, k / k_required)`.

**Retention decay** (t days since last successful revisit, λ = 0.01): `Retention(t) = R_last · e^(−λt)`

**Judgement / calibration** (confidence cᵢ, outcome oᵢ ∈ {0,1}, κ = 1.5 for overconfidence): `Brierᵢ = (cᵢ − oᵢ)² · (κ if cᵢ > oᵢ else 1)`; `Judgement = 0.5·(1 − mean(Brierᵢ)) + 0.5·CritiqueQuality`

**Composite mastery per competency:** `Mastery = 0.40·S_artifact + 0.20·Consistency + 0.20·Retention + 0.20·Judgement`

**Promotion gate:** `Mastery ≥ threshold(rung)` AND `contexts ≥ min_required(rung)` AND `Judgement ≥ 0.60` (0.75 for L5).

**Revisit scheduler:** intervals `[2, 7, 21, 60, 120]` days; advance one step on pass (score ≥ 0.80), reset to step 1 on fail.

**Decay-triggered reassessment:** if mastery for a gating competency drops below 0.70 between scheduled revisits, auto-inject a revisit regardless of schedule.

## References

- Guskey, "Mastery Learning": https://tguskey.com/wp-content/uploads/Mastery-Learning-1-Mastery-Learning.pdf
- Bayesian Knowledge Tracing overview: https://www.emergentmind.com/topics/bayesian-knowledge-tracing-bkt · pyBKT: https://arxiv.org/pdf/2105.00385
- Performance Factors Analysis: https://files.eric.ed.gov/fulltext/ED506305.pdf
- Elo in adaptive educational systems (Pelánek): https://www.sciencedirect.com/science/article/abs/pii/S036013151630080X
- SM-2: https://github.com/cnnrhill/sm-2 · FSRS: https://github.com/open-spaced-repetition/awesome-fsrs/wiki/ABC-of-FSRS · Leitner: https://www.goodnotes.com/blog/leitner-system
- Bjork & Bjork, Desirable Difficulties: https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-introducing-desirable-difficulties-into-practice-and-instruction-bjork-and-bjork.pdf
- Roediger & Karpicke 2006: https://notes.andymatuschak.org/zGfjkW1ociSmSUCLcpbhKjf
- Dreyfus model: https://en.wikipedia.org/wiki/Dreyfus_model_of_skill_acquisition · CBE Mastery Framework: https://ies.ed.gov/rel-southeast/2025/01/cbe-mastery-framework
- Deliberate practice replication: https://royalsocietypublishing.org/doi/10.1098/rsos.190327
- Gerlich 2025, Societies: https://www.mdpi.com/2075-4698/15/1/6
- Fan et al. 2025, "Beware of Metacognitive Laziness", BJET: https://bera-journals.onlinelibrary.wiley.com/doi/10.1111/bjet.13544
- Microsoft Research / CHI 2025: https://www.microsoft.com/en-us/research/publication/the-impact-of-generative-ai-on-critical-thinking-self-reported-reductions-in-cognitive-effort-and-confidence-effects-from-a-survey-of-knowledge-workers/
- Brier decomposition: https://www.emergentmind.com/topics/brier-score-term · Hypercorrection: https://link.springer.com/article/10.3758/s13423-011-0173-y
- Goodhart and leaderboards: https://blog.collinear.ai/p/gaming-the-system-goodharts-law-exemplified-in-ai-leaderboard-controversy
