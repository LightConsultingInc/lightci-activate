"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { ActivationComponents } from "@/hooks/mc/types"
import { CHART } from "./chart-bits"

/** Fixed order and hue per component so bars read the same on every row. */
export const SCORE_COMPONENTS: { key: keyof ActivationComponents; label: string; color: string }[] = [
  { key: "rung", label: "Rung", color: CHART.glow },
  { key: "hoursBack", label: "Hours back vs baseline", color: CHART.ink },
  { key: "skillsPublished", label: "Skills published", color: CHART.info },
  { key: "influence", label: "Influence (adopted by others)", color: CHART.pass },
  { key: "gradeQuality", label: "Grade quality", color: CHART.claude },
  { key: "activeDays", label: "Active days", color: "var(--rung-5)" },
]

/** The activation score, always as its stacked components. Never a lone number. */
export function ScoreBar({ composite, components, className, width = 160 }: { composite: number; components: ActivationComponents; className?: string; width?: number }) {
  const total = SCORE_COMPONENTS.reduce((a, c) => a + Math.max(0, components[c.key] ?? 0), 0) || 1
  return (
    <Tooltip>
      <TooltipTrigger render={<div />} className={cn("flex items-center gap-2", className)} data-testid="score-bar">
        <div className="flex h-2.5 gap-px overflow-hidden rounded-sm bg-muted" style={{ width }}>
          {SCORE_COMPONENTS.map((c) => {
            const v = Math.max(0, components[c.key] ?? 0)
            return v > 0 ? <span key={c.key} style={{ width: `${(v / total) * 100}%`, background: c.color }} /> : null
          })}
        </div>
        <span className="tabular text-xs text-muted-foreground">{Math.round(composite * 100)}</span>
      </TooltipTrigger>
      <TooltipContent className="block">
        <ul className="space-y-0.5">
          {SCORE_COMPONENTS.map((c) => (
            <li key={c.key} className="flex items-center gap-2">
              <span className="size-2 rounded-sm" style={{ background: c.color }} />
              <span className="text-background/70">{c.label}</span>
              <span className="ml-auto tabular">{Math.round((components[c.key] ?? 0) * 100)}</span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}

export function ScoreLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground", className)} data-testid="score-legend">
      {SCORE_COMPONENTS.map((c) => (
        <li key={c.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: c.color }} />
          {c.label}
        </li>
      ))}
    </ul>
  )
}
