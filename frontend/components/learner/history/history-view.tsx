"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState, ErrorState } from "@/components/shell/empty-state"
import { RungBadge, RUNGS } from "@/components/brand/rung"
import { GradeCard } from "../grade-card"
import { DecisionChip, ModeBadge } from "../chips"
import { useHistory } from "@/hooks/learner/queries"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { HistoryItem } from "@/hooks/learner/types"

const RUNG_ITEMS = { all: "All rungs", ...Object.fromEntries(RUNGS.map((r) => [String(r.rung), `${r.code} ${r.name}`])) }
const DECISION_ITEMS = { all: "All outcomes", pass: "Pass", revise: "Revise", ungraded: "Awaiting grade" }

export function HistoryView() {
  const q = useHistory()
  const [rung, setRung] = useState<string>("all")
  const [decision, setDecision] = useState<string>("all")
  const [open, setOpen] = useState<string | null>(null)

  const items = useMemo(() => {
    const all = q.data?.items ?? []
    return all.filter((it) => (rung === "all" || String(it.exercise.rung) === rung) && (decision === "all" || (decision === "ungraded" ? !it.submission.grade : it.submission.grade?.decision === decision)))
  }, [q.data, rung, decision])

  if (q.isPending) return <div className="space-y-3" data-testid="history-loading">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
  if (q.isError) return <ErrorState title="Couldn't load your history" detail={q.error.message} retry={() => q.refetch()} />

  const total = q.data.items.length
  const passed = q.data.items.filter((i) => i.submission.grade?.decision === "pass").length

  return (
    <div className="space-y-5" data-testid="history-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground"><span className="tabular font-medium text-foreground">{total}</span> submissions · <span className="tabular font-medium text-foreground">{passed}</span> passed</p>
        <div className="flex items-center gap-2">
          <Select value={rung} onValueChange={(v) => setRung(v ?? "all")} items={RUNG_ITEMS}>
            <SelectTrigger size="sm" className="w-40" data-testid="history-filter-rung"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All rungs</SelectItem>
              {RUNGS.map((r) => <SelectItem key={r.rung} value={String(r.rung)}>{r.code} {r.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={decision} onValueChange={(v) => setDecision(v ?? "all")} items={DECISION_ITEMS}>
            <SelectTrigger size="sm" className="w-36" data-testid="history-filter-decision"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outcomes</SelectItem>
              <SelectItem value="pass">Pass</SelectItem>
              <SelectItem value="revise">Revise</SelectItem>
              <SelectItem value="ungraded">Awaiting grade</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {total === 0 ? (
        <EmptyState title="No submissions yet" description="Every exercise you submit lands here with your expectation, the artifact, your critique and the grade. It is your evidence trail, and the basis for every promotion." />
      ) : items.length === 0 ? (
        <EmptyState title="Nothing matches those filters" description="Try widening the rung or outcome filter." />
      ) : (
        <ul className="space-y-3">
          {items.map((it) => <HistoryRow key={it.submission.id} item={it} open={open === it.submission.id} onToggle={() => setOpen(open === it.submission.id ? null : it.submission.id)} />)}
        </ul>
      )}
    </div>
  )
}

function HistoryRow({ item, open, onToggle }: { item: HistoryItem; open: boolean; onToggle: () => void }) {
  const { exercise: ex, submission: s } = item
  const excerpt = (s.artifact?.content ?? "").replace(/\s+/g, " ").trim()
  return (
    <li className={cn("rounded-xl border bg-card transition-shadow", open && "ring-1 ring-glow/40")} data-testid="history-row" data-decision={s.grade?.decision ?? "ungraded"}>
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-4 p-4 text-left" aria-expanded={open} data-testid="history-row-toggle">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <RungBadge rung={ex.rung} showName={false} />
            <ModeBadge mode={ex.mode} />
            <span className="text-xs text-muted-foreground">{fmt.date(s.submittedAt)} · attempt {s.attempt}{s.coldAttempt ? " · cold" : ""}</span>
          </div>
          <h3 className="mt-1.5 font-display text-lg font-medium leading-snug">{ex.title}</h3>
          <dl className="mt-2 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
            <div><dt className="eyebrow">Expectation · {Math.round(s.expectationConfidence * 100)}%</dt><dd className="mt-0.5 line-clamp-2">{s.expectationText}</dd></div>
            <div><dt className="eyebrow">Artifact</dt><dd className="mt-0.5 line-clamp-2 font-mono">{excerpt || "—"}</dd></div>
            <div><dt className="eyebrow">Critique</dt><dd className="mt-0.5 line-clamp-2">{s.critiqueText || "—"}</dd></div>
          </dl>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {s.grade ? <div className="flex items-center gap-2"><span className="font-display text-xl tabular">{Math.round(s.grade.score * 100)}</span><DecisionChip decision={s.grade.decision} /></div> : <span className="text-xs text-muted-foreground">Awaiting grade</span>}
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </button>
      {open && (
        <div className="space-y-4 border-t p-4 animate-rise" data-testid="history-row-detail">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="eyebrow mb-1.5">Full artifact</p>
              <pre className="max-h-72 overflow-auto rounded-lg border bg-background p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{s.artifact?.content}</pre>
              {s.artifact?.output && (
                <>
                  <p className="eyebrow mt-3 mb-1.5">Claude&apos;s output</p>
                  <pre className="max-h-72 overflow-auto rounded-lg border bg-background p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{s.artifact.output}</pre>
                </>
              )}
            </div>
            <div className="space-y-3 text-sm">
              <div><p className="eyebrow mb-1">Expectation</p><p className="whitespace-pre-wrap">{s.expectationText}</p></div>
              <div><p className="eyebrow mb-1">Critique</p><p className="whitespace-pre-wrap">{s.critiqueText || "—"}</p></div>
              <Link href={`/exercise/${ex.id}`} className="inline-block text-xs underline underline-offset-4">Open exercise</Link>
            </div>
          </div>
          {s.grade && <GradeCard grade={s.grade} />}
        </div>
      )}
    </li>
  )
}
