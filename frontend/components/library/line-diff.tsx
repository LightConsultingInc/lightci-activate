"use client"

import { useMemo, useState } from "react"
import { lineDiff, diffStats, type DiffOp } from "@/hooks/library/line-diff"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

const ROW: Record<DiffOp["kind"], string> = {
  equal: "",
  add: "bg-pass-soft/70 text-foreground",
  del: "bg-fail-soft/70 text-foreground line-through decoration-fail/40",
}
const GUTTER: Record<DiffOp["kind"], string> = { equal: " ", add: "+", del: "-" }

/** Inline / side-by-side line diff of two texts. Collapses long unchanged runs. */
export function LineDiff({ before, after, className, defaultMode = "inline" }: { before: string | null; after: string; className?: string; defaultMode?: "inline" | "split" }) {
  const [mode, setMode] = useState<"inline" | "split">(defaultMode)
  const [expandAll, setExpandAll] = useState(false)
  const ops = useMemo(() => lineDiff(before ?? "", after), [before, after])
  const stats = useMemo(() => diffStats(ops), [ops])
  const isNew = !before

  // Collapse unchanged runs longer than 8 lines into a "… n unchanged lines" marker unless expanded.
  const groups = useMemo(() => {
    const g: (DiffOp | { kind: "skip"; count: number })[] = []
    let run: DiffOp[] = []
    const flush = (final: boolean) => {
      if (!run.length) return
      if (!expandAll && run.length > 8) {
        const head = g.length === 0 ? 0 : 3
        const tail = final ? 0 : 3
        g.push(...run.slice(0, head))
        g.push({ kind: "skip", count: run.length - head - tail })
        if (tail) g.push(...run.slice(-tail))
      } else g.push(...run)
      run = []
    }
    for (const o of ops) { if (o.kind === "equal") run.push(o); else { flush(false); g.push(o) } }
    flush(true)
    return g
  }, [ops, expandAll])

  return (
    <div className={cn("overflow-hidden rounded-xl border", className)} data-testid="line-diff">
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs">
        <span className="font-medium">{isNew ? "New file" : "SKILL.md"}</span>
        <span className="tabular text-pass">+{stats.additions}</span>
        <span className="tabular text-fail">−{stats.deletions}</span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className="text-muted-foreground underline-offset-4 hover:underline" onClick={() => setExpandAll((v) => !v)} data-testid="diff-expand">{expandAll ? "Collapse unchanged" : "Show unchanged"}</button>
          <ToggleGroup value={[mode]} onValueChange={(v) => { const m = v[0] as "inline" | "split" | undefined; if (m) setMode(m) }} size="sm" variant="outline" data-testid="diff-mode">
            <ToggleGroupItem value="inline" aria-label="Inline diff">Inline</ToggleGroupItem>
            <ToggleGroupItem value="split" aria-label="Side-by-side diff">Split</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      {mode === "inline" ? (
        <div className="max-h-[60vh] overflow-auto font-mono text-xs leading-5">
          {groups.map((o, i) =>
            o.kind === "skip" ? <SkipRow key={i} count={o.count} onExpand={() => setExpandAll(true)} /> : (
              <div key={i} className={cn("grid grid-cols-[3rem_3rem_1ch_1fr] gap-x-2 px-2", ROW[o.kind])}>
                <span className="select-none text-right text-muted-foreground/70 tabular">{o.a ?? ""}</span>
                <span className="select-none text-right text-muted-foreground/70 tabular">{o.b ?? ""}</span>
                <span className={cn("select-none", o.kind === "add" && "text-pass", o.kind === "del" && "text-fail")}>{GUTTER[o.kind]}</span>
                <span className="whitespace-pre-wrap break-words">{o.text || " "}</span>
              </div>
            ),
          )}
        </div>
      ) : (
        <div className="grid max-h-[60vh] grid-cols-2 overflow-auto font-mono text-xs leading-5">
          <div className="border-r">
            <div className="sticky top-0 border-b bg-muted/60 px-2 py-1 font-sans text-[10px] uppercase tracking-wider text-muted-foreground">Previous version</div>
            {groups.map((o, i) =>
              o.kind === "skip" ? <SkipRow key={i} count={o.count} onExpand={() => setExpandAll(true)} /> :
              o.kind === "add" ? <div key={i} className="h-5" /> : (
                <div key={i} className={cn("grid grid-cols-[3rem_1fr] gap-x-2 px-2", o.kind === "del" && ROW.del)}>
                  <span className="select-none text-right text-muted-foreground/70 tabular">{o.a}</span>
                  <span className="whitespace-pre-wrap break-words">{o.text || " "}</span>
                </div>
              ),
            )}
          </div>
          <div>
            <div className="sticky top-0 border-b bg-muted/60 px-2 py-1 font-sans text-[10px] uppercase tracking-wider text-muted-foreground">Proposed</div>
            {groups.map((o, i) =>
              o.kind === "skip" ? <SkipRow key={i} count={o.count} onExpand={() => setExpandAll(true)} /> :
              o.kind === "del" ? <div key={i} className="h-5" /> : (
                <div key={i} className={cn("grid grid-cols-[3rem_1fr] gap-x-2 px-2", o.kind === "add" && ROW.add)}>
                  <span className="select-none text-right text-muted-foreground/70 tabular">{o.b}</span>
                  <span className="whitespace-pre-wrap break-words">{o.text || " "}</span>
                </div>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SkipRow({ count, onExpand }: { count: number; onExpand: () => void }) {
  return (
    <button type="button" onClick={onExpand} className="block w-full bg-muted/30 px-2 py-0.5 text-center font-sans text-[11px] text-muted-foreground hover:bg-muted/60">
      … {count} unchanged {count === 1 ? "line" : "lines"}
    </button>
  )
}
