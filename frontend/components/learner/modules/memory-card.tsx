"use client"

import Link from "next/link"
import { Brain } from "lucide-react"
import { Chip } from "../chips"
import { useMemory } from "@/hooks/learner/queries"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"

/** "What Coach knows about you": summary, strengths and struggles as chips, last updated. Hidden until the API has a picture. */
export function MemoryCard({ className }: { className?: string }) {
  const q = useMemory()
  const m = q.data
  if (!m || !m.summary?.trim()) return null
  return (
    <section className={cn("rounded-xl border bg-card p-5", className)} data-testid="memory-card" data-version={m.version}>
      <h2 className="flex items-center gap-2 font-display text-xl font-medium"><Brain className="size-4 text-glow-foreground" /> What we know about you</h2>
      <p className="mt-2 text-sm leading-relaxed" data-testid="memory-summary">{m.summary}</p>
      {m.strengths?.length > 0 && (
        <div className="mt-3">
          <p className="eyebrow mb-1.5">Strengths</p>
          <ul className="flex flex-wrap gap-1.5">{m.strengths.map((s) => <li key={s}><Chip tone="pass">{s}</Chip></li>)}</ul>
        </div>
      )}
      {m.struggles?.length > 0 && (
        <div className="mt-3">
          <p className="eyebrow mb-1.5">Working on</p>
          <ul className="flex flex-wrap gap-1.5">{m.struggles.map((s) => <li key={s}><Chip tone="glow">{s}</Chip></li>)}</ul>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">Updated {fmt.ago(m.updatedAt)}</p>
    </section>
  )
}

/** One-line version for the bottom of the home page, linking to the module's Feedback tab. */
export function MemoryLine({ moduleCode, className }: { moduleCode: string; className?: string }) {
  const q = useMemory()
  const m = q.data
  if (!m || !m.summary?.trim()) return null
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground", className)} data-testid="memory-line">
      <Brain className="size-3.5 text-glow-foreground" />
      <span className="min-w-0 truncate"><span className="font-medium text-foreground">What we know about you:</span> {m.summary}</span>
      <span aria-hidden>·</span>
      <span>updated {fmt.ago(m.updatedAt)}</span>
      <span aria-hidden>·</span>
      <Link href={`/modules/${moduleCode}?tab=feedback`} className="underline underline-offset-4 hover:text-foreground">view</Link>
    </p>
  )
}
