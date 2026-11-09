"use client"

import Link from "next/link"
import { motion } from "motion/react"
import { ArrowRight, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Chip } from "../chips"
import { PromotionCelebration } from "../promotion-celebration"
import { useReducedMotion } from "@/hooks/learner/use-reduced-motion"
import { cn } from "@/lib/utils"
import { rungMeta } from "@/components/brand/rung"
import type { ExerciseSummary, Feedback, PracticeDecision } from "@/hooks/learner/types"

export type FeedbackResult = {
  feedback: Feedback
  score10: number
  decision: PracticeDecision
  nextUp: ExerciseSummary | null
  promotion?: { newRung: number }
  agreement?: { yours: number; grader: number }
}

type Props = {
  result: FeedbackResult
  moduleCode: string
  /** The module this practice belongs to. When the next practice sits in a later module, the card sends you to that module's lessons first. */
  rung: number
  onTryAgain?: () => void
  className?: string
}

/** Score out of 10, pass or try again, Coach's three lines, and what to do next. */
export function FeedbackCard({ result, moduleCode, rung, onTryAgain, className }: Props) {
  const reduced = useReducedMotion()
  const pass = result.decision === "pass"
  // Lessons come before practice in every module: a next practice one module up means "go to that module", not "skip its lessons".
  const nextAhead = result.nextUp != null && result.nextUp.rung > rung ? rungMeta(result.nextUp.rung) : null
  const nextHere = result.nextUp != null && result.nextUp.rung <= rung ? result.nextUp : null
  // The exact score, one decimal at most: "6.7" beats a rounded "7" sitting next to "Try again".
  const clamped = Math.max(0, Math.min(10, result.score10))
  const score = Number.isInteger(clamped) ? String(clamped) : clamped.toFixed(1).replace(/\.0$/, "")
  return (
    <div className="space-y-4">
      {result.promotion?.newRung != null && <PromotionCelebration newRung={result.promotion.newRung} />}
      <motion.section
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={reduced ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className={cn("rounded-xl border bg-card p-5 ring-1 ring-foreground/5", pass && "glow-ring", className)}
        data-testid="feedback-card"
        data-decision={result.decision}
      >
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-6xl font-medium leading-none tabular" data-testid="feedback-score">{score}</span>
            <span className="text-lg text-muted-foreground">/ 10</span>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Chip tone={pass ? "pass" : "revise"} className="h-6 px-2.5 text-xs" data-testid="decision-chip" data-decision={result.decision}>
              {pass ? "Pass" : "Try again"}
            </Chip>
            {result.agreement && (
              <p className="text-xs text-muted-foreground" data-testid="agreement">
                You guessed {result.agreement.yours}; it scored {result.agreement.grader}
              </p>
            )}
          </div>
        </header>

        <dl className="mt-5 grid gap-3">
          <Line label="What worked" text={result.feedback.worked} testId="feedback-worked" />
          <Line label="What to change" text={result.feedback.change} testId="feedback-change" />
          <Line label="Try next" text={result.feedback.tryNext} testId="feedback-next" />
        </dl>

        <footer className="mt-6 flex flex-wrap items-center gap-2 border-t pt-4" data-testid="feedback-actions">
          {onTryAgain && (
            <Button variant={pass ? "outline" : "default"} onClick={onTryAgain} data-testid="try-again-button">
              <RotateCcw data-icon="inline-start" /> Try again
            </Button>
          )}
          {nextHere && (
            <Button variant={pass || !onTryAgain ? "default" : "outline"} render={<Link href={`/exercise/${nextHere.id}`} />} data-testid="next-practice-button">
              Next practice <ArrowRight data-icon="inline-end" />
            </Button>
          )}
          {nextAhead && (
            <Button variant={pass || !onTryAgain ? "default" : "outline"} render={<Link href={`/modules/${nextAhead.code}?tab=learn`} />} data-testid="next-module-button">
              Next: {nextAhead.code} {nextAhead.name} <ArrowRight data-icon="inline-end" />
            </Button>
          )}
          <Button variant="ghost" render={<Link href={`/modules/${moduleCode}?tab=practice`} />} data-testid="back-to-module-button">
            Back to module
          </Button>
        </footer>
      </motion.section>
    </div>
  )
}

function Line({ label, text, testId }: { label: string; text: string; testId: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3" data-testid={testId}>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 text-sm leading-relaxed">{text || "—"}</dd>
    </div>
  )
}
