"use client"

import Link from "next/link"
import { motion } from "motion/react"
import { ArrowRight, Lightbulb, RotateCcw, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RubricBars } from "./rubric-bars"
import { DecisionChip } from "./chips"
import { MarkdownLite } from "./markdown-lite"
import { useReducedMotion } from "@/hooks/learner/use-reduced-motion"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ExerciseSummary, GradeView } from "@/hooks/learner/types"

type Props = {
  grade: GradeView
  /** When present, renders a "what's next" footer. */
  nextUp?: ExerciseSummary | null
  onRevise?: () => void
  compact?: boolean
  animate?: boolean
  className?: string
}

export function GradeCard({ grade, nextUp, onRevise, compact = false, animate = false, className }: Props) {
  const reduced = useReducedMotion()
  const doAnimate = animate && !reduced
  const pct = Math.round(grade.score * 100)
  const gradedBy = grade.gradedBy === "grader" ? "Grader" : grade.gradedBy?.name ?? "Champion"
  return (
    <motion.section
      initial={doAnimate ? { opacity: 0, y: 12 } : false}
      animate={doAnimate ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn("rounded-xl border bg-card p-5 ring-1 ring-foreground/5", grade.decision === "pass" && "glow-ring", className)}
      data-testid="grade-card"
      data-decision={grade.decision}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Grade · {gradedBy}</p>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="font-display text-4xl font-medium tabular" data-testid="grade-score">{pct}</span>
            <span className="text-sm text-muted-foreground">/ 100</span>
            <DecisionChip decision={grade.decision} />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-right text-xs">
          <dt className="text-muted-foreground">Expectation accuracy</dt>
          <dd className="tabular font-medium" data-testid="grade-expectation-accuracy">{grade.expectationAccuracy == null ? "—" : fmt.pct(grade.expectationAccuracy)}</dd>
          <dt className="text-muted-foreground">Critique quality</dt>
          <dd className="tabular font-medium" data-testid="grade-critique-quality">{grade.critiqueQuality == null ? "—" : fmt.pct(grade.critiqueQuality)}</dd>
        </dl>
      </header>

      <div className="mt-5">
        <RubricBars rubric={grade.rubric} compact={compact} />
      </div>

      {grade.feedback && (
        <div className="mt-5">
          <p className="eyebrow mb-1.5">Feedback</p>
          <MarkdownLite text={grade.feedback} />
        </div>
      )}

      {grade.teachingMoment && (
        <div className="mt-5 flex gap-3 rounded-lg border border-glow/40 bg-glow-soft p-4" data-testid="teaching-moment">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-glow-foreground" />
          <div>
            <p className="eyebrow text-glow-foreground">Teaching moment</p>
            <MarkdownLite text={grade.teachingMoment} className="mt-1 text-glow-foreground" />
          </div>
        </div>
      )}

      {grade.securityFindings?.length > 0 && (
        <div className="mt-5 rounded-lg border border-fail/30 bg-fail-soft p-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-fail"><ShieldAlert className="size-4" /> Security findings</p>
          <ul className="mt-2 space-y-1 text-sm">
            {grade.securityFindings.map((f, i) => (
              <li key={i}><span className="mr-1.5 rounded bg-background px-1.5 py-0.5 text-[10px] font-semibold uppercase">{f.severity}</span>{f.finding}</li>
            ))}
          </ul>
        </div>
      )}

      {(nextUp !== undefined || onRevise) && (
        <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">Graded {fmt.ago(grade.gradedAt)}</p>
          <div className="flex gap-2">
            {grade.decision === "revise" && onRevise && (
              <Button variant="outline" onClick={onRevise} data-testid="grade-revise">
                <RotateCcw data-icon="inline-start" /> Revise and resubmit
              </Button>
            )}
            {nextUp ? (
              <Button render={<Link href={`/exercise/${nextUp.id}`} />} data-testid="grade-next-exercise">
                Next: {nextUp.title} <ArrowRight data-icon="inline-end" />
              </Button>
            ) : grade.decision === "pass" ? (
              <Button variant="outline" render={<Link href="/" />} data-testid="grade-back-to-ladder">Back to My Ladder</Button>
            ) : null}
          </div>
        </footer>
      )}
    </motion.section>
  )
}
