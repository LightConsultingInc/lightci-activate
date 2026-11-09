"use client"

import { cn } from "@/lib/utils"
import type { RubricScore } from "@/hooks/learner/types"

/** One horizontal bar per rubric criterion: label, score 0..1 and the grader's note. */
export function RubricBars({ rubric, className, compact = false }: { rubric: RubricScore[]; className?: string; compact?: boolean }) {
  if (!rubric?.length) return null
  return (
    <ul className={cn("space-y-3", className)} data-testid="rubric-bars">
      {rubric.map((r) => {
        const pct = Math.round(Math.max(0, Math.min(1, r.score)) * 100)
        const strong = r.score >= 0.8
        return (
          <li key={r.criterion} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">{r.label}</span>
              <span className={cn("tabular text-xs", strong ? "text-pass" : r.score >= 0.6 ? "text-glow-foreground" : "text-fail")}>{pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={r.label}>
              <div className={cn("h-full rounded-full transition-[width] duration-700", strong ? "bg-pass" : r.score >= 0.6 ? "bg-glow" : "bg-fail")} style={{ width: `${pct}%` }} />
            </div>
            {!compact && r.note && <p className="text-xs leading-relaxed text-muted-foreground">{r.note}</p>}
          </li>
        )
      })}
    </ul>
  )
}
