"use client"

import { BookOpen, ChevronRight, MessageSquareText, PanelRightClose } from "lucide-react"
import { Button } from "@/components/ui/button"
import { HintsPanel } from "../hints-panel"
import { MarkdownLite } from "../markdown-lite"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onOpenChange: (o: boolean) => void
  coachIntro: string
  hints: { hints: string[]; revealed: number; total: number; onReveal: () => void; pending: boolean }
  workedExample: string | null
  /** A short line about the current beat, in Coach's voice. */
  beatNote?: string
  className?: string
}

/** Coach sits beside the work: a short intro, one hint at a time, and the worked example once it unlocks. Collapses to a rail. */
export function CoachPanel({ open, onOpenChange, coachIntro, hints, workedExample, beatNote, className }: Props) {
  if (!open) {
    return (
      <aside className={cn("flex flex-col items-center gap-2", className)} data-testid="coach-panel" data-open={false}>
        <Button variant="outline" size="sm" onClick={() => onOpenChange(true)} data-testid="coach-toggle" aria-label="Open Coach">
          <MessageSquareText data-icon="inline-start" className="text-glow-foreground" /> Coach <ChevronRight data-icon="inline-end" />
        </Button>
        {hints.total > 0 && <span className="tabular text-[11px] text-muted-foreground">{hints.revealed}/{hints.total} nudges</span>}
      </aside>
    )
  }
  return (
    <aside className={cn("flex flex-col rounded-xl border bg-card", className)} data-testid="coach-panel" data-open>
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <p className="flex items-center gap-2 text-sm font-medium"><MessageSquareText className="size-4 text-glow-foreground" /> Coach</p>
        <Button variant="ghost" size="icon-xs" onClick={() => onOpenChange(false)} aria-label="Hide Coach" data-testid="coach-toggle"><PanelRightClose /></Button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {coachIntro && (
          <div className="rounded-lg border bg-glow-soft/50 p-3" data-testid="coach-intro">
            <MarkdownLite text={coachIntro} />
          </div>
        )}
        {beatNote && <p className="text-sm text-muted-foreground" data-testid="coach-beat-note">{beatNote}</p>}
        <div>
          <p className="mb-1.5 text-sm font-medium">Need a nudge?</p>
          <HintsPanel hints={hints.hints} hintsRevealed={hints.revealed} hintsTotal={hints.total} onReveal={hints.onReveal} pending={hints.pending} />
        </div>
        {workedExample && (
          <details className="rounded-lg border p-3" data-testid="worked-example">
            <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-medium"><BookOpen className="size-4 text-glow-foreground" /> See how someone else did it</summary>
            <MarkdownLite text={workedExample} className="mt-3" />
          </details>
        )}
      </div>
    </aside>
  )
}
