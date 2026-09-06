"use client"

import Link from "next/link"
import { ArrowRight, Clock, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Paper } from "@/components/brand/grain"
import { askOf, practiceAction, practiceStatus, workflowOf } from "../modules/practice-tab"
import type { Lesson, Module } from "@/content/lessons/types"
import type { ExerciseSummary } from "@/hooks/learner/types"

type Props = { module: Module; lesson: Lesson | null; practice: ExerciseSummary | null; queuedCount: number }

/**
 * One card that says, in plain words, what to do now. A lesson you have not watched in your current
 * module comes first; otherwise the practice Coach picked. The other option stays one click away.
 */
export function UpNext({ module, lesson, practice, queuedCount }: Props) {
  const primary: "lesson" | "practice" | null = lesson ? "lesson" : practice ? "practice" : null
  const action = practice ? practiceAction(practice) : null
  const wf = practice ? workflowOf(practice) : null

  return (
    <Paper className="rounded-xl border bg-card p-6 glow-ring" data-testid="up-next" data-kind={primary ?? "empty"}>
      <p className="eyebrow">Up next</p>
      {primary === null && (
        <>
          <h2 className="mt-1 font-display text-2xl font-medium">You&apos;re caught up</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">Coach is planning your next practice from the work you named at intake. Check back later today, or reread a lesson in {module.code} {module.name}.</p>
        </>
      )}
      {primary === "lesson" && lesson && (
        <>
          <h2 className="mt-1 font-display text-2xl font-medium leading-snug" data-testid="up-next-title">
            Watch &lsquo;{lesson.title}&rsquo; <span className="text-muted-foreground">({lesson.minutes} min)</span>
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{lesson.promise}</p>
        </>
      )}
      {primary === "practice" && practice && (
        <>
          {wf && <p className="mt-2 eyebrow" data-testid="up-next-workflow">{wf}</p>}
          <h2 className="mt-1 font-display text-2xl font-medium leading-snug" data-testid="up-next-title">
            {askOf(practice)} <span className="text-muted-foreground">({practice.estimatedMinutes} min)</span>
          </h2>
          <p className="mt-2 text-xs text-muted-foreground" data-testid="up-next-status">{practiceStatus(practice).text}</p>
        </>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {lesson && (
          <Button size="lg" variant={primary === "lesson" ? "default" : "outline"} render={<Link href={`/modules/${module.code}/learn/${lesson.slug}`} />} data-testid="up-next-lesson">
            <Play data-icon="inline-start" /> {primary === "lesson" ? "Watch now" : `Or watch '${lesson.title}' (${lesson.minutes} min)`}
          </Button>
        )}
        {practice && action && (
          <Button size="lg" variant={primary === "practice" ? "default" : "outline"} render={<Link href={`/exercise/${practice.id}`} />} data-testid="next-up-start">
            {primary === "practice" ? (
              <>{action.label} <ArrowRight data-icon="inline-end" /></>
            ) : (
              <><Clock data-icon="inline-start" /> Or practice: {askOf(practice)} ({practice.estimatedMinutes} min)</>
            )}
          </Button>
        )}
        {practice && <span className="sr-only" data-testid="next-up-title">{askOf(practice)}</span>}
        {queuedCount > 0 && <span className="text-xs text-muted-foreground">{queuedCount} more practice waiting</span>}
      </div>
    </Paper>
  )
}
