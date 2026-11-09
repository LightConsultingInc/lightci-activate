"use client"

import { useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/shell/empty-state"
import { Grain } from "@/components/brand/grain"
import { rungMeta } from "@/components/brand/rung"
import { MODULES, moduleFor } from "@/content/lessons"
import type { Rung } from "@/content/lessons/types"
import { useExercises, useLadder } from "@/hooks/learner/queries"
import { useLessonProgress } from "@/hooks/learner/use-lesson-progress"
import { useModuleReadiness } from "@/hooks/learner/use-module-readiness"
import { HoursBackSparkline } from "../hours-back-sparkline"
import { RevisitSheet } from "../revisit-sheet"
import { moduleProgress, moduleState } from "../modules/module-state"
import { ModuleCard } from "./module-card"
import { UpNext } from "./up-next"
import { QuickRecaps } from "./quick-recaps"
import { MySkillsPanel } from "./my-skills-panel"
import { MemoryLine } from "../modules/memory-card"
import type { RevisitSummary } from "@/hooks/learner/types"

/** Home: a slim header, the six modules on your path, one "Up next", and today's quick recaps. */
export function HomeView() {
  const q = useLadder()
  const exercises = useExercises()
  const { isDone } = useLessonProgress()
  const [revisit, setRevisit] = useState<RevisitSummary | null>(null)

  // Start tailoring the current module (and the next one once the current is done) as soon as home loads.
  const rungNow = Math.max(0, Math.min(5, q.data?.rung ?? 0))
  const currentDone = q.data ? moduleState(q.data, rungNow) === "done" : false
  useModuleReadiness(`L${rungNow}`, { prepare: true, enabled: Boolean(q.data) })
  useModuleReadiness(`L${Math.min(5, rungNow + 1)}`, { prepare: true, enabled: Boolean(q.data) && currentDone && rungNow < 5 })

  if (q.isPending) return <HomeSkeleton />
  if (q.isError) return <ErrorState title="Couldn't load your path" detail={q.error.message} retry={() => q.refetch()} />
  const l = q.data
  const currentRung = Math.max(0, Math.min(5, l.rung)) as Rung
  const current = moduleFor(currentRung)
  const meta = rungMeta(l.rung)
  const hours = l.hoursBack.thisMonthMinutes / 60
  const all = exercises.data ?? []
  const nextLesson = current.lessons.find((ls) => !isDone(ls.slug)) ?? null

  return (
    <div className="space-y-6 animate-rise" data-testid="ladder-view">
      <header className="relative overflow-hidden rounded-2xl bg-ink px-5 py-4 text-paper md:px-6" data-testid="ladder-header">
        <Grain opacity={0.1} />
        <div className="relative flex flex-wrap items-center gap-x-6 gap-y-3">
          <h1 className="font-display text-xl font-medium md:text-2xl" data-testid="ladder-name">{l.person.name}</h1>
          <p className="text-sm text-paper/80">
            <span className="text-glow">{meta.code} {meta.name}</span>
            <span className="text-paper/50"> · {current.tagline}</span>
          </p>
          {hours > 0 && (
            <div className="ml-auto flex items-center gap-3">
              <p className="text-sm text-paper/70">
                Time saved this month <span className="font-display text-xl tabular text-paper" data-testid="hours-back">{hours.toFixed(hours >= 10 ? 0 : 1)}h</span>
              </p>
              <HoursBackSparkline series={l.hoursBack.series} height={28} className="w-28" />
            </div>
          )}
        </div>
      </header>

      <section data-testid="your-path">
        <div className="flex items-baseline justify-between pb-3">
          <h2 className="font-display text-xl font-medium">Your path</h2>
          <p className="text-xs text-muted-foreground">Each step: read a short lesson, practise, get feedback</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {MODULES.map((m) => {
            const mine = all.filter((e) => e.rung === m.rung && e.status !== "skipped")
            return (
              <ModuleCard
                key={m.code}
                module={m}
                state={moduleState(l, m.rung)}
                progress={moduleProgress(l, m.rung)}
                lessonsDone={m.lessons.filter((ls) => isDone(ls.slug)).length}
                practiceTotal={mine.length}
                practiceDone={mine.filter((e) => e.status === "passed").length}
              />
            )
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <UpNext module={current} lesson={nextLesson} practice={l.nextUp} queuedCount={l.queued.length} />
        </div>
        <QuickRecaps revisits={l.revisitsDue} onOpen={setRevisit} />
      </div>

      <MySkillsPanel />
      <MemoryLine moduleCode={current.code} />
      <RevisitSheet revisit={revisit} onOpenChange={(o) => !o && setRevisit(null)} />
    </div>
  )
}

function HomeSkeleton() {
  return (
    <div className="space-y-6" data-testid="ladder-loading">
      <Skeleton className="h-16 w-full rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{MODULES.map((m) => <Skeleton key={m.code} className="h-44" />)}</div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-44 lg:col-span-2" />
        <Skeleton className="h-44" />
      </div>
    </div>
  )
}
