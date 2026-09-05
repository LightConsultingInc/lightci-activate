"use client"

import { AnimatePresence, motion } from "motion/react"
import { BookOpen, Check, ChevronLeft, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { HintsPanel } from "./hints-panel"
import { GradeCard } from "./grade-card"
import { MarkdownLite } from "./markdown-lite"
import { PromotionCelebration } from "./promotion-celebration"
import { useReducedMotion } from "@/hooks/learner/use-reduced-motion"
import { cn } from "@/lib/utils"
import type { ExerciseSummary, GradeView } from "@/hooks/learner/types"

export type StepperStep = 1 | 2 | 3 | 4 | 5
export const STEP_LABELS: Record<StepperStep, string> = { 1: "State your expectation", 2: "Work", 3: "Critique the output", 4: "Submit", 5: "Grade" }

type Props = {
  step: StepperStep
  maxReached: StepperStep
  onStep: (s: StepperStep) => void
  coachIntro: string
  expectation: { text: string; confidence: number }
  onExpectation: (v: { text: string; confidence: number }) => void
  onConfirmExpectation: () => void
  expectationPending: boolean
  hints: { hints: string[]; revealed: number; total: number; onReveal: () => void; pending: boolean }
  work: { ready: boolean; reason?: string }
  critique: string
  onCritique: (v: string) => void
  onSubmit: () => void
  submitting: boolean
  coldAttempt: boolean
  workedExample: string | null
  result: { grade: GradeView; nextUp: ExerciseSummary | null; promotion?: { newRung: number } } | null
  onRevise: () => void
  locked?: boolean
}

function confidenceLabel(c: number) {
  if (c >= 90) return "Near certain"
  if (c >= 70) return "Fairly confident"
  if (c >= 50) return "Coin flip"
  if (c >= 30) return "Doubtful"
  return "Expect a revise"
}

/** The Coach panel: a fixed predict → run → critique → submit → grade sequence. */
export function ExpectationCritiqueStepper(p: Props) {
  const reduced = useReducedMotion()
  const canConfirm = p.expectation.text.trim().length >= 20
  const canCritique = p.critique.trim().length >= 30

  return (
    <div className="flex h-full flex-col" data-testid="coach-panel">
      <ol className="flex items-center gap-1 border-b px-4 py-3" data-testid="stepper">
        {([1, 2, 3, 4, 5] as StepperStep[]).map((s) => {
          const done = s < p.step || (p.step === 5 && s === 5)
          const current = s === p.step
          const reachable = s <= p.maxReached && p.step !== 5
          return (
            <li key={s} className="flex items-center gap-1">
              <button
                type="button"
                disabled={!reachable || current}
                onClick={() => p.onStep(s)}
                className={cn(
                  "grid size-6 place-items-center rounded-full border text-[11px] font-semibold tabular transition-colors",
                  current ? "border-glow bg-glow text-glow-foreground" : done ? "border-pass bg-pass-soft text-pass" : "border-border text-muted-foreground",
                  reachable && !current && "hover:border-foreground",
                )}
                aria-current={current ? "step" : undefined}
                aria-label={`Step ${s}: ${STEP_LABELS[s]}`}
                data-testid={`step-${s}`}
                data-state={current ? "current" : done ? "done" : "upcoming"}
              >
                {done && !current ? <Check className="size-3" /> : s}
              </button>
              {s < 5 && <span className={cn("h-px w-3 sm:w-5", s < p.step ? "bg-pass" : "bg-border")} />}
            </li>
          )
        })}
        <li className="ml-auto text-xs text-muted-foreground">{p.step}/5</li>
      </ol>

      <div className="flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={p.step}
            initial={reduced ? false : { opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduced ? undefined : { opacity: 0, x: -10 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="space-y-4"
          >
            <header>
              <p className="eyebrow">Step {p.step}</p>
              <h3 className="font-display text-xl font-medium">{STEP_LABELS[p.step]}</h3>
            </header>

            {p.step === 1 && (
              <>
                {p.coachIntro && (
                  <div className="rounded-lg border bg-glow-soft/50 p-3" data-testid="coach-intro">
                    <p className="eyebrow mb-1 text-glow-foreground">Coach</p>
                    <MarkdownLite text={p.coachIntro} />
                  </div>
                )}
                <p className="text-sm text-muted-foreground">Before anything runs: what will a good result look like, and where do you expect it to fall short? Written predictions are how calibration is measured.</p>
                <Textarea
                  value={p.expectation.text}
                  onChange={(e) => p.onExpectation({ ...p.expectation, text: e.target.value })}
                  disabled={p.locked}
                  className="min-h-32"
                  placeholder="I expect Claude to structure the pack well but to invent numbers where the CRM export is missing, so I'll check every figure…"
                  data-testid="expectation-input"
                />
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">How likely is this attempt to pass?</span>
                    <span className="tabular text-muted-foreground" data-testid="confidence-value">{p.expectation.confidence}% · {confidenceLabel(p.expectation.confidence)}</span>
                  </div>
                  <Slider
                    value={[p.expectation.confidence]}
                    onValueChange={(v) => p.onExpectation({ ...p.expectation, confidence: Array.isArray(v) ? v[0] : (v as number) })}
                    min={0}
                    max={100}
                    step={5}
                    disabled={p.locked}
                    data-testid="confidence-slider"
                  />
                  <p className="text-[11px] text-muted-foreground">Overconfidence costs more than doubt in the judgement score, so be honest, not brave.</p>
                </div>
                <Button className="w-full" disabled={!canConfirm || p.expectationPending || p.locked} onClick={p.onConfirmExpectation} data-testid="expectation-confirm">
                  {p.expectationPending ? "Saving…" : "Lock in my expectation"}
                </Button>
              </>
            )}

            {p.step === 2 && (
              <>
                <p className="text-sm text-muted-foreground">Build the artifact in the work surface on the left. Come back here when the output exists and you have read it.</p>
                <div className="rounded-lg border p-3 text-sm">
                  <p className="eyebrow mb-1">Your expectation</p>
                  <p className="whitespace-pre-wrap">{p.expectation.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Confidence {p.expectation.confidence}%</p>
                </div>
                <HintsPanel hints={p.hints.hints} hintsRevealed={p.hints.revealed} hintsTotal={p.hints.total} onReveal={p.hints.onReveal} pending={p.hints.pending} />
                {p.workedExample && (
                  <details className="rounded-lg border p-3" data-testid="worked-example">
                    <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-medium"><BookOpen className="size-4 text-glow-foreground" /> Worked example (unlocked after your cold attempt)</summary>
                    <MarkdownLite text={p.workedExample} className="mt-3" />
                  </details>
                )}
                <Button className="w-full" disabled={!p.work.ready || p.locked} onClick={() => p.onStep(3)} data-testid="work-continue">
                  I&apos;ve read the output, critique it
                </Button>
                {!p.work.ready && p.work.reason && <p className="text-center text-xs text-muted-foreground">{p.work.reason}</p>}
              </>
            )}

            {p.step === 3 && (
              <>
                <p className="text-sm text-muted-foreground">Where does the artifact fall short of what a careful colleague would ship? Name the real weaknesses, not cosmetic ones. Grader scores how many you found.</p>
                <Textarea value={p.critique} onChange={(e) => p.onCritique(e.target.value)} disabled={p.locked} className="min-h-40" placeholder="The summary invents a Q3 figure; the tone is too casual for a compliance audience; it skipped the exceptions section…" data-testid="critique-input" />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => p.onStep(2)} disabled={p.locked} data-testid="critique-back"><ChevronLeft data-icon="inline-start" /> Back to work</Button>
                  <Button className="flex-1" disabled={!canCritique || p.locked} onClick={() => p.onStep(4)} data-testid="critique-continue">Continue to submit</Button>
                </div>
              </>
            )}

            {p.step === 4 && (
              <>
                <p className="text-sm text-muted-foreground">Grader will score the artifact against the rubric, your prediction against the outcome, and your critique against the issues it finds.</p>
                <dl className="space-y-2 rounded-lg border p-3 text-sm">
                  <div><dt className="eyebrow">Expectation</dt><dd className="mt-0.5 line-clamp-3">{p.expectation.text}</dd></div>
                  <div><dt className="eyebrow">Confidence</dt><dd className="tabular mt-0.5">{p.expectation.confidence}%</dd></div>
                  <div><dt className="eyebrow">Critique</dt><dd className="mt-0.5 line-clamp-3">{p.critique}</dd></div>
                  <div><dt className="eyebrow">Attempt</dt><dd className="mt-0.5">{p.coldAttempt ? "Cold: no worked example was shown" : "After seeing the worked example"}</dd></div>
                </dl>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => p.onStep(3)} disabled={p.submitting} data-testid="submit-back"><ChevronLeft data-icon="inline-start" /> Edit critique</Button>
                  <Button className="flex-1" onClick={p.onSubmit} disabled={p.submitting || !p.work.ready} data-testid="submit-button">
                    <Send data-icon="inline-start" /> {p.submitting ? "Grading…" : "Submit for grading"}
                  </Button>
                </div>
              </>
            )}

            {p.step === 5 && p.result && (
              <>
                {p.result.promotion?.newRung != null && <PromotionCelebration newRung={p.result.promotion.newRung} />}
                <GradeCard grade={p.result.grade} nextUp={p.result.nextUp} onRevise={p.onRevise} animate />
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
