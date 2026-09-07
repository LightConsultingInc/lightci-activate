"use client"

import Link from "next/link"
import { ArrowRight, Clock, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState, ErrorState } from "@/components/shell/empty-state"
import { Paper } from "@/components/brand/grain"
import { Chip } from "../chips"
import { useExercises } from "@/hooks/learner/queries"
import type { Module } from "@/content/lessons/types"
import type { ExerciseSummary } from "@/hooks/learner/types"

const ORDER: Record<string, number> = { active: 0, revise: 1, try_again: 1, queued: 2, passed: 3 }

/** One action per card. */
export function practiceAction(e: ExerciseSummary): { label: string; variant: "default" | "outline" } {
  switch (e.status) {
    case "passed": return { label: "Review feedback", variant: "outline" }
    case "revise":
    case "try_again": return { label: "Try again", variant: "default" }
    case "active": return { label: "Continue", variant: "default" }
    default: return { label: "Start", variant: "default" }
  }
}

export function practiceStatus(e: ExerciseSummary): { text: string; tone: "pass" | "revise" | "glow" | "neutral" } {
  switch (e.status) {
    case "passed": return { text: "Passed", tone: "pass" }
    case "revise":
    case "try_again": return { text: "Try again", tone: "revise" }
    case "active": return { text: "In progress", tone: "glow" }
    default: return { text: "Ready", tone: "neutral" }
  }
}

/** The one-line ask on a summary, falling back to the title. */
export const askOf = (e: ExerciseSummary) => e.ask?.trim() || e.title
export const workflowOf = (e: ExerciseSummary) => e.workflowName?.trim() || e.contextTag || null

/** The module's practice, each on one of the learner's own workflows. */
export function PracticeTab({ module, practiceReady = true }: { module: Module; practiceReady?: boolean }) {
  const q = useExercises("queued,active,passed,revise")
  if (q.isPending) return <div className="space-y-3" data-testid="practice-loading"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
  if (q.isError) return <ErrorState title="Couldn't load your practice" detail={q.error.message} retry={() => q.refetch()} />
  const mine = q.data.filter((e) => e.rung === module.rung).sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9))

  return (
    <section className="space-y-4" data-testid="practice-tab">
      <Paper className="rounded-xl border bg-card p-4">
        <p className="eyebrow mb-1">What practice looks like here</p>
        <p className="text-sm leading-relaxed">{module.practice}</p>
      </Paper>
      {mine.length === 0 && !practiceReady ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed bg-card/60 p-5 text-sm text-muted-foreground" data-testid="practice-preparing" role="status">
          <Loader2 className="size-4 animate-spin text-glow-foreground" /> Coach is setting up your practice from the work you named at intake. It opens in a moment.
        </div>
      ) : mine.length === 0 ? (
        <EmptyState title="No practice here yet" description={`Coach adds practice for ${module.code} from the work you named at intake, once you reach this module. Lessons are open any time.`} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {mine.map((e) => {
            const a = practiceAction(e)
            const s = practiceStatus(e)
            const wf = workflowOf(e)
            return (
              <li key={e.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4" data-testid="practice-card" data-status={e.status}>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={s.tone}>{s.text}</Chip>
                  <Chip><Clock className="size-3" /> ~{e.estimatedMinutes} min</Chip>
                </div>
                <div>
                  {wf && <p className="eyebrow mb-1" data-testid="practice-workflow">{wf}</p>}
                  <h3 className="font-display text-lg font-medium leading-snug" data-testid="practice-title">{askOf(e)}</h3>
                </div>
                <div className="mt-auto pt-1">
                  <Button variant={a.variant} render={<Link href={`/exercise/${e.id}`} />} data-testid="practice-start">
                    {a.label} <ArrowRight data-icon="inline-end" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
