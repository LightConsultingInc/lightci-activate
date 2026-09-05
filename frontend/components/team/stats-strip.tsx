import { RUNGS } from "@/components/brand/rung"
import { fmt } from "@/lib/format"
import type { TeamView } from "@/hooks/library/types"

/** Five stat tiles. The rung distribution is a tiny histogram whose bars carry rung colours; numbers are text. */
export function StatsStrip({ stats }: { stats: TeamView["stats"] }) {
  const dist = stats.rungDistribution ?? []
  const max = Math.max(1, ...dist)
  const people = dist.reduce((a, b) => a + b, 0)
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="team-stats">
      <Tile label="Active on real work · 7d" value={fmt.pct(stats.activePct7d)} hint="Claude Analytics definition, not logins" />
      <div className="rounded-xl border bg-card p-4" data-testid="rung-histogram">
        <p className="eyebrow">Rung distribution</p>
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
      <Tile label="Hours back · per week" value={`${(stats.hoursBackPerWeek ?? 0).toFixed(1)}h`} hint="Net of rework, against baseline" />
      <Tile label="Skills published" value={fmt.num(stats.skillsPublished)} hint="Through the promotion queue" />
      <Tile label="Promotions pending" value={fmt.num(stats.promotionsPending)} hint={stats.promotionsPending ? "Waiting on you" : "Queue is clear"} tone={stats.promotionsPending ? "glow" : undefined} />
    </div>
  )
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "glow" }) {
  return (
    <div className={`rounded-xl border bg-card p-4 ${tone === "glow" ? "glow-ring" : ""}`}>
      <p className="eyebrow">{label}</p>
      <p className="font-display mt-1 text-3xl font-medium tabular">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
