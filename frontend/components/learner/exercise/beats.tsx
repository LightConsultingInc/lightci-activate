"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export type Beat = "build" | "check" | "result"
export const BEATS: { id: Beat; label: string; hint: string }[] = [
  { id: "build", label: "Build", hint: "Do the work" },
  { id: "check", label: "Check", hint: "Look it over yourself" },
  { id: "result", label: "Result", hint: "See how it landed" },
]

type Props = { beat: Beat; reachable: Record<Beat, boolean>; onBeat: (b: Beat) => void }

/** Three beats, in plain words. Click back to an earlier beat any time; forward only when it is ready. */
export function Beats({ beat, reachable, onBeat }: Props) {
  const idx = BEATS.findIndex((b) => b.id === beat)
  return (
    <ol className="flex items-stretch gap-2" data-testid="beats">
      {BEATS.map((b, i) => {
        const current = b.id === beat
        const done = i < idx
        const can = reachable[b.id] && !current
        return (
          <li key={b.id} className="flex-1">
            <button
              type="button"
              disabled={!can}
              onClick={() => onBeat(b.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                current ? "border-glow bg-glow-soft/60 glow-ring" : done ? "border-pass/40 bg-card" : "bg-card",
                can && "hover:border-foreground/40",
                !can && !current && "opacity-60",
              )}
              aria-current={current ? "step" : undefined}
              data-testid={`beat-${b.id}`}
              data-state={current ? "current" : done ? "done" : "upcoming"}
            >
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold tabular", current ? "border-glow bg-glow text-glow-foreground" : done ? "border-pass bg-pass-soft text-pass" : "text-muted-foreground")}>
                {done ? <Check className="size-3" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-tight">{b.label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{b.hint}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
