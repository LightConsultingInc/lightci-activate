"use client"

import { cn } from "@/lib/utils"
import { SourceLine } from "./states"

export type MetricTileProps = {
  label: string
  /** Formatted value. Pass null to show an em-dash. */
  value: React.ReactNode
  /** Small text under the value, e.g. "of 48 seats". */
  sub?: React.ReactNode
  /** Signed delta (fraction or absolute) with a label; direction colours by `goodWhenUp`. */
  delta?: { value: number | null | undefined; label?: string; format?: "pct" | "abs"; goodWhenUp?: boolean } | null
  trend?: "up" | "flat" | "down" | null
  source?: string | null
  baseline?: string | null
  /** Optional sparkline points, rendered as a hairline. */
  spark?: number[]
  testId?: string
  className?: string
  accent?: boolean
}

/** Every number on a dashboard shows its value, its trend and its provenance. Greyed when it has no baseline. */
export function MetricTile({ label, value, sub, delta, trend, source, baseline, spark, testId, className, accent }: MetricTileProps) {
  const noBaseline = !baseline
  const d = delta?.value
  const dir = trend ?? (d == null ? null : d > 0 ? "up" : d < 0 ? "down" : "flat")
  const good = dir === "flat" || dir == null ? null : (dir === "up") === (delta?.goodWhenUp ?? true)
  return (
    <div className={cn("relative flex flex-col gap-1 rounded-xl bg-card p-4 ring-1 ring-foreground/10", accent && "glow-ring", className)} data-testid={testId ?? "metric-tile"} data-baseline={noBaseline ? "none" : "present"}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {spark && spark.length > 1 && <Spark points={spark} />}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn("font-display text-3xl font-medium leading-none tabular", noBaseline ? "text-muted-foreground" : "text-foreground")} data-testid="metric-value">
          {value ?? "—"}
        </span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
      <div className="flex min-h-4 items-center gap-1.5 text-xs">
        {dir && (
          <span className={cn("tabular font-medium", good == null ? "text-muted-foreground" : good ? "text-pass" : "text-fail")} data-testid="metric-delta">
            {dir === "up" ? "▲" : dir === "down" ? "▼" : "•"}
            {d != null && Number.isFinite(d) && <> {delta?.format === "abs" ? Math.abs(d) : `${Math.abs(Math.round(d * 100))}%`}</>}
          </span>
        )}
        {delta?.label && <span className="text-muted-foreground">{delta.label}</span>}
      </div>
      <SourceLine source={source} baseline={baseline} className="mt-1" />
    </div>
  )
}

function Spark({ points }: { points: number[] }) {
  const w = 64
  const h = 20
  const max = Math.max(...points)
  const min = Math.min(...points)
  const span = max - min || 1
  const d = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p - min) / span) * (h - 2) - 1}`).join(" ")
  return (
    <svg width={w} height={h} className="text-muted-foreground/70" aria-hidden>
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
