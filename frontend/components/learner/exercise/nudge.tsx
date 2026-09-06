"use client"

import { Lightbulb } from "lucide-react"
import { MarkdownLite } from "../markdown-lite"
import { cn } from "@/lib/utils"

type Props = {
  hints: string[]
  revealed: number
  total: number
  onReveal: () => void
  pending?: boolean
  className?: string
}

/** "Need a nudge?" reveals one hint at a time, inline under the ask. Hidden when the exercise has none. */
export function Nudge({ hints, revealed, total, onReveal, pending, className }: Props) {
  if (total <= 0 && hints.length === 0) return null
  const remaining = Math.max(0, total - revealed)
  return (
    <div className={cn("space-y-2", className)} data-testid="nudge">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={onReveal}
          disabled={pending || remaining === 0}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:cursor-default disabled:no-underline disabled:opacity-60"
          data-testid="hint-button"
        >
          <Lightbulb className="size-3.5 text-glow-foreground" />
          {remaining === 0 ? "That's every nudge" : pending ? "Thinking…" : revealed === 0 ? "Need a nudge?" : "One more nudge"}
        </button>
        <span className="tabular text-xs text-muted-foreground" data-testid="hints-count">{revealed}/{total} revealed</span>
      </div>
      {hints.length > 0 && (
        <ol className="space-y-1.5">
          {hints.map((h, i) => (
            <li key={i} className="flex gap-2 rounded-md bg-glow-soft/60 px-3 py-2 text-sm animate-rise" data-testid={`hint-${i + 1}`}>
              <span className="tabular mt-0.5 shrink-0 text-xs font-semibold text-glow-foreground">{i + 1}</span>
              <MarkdownLite text={h} className="space-y-1" />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
