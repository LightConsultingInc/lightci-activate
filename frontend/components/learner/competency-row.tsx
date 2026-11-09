"use client"

import { Info } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CompetencyStatusChip } from "./chips"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Competency } from "@/hooks/learner/types"

const COMPONENTS: { key: keyof Competency["components"]; label: string; weight: string; help: string }[] = [
  { key: "artifact", label: "Your recent work", weight: "", help: "How your last few pieces of practice went. Recent ones count more." },
  { key: "consistency", label: "Steadiness", weight: "", help: "Whether it goes well on different tasks, not just one." },
  { key: "retention", label: "Remembering it", weight: "", help: "Fades a little over time; answering a quick recap brings it back." },
  { key: "judgement", label: "Spotting what's off", weight: "", help: "Whether your guess about the result matches what Claude gives back, and how useful your notes are." },
  { key: "contexts", label: "Different tasks", weight: "needed", help: "How many different pieces of your own work you've used this on." },
]

/** Name, mastery bar with a threshold tick, status chip, and a popover breaking mastery into its components. */
export function CompetencyRow({ c, className }: { c: Competency; className?: string }) {
  const pct = Math.round(c.mastery * 100)
  const tick = Math.round(c.threshold * 100)
  const barTone = c.status === "mastered" ? "bg-pass" : c.status === "decayed" ? "bg-revise" : c.status === "locked" ? "bg-border" : "bg-glow"
  return (
    <li className={cn("grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto]", className)} data-testid="competency-row" data-code={c.code}>
      <div className="flex min-w-0 items-center gap-2">
        <Popover>
          <PopoverTrigger className="flex min-w-0 items-center gap-1.5 text-left text-sm font-medium hover:underline hover:underline-offset-4" data-testid="competency-components-trigger">
            <span className="truncate">{c.name}</span>
            <Info className="size-3.5 shrink-0 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80">
            <p className="text-sm font-medium">{c.name}</p>
            <p className="text-xs text-muted-foreground">At {fmt.pct(c.mastery)} of the {fmt.pct(c.threshold)} needed, on {c.minContexts} different {c.minContexts === 1 ? "task" : "tasks"}</p>
            <ul className="mt-2 space-y-2">
              {COMPONENTS.map(({ key, label, weight, help }) => {
                const v = c.components?.[key] ?? 0
                const isCount = key === "contexts"
                const w = isCount ? Math.min(1, v / Math.max(1, c.minContexts)) : Math.max(0, Math.min(1, v))
                return (
                  <li key={key}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span>{label}{weight && <span className="text-muted-foreground"> · {weight}</span>}</span>
                      <span className="tabular font-medium">{isCount ? `${v} / ${c.minContexts}` : fmt.pct(v)}</span>
                    </div>
                    <div className="mt-1 h-1 w-full rounded-full bg-muted"><div className="h-full rounded-full bg-glow" style={{ width: `${w * 100}%` }} /></div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{help}</p>
                  </li>
                )
              })}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
      <div className="col-span-2 sm:col-span-1 sm:col-start-2">
        <div className="relative h-2 w-full rounded-full bg-muted" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.name} progress`}>
          <div className={cn("h-full rounded-full transition-[width] duration-700", barTone)} style={{ width: `${pct}%` }} />
          <span className="absolute -top-1 h-4 w-px bg-foreground/70" style={{ left: `${tick}%` }} title={`Line to clear: ${tick}%`} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
          <span className="tabular">{pct}%</span>
          <span className="tabular">{c.components?.contexts ?? 0} of {c.minContexts} tasks</span>
        </div>
      </div>
      <div className="col-start-2 row-start-1 sm:col-start-3">
        <CompetencyStatusChip status={c.status} />
      </div>
    </li>
  )
}
