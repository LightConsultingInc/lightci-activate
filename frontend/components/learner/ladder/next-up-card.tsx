"use client"

import Link from "next/link"
import { ArrowRight, Clock, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RungBadge } from "@/components/brand/rung"
import { Paper } from "@/components/brand/grain"
import { ModeBadge } from "../chips"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ExerciseSummary, RevisitSummary } from "@/hooks/learner/types"

export function NextUpCard({ exercise, queued }: { exercise: ExerciseSummary | null; queued: ExerciseSummary[] }) {
  if (!exercise) {
    return (
      <Paper className="rounded-xl border bg-card p-6" data-testid="next-up-card" data-empty>
        <p className="eyebrow">Next up</p>
        <h2 className="mt-1 font-display text-2xl font-medium">Coach is planning your next exercise</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">It picks from the workflows you named at intake. If this stays empty for a day, ask your champion to check in.</p>
      </Paper>
    )
  }
  const active = exercise.status === "active" || exercise.status === "revise"
  return (
    <Paper className="rounded-xl border bg-card p-6 glow-ring" data-testid="next-up-card">
      <div className="flex flex-wrap items-center gap-2">
        <p className="eyebrow">Next up</p>
        <RungBadge rung={exercise.rung} />
        <ModeBadge mode={exercise.mode} />
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3" /> ~{exercise.estimatedMinutes} min</span>
      </div>
      <h2 className="mt-2 font-display text-2xl font-medium leading-snug" data-testid="next-up-title">{exercise.title}</h2>
      {exercise.rationale && <p className="mt-2 max-w-2xl text-sm text-muted-foreground" data-testid="next-up-rationale">{exercise.rationale}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button size="lg" render={<Link href={`/exercise/${exercise.id}`} />} data-testid="next-up-start">
          {active ? "Continue" : "Start"} <ArrowRight data-icon="inline-end" />
        </Button>
        {queued.length > 0 && <span className="text-xs text-muted-foreground">{queued.length} more queued behind this one</span>}
      </div>
    </Paper>
  )
}

export function RevisitsDue({ revisits, onOpen }: { revisits: RevisitSummary[]; onOpen: (r: RevisitSummary) => void }) {
  return (
    <section className="rounded-xl border bg-card p-5" data-testid="revisits-due">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-medium">Revisits due today</h2>
        <span className="tabular text-xs text-muted-foreground">{revisits.length}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Two to five minutes each, from memory. Retrieval is what makes the earlier rungs stick.</p>
      {revisits.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">Nothing due. Your next revisit is scheduled by the spacing rule (2, 7, 21, 60, 120 days).</p>
      ) : (
        <ul className="mt-4 divide-y">
          {revisits.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5" data-testid="revisit-row">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.competencyName}</p>
                <p className={cn("text-xs", r.overdue ? "text-fail" : "text-muted-foreground")}>{r.overdue ? "Overdue" : "Due"} {fmt.ago(r.dueAt)} · step {r.intervalStep + 1}</p>
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
