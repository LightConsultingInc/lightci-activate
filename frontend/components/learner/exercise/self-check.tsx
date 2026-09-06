"use client"

import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { CompetencyCatalogEntry } from "@/hooks/learner/types"

export type SelfCheckItem = { criterion: string; label: string; description: string }

const FALLBACK: SelfCheckItem[] = [{ criterion: "general.quality", label: "It does what the brief asked", description: "A colleague could use this as it stands, without redoing it." }]

/** Self-check statements from the rubric of the exercise's competencies; the same criteria the grader scores. */
export function selfCheckItems(codes: string[], catalog: CompetencyCatalogEntry[] | undefined): SelfCheckItem[] {
  if (!catalog?.length) return FALLBACK
  const out: SelfCheckItem[] = []
  for (const code of codes) {
    const def = catalog.find((c) => c.code === code)
    if (!def) continue
    for (const r of def.rubric ?? []) out.push({ criterion: `${code}.${r.key}`, label: r.label, description: r.description })
  }
  return out.length ? out : FALLBACK
}

/** Turn the unchecked items and the learner's note into the critique text the grader reads. */
export function critiqueFrom(items: SelfCheckItem[], checked: Set<string>, note: string): string {
  const lines = items.filter((i) => !checked.has(i.criterion)).map((i) => `Not yet: ${i.label} — ${i.description}`)
  const n = note.trim()
  if (n) lines.push(n)
  if (!lines.length) lines.push("I went through every point and could not find anything to fix.")
  return lines.join("\n")
}

export function confidenceWords(c: number) {
  if (c >= 90) return "Near certain"
  if (c >= 70) return "Fairly sure"
  if (c >= 50) return "Coin flip"
  if (c >= 30) return "Doubtful"
  return "Probably needs another go"
}

type Props = {
  items: SelfCheckItem[]
  loading?: boolean
  checked: Set<string>
  onToggle: (criterion: string, on: boolean) => void
  confidence: number
  onConfidence: (v: number) => void
  note: string
  onNote: (v: string) => void
  onSubmit: () => void
  submitting: boolean
  onBack: () => void
  disabled?: boolean
}

/** The Check beat: tick what holds true, say how likely it is to pass, add a note, send it for grading. */
export function SelfCheck(p: Props) {
  const unchecked = p.items.length - p.checked.size
  return (
    <section className="flex flex-col rounded-xl border bg-card" data-testid="self-check">
      <div className="border-b px-4 py-3">
        <p className="eyebrow">Check</p>
        <h3 className="font-display text-xl font-medium">Look it over before the grader does</h3>
        <p className="mt-1 text-sm text-muted-foreground">Read your work once more and tick only what genuinely holds. Leaving a box empty is not a penalty; it shows you can see what is missing.</p>
      </div>
      <div className="space-y-5 p-4">
        {p.loading && <p className="text-sm text-muted-foreground">Loading the checklist…</p>}
        <ul className="space-y-2" data-testid="self-check-list">
          {p.items.map((it) => {
            const on = p.checked.has(it.criterion)
            return (
              <li key={it.criterion}>
                <label className={cn("flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors", on ? "border-pass/50 bg-pass-soft/40" : "hover:bg-muted/40", p.disabled && "cursor-default opacity-70")} data-testid="self-check-item" data-criterion={it.criterion} data-checked={on}>
                  <Checkbox checked={on} onCheckedChange={(v) => p.onToggle(it.criterion, Boolean(v))} disabled={p.disabled} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-snug">{it.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{it.description}</span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">How likely is this to pass?</span>
            <span className="tabular text-muted-foreground" data-testid="confidence-value">{p.confidence}% · {confidenceWords(p.confidence)}</span>
          </div>
          <Slider value={[p.confidence]} onValueChange={(v) => p.onConfidence(Array.isArray(v) ? v[0] : (v as number))} min={0} max={100} step={5} disabled={p.disabled} data-testid="confidence-slider" />
          <p className="text-[11px] text-muted-foreground">Be honest rather than brave: saying 90% and getting a revise costs more than saying 50%.</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="check-note" className="text-sm font-medium">Anything else you&apos;d fix? <span className="font-normal text-muted-foreground">(optional)</span></label>
          <Textarea id="check-note" value={p.note} onChange={(e) => p.onNote(e.target.value)} disabled={p.disabled} className="min-h-24" placeholder="The closing ask is vague; I'd make the beneficiary form one explicit sentence…" data-testid="check-note" />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={p.onBack} disabled={p.submitting || p.disabled} data-testid="check-back">Back to Build</Button>
          <Button className="flex-1" onClick={p.onSubmit} disabled={p.submitting || p.disabled || p.loading} data-testid="submit-button">
            <Send data-icon="inline-start" /> {p.submitting ? "Grading…" : "Send for grading"}
          </Button>
        </div>
        {!p.disabled && <p className="text-center text-[11px] text-muted-foreground">{unchecked === 0 ? "Every box ticked. The grader will tell you if it agrees." : `${unchecked} unticked ${unchecked === 1 ? "point goes" : "points go"} to the grader as what you'd fix.`}</p>}
      </div>
    </section>
  )
}
