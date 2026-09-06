"use client"

import { useState } from "react"
import { format, parseISO } from "date-fns"
import { RungBadge, rungMeta } from "@/components/brand/rung"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useJourney } from "@/hooks/mc/use-mc"
import { useMcFilters } from "@/hooks/mc/use-mc-filters"
import type { Journey } from "@/hooks/mc/types"
import { McHeader } from "./mc-header"
import { Panel, QueryState, SourceLine } from "./states"
import { Heatmap } from "./heatmap"
import { RankingTable } from "./ranking-table"
import { PersonCell } from "./person-cell"
import { Bar01 } from "./adoption-view"
import { RoleGate } from "./role-gate"

export function JourneyView() {
  return (
    <RoleGate roles={["sponsor", "admin"]} surface="Mission Control">
      <Inner />
    </RoleGate>
  )
}

function Inner() {
  const q = useJourney()
  const { teamId } = useMcFilters()
  return (
    <>
      <McHeader title="Journey" description="Where everybody sits on the ladder, how long each rung takes, and whether spaced revisits are being done." filters={{ team: true, range: false }} />
      <QueryState query={q}>{(d) => <Body d={d} teamId={teamId} />}</QueryState>
    </>
  )
}

function Body({ d, teamId }: { d: Journey; teamId: string | null }) {
  const [mode, setMode] = useState<"pct" | "count">("pct")
  const heat = (d.heatmap ?? []).filter((r) => !teamId || r.teamId === teamId)
  const source = d.source ?? "Activate ladder (placements, promotions)"
  return (
    <div className="space-y-6 animate-rise">
      <Panel
        title="Rung distribution by team"
        description="Colour intensity is the share of the team at that rung."
        actions={
          <ToggleGroup value={[mode]} onValueChange={(v) => v[0] && setMode(v[0] as "pct" | "count")} variant="outline" size="sm" spacing={0} data-testid="heatmap-mode">
            <ToggleGroupItem value="pct">% of team</ToggleGroupItem>
            <ToggleGroupItem value="count">Counts</ToggleGroupItem>
          </ToggleGroup>
        }
        footer={<SourceLine source={source} baseline="diagnostic placement at onboarding" />}
        testId="panel-heatmap"
      >
        <Heatmap rows={heat.map((r) => ({ id: r.teamId, label: r.teamName, counts: r.counts }))} mode={mode} rowHref={(r) => `/mission-control/groups?team=${r.id}`} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Cohorts by onboarding week" description="Where each intake cohort sits now." footer={<SourceLine source={source} baseline="cohort's placement week" />} testId="panel-cohorts">
          {d.cohorts?.length ? (
            <Heatmap rows={[...d.cohorts].sort((a, b) => a.cohortWeek.localeCompare(b.cohortWeek)).map((c) => ({ id: c.cohortWeek, label: /^\d{4}-\d{2}-\d{2}$/.test(c.cohortWeek) ? `Week of ${format(parseISO(c.cohortWeek), "MMM d")}` : "Not yet onboarded", counts: c.counts }))} mode={mode} />
          ) : (
            <p className="text-sm text-muted-foreground">No cohorts yet.</p>
          )}
        </Panel>
        <Panel title="Revisit compliance" description="Spaced exercises due vs done, by team. Retention is what makes a rung stick." footer={<SourceLine source="Activate revisits" baseline="revisits scheduled by the spacing model" />} testId="panel-revisits">
          <RankingTable
            testId="revisit-compliance"
            rows={(d.revisitCompliance ?? []).filter((r) => !teamId || r.teamId === teamId)}
            rowKey={(r) => r.teamId}
            defaultSort={{ key: "rate", dir: "asc" }}
            dense
            columns={[
              { key: "team", header: "Team", sortValue: (r) => r.teamName ?? r.teamId, render: (r) => <span className="font-medium">{r.teamName ?? d.heatmap?.find((h) => h.teamId === r.teamId)?.teamName ?? r.teamId}</span> },
              { key: "due", header: "Due", align: "right", sortValue: (r) => r.due, render: (r) => r.due },
              { key: "done", header: "Done", align: "right", sortValue: (r) => r.done, render: (r) => r.done },
              { key: "rate", header: "Compliance", align: "right", sortValue: (r) => (r.due ? r.done / r.due : null), render: (r) => (r.due ? <Bar01 value={r.done / r.due} color={r.done / r.due < 0.6 ? "var(--revise)" : "var(--pass)"} /> : <span className="text-muted-foreground">none due</span>) },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Time in rung" description="Median and p90 days spent at each rung before promotion. A high p90 with people stuck is a design signal for LightCI, not a learner failure." footer={<SourceLine source={source} baseline="rung entry date" />} testId="panel-time-in-rung">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(d.timeInRung ?? []).map((t) => (
            <div key={t.rung} className="rounded-lg border p-3" data-testid="time-in-rung">
              <div className="flex items-center justify-between">
                <RungBadge rung={t.rung} />
                <span className="text-xs text-muted-foreground">{rungMeta(t.rung).short}</span>
              </div>
              <div className="mt-3 flex items-baseline gap-4">
                <div>
                  <p className="text-[11px] text-muted-foreground">Median</p>
                  <p className="font-display text-2xl tabular">{Math.round(t.medianDays)}d</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">p90</p>
                  <p className={`font-display text-2xl tabular ${t.p90Days > t.medianDays * 2.5 ? "text-revise" : ""}`}>{Math.round(t.p90Days)}d</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-[11px] text-muted-foreground">Stuck</p>
                  <p className="font-display text-2xl tabular">{t.stuck?.length ?? 0}</p>
                </div>
              </div>
              {t.stuck?.length > 0 && (
                <ul className="mt-3 space-y-1 border-t pt-2">
                  {t.stuck.slice(0, 4).map((p) => (
                    <li key={p.id}>
                      <a href={`/people/${p.id}`} className="block rounded hover:bg-muted/40">
                        <PersonCell person={p} sub={p.teamName ?? undefined} />
                      </a>
                    </li>
                  ))}
                  {t.stuck.length > 4 && <li className="text-xs text-muted-foreground">+{t.stuck.length - 4} more</li>}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
