import { RUNGS } from "@/components/brand/rung"
import { fmt } from "@/lib/format"
import type { TeamView } from "@/hooks/library/types"

/** Five stat tiles. A tile whose number is only "no data yet" drops the number and keeps the hint. The level distribution is a tiny histogram whose bars carry rung colours; numbers are text. */
export function StatsStrip({ stats }: { stats: TeamView["stats"] }) {
  const dist = stats.rungDistribution ?? []
  const max = Math.max(1, ...dist)
  const people = dist.reduce((a, b) => a + b, 0)
  // 0% with no usage data, or 0h with no "before" times, means "not known yet": show the explanation, not a zero.
  const noUsage = stats.hasUsage === false && !stats.activePct7d
  const noHours = stats.hasBaseline === false && !stats.hoursBackPerWeek
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="team-stats">
      <Tile label="Using Claude for work · 7 days" value={noUsage ? "" : fmt.pct(stats.activePct7d)} hint={noUsage ? "Shows once Claude usage data comes in" : "Doing real work in Claude, not just signing in"} />
      <div className="rounded-xl border bg-card p-4" data-testid="rung-histogram">
        <p className="eyebrow">People at each level</p>
        <div className="mt-2 flex h-12 items-end gap-1.5">
          {RUNGS.map((r) => {
            const n = dist[r.rung] ?? 0
            return (
              <div key={r.rung} className="flex flex-1 flex-col items-center gap-1" title={`${r.code} ${r.name}: ${n}`}>
                <span className="text-[10px] tabular text-muted-foreground">{n || ""}</span>
                <div className="w-full rounded-t-[3px]" style={{ height: `${Math.max(2, (n / max) * 32)}px`, background: `var(--rung-${r.rung})`, opacity: n ? 1 : 0.25 }} />
                <span className="text-[9px] text-muted-foreground">{r.code}</span>
              </div>
            )
          })}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{people} people</p>
      </div>
      <Tile label="Time saved · per week" value={noHours ? "" : `${(stats.hoursBackPerWeek ?? 0).toFixed(1)}h`} hint={noHours ? "Shows once we know how long tasks took before" : "Compared with before, minus time spent fixing"} />
      <Tile label="Skills published" value={fmt.num(stats.skillsPublished)} hint="Checked and approved before sharing" />
      <Tile label="Skills to approve" value={fmt.num(stats.promotionsPending)} hint={stats.promotionsPending ? "Waiting on you" : "All caught up"} tone={stats.promotionsPending ? "glow" : undefined} />
    </div>
  )
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "glow" }) {
  return (
    <div className={`rounded-xl border bg-card p-4 ${tone === "glow" ? "glow-ring" : ""}`}>
      <p className="eyebrow">{label}</p>
      {value && <p className="font-display mt-1 text-3xl font-medium tabular">{value}</p>}
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
