"use client"

import { cn } from "@/lib/utils"
import { fmt } from "@/lib/format"

export type FunnelStep = { step: string; count: number; medianDays: number | null }

/** Horizontal funnel: provisioned → logged in → first real work → L1..L5. Shows conversion vs previous step and median days. */
export function FunnelChart({ steps, className }: { steps: FunnelStep[]; className?: string }) {
  const max = Math.max(1, ...steps.map((s) => s.count))
  return (
    <ol className={cn("space-y-1.5", className)} data-testid="funnel-chart">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].count : null
        const conv = prev ? s.count / prev : null
        const w = Math.max(2, (s.count / max) * 100)
        return (
          <li key={s.step} className="grid grid-cols-[9rem_1fr_7rem] items-center gap-3 text-sm" data-testid="funnel-step">
            <span className="truncate text-muted-foreground" title={s.step}>
              {s.step}
            </span>
            <div className="relative h-6 rounded-r-md bg-muted/60">
              <div className="h-full rounded-r-md transition-[width] duration-700" style={{ width: `${w}%`, background: `color-mix(in oklch, var(--glow) ${45 + (55 * (i + 1)) / steps.length}%, var(--ink))` }} />
              <span className="absolute inset-y-0 left-2 flex items-center text-xs font-medium tabular text-paper mix-blend-difference">{fmt.num(s.count)}</span>
            </div>
            <span className="tabular text-right text-xs text-muted-foreground">
              {conv != null ? <span className="font-medium text-foreground">{fmt.pct(conv)}</span> : <span>start</span>}
              {s.medianDays != null && <span className="ml-1">· {Math.round(s.medianDays)}d</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
