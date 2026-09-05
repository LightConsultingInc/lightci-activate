import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { WorkflowScore } from "@/hooks/learner/types"

const DIMS: { key: "value" | "hours" | "readiness" | "exposure"; label: string; invert?: boolean }[] = [
  { key: "value", label: "Value" },
  { key: "hours", label: "Hours at stake" },
  { key: "readiness", label: "Readiness" },
  { key: "exposure", label: "Exposure", invert: true },
]

/** Scorer's four dimensions. Hours is shown as a share of a 20h/week ceiling; exposure is inverted (less is better). */
export function ScoreBars({ score, compact = false, className }: { score: WorkflowScore | null; compact?: boolean; className?: string }) {
  if (!score) return <p className={cn("text-xs text-muted-foreground", className)}>Not scored yet</p>
  return (
    <div className={cn("space-y-1.5", className)} data-testid="score-bars">
      {DIMS.map((d) => {
        const raw = score[d.key]
        const v = d.key === "hours" ? Math.min(1, raw / 20) : Math.max(0, Math.min(1, raw))
        const display = d.key === "hours" ? `${raw.toFixed(1)}h/wk` : fmt.pct(raw)
        return (
          <div key={d.key} className="grid grid-cols-[6rem_1fr_3.5rem] items-center gap-2 text-xs">
            <span className={cn("text-muted-foreground", compact && "text-[11px]")}>{d.label}</span>
            <div className="h-1.5 rounded-full bg-muted">
              <div className={cn("h-full rounded-full", d.invert ? "bg-fail/70" : "bg-glow")} style={{ width: `${v * 100}%` }} />
            </div>
            <span className="tabular text-right">{display}</span>
          </div>
        )
      })}
    </div>
  )
}

export function CompletenessMeter({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div className={cn("flex items-center gap-2", className)} data-testid="completeness-meter">
      <div className="h-1.5 w-24 rounded-full bg-muted" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Map completeness">
        <div className={cn("h-full rounded-full", pct >= 85 ? "bg-pass" : "bg-glow")} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular text-xs text-muted-foreground">{pct}% mapped</span>
    </div>
  )
}
