"use client"

import { rungMeta } from "@/components/brand/rung"
import { CompetencyRow } from "../competency-row"
import { cn } from "@/lib/utils"
import type { Competency } from "@/hooks/learner/types"

export function CompetenciesPanel({ competencies, currentRung }: { competencies: Competency[]; currentRung: number }) {
  const byRung = new Map<number, Competency[]>()
  for (const c of competencies) byRung.set(c.rung, [...(byRung.get(c.rung) ?? []), c])
  const rungs = [...byRung.keys()].sort((a, b) => a - b)
  return (
    <section className="rounded-xl border bg-card p-5" data-testid="competencies-panel">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-medium">Competencies</h2>
        <p className="text-xs text-muted-foreground">Mastery = 40% artifact · 20% consistency · 20% retention · 20% judgement</p>
      </div>
      {rungs.length === 0 && <p className="mt-4 text-sm text-muted-foreground">Competencies appear after your intake interview places you on the ladder.</p>}
      <div className="mt-3 space-y-5">
        {rungs.map((r) => {
          const m = rungMeta(r)
          const list = byRung.get(r)!
          const mastered = list.filter((c) => c.status === "mastered").length
          return (
            <div key={r} data-testid={`competency-group-${r}`}>
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: `var(--rung-${r})` }} />
                <h3 className={cn("text-sm font-semibold", r > currentRung && "text-muted-foreground")}>{m.code} {m.name}</h3>
                <span className="tabular text-xs text-muted-foreground">{mastered}/{list.length} mastered</span>
                {r === currentRung && <span className="ml-auto text-[11px] text-glow-foreground">Current rung</span>}
              </div>
              <ul className="mt-1 divide-y">{list.map((c) => <CompetencyRow key={c.code} c={c} />)}</ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
