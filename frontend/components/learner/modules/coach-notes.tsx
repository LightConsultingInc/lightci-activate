"use client"

import { MessageSquareText } from "lucide-react"
import { fmt } from "@/lib/format"
import type { LadderView } from "@/hooks/learner/types"

/** Coach's notes to the learner: plan changes, reschedules, patterns it noticed. */
export function CoachNotes({ notes }: { notes: LadderView["coachNotes"] }) {
  return (
    <section className="rounded-xl border bg-card p-5" data-testid="coach-notes">
      <h2 className="flex items-center gap-2 font-display text-xl font-medium"><MessageSquareText className="size-4 text-glow-foreground" /> Notes for you</h2>
      {notes.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">A note shows up here when we change your plan, move something, or notice a pattern in your practice.</p> : (
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
