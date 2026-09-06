"use client"

import Link from "next/link"
import { Check, Lock } from "lucide-react"
import { rungColor } from "@/components/brand/rung"
import { ProgressRing } from "../modules/progress-ring"
import { cn } from "@/lib/utils"
import type { Module } from "@/content/lessons/types"
import type { ModuleState } from "../modules/module-state"

type Props = {
  module: Module
  state: ModuleState
  progress: number
  lessonsDone: number
  practiceTotal: number
  practiceDone: number
}

/** One module on "Your path": name, tagline, a small ring, lesson and practice counts. Locked modules still open (lessons are readable). */
export function ModuleCard({ module, state, progress, lessonsDone, practiceTotal, practiceDone }: Props) {
  const lessons = module.lessons.length
  return (
    <Link
      href={`/modules/${module.code}`}
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/40",
        state === "current" && "glow-ring",
        state === "locked" && "opacity-70 hover:opacity-100",
      )}
      data-testid="module-card"
      data-code={module.code}
      data-state={state}
    >
      <div className="flex items-start justify-between gap-2">
        <ProgressRing rung={module.rung} progress={progress} size={40}>
          {state === "done" ? <Check className="size-4 text-pass" /> : state === "locked" ? <Lock className="size-3.5 text-muted-foreground" /> : <span className="text-[11px] font-semibold tabular">{Math.round(progress * 100)}%</span>}
        </ProgressRing>
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular" style={{ borderColor: rungColor(module.rung) }}>
          <span className="size-1.5 rounded-full" style={{ background: rungColor(module.rung) }} />
          {module.code}
        </span>
      </div>
      <div className="min-w-0">
        <h3 className="font-display text-lg font-medium leading-tight">{module.name}</h3>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{module.tagline}</p>
      </div>
      <dl className="mt-auto flex items-center gap-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1"><dt className="sr-only">Lessons</dt><dd><span className="tabular font-medium text-foreground">{lessonsDone}/{lessons}</span> lessons</dd></div>
        <span aria-hidden>·</span>
        <div className="flex items-center gap-1"><dt className="sr-only">Practice</dt><dd><span className="tabular font-medium text-foreground">{practiceDone}/{practiceTotal}</span> practice</dd></div>
      </dl>
      <p className="text-[11px] font-medium" data-testid="module-card-state">
        {state === "current" ? <span className="text-glow-foreground">You are here</span> : state === "done" ? <span className="text-pass">Done</span> : <span className="text-muted-foreground">Opens after L{module.rung - 1}</span>}
      </p>
    </Link>
  )
}
