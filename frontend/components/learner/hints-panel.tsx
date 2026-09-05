"use client"

import { Lightbulb } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MarkdownLite } from "./markdown-lite"
import { cn } from "@/lib/utils"

type Props = {
  hints: string[]
  hintsRevealed: number
  hintsTotal: number
  onReveal: () => void
  pending?: boolean
  className?: string
}

/** Hints before answers: one is revealed at a time, the count stays visible so "closed" differs from "empty". */
export function HintsPanel({ hints, hintsRevealed, hintsTotal, onReveal, pending, className }: Props) {
  const remaining = Math.max(0, hintsTotal - hintsRevealed)
  return (
    <div className={cn("rounded-lg border bg-background/60 p-3", className)} data-testid="hints-panel">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium"><Lightbulb className="size-4 text-glow-foreground" /> Hints</p>
        <span className="tabular text-xs text-muted-foreground" data-testid="hints-count">{hintsRevealed}/{hintsTotal} revealed</span>
      </div>
      {hints.length > 0 && (
        <ol className="mt-3 space-y-2">
          {hints.map((h, i) => (
            <li key={i} className="flex gap-2 rounded-md bg-glow-soft/60 p-2.5 text-sm animate-rise" data-testid={`hint-${i + 1}`}>
              <span className="tabular mt-0.5 shrink-0 text-xs font-semibold text-glow-foreground">{i + 1}</span>
              <MarkdownLite text={h} className="space-y-1" />
            </li>
          ))}
        </ol>
      )}
      <Button variant="outline" size="sm" className="mt-3 w-full" onClick={onReveal} disabled={pending || remaining === 0} data-testid="hint-button">
        {remaining === 0 ? (hintsTotal === 0 ? "No hints for this one" : "All hints revealed") : pending ? "Thinking…" : hintsRevealed === 0 ? "Give me a hint" : "One more hint"}
      </Button>
      {remaining > 0 && <p className="mt-1.5 text-center text-[11px] text-muted-foreground">Try cold first. A hint costs nothing on your grade, but the learning sticks better without it.</p>}
    </div>
  )
}
