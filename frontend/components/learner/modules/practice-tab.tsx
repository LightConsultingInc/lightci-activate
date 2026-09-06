"use client"

import Link from "next/link"
import { ArrowRight, Clock, Sparkles, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState, ErrorState } from "@/components/shell/empty-state"
import { Paper } from "@/components/brand/grain"
import { Chip, ModeBadge } from "../chips"
import { useExercises } from "@/hooks/learner/queries"
import type { Module } from "@/content/lessons/types"
import type { ExerciseSummary } from "@/hooks/learner/types"

const ORDER: Record<string, number> = { active: 0, revise: 1, queued: 2, passed: 3 }

function actionFor(e: ExerciseSummary) {
  if (e.status === "passed") return { label: "Review", tone: "outline" as const }
  if (e.status === "active" || e.status === "revise") return { label: "Continue", tone: "default" as const }
  return { label: "Start", tone: "default" as const }
}

function statusWords(e: ExerciseSummary) {
  switch (e.status) {
    case "passed": return { text: "Passed", tone: "pass" as const }
    case "revise": return { text: "Revise and resubmit", tone: "revise" as const }
    case "active": return { text: "In progress", tone: "glow" as const }
    default: return { text: "Ready to start", tone: "neutral" as const }
  }
}

/** The module's exercises, on the learner's own work. */
export function PracticeTab({ module }: { module: Module }) {
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
      {mine.length === 0 ? (
        <EmptyState title="No practice here yet" description={`Coach adds practice for ${module.code} from the work you named at intake, once you reach this module. Lessons are open any time.`} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {mine.map((e) => {
            const a = actionFor(e)
            const s = statusWords(e)
            return (
              <li key={e.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4" data-testid="practice-card" data-status={e.status} data-mode={e.mode}>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={s.tone}>{s.text}</Chip>
                  <ModeBadge mode={e.mode} />
                  <Chip><Clock className="size-3" /> ~{e.estimatedMinutes} min</Chip>
                  {e.contextTag && <Chip><Tag className="size-3" /> {e.contextTag}</Chip>}
                </div>
                <div>
                  <h3 className="font-display text-lg font-medium leading-snug" data-testid="practice-title">{e.title}</h3>
                  <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{e.brief}</p>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  {e.mode === "in_claude" && e.status !== "passed" ? (
                    <>
                      {/* The Open-in-Claude pack opens first; working in the app is the secondary path. */}
                      <Button render={<Link href={`/exercise/${e.id}?claude=1`} />} data-testid="practice-in-claude">
                        <Sparkles data-icon="inline-start" className="text-glow" /> Do it in Claude
                      </Button>
                      <Button variant="outline" render={<Link href={`/exercise/${e.id}`} />} data-testid="practice-start">
                        Do it here
                      </Button>
                    </>
                  ) : (
                    <Button variant={a.tone} render={<Link href={`/exercise/${e.id}`} />} data-testid="practice-start">
                      {a.label} <ArrowRight data-icon="inline-end" />
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
