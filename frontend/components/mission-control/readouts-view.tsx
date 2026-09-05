"use client"

import { useMemo, useState } from "react"
import { format, subDays } from "date-fns"
import { toast } from "sonner"
import { FileTextIcon, PrinterIcon, SparklesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useMe } from "@/hooks/use-me"
import { useGenerateReadout, useReadout, useReadouts, useTeams, usePeople } from "@/hooks/mc/use-mc"
import type { Readout } from "@/hooks/mc/types"
import { fmt } from "@/lib/format"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/shell/empty-state"
import { LightciWordmark } from "@/components/brand/logo"
import { McHeader } from "./mc-header"
import { Panel, QueryState } from "./states"
import { RoleGate } from "./role-gate"

export function ReadoutsView() {
  return (
    <RoleGate roles={["sponsor", "admin"]} surface="Mission Control">
      <Inner />
    </RoleGate>
  )
}

function Inner() {
  const list = useReadouts()
  const [selected, setSelected] = useState<string | null>(null)
  const detail = useReadout(selected)
  const current = detail.data ?? list.data?.find((r) => r.id === selected) ?? null
  return (
    <>
      <div className="print:hidden">
        <McHeader title="Readouts" description="Narrative drafted by the Auditor from the numbers above. Every figure is footnoted to its source and baseline." filters={false} actions={<GenerateDialog onDone={(r) => setSelected(r.id)} />} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <div className="print:hidden">
          <QueryState query={list} skeleton={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
            {(rows) => (
              <Panel title={`Readouts · ${rows.length}`} testId="readouts-list">
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None yet. Generate the first one.</p>
                ) : (
                  <ul className="-mx-2 divide-y">
                    {[...rows].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)).map((r) => (
                      <li key={r.id}>
                        <button type="button" onClick={() => setSelected(r.id)} className={cn("w-full rounded-md px-2 py-2 text-left hover:bg-muted/40", selected === r.id && "bg-muted/60")} data-testid="readout-item">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <FileTextIcon className="size-3.5 text-muted-foreground" /> <span className="truncate">{r.title}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {scopeLabel(r)} · {fmt.dateShort(r.periodStart)} – {fmt.dateShort(r.periodEnd)}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
          </QueryState>
        </div>
        <div>
          {!selected && <EmptyState icon={<FileTextIcon className="size-5" />} title="Pick a readout" description="Or generate one for the org, a team or a person over a period. The Auditor writes the narrative; the footnotes carry the sources." />}
          {selected && detail.isPending && !current && <div className="h-64 animate-pulse rounded-xl bg-muted" />}
          {current && <ReadoutDoc r={current} />}
        </div>
      </div>
    </>
  )
}

function scopeLabel(r: Readout) {
  return r.scopeType === "org" ? "Organisation" : r.scopeType === "team" ? `Team${r.scopeName ? ` · ${r.scopeName}` : ""}` : `Person${r.scopeName ? ` · ${r.scopeName}` : ""}`
}

function ReadoutDoc({ r }: { r: Readout }) {
  const me = useMe()
  const metrics = Object.entries(r.metrics ?? {}).filter(([, v]) => typeof v === "number" || typeof v === "string")
  return (
    <article className="readout-print rounded-xl bg-card p-6 ring-1 ring-foreground/10 md:p-8" data-testid="readout-view">
      <style>{`@media print { body * { visibility: hidden; } .readout-print, .readout-print * { visibility: visible; } .readout-print { position: absolute; inset: 0; margin: 0; box-shadow: none; border-radius: 0; padding: 24pt; } .print-hide { display: none !important; } }`}</style>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div>
          <p className="eyebrow">{me.org?.name ?? "Readout"} · {scopeLabel(r)}</p>
          <h2 className="mt-1 font-display text-2xl font-medium md:text-3xl">{r.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {fmt.date(r.periodStart)} – {fmt.date(r.periodEnd)} · generated {fmt.date(r.generatedAt)} by the Auditor
          </p>
        </div>
        <div className="flex items-center gap-2 print-hide">
          <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="readout-export">
            <PrinterIcon data-icon="inline-start" /> Export (print / PDF)
          </Button>
        </div>
      </header>
      {metrics.length > 0 && (
        <dl className="mt-5 grid gap-3 sm:grid-cols-3" data-testid="readout-metrics">
          {metrics.slice(0, 6).map(([k, v]) => (
            <div key={k} className="rounded-lg bg-muted/40 p-3">
              <dt className="text-xs text-muted-foreground">{k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").toLowerCase()}</dt>
              <dd className="font-display text-xl tabular">{typeof v === "number" ? (Math.abs(v) < 1 && v !== 0 ? fmt.pct(v) : fmt.num(v)) : String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="prose-sm mt-6 max-w-none whitespace-pre-wrap text-[15px] leading-relaxed" data-testid="readout-narrative">
        {renderNarrative(r.narrative)}
      </div>
      {r.footnotes?.length > 0 && (
        <footer className="mt-8 border-t pt-4" data-testid="readout-footnotes">
          <p className="eyebrow mb-2">Sources and baselines</p>
          <ol className="space-y-1 text-xs text-muted-foreground">
            {r.footnotes.map((f, i) => (
              <li key={`${f.ref}-${i}`} className="flex gap-2">
                <span className="tabular font-medium text-foreground">[{f.ref}]</span>
                <span>
                  Source: {f.source}
                  {f.baseline ? <> · Baseline: {f.baseline}</> : <> · <em>no baseline</em></>}
                </span>
              </li>
            ))}
          </ol>
        </footer>
      )}
      <div className="mt-8 flex items-center justify-between text-[11px] text-muted-foreground">
        <LightciWordmark className="h-3.5" />
        <span>Every number carries its source and baseline. Hours back are net of rework.</span>
      </div>
    </article>
  )
}

/** Turn [1]-style refs into superscripts so footnotes read as footnotes. */
function renderNarrative(text: string) {
  const parts = text.split(/(\[\d+\])/g)
  return parts.map((p, i) => (/^\[\d+\]$/.test(p) ? <sup key={i} className="text-[10px] text-muted-foreground">{p}</sup> : <span key={i}>{p}</span>))
}

function GenerateDialog({ onDone }: { onDone: (r: Readout) => void }) {
  const [open, setOpen] = useState(false)
  const [scopeType, setScopeType] = useState<"org" | "team" | "person">("org")
  const [scopeId, setScopeId] = useState<string>("")
  const [start, setStart] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"))
  const [end, setEnd] = useState(format(new Date(), "yyyy-MM-dd"))
  const teams = useTeams()
  const people = usePeople(scopeType === "person" ? null : undefined)
  const gen = useGenerateReadout()
  const options = useMemo(() => (scopeType === "team" ? (teams.data ?? []).map((t) => ({ id: t.id, name: t.name })) : scopeType === "person" ? (people.data ?? []).map((p) => ({ id: p.id, name: p.name })) : []), [scopeType, teams.data, people.data])
  const valid = scopeType === "org" || Boolean(scopeId)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" data-testid="readout-generate-open" />}>
        <SparklesIcon data-icon="inline-start" /> Generate readout
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate a readout</DialogTitle>
          <DialogDescription>The Auditor drafts a narrative from the period&apos;s numbers. Takes about a minute.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label className="text-xs">Scope</Label>
            <Select value={scopeType} onValueChange={(v) => { setScopeType(v as typeof scopeType); setScopeId("") }}>
              <SelectTrigger className="w-full" data-testid="readout-scope">
                <SelectValue>{(v: string) => ({ org: "Whole organisation", team: "A team", person: "A person" })[v] ?? v}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="org">Whole organisation</SelectItem>
                <SelectItem value="team">A team</SelectItem>
                <SelectItem value="person">A person</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scopeType !== "org" && (
            <div className="grid gap-1">
              <Label className="text-xs">{scopeType === "team" ? "Team" : "Person"}</Label>
              <Select value={scopeId} onValueChange={(v) => setScopeId((v as string) ?? "")}>
                <SelectTrigger className="w-full" data-testid="readout-scope-id">
                  <SelectValue>{(v: string) => options.find((o) => o.id === v)?.name ?? "Choose…"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label htmlFor="ro-start" className="text-xs">From</Label>
              <Input id="ro-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} data-testid="readout-period-start" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="ro-end" className="text-xs">To</Label>
              <Input id="ro-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="readout-period-end" />
            </div>
          </div>
        </div>
        <DialogFooter showCloseButton>
          <Button
            disabled={!valid || gen.isPending}
            data-testid="readout-generate"
            onClick={() =>
              gen.mutate(
                { scopeType, scopeId: scopeType === "org" ? undefined : scopeId, periodStart: start, periodEnd: end },
                {
                  onSuccess: (r) => {
                    toast.success("Readout generated", { description: r.title })
                    setOpen(false)
                    onDone(r)
                  },
                  onError: (e) => toast.error("Couldn't generate the readout", { description: e instanceof ApiError ? e.detail : String(e) }),
                },
              )
            }
          >
            {gen.isPending ? "Drafting…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
