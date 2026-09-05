"use client"

import Link from "next/link"
import { toast } from "sonner"
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts"
import { BellRingIcon, UserRoundXIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAdoption } from "@/hooks/mc/use-mc"
import { useMcFilters } from "@/hooks/mc/use-mc-filters"
import { lastNum, trendOf } from "@/hooks/mc/normalise"
import type { Adoption } from "@/hooks/mc/types"
import { fmt } from "@/lib/format"
import { EmptyState } from "@/components/shell/empty-state"
import { McHeader } from "./mc-header"
import { MetricTile } from "./metric-tile"
import { TrendChart } from "./trend-chart"
import { FunnelChart } from "./funnel-chart"
import { Panel, QueryState, SourceLine } from "./states"
import { RankingTable } from "./ranking-table"
import { PersonCell } from "./person-cell"
import { CHART, CATEGORICAL, ChartTip } from "./chart-bits"
import { RoleGate } from "./role-gate"

export function AdoptionView() {
  return (
    <RoleGate roles={["sponsor", "admin"]} surface="Mission Control">
      <AdoptionInner />
    </RoleGate>
  )
}

function AdoptionInner() {
  const { teamId, range } = useMcFilters()
  const q = useAdoption({ teamId, range })
  return (
    <>
      <McHeader title="Adoption" description="Active on real work, not logins. Anthropic's definition: a message sent, or a Code / Cowork session with tool use." />
      <QueryState query={q}>{(d) => <AdoptionBody d={d} range={range} />}</QueryState>
    </>
  )
}

function AdoptionBody({ d, range }: { d: Adoption; range: "30d" | "90d" }) {
  const daily = d.active.daily ?? []
  const seats = d.active.seats ?? daily.at(-1)?.seats ?? 0
  const weekly = lastNum(d.active.weekly)
  const monthly = lastNum(d.active.monthly)
  const trend = trendOf(d.active.trend)
  const analyticsSrc = d.active.source ?? d.source ?? "Analytics API"
  const activeBaseline = d.active.baseline ?? d.baseline ?? (range === "30d" ? "prior 30 days" : "prior 90 days")
  const depthSrc = d.depth.source ?? analyticsSrc
  const depthBaseline = d.depth.baseline ?? null
  const seatPct = (n: number | null) => (n != null && seats ? fmt.pct(n / seats) : null)

  return (
    <div className="space-y-6 animate-rise">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="adoption-tiles">
        <MetricTile testId="tile-active-pct" label="Active on real work" value={fmt.pct(d.active.pctOfSeats)} sub={`of ${seats} seats`} delta={{ value: typeof d.active.trend === "number" ? d.active.trend : null, label: trend.label && typeof d.active.trend !== "number" ? trend.label : `vs ${activeBaseline}` }} trend={trend.direction} source={analyticsSrc} baseline={activeBaseline} spark={daily.map((x) => x.active)} accent />
        <MetricTile testId="tile-wau" label="Weekly active (WAU)" value={weekly != null ? fmt.num(weekly) : null} sub={seatPct(weekly) ? `${seatPct(weekly)} of seats` : undefined} source={analyticsSrc} baseline={activeBaseline} />
        <MetricTile testId="tile-mau" label="Monthly active (MAU)" value={monthly != null ? fmt.num(monthly) : null} sub={seatPct(monthly) ? `${seatPct(monthly)} of seats` : undefined} source={analyticsSrc} baseline={activeBaseline} />
        <MetricTile testId="tile-sessions" label="Sessions per active person" value={d.depth.sessionsPerActive?.toFixed(1)} sub="per week" source={depthSrc} baseline={depthBaseline} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Active on real work, daily" description={`Last ${range}. Dashed line is provisioned seats.`} footer={<SourceLine source={analyticsSrc} baseline={activeBaseline} />} testId="panel-active-daily">
          {daily.length ? <TrendChart data={daily} /> : <EmptyState title="No usage days yet" description="Once the Analytics key is verified, daily active-on-real-work lands here." className="p-6" />}
        </Panel>
        <Panel title="Depth" description="How people are using Claude, not just whether." footer={<SourceLine source={depthSrc} baseline={depthBaseline} />} testId="panel-depth">
          <div className="grid grid-cols-2 gap-3">
            <Mini label="Connectors in use" value={fmt.num(d.depth.connectors)} />
            <Mini label="Skills activated" value={fmt.num(d.depth.skillsActivated)} sub={`last ${range}`} />
          </div>
          <p className="mt-4 mb-1 text-xs font-medium text-muted-foreground">Surfaces · people using each</p>
          <SurfacesBar surfaces={d.depth.surfaces ?? []} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Funnel" description="Provisioned → logged in → first real work → L1 … L5. Conversion vs the previous step, and median days to reach it." footer={<SourceLine source={d.funnel?.[0]?.source ?? "Analytics API + Activate ladder"} baseline={d.funnel?.[0]?.baseline ?? "provisioned seats"} />} testId="panel-funnel">
          {d.funnel?.length ? <FunnelChart steps={d.funnel} /> : <p className="text-sm text-muted-foreground">No funnel steps yet.</p>}
        </Panel>
        <Panel title="By team" description="Active share and hours back per week against each team's baseline." footer={<SourceLine source="Analytics API + Activate baselines" baseline="team baseline (Interviewer estimate or time diary)" />} testId="panel-by-team">
          <RankingTable
            testId="adoption-by-team"
            rows={d.byTeam ?? []}
            rowKey={(r) => r.teamId}
            rowHref={(r) => `/mission-control/groups?team=${r.teamId}`}
            defaultSort={{ key: "activePct", dir: "desc" }}
            dense
            columns={[
              { key: "team", header: "Team", sortValue: (r) => r.teamName, render: (r) => <span className="font-medium">{r.teamName}</span> },
              { key: "activePct", header: "Active", align: "right", sortValue: (r) => r.activePct, render: (r) => <Bar01 value={r.activePct} /> },
              { key: "hoursBack", header: "Hours back / wk", align: "right", sortValue: (r) => r.hoursBack, render: (r) => <span className={r.baselineHours == null && r.baseline == null ? "text-muted-foreground" : ""}>{r.hoursBack.toFixed(1)}h</span> },
            ]}
          />
        </Panel>
      </div>

      <Panel title={`Inactive seats · ${d.inactiveSeats?.length ?? 0}`} description="No real work in the period. Every one is a seat cost with nothing back." footer={<SourceLine source={analyticsSrc} baseline="days since last real-work activity" />} testId="panel-inactive">
        <RankingTable
          testId="inactive-seats"
          rows={d.inactiveSeats ?? []}
          rowKey={(p) => p.id}
          defaultSort={{ key: "days", dir: "desc" }}
          emptyLabel="Every seat has done real work in this period."
          dense
          columns={[
            { key: "person", header: "Person", sortValue: (p) => p.name, render: (p) => <PersonCell person={p} /> },
            { key: "team", header: "Team", sortValue: (p) => p.teamName, render: (p) => <span className="text-muted-foreground">{p.teamName ?? "—"}</span> },
            { key: "days", header: "Days inactive", align: "right", sortValue: (p) => p.daysInactive, render: (p) => <span className={p.daysInactive >= 30 ? "font-medium text-fail" : ""}>{p.daysInactive}</span> },
            {
              key: "actions",
              header: "",
              align: "right",
              sortable: false,
              render: (p) => (
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button size="xs" variant="outline" data-testid="nudge-button" onClick={() => toast.success(`Nudge queued for ${p.name}`, { description: "Coach will send a short, specific prompt tied to one of their real workflows. Nothing generic." })}>
                    <BellRingIcon data-icon="inline-start" /> Nudge
                  </Button>
                  <UiTooltip>
                    <TooltipTrigger render={<span className="inline-flex" />}>
                      <Button size="xs" variant="ghost" disabled data-testid="reassign-seat-button">
                        <UserRoundXIcon data-icon="inline-start" /> Reassign seat
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Seat reassignment happens in Claude admin. Activate will link here once the Admin API key is verified.</TooltipContent>
                  </UiTooltip>
                </div>
              ),
            },
          ]}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Need to change who holds a seat? Open <Link href="/admin/teams" className="underline underline-offset-4">Teams & People</Link>.
        </p>
      </Panel>
    </div>
  )
}

function Mini({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-2xl leading-tight tabular">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function SurfacesBar({ surfaces }: { surfaces: { name: string; users: number }[] }) {
  if (!surfaces.length) return <p className="text-sm text-muted-foreground">No surface data.</p>
  return (
    <div style={{ height: 28 * surfaces.length + 8 }} data-testid="surfaces-bar">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={surfaces} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }} barSize={16}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTip />} cursor={{ fill: CHART.grid }} />
          <Bar dataKey="users" name="People" radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: "right", fontSize: 11, fill: CHART.axis }}>
            {surfaces.map((_, i) => (
              <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Bar01({ value, color = "var(--glow)" }: { value: number; color?: string }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, background: color }} />
      </span>
      <span className="tabular">{fmt.pct(value)}</span>
    </span>
  )
}
