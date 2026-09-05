"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type Props = { value: string[]; onChange: (v: string[]) => void; placeholder?: string; tone?: "pass" | "fail" | "revise" | "neutral"; testId?: string; disabled?: boolean }

const tones = { pass: "bg-pass-soft text-pass", fail: "bg-fail-soft text-fail", revise: "bg-revise-soft text-glow-foreground", neutral: "bg-muted text-foreground" }

/** Chips with an inline input: Enter or comma adds, Backspace on empty removes the last. */
export function ChipListEditor({ value, onChange, placeholder = "Add and press Enter", tone = "neutral", testId, disabled }: Props) {
  const [draft, setDraft] = useState("")
  const add = () => {
    const v = draft.trim().replace(/,$/, "")
    if (!v) return
    if (!value.includes(v)) onChange([...value, v])
    setDraft("")
  }
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1.5", disabled && "opacity-60")} data-testid={testId}>
      {value.map((v) => (
        <span key={v} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs", tones[tone])}>
          {v}
          {!disabled && (
            <button type="button" aria-label={`Remove ${v}`} className="rounded-full hover:bg-foreground/10" onClick={() => onChange(value.filter((x) => x !== v))}>
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault()
              add()
            } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={add}
          placeholder={value.length ? "" : placeholder}
          className="h-6 min-w-32 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
        />
      )}
    </div>
  )
}
