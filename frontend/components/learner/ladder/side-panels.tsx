"use client"

import Link from "next/link"
import { ArrowUpRight, MessageSquareText } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/shell/empty-state"
import { Chip, DecisionChip, StatusPipeline, skillStatusTone } from "../chips"
import { useMySkills, useMyWorkflows } from "@/hooks/learner/queries"
import { fmt } from "@/lib/format"
import type { LadderView } from "@/hooks/learner/types"

export function MySkillsPanel() {
  const q = useMySkills()
  return (
    <section className="rounded-xl border bg-card p-5" data-testid="my-skills-panel">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-medium">My skills</h2>
        <Link href="/library" className="text-xs underline underline-offset-4">Library</Link>
      </div>
      {q.isPending && <div className="mt-3 space-y-2"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>}
      {q.isError && <ErrorState detail={q.error.message} retry={() => q.refetch()} />}
      {q.data && (
        <div className="mt-3 space-y-4">
          <div>
            <p className="eyebrow mb-1.5">Adopted · {q.data.adopted.length}</p>
            {q.data.adopted.length === 0 ? <p className="text-xs text-muted-foreground">Nothing adopted yet. The fastest way through L3 is using a teammate&apos;s skill on your own case.</p> : (
              <ul className="divide-y">
                {q.data.adopted.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm" data-testid="adopted-skill">
                    <Link href={`/library/${s.slug}`} className="min-w-0 truncate hover:underline hover:underline-offset-4">{s.name}</Link>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">{s.myActivations30d} uses / 30d</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="eyebrow mb-1.5">Authored · {q.data.authored.length}</p>
            {q.data.authored.length === 0 ? <p className="text-xs text-muted-foreground">Your first authored skill arrives at L3, written cold before the worked example.</p> : (
              <ul className="divide-y">
                {q.data.authored.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm" data-testid="authored-skill">
                    <div className="min-w-0">
                      <Link href={`/library/${s.slug}`} className="block truncate hover:underline hover:underline-offset-4">{s.name}</Link>
                      <p className="text-xs text-muted-foreground">v{s.version} · {s.usageByOthers30d} uses by others / 30d</p>
                    </div>
                    <Chip tone={skillStatusTone(s.status)}>{s.status.replace("_", " ")}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export function MyWorkflowsSummary() {
  const q = useMyWorkflows()
  const top = (q.data ?? []).slice().sort((a, b) => (b.score?.composite ?? 0) - (a.score?.composite ?? 0)).slice(0, 3)
  return (
    <section className="rounded-xl border bg-card p-5" data-testid="my-workflows-summary">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-medium">My workflows</h2>
        <Link href="/workflows" className="inline-flex items-center gap-0.5 text-xs underline underline-offset-4" data-testid="workflows-link">All <ArrowUpRight className="size-3" /></Link>
      </div>
      {q.isPending && <div className="mt-3 space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>}
      {q.isError && <ErrorState detail={q.error.message} retry={() => q.refetch()} />}
      {q.data && (top.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">Your intake interview seeds two to four workflow candidates here.</p> : (
        <ul className="mt-3 divide-y">
          {top.map((w) => (
            <li key={w.id} className="py-2.5" data-testid="workflow-summary-row">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/workflows/${w.id}`} className="min-w-0 truncate text-sm font-medium hover:underline hover:underline-offset-4">{w.name}</Link>
                {w.score && <span className="tabular shrink-0 text-xs text-muted-foreground">score {Math.round(w.score.composite)}</span>}
              </div>
              <StatusPipeline status={w.status} className="mt-1.5" />
            </li>
          ))}
        </ul>
      ))}
    </section>
  )
}

export function RecentGrades({ grades }: { grades: LadderView["recentGrades"] }) {
  return (
    <section className="rounded-xl border bg-card p-5" data-testid="recent-grades">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-medium">Recent grades</h2>
        <Link href="/history" className="text-xs underline underline-offset-4">History</Link>
      </div>
      {grades.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">Your first grade lands after your first submission.</p> : (
        <ul className="mt-3 divide-y">
          {grades.map((g) => (
            <li key={g.submissionId} className="flex items-center justify-between gap-3 py-2 text-sm" data-testid="recent-grade">
              <div className="min-w-0">
                <p className="truncate">{g.exerciseTitle}</p>
                <p className="text-xs text-muted-foreground">{fmt.ago(g.gradedAt)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2"><span className="tabular text-xs">{Math.round(g.score * 100)}</span><DecisionChip decision={g.decision} /></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function CoachNotes({ notes }: { notes: LadderView["coachNotes"] }) {
  return (
    <section className="rounded-xl border bg-card p-5" data-testid="coach-notes">
      <h2 className="flex items-center gap-2 font-display text-xl font-medium"><MessageSquareText className="size-4 text-glow-foreground" /> Coach notes</h2>
      {notes.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">Coach writes a note when it changes your plan, reschedules something, or spots a pattern.</p> : (
        <ul className="mt-3 space-y-3">
          {notes.map((n, i) => (
            <li key={i} className="rounded-lg bg-glow-soft/50 p-3 text-sm" data-testid="coach-note">
              <p>{n.note}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>{fmt.ago(n.createdAt)}</span>
                {n.tags?.map((t) => <span key={t} className="rounded-full bg-background px-1.5 py-0.5">{t}</span>)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
