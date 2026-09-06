"use client"

import Link from "next/link"
import { Check, Clock, Play } from "lucide-react"
import { useLessonProgress } from "@/hooks/learner/use-lesson-progress"
import { cn } from "@/lib/utils"
import type { Module } from "@/content/lessons/types"

/** The module's lessons: title, promise, minutes, and a tick once the check is done. */
export function LearnTab({ module }: { module: Module }) {
  const { isDone } = useLessonProgress()
  const done = module.lessons.filter((l) => isDone(l.slug)).length
  const total = module.lessons.reduce((s, l) => s + l.minutes, 0)
  return (
    <section data-testid="learn-tab">
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3">
        <p className="text-sm text-muted-foreground">
          <span className="tabular font-medium text-foreground">{module.lessons.length}</span> short lessons · about <span className="tabular font-medium text-foreground">{total}</span> minutes in all · <span className="tabular font-medium text-foreground" data-testid="lessons-done-count">{done}</span> done
        </p>
      </div>
      <ol className="grid gap-3 md:grid-cols-2">
        {module.lessons.map((l, i) => {
          const d = isDone(l.slug)
          return (
            <li key={l.slug}>
              <Link
                href={`/modules/${module.code}/learn/${l.slug}`}
                className={cn("group flex h-full gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/40", d && "border-pass/40")}
                data-testid="lesson-card"
                data-slug={l.slug}
                data-done={d}
              >
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-full border text-sm font-semibold tabular", d ? "border-pass bg-pass-soft text-pass" : "bg-muted text-muted-foreground group-hover:bg-glow-soft group-hover:text-glow-foreground")}>
                  {d ? <Check className="size-4" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-medium leading-snug">{l.title}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"><Clock className="size-3" /> {l.minutes} min</span>
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{l.promise}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-glow-foreground opacity-0 transition-opacity group-hover:opacity-100">
                    <Play className="size-3" /> {d ? "Watch again" : "Watch"}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
