"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { SaveIcon, LinkIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useCost, useSaveCostInputs } from "@/hooks/mc/use-mc"
import type { BaselineRef, Cost, CostInput, ReturnRow } from "@/hooks/mc/types"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { ApiError } from "@/lib/api"
import { McHeader } from "./mc-header"
import { MetricTile } from "./metric-tile"
import { Panel, QueryState, SourceLine } from "./states"
import { RankingTable } from "./ranking-table"
import { CHART, ChartTip, Legend } from "./chart-bits"
import { RoleGate, useCanAdmin } from "./role-gate"

export function CostView() {
  return (
    <RoleGate roles={["sponsor", "admin"]} surface="Mission Control">
      <Inner />
    </RoleGate>
  )
}

function Inner() {
  const q = useCost()
  return (
    <>
      <McHeader title="Cost & Return" description="Seats you pay for versus hours that came back, net of rework. Every return figure links to the baseline records it rests on." filters={false} />
      <QueryState query={q}>{(d) => <Body key={d.inputs?.updatedAt ?? JSON.stringify(d.inputs)} d={d} />}</QueryState>
    </>
  )
}

const INPUT_FIELDS: { key: keyof CostInput; label: string; hint: string; prefix?: string; suffix?: string }[] = [
  { key: "seatPriceMonthly", label: "Seat price", hint: "per seat, per month", prefix: "$" },
  { key: "premiumSeatPriceMonthly", label: "Premium seat price", hint: "Claude Code / Cowork, per month", prefix: "$" },
  { key: "loadedHourlyRate", label: "Loaded hourly rate", hint: "fully loaded cost of an hour", prefix: "$" },
  { key: "lightciFeesMonthly", label: "LightCI fees", hint: "per month", prefix: "$" },
  { key: "championHoursPerMonth", label: "Champion hours", hint: "logged per month", suffix: "h" },
]

function Body({ d }: { d: Cost }) {
  const canAdmin = useCanAdmin()
  const save = useSaveCostInputs()
  const [inputs, setInputs] = useState<CostInput>(d.inputs)
  const dirty = INPUT_FIELDS.some((f) => Number(inputs[f.key]) !== Number(d.inputs[f.key]))
  const programCost = (d.program?.lightciFees ?? 0) + (d.program?.championHoursCost ?? 0) + (d.program?.learnerExerciseHoursCost ?? 0)
  const totalCost = (d.seats?.costTotal ?? 0) + (d.premium?.cost ?? 0) + programCost
  const inputsBaseline = `client inputs${d.inputs.updatedAt ? ` (updated ${fmt.date(d.inputs.updatedAt)})` : ""}`
  const returnBaseline = d.return.baselineIds?.length || d.return.baselines?.length ? `${(d.return.baselines?.length ?? d.return.baselineIds?.length) ?? 0} baseline records${d.return.baselineCoveragePct != null ? ` · ${fmt.pct(d.return.baselineCoveragePct)} coverage` : ""}` : d.baseline ?? null

  const onSave = () => {
    const body = Object.fromEntries(INPUT_FIELDS.map((f) => [f.key, Number(inputs[f.key]) || 0])) as unknown as CostInput
    save.mutate(body, {
      onSuccess: () => toast.success("Cost inputs saved", { description: "Every return figure below has been recomputed against them." }),
      onError: (e) => toast.error("Couldn't save inputs", { description: e instanceof ApiError ? e.detail : String(e) }),
    })
  }

  return (
    <div className="space-y-6 animate-rise">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="cost-tiles">
        <MetricTile testId="tile-return" label="Return, this month" value={fmt.money(d.return.valueUsd)} sub={`${Math.round(d.return.hoursBackPerMonth)}h back × ${fmt.money(d.inputs.loadedHourlyRate)}/h`} source="Activate measurements (net of rework)" baseline={returnBaseline} accent />
        <MetricTile testId="tile-cost" label="Total cost, this month" value={fmt.money(totalCost)} sub="seats + premium + program" source="Client inputs + Analytics API seat counts" baseline={inputsBaseline} />
        <MetricTile testId="tile-roi" label="ROI" value={d.return.roi == null ? null : `${(d.return.roi * 100).toFixed(0)}%`} sub={d.return.roi == null ? "needs baselines" : "(return − cost) ÷ cost"} source="Derived" baseline={returnBaseline} delta={{ value: null }} />
        <MetricTile testId="tile-cost-per-active" label="Cost per active person" value={d.seats.costPerActive == null ? null : fmt.money(d.seats.costPerActive)} sub={`${d.seats.active} of ${d.seats.total} seats active`} source="Analytics API + client seat price" baseline={inputsBaseline} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Panel title="Inputs" description={canAdmin ? "Entered by your firm. Nothing here is guessed." : "Entered by your admin. Sponsors see them read-only."} testId="panel-cost-inputs" footer={<SourceLine source="Client" baseline={inputsBaseline} />}>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault()
              onSave()
            }}
            data-testid="cost-inputs-form"
          >
            {INPUT_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`cost-${f.key}`} className="text-xs">{f.label}</Label>
                <div className="relative">
                  {f.prefix && <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">{f.prefix}</span>}
                  <Input id={`cost-${f.key}`} type="number" min={0} step="any" value={inputs[f.key] ?? 0} onChange={(e) => setInputs((s) => ({ ...s, [f.key]: e.target.value === "" ? 0 : Number(e.target.value) }))} disabled={!canAdmin} className={cn("tabular", f.prefix && "pl-6", f.suffix && "pr-7")} data-testid={`cost-input-${f.key}`} />
                  {f.suffix && <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">{f.suffix}</span>}
                </div>
                <p className="text-[11px] text-muted-foreground">{f.hint}</p>
              </div>
            ))}
            {canAdmin && (
              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit" size="sm" disabled={!dirty || save.isPending} data-testid="cost-inputs-save">
                  <SaveIcon data-icon="inline-start" /> {save.isPending ? "Saving…" : "Save inputs"}
                </Button>
              </div>
            )}
          </form>
        </Panel>

        <Panel title="Where the cost comes from" description="Seats active vs inactive, premium seats unused, and the program itself." footer={<SourceLine source="Analytics API seat activity + client inputs" baseline={inputsBaseline} />} testId="panel-cost-breakdown">
          <CostBars d={d} programCost={programCost} />
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <Stat label="Inactive seat cost" value={fmt.money(d.seats.costInactive)} sub={`${d.seats.inactive} seats`} tone="fail" />
            <Stat label="Premium seats unused" value={`${d.premium.unused} of ${d.premium.seats}`} sub={fmt.money(d.premium.costUnused ?? (d.premium.seats ? (d.premium.cost / d.premium.seats) * d.premium.unused : 0))} tone="revise" />
            <Stat label="Program" value={fmt.money(programCost)} sub={`fees ${fmt.money(d.program.lightciFees)} · champions ${fmt.money(d.program.championHoursCost)}`} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Return by team" footer={<SourceLine source="Activate measurements vs baselines" baseline={returnBaseline} />} testId="panel-return-team">
          <ReturnTable rows={d.return.perTeam ?? []} nameOf={(r) => r.teamName ?? r.name ?? "—"} testId="return-by-team" />
        </Panel>
        <Panel title="Return by skill" footer={<SourceLine source="Activate measurements vs baselines" baseline={returnBaseline} />} testId="panel-return-skill">
          <ReturnTable rows={d.return.perSkill ?? []} nameOf={(r) => r.skillName ?? r.name ?? "—"} testId="return-by-skill" />
        </Panel>
      </div>

      <Panel title="Waste signals" description="Money going out with nothing measurable coming back." footer={<SourceLine source="Analytics API + Activate" baseline={inputsBaseline} />} testId="panel-waste">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(d.waste ?? []).map((w) => (
            <div key={w.kind} className="rounded-lg border p-3" data-testid="waste-signal">
              <p className="text-xs text-muted-foreground">{wasteLabel(w.kind)}</p>
              <p className="mt-1 font-display text-2xl tabular">{w.count}</p>
              <p className="text-xs text-fail tabular">{fmt.money(w.costUsd)} / month</p>
            </div>
          ))}
          {(d.waste ?? []).length === 0 && <p className="text-sm text-muted-foreground">No waste signals. Rare, and worth a readout.</p>}
        </div>
      </Panel>
    </div>
  )
}

function wasteLabel(k: string) {
  return ({ inactive_seats: "Inactive seats", premium_unused: "Premium seats unused", skills_unadopted: "Skills built, not adopted", exercises_abandoned: "Exercises abandoned" } as Record<string, string>)[k] ?? k.replace(/_/g, " ")
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "fail" | "revise" }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("font-display text-xl tabular", tone === "fail" && "text-fail", tone === "revise" && "text-revise")}>{value}</p>
      {sub && <p className="truncate text-[11px] text-muted-foreground" title={sub}>{sub}</p>}
    </div>
  )
}

function CostBars({ d, programCost }: { d: Cost; programCost: number }) {
  const data = [
    { name: "Active seats", value: Math.max(0, d.seats.costTotal - d.seats.costInactive), color: CHART.ink },
    { name: "Inactive seats", value: d.seats.costInactive, color: "var(--fail)" },
    { name: "Premium seats", value: d.premium.cost, color: CHART.info },
    { name: "Program", value: programCost, color: CHART.glow },
  ]
  return (
    <div data-testid="cost-bars">
      <div style={{ height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }} barSize={18}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTip format={(v) => fmt.money(Number(v))} />} cursor={{ fill: CHART.grid }} />
            <Bar dataKey="value" name="Monthly cost" radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: "right", fontSize: 11, fill: CHART.axis, formatter: (v: unknown) => fmt.money(Number(v)) }}>
              {data.map((x) => (
                <Cell key={x.name} fill={x.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legend className="mt-1" items={data.map((x) => ({ label: x.name, color: x.color }))} />
    </div>
  )
}

function BaselineLink({ row }: { row: ReturnRow }) {
  const refs: BaselineRef[] = row.baselines ?? (row.baselineIds ?? []).map((id) => ({ id }))
  if (!refs.length) return <span className="text-xs italic text-muted-foreground">no baseline</span>
  return (
    <UiTooltip>
      <TooltipTrigger render={<button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground" data-testid="baseline-link" />}>
        <LinkIcon className="size-3" /> {refs.length} baseline{refs.length > 1 ? "s" : ""}
      </TooltipTrigger>
      <TooltipContent className="block max-w-sm">
        <p className="mb-1 font-medium">Baseline records</p>
        <ul className="space-y-0.5">
          {refs.slice(0, 8).map((b) => (
            <li key={b.id} className="flex gap-2">
              <span className="font-mono text-[10px] text-background/60">{b.id.slice(0, 8)}</span>
              <span>{b.workflow ?? b.task ?? "workflow"}{b.minutesPerWeek != null ? ` · ${b.minutesPerWeek} min/wk` : ""}{b.method ? ` · ${b.method.replace(/_/g, " ")}` : ""}</span>
            </li>
          ))}
          {refs.length > 8 && <li className="text-background/60">+{refs.length - 8} more</li>}
        </ul>
      </TooltipContent>
    </UiTooltip>
  )
}

function ReturnTable({ rows, nameOf, testId }: { rows: ReturnRow[]; nameOf: (r: ReturnRow) => string; testId: string }) {
  return (
    <RankingTable
      testId={testId}
      rows={rows}
      rowKey={(r) => r.teamId ?? r.skillId ?? nameOf(r)}
      defaultSort={{ key: "value", dir: "desc" }}
      dense
      emptyLabel="No measured return yet. Baselines first, then measurements."
      columns={[
        { key: "name", header: "Name", sortValue: nameOf, render: (r) => <span className="font-medium">{nameOf(r)}</span> },
        { key: "hours", header: "Hours back / mo", align: "right", sortValue: (r) => r.hoursBackPerMonth, render: (r) => `${Math.round(r.hoursBackPerMonth)}h` },
        { key: "value", header: "Value", align: "right", sortValue: (r) => r.valueUsd, render: (r) => fmt.money(r.valueUsd) },
        { key: "roi", header: "ROI", align: "right", sortValue: (r) => r.roi ?? null, render: (r) => (r.roi == null ? <span className="text-muted-foreground">—</span> : <span className={r.roi < 0 ? "text-fail" : ""}>{(r.roi * 100).toFixed(0)}%</span>) },
        { key: "baseline", header: "Baseline", sortable: false, render: (r) => <BaselineLink row={r} /> },
      ]}
    />
  )
}
