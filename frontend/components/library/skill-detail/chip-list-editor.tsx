"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/** Chip list with optional inline editing (Enter to add, × to remove). `conflict` marks a chip in red. */
export function ChipListEditor({ label, hint, values, onChange, editing, tone = "neutral", conflicts = [], placeholder, testId }: {
  label: string; hint?: string; values: string[]; onChange?: (v: string[]) => void; editing?: boolean
  tone?: "neutral" | "pass" | "fail" | "revise"; conflicts?: string[]; placeholder?: string; testId?: string
}) {
  const [draft, setDraft] = useState("")
  const toneCls = { neutral: "bg-secondary text-secondary-foreground", pass: "bg-pass-soft text-pass", fail: "bg-fail-soft text-fail", revise: "bg-revise-soft text-glow-foreground" }[tone]
  const add = () => { const v = draft.trim(); if (!v || values.includes(v)) return; onChange?.([...values, v]); setDraft("") }
  return (
    <div className="rounded-xl border bg-card p-4" data-testid={testId}>
      <p className="text-sm font-medium">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {values.length === 0 && !editing && <span className="text-sm text-muted-foreground italic">Nothing listed</span>}
        {values.map((v) => {
          const bad = conflicts.includes(v)
          return (
            <span key={v} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs", bad ? "bg-fail text-paper" : toneCls)} title={bad ? "Clashes with your firm's data rules" : undefined} data-conflict={bad || undefined}>
              {v}
              {editing && <button type="button" onClick={() => onChange?.(values.filter((x) => x !== v))} className="rounded-full hover:bg-black/10" aria-label={`Remove ${v}`}><X className="size-3" /></button>}
            </span>
          )
        })}
      </div>
      {editing && (
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add() } }} onBlur={add} placeholder={placeholder ?? "Type a kind of information and press Enter"} className="mt-3 h-8 font-mono text-xs" data-testid={testId ? `${testId}-input` : undefined} />
      )}
    </div>
  )
}
