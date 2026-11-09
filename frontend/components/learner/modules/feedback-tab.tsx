"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/shell/empty-state"
import { GradeCard } from "../grade-card"
import { DecisionChip } from "../chips"
import { CompetencyRow } from "../competency-row"
import { RevisitSheet } from "../revisit-sheet"
import { QuickRecaps } from "../home/quick-recaps"
import { CoachNotes } from "./coach-notes"
import { MemoryCard } from "./memory-card"
import { competenciesForRung, progressWords } from "./module-state"
import { useHistory } from "@/hooks/learner/queries"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Module } from "@/content/lessons/types"
import type { LadderView, RevisitSummary } from "@/hooks/learner/types"

/** Grades, coach notes, plain-words progress and the competency rows for this module only. */
export function FeedbackTab({ module, ladder }: { module: Module; ladder: LadderView }) {
  const history = useHistory()
  const [revisit, setRevisit] = useState<RevisitSummary | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const nextCode = module.rung < 5 ? `L${module.rung + 1}` : null
  const cs = competenciesForRung(ladder, module.rung)
  const recaps = ladder.revisitsDue.filter((r) => r.competencyCode.startsWith(`${module.code}.`))
  const graded = (history.data?.items ?? []).filter((it) => it.exercise.rung === module.rung && it.submission.grade)

  return (
    <div className="grid gap-6 lg:grid-cols-3" data-testid="feedback-tab">
      <div className="space-y-6 lg:col-span-2">
        <section className="rounded-xl border bg-card p-5 glow-ring" data-testid="module-progress">
          <p className="eyebrow">Where you are</p>
          <p className="mt-2 text-base leading-relaxed" data-testid="module-progress-words">{progressWords(ladder, module.rung, nextCode)}</p>
        </section>

        <section className="rounded-xl border bg-card p-5" data-testid="module-grades">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-medium">Your feedback in {module.code}</h2>
            <Link href="/history" className="text-xs underline underline-offset-4">All history</Link>
          </div>
          {history.isPending && <div className="mt-3 space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}
          {history.isError && <ErrorState detail={history.error.message} retry={() => history.refetch()} />}
          {history.data && graded.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Your first feedback here comes after you send in your first practice. Each one says what worked, what to fix, and one thing to remember.</p>}
          {graded.length > 0 && (
            <ul className="mt-3 divide-y">
              {graded.map(({ exercise, submission }) => {
                const g = submission.grade!
                const isOpen = open === submission.id
                return (
                  <li key={submission.id} data-testid="module-grade" data-decision={g.decision}>
                    <button type="button" onClick={() => setOpen(isOpen ? null : submission.id)} className="flex w-full items-center justify-between gap-3 py-3 text-left" aria-expanded={isOpen}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{exercise.title}</p>
                        <p className="text-xs text-muted-foreground">{submission.attempt > 1 ? `Try ${submission.attempt} · ` : ""}{fmt.ago(g.gradedAt)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="tabular text-sm">{Math.round(g.score * 100)}</span>
                        <DecisionChip decision={g.decision} />
                        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                      </div>
                    </button>
                    {isOpen && <GradeCard grade={g} compact className="mb-3" />}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-card p-5" data-testid="module-competencies">
          <h2 className="font-display text-xl font-medium">What this module is checking</h2>
          <p className="mt-1 text-xs text-muted-foreground">Each bar fills as your practice shows the skill on different tasks. The tick is the line to clear.</p>
          {cs.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">These show up once your first chat places you on the path.</p>
          ) : (
            <ul className="mt-2 divide-y">{cs.map((c) => <CompetencyRow key={c.code} c={c} />)}</ul>
          )}
        </section>
      </div>

      <div className="space-y-6">
        <MemoryCard />
        <CoachNotes notes={ladder.coachNotes} />
        <QuickRecaps revisits={recaps} onOpen={setRevisit} title={`Quick recaps due · ${module.code}`} />
      </div>
      <RevisitSheet revisit={revisit} onOpenChange={(o) => !o && setRevisit(null)} />
    </div>
  )
}
