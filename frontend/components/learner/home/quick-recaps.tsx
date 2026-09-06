"use client"

import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { RevisitSummary } from "@/hooks/learner/types"

/** Revisits due, called quick recaps: two to five minutes each, from memory. */
export function QuickRecaps({ revisits, onOpen, title = "Quick recaps due today", className }: { revisits: RevisitSummary[]; onOpen: (r: RevisitSummary) => void; title?: string; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card p-5", className)} data-testid="revisits-due">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-medium">{title}</h2>
        <span className="tabular text-xs text-muted-foreground">{revisits.length}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Two to five minutes each, answered from memory. This is what makes earlier modules stick.</p>
      {revisits.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">Nothing due today. The next one comes round in a few days.</p>
      ) : (
        <ul className="mt-4 divide-y">
          {revisits.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5" data-testid="revisit-row">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.competencyName}</p>
                <p className={cn("text-xs", r.overdue ? "text-fail" : "text-muted-foreground")}>{r.overdue ? "Overdue" : "Due"} {fmt.ago(r.dueAt)} · recap {r.intervalStep + 1}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onOpen(r)} data-testid="revisit-open">
                <RefreshCw data-icon="inline-start" /> Answer
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
