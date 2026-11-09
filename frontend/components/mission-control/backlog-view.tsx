"use client"

import { useState } from "react"
import Link from "next/link"
import { FileSpreadsheetIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useMe } from "@/hooks/use-me"
import { useMcBacklog } from "@/hooks/mc/use-mc"
import { useMcFilters } from "@/hooks/mc/use-mc-filters"
import { composite, scoreField } from "@/hooks/mc/normalise"
import type { Backlog, WorkflowSummary } from "@/hooks/mc/types"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { McHeader } from "./mc-header"
import { MetricTile } from "./metric-tile"
import { Panel, QueryState, SourceLine } from "./states"
import { RankingTable } from "./ranking-table"
import { csvDownload, stamp } from "./csv-download"
import { Bar01 } from "./adoption-view"
import { RoleGate } from "./role-gate"

export function BacklogView() {
  return (
    <RoleGate roles={["sponsor", "admin"]} surface="Mission Control">
      <Inner />
    </RoleGate>
  )
}

function Inner() {
  const { teamId } = useMcFilters()
  const q = useMcBacklog(teamId)
  const me = useMe()
  const [nextWave, setNextWave] = useState(false)
  return (
    <>
      <McHeader
        title="Backlog"
        description="Every mapped workflow, ranked by the Scorer: hours at stake, readiness to build, compliance exposure."
        filters={{ team: true, range: false }}
        actions={
          <Button size="sm" disabled={!q.data?.sowExport?.rows?.length} onClick={() => q.data && csvDownload(`sow-${me.org?.slug ?? "org"}-${stamp()}`, q.data.sowExport.rows)} data-testid="export-sow">
            <FileSpreadsheetIcon data-icon="inline-start" /> Export to SOW
          </Button>
        }
      />
      <QueryState query={q}>{(d) => <Body d={d} nextWave={nextWave} setNextWave={setNextWave} />}</QueryState>
    </>
  )
}

const STATUS_TONE: Record<string, string> = { candidate: "border-border", mapped: "border-info/40 bg-info-soft", in_build: "border-glow bg-glow-soft", shipped: "border-pass/40 bg-pass-soft", parked: "border-border text-muted-foreground" }

export function ExposureBadge({ value }: { value: number | string | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>
  const label = typeof value === "number" ? (value >= 0.66 ? "Restricted" : value >= 0.33 ? "Elevated" : "Standard") : value
  const tone = /restricted|high/i.test(label) ? "border-fail/40 bg-fail-soft" : /elevated|medium|amber/i.test(label) ? "border-revise/40 bg-revise-soft" : "border-pass/40 bg-pass-soft"
  return <Badge variant="outline" className={cn("text-foreground capitalize", tone)}>{label}</Badge>
}

function Body({ d, nextWave, setNextWave }: { d: Backlog; nextWave: boolean; setNextWave: (v: boolean) => void }) {
  const items = (d.items ?? []).filter((w) => !nextWave || w.nextWave)
  const source = d.source ?? "Interviewer workflow maps + Scorer"
  const baseline = d.baseline ?? "baseline minutes/week per workflow (Interviewer estimate or time diary)"
  // Scorer's hours/week when scored; otherwise the captured baseline. A workflow with no baseline
  // row (hasBaseline false, baseline 0) shows "no baseline" rather than a false 0.0h.
  const hoursAtStake = (w: WorkflowSummary) => {
    const s = scoreField(w.score, "hoursAtStake")
    if (typeof s === "number") return s
    if (w.hasBaseline === false) return null
    return w.baselineMinutesPerWeek != null && w.baselineMinutesPerWeek > 0 ? w.baselineMinutesPerWeek / 60 : null
  }
  return (
    <div className="space-y-6 animate-rise">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" data-testid="backlog-tiles">
        <MetricTile testId="tile-hours-at-stake" label="Hours at stake / wk" value={`${Math.round(d.totals.hoursAtStake)}h`} source={source} baseline={baseline} accent />
        <MetricTile testId="tile-candidates" label="Candidates" value={d.totals.candidates} source={source} baseline="n/a (count)" />
        <MetricTile testId="tile-in-build" label="In build" value={d.totals.inBuild} source={source} baseline="n/a (count)" />
        <MetricTile testId="tile-shipped" label="Shipped" value={d.totals.shipped} source={source} baseline="n/a (count)" />
        <MetricTile testId="tile-next-wave" label="Next wave" value={d.totals.nextWave} source={source} baseline="n/a (count)" />
      </div>

      <Panel
        title={`Workflow inventory · ${items.length}`}
        description="Ranked by composite score. Readiness = how complete and champion-verified the map is."
        actions={
          <Label className="gap-2 text-xs text-muted-foreground">
            Next wave only <Switch checked={nextWave} onCheckedChange={setNextWave} size="sm" data-testid="next-wave-filter" />
          </Label>
        }
        footer={<SourceLine source={source} baseline={baseline} />}
        testId="panel-backlog"
      >
        <RankingTable
          testId="backlog-table"
          rowTestId="backlog-row"
          rows={items}
          rowKey={(w) => w.id}
          defaultSort={{ key: "score", dir: "desc" }}
          emptyLabel={nextWave ? "Nothing tagged for the next wave yet." : "No workflows mapped yet. Interviewer intake creates them."}
          columns={[
            { key: "rank", header: "#", sortable: false, render: (w) => <span className="tabular text-muted-foreground">{(d.items ?? []).findIndex((x) => x.id === w.id) + 1}</span>, width: "2.5rem" },
            { key: "name", header: "Workflow", sortValue: (w) => w.name, render: (w) => (
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{w.name}</span>
                  {w.nextWave && <Badge variant="outline" className="border-glow bg-glow-soft text-glow-foreground">Next wave</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{w.owner ? w.owner.name : "no owner"}{w.linkedSkills?.length ? ` · ${w.linkedSkills.length} skill${w.linkedSkills.length > 1 ? "s" : ""}` : ""}</div>
              </div>
            ) },
            { key: "score", header: "Score", align: "right", sortValue: (w) => composite(w.score), render: (w) => { const c = composite(w.score); return c == null ? <span className="text-muted-foreground" title="New workflows are scored overnight">scored overnight</span> : <span className="font-medium">{fmt.score(c)}</span> } },
            { key: "hours", header: "Hours at stake / wk", align: "right", sortValue: (w) => hoursAtStake(w), render: (w) => { const h = hoursAtStake(w); return h == null ? <span className="text-muted-foreground">no baseline</span> : `${h.toFixed(1)}h` } },
            { key: "readiness", header: "Readiness", align: "right", sortValue: (w) => (typeof scoreField(w.score, "readiness") === "number" ? (scoreField(w.score, "readiness") as number) : w.completeness), render: (w) => <Bar01 value={typeof scoreField(w.score, "readiness") === "number" ? (scoreField(w.score, "readiness") as number) : w.completeness} color={w.championVerified ? "var(--pass)" : "var(--glow)"} /> },
            { key: "exposure", header: "Exposure", sortValue: (w) => { const e = scoreField(w.score, "exposure") ?? w.exposure; return typeof e === "number" ? e : String(e ?? "") }, render: (w) => <ExposureBadge value={scoreField(w.score, "exposure") ?? w.exposure ?? null} /> },
            { key: "team", header: "Team", sortValue: (w) => w.teamName, render: (w) => <span className="text-muted-foreground">{w.teamName ?? "—"}</span> },
            { key: "status", header: "Status", sortValue: (w) => w.status, render: (w) => <Badge variant="outline" className={cn("text-foreground", STATUS_TONE[w.status] ?? "")}>{w.status.replace(/_/g, " ")}</Badge> },
          ]}
        />
      </Panel>

      {d.byTeam && d.byTeam.length > 0 && (
        <Panel title="By team" footer={<SourceLine source={source} baseline={baseline} />} testId="panel-backlog-by-team">
          <RankingTable
            testId="backlog-by-team"
            rows={d.byTeam}
            rowKey={(t) => t.teamId}
            defaultSort={{ key: "hours", dir: "desc" }}
            dense
            columns={[
              { key: "team", header: "Team", sortValue: (t) => t.teamName, render: (t) => <Link href={`/mission-control/backlog?team=${t.teamId}`} className="font-medium hover:underline">{t.teamName}</Link> },
              { key: "hours", header: "Hours at stake / wk", align: "right", sortValue: (t) => t.hoursAtStake, render: (t) => `${(t.hoursAtStake ?? 0).toFixed(1)}h` },
              { key: "candidates", header: "Candidates", align: "right", sortValue: (t) => t.candidates, render: (t) => t.candidates },
              { key: "nextWave", header: "Next wave", align: "right", sortValue: (t) => t.nextWave ?? 0, render: (t) => t.nextWave ?? "—" },
              { key: "shipped", header: "Shipped", align: "right", sortValue: (t) => t.shipped ?? 0, render: (t) => t.shipped ?? "—" },
            ]}
          />
        </Panel>
      )}
    </div>
  )
}
