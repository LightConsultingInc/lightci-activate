"use client"

import { useState } from "react"
import { XIcon, PlusIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Editable list of short tokens (data classes, systems). Enter or comma adds; × removes. */
export function ChipListEditor({ label, hint, value, onChange, disabled, tone = "info", placeholder = "Add and press Enter", testId, mono = true }: {
  label: string
  hint?: string
  value: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
  tone?: "pass" | "fail" | "info" | "revise"
  placeholder?: string
  testId?: string
  mono?: boolean
}) {
  const [draft, setDraft] = useState("")
  const toneCls = { pass: "border-pass/40 bg-pass-soft", fail: "border-fail/40 bg-fail-soft", info: "border-info/40 bg-info-soft", revise: "border-revise/40 bg-revise-soft" }[tone]
  const add = () => {
    const items = draft.split(",").map((s) => s.trim()).filter(Boolean)
    if (!items.length) return
    onChange(Array.from(new Set([...value, ...items])))
    setDraft("")
  }
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className={cn("flex flex-wrap items-center gap-1 rounded-lg border p-1.5", disabled && "opacity-70")}>
        {value.length === 0 && <span className="px-1 text-xs italic text-muted-foreground">none</span>}
        {value.map((v) => (
          <span key={v} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]", mono && "font-mono", toneCls)} data-testid="chip">
            {v}
            {!disabled && (
              <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="rounded-full hover:bg-foreground/10" aria-label={`Remove ${v}`} data-testid="chip-remove">
                <XIcon className="size-3" />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <span className="flex min-w-40 flex-1 items-center gap-1">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault()
                  add()
                }
              }}
              onBlur={add}
              placeholder={placeholder}
              className="h-6 flex-1 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
              data-testid="chip-input"
            />
            <Button type="button" size="icon-xs" variant="ghost" onClick={add} aria-label="Add">
              <PlusIcon />
            </Button>
          </span>
        )}
      </div>
    </div>
  )
}
