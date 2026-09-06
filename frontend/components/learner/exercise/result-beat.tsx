"use client"

import Link from "next/link"
import { ArrowRight, Check, Minus, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GradeCard } from "../grade-card"
import { PromotionCelebration } from "../promotion-celebration"
import { cn } from "@/lib/utils"
import type { ExerciseSummary, GradeView } from "@/hooks/learner/types"
import type { SelfCheckItem } from "./self-check"

const AGREE_AT = 0.7

type Props = {
  grade: GradeView
  nextUp: ExerciseSummary | null
  promotion?: { newRung: number }
  items: SelfCheckItem[]
  checked: Set<string>
  moduleCode: string
  onRevise: () => void
  canRevise: boolean
}

/** The Result beat: the grade, where your self-check matched the grader, and what to do next. */
export function ResultBeat({ grade, nextUp, promotion, items, checked, moduleCode, onRevise, canRevise }: Props) {
  const rows = items
    .map((it) => {
      const r = grade.rubric.find((x) => x.criterion === it.criterion)
      if (!r) return null
      const you = checked.has(it.criterion)
      const grader = r.score >= AGREE_AT
      return { it, you, grader, score: r.score, agree: you === grader }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
  const agreed = rows.filter((r) => r.agree).length

  return (
    <div className="space-y-6" data-testid="result-beat">
      {promotion?.newRung != null && <PromotionCelebration newRung={promotion.newRung} />}
      <GradeCard grade={grade} animate />

      {rows.length > 0 && (
        <section className="rounded-xl border bg-card p-5" data-testid="check-vs-grader">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-display text-xl font-medium">Your check vs the grader</h3>
            <p className="tabular text-sm text-muted-foreground" data-testid="check-vs-grader-summary">Agreed on {agreed} of {rows.length}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Where you and the grader see the same thing, your judgement is working. Where you differ, that is the next thing to learn to spot.</p>
          <ul className="mt-3 divide-y">
            {rows.map((r) => (
              <li key={r.it.criterion} className="flex items-center gap-3 py-2.5 text-sm" data-testid="check-vs-grader-row" data-agree={r.agree}>
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", r.agree ? "bg-pass-soft text-pass" : "bg-revise-soft text-glow-foreground")}>{r.agree ? <Check className="size-3.5" /> : <Minus className="size-3.5" />}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{r.it.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">You: {r.you ? "holds" : "not yet"}</span>
                <span className={cn("shrink-0 text-xs", r.grader ? "text-pass" : "text-glow-foreground")}>Grader: {Math.round(r.score * 100)}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2" data-testid="result-actions">
        {grade.decision === "revise" && canRevise && (
          <Button onClick={onRevise} data-testid="grade-revise"><RotateCcw data-icon="inline-start" /> Revise and resubmit</Button>
        )}
        {nextUp && (
          <Button variant={grade.decision === "revise" ? "outline" : "default"} render={<Link href={`/exercise/${nextUp.id}`} />} data-testid="grade-next-exercise">
            Next: {nextUp.title} <ArrowRight data-icon="inline-end" />
          </Button>
        )}
        <Button variant="outline" render={<Link href={`/modules/${moduleCode}?tab=feedback`} />} data-testid="grade-back-to-module">Back to {moduleCode}</Button>
      </div>
    </div>
  )
}
