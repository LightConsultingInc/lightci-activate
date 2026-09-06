"use client"

import { useState } from "react"
import { FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/shell/empty-state"
import { MarkdownLite } from "@/components/library/markdown-lite"
import { describeError } from "@/components/library/skill-actions"
import { useTeamReadout } from "@/hooks/library/queries"
import { fmt } from "@/lib/format"
import type { Readout } from "@/hooks/library/types"

type ReadoutMetric = { key: string; label: string; value: number; unit?: string; baseline?: { value: number; ref?: string } }
type Tile = { key: string; label: string; value: string; hint?: string }

const fmtVal = (v: number) => (Number.isInteger(v) ? fmt.num(v) : Math.abs(v) < 10 ? String(Number(v.toFixed(2))) : v.toFixed(1))

/** The Auditor's `metrics` is `{ scope, period, metrics: ReadoutMetric[], skipped }`; older readouts may be a flat map. */
function tiles(r: Readout | undefined): Tile[] {
  if (!r) return []
  const m = (r.metrics ?? {}) as Record<string, unknown>
  const list = m.metrics
  if (Array.isArray(list)) {
    return (list as ReadoutMetric[]).map((x) => {
      const unit = x.unit ? ` ${x.unit}` : ""
      return { key: x.key, label: x.label, value: `${fmtVal(x.value)}${unit}`, hint: x.baseline ? `baseline ${fmtVal(x.baseline.value)}${unit}` : undefined }
    })
  }
  return Object.entries(m)
    .filter(([, v]) => typeof v === "number" || typeof v === "string")
    .map(([k, v]) => ({ key: k, label: k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " "), value: typeof v === "number" ? fmtVal(v) : String(v) }))
}

/** "Team readout": the Auditor's one-page summary, with footnotes so no number appears without its baseline. */
export function ReadoutDialog() {
  const [open, setOpen] = useState(false)
  const q = useTeamReadout(open)
  const r = q.data
  const metrics = tiles(r)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" data-testid="team-readout" />}><FileText data-icon="inline-start" /> Team readout</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl" data-testid="readout-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{r?.title ?? "Team readout"}</DialogTitle>
          <DialogDescription>{r ? `${fmt.date(r.periodStart)} – ${fmt.date(r.periodEnd)} · generated ${fmt.ago(r.generatedAt)} by the Auditor` : "The Auditor writes this once a day from measured data, never from estimates alone."}</DialogDescription>
        </DialogHeader>
        {q.isPending || (!r && !q.isError) ? (
          <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" /></div>
        ) : q.isError ? (
          <ErrorState title="Couldn't generate the readout" detail={describeError(q.error)} retry={() => q.refetch()} />
        ) : r && (
          <div className="space-y-5">
            {metrics.length > 0 && (
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="readout-metrics">
                {metrics.slice(0, 6).map((t) => (
                  <div key={t.key} className="rounded-lg border bg-muted/30 p-3"><dt className="eyebrow !text-[10px]">{t.label}</dt><dd className="font-display mt-1 text-xl tabular">{t.value}</dd>{t.hint && <dd className="text-[11px] text-muted-foreground">{t.hint}</dd>}</div>
                ))}
              </dl>
            )}
            <MarkdownLite source={r.narrative} />
            {r.footnotes.length > 0 && (
              <ol className="space-y-1 border-t pt-3 text-xs text-muted-foreground" data-testid="readout-footnotes">
                {r.footnotes.map((f) => <li key={f.ref}><span className="font-mono">[{f.ref}]</span> {f.source}{f.baseline && <> · baseline: {f.baseline}</>}</li>)}
              </ol>
            )}
          </div>
        )}
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
