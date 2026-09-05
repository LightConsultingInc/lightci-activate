"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeftRightIcon, TrophyIcon, InfoIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useMe } from "@/hooks/use-me"
import { useGroups, useGroupsCompare } from "@/hooks/mc/use-mc"
import { useMcFilters } from "@/hooks/mc/use-mc-filters"
import type { GroupRow, Groups, GroupsCompare } from "@/hooks/mc/types"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { McHeader } from "./mc-header"
import { Panel, QueryState, SourceLine, DashboardSkeleton } from "./states"
import { RankingTable } from "./ranking-table"
import { RungMixBar } from "./heatmap"
import { Bar01 } from "./adoption-view"
import { RoleGate } from "./role-gate"

export function GroupsView() {
  return (
    <RoleGate roles={["sponsor", "admin"]} surface="Mission Control">
      <Inner />
    </RoleGate>
  )
}

function Inner() {
  const q = useGroups()
  const { teamId } = useMcFilters()
  return (
    <>
      <McHeader title="Groups" description="Which teams are performing, normalised for size and start date. Cohort trends over rankings." filters={{ team: true, range: false }} />
      <QueryState query={q}>{(d) => <Body key={teamId ?? "all"} d={d} teamId={teamId} />}</QueryState>
    </>
  )
}

const METRICS: { key: keyof GroupRow; label: string; fmt: (v: number) => string; higherIsBetter: boolean; perPerson?: boolean }[] = [
  { key: "activePct", label: "Active on real work", fmt: (v) => fmt.pct(v), higherIsBetter: true },
  { key: "hoursBackPerPerson", label: "Hours back / person / wk", fmt: (v) => `${v.toFixed(1)}h`, higherIsBetter: true },
  { key: "skillsPublished", label: "Skills published per 10 people", fmt: (v) => v.toFixed(1), higherIsBetter: true, perPerson: true },
  { key: "skillsAdopted", label: "Skills adopted per 10 people", fmt: (v) => v.toFixed(1), higherIsBetter: true, perPerson: true },
  { key: "promotionThroughput", label: "Promotions / wk", fmt: (v) => v.toFixed(2), higherIsBetter: true },
  { key: "reworkRate", label: "Rework rate (revise ÷ pass)", fmt: (v) => fmt.pct(v), higherIsBetter: false },
  { key: "championQueueAgeDays", label: "Champion queue age", fmt: (v) => `${v.toFixed(1)}d`, higherIsBetter: false },
]

function Body({ d, teamId }: { d: Groups; teamId: string | null }) {
  const me = useMe()
  const leaderboardsAllowed = Boolean((me.org?.settings as { leaderboardsEnabled?: boolean } | undefined)?.leaderboardsEnabled)
  const [leaderboard, setLeaderboard] = useState(false)
  const [compare, setCompare] = useState(false)
  const groups = d.groups ?? []
  const [a, setA] = useState<string | null>(teamId ?? groups[0]?.teamId ?? null)
  const [b, setB] = useState<string | null>(groups.find((g) => g.teamId !== (teamId ?? groups[0]?.teamId))?.teamId ?? null)
  const cmp = useGroupsCompare(compare ? a : null, compare ? b : null)
  const source = d.source ?? "Analytics API + Activate"
  const baseline = d.baseline ?? "team baselines · program start date"
  const ranked = leaderboard && leaderboardsAllowed

  return (
    <div className="space-y-6 animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant={compare ? "default" : "outline"} size="sm" onClick={() => setCompare((v) => !v)} data-testid="compare-toggle" aria-pressed={compare}>
            <ArrowLeftRightIcon data-icon="inline-start" /> Compare two groups
          </Button>
          {compare && (
            <>
              <GroupPick value={a} onChange={setA} groups={groups} testId="compare-a" />
              <span className="text-xs text-muted-foreground">vs</span>
              <GroupPick value={b} onChange={setB} groups={groups} testId="compare-b" />
            </>
          )}
        </div>
        {leaderboardsAllowed ? (
          <Label className="gap-2 text-xs text-muted-foreground" data-testid="leaderboard-toggle-wrap">
            <TrophyIcon className="size-3.5" /> Leaderboard ranking
            <Switch checked={leaderboard} onCheckedChange={setLeaderboard} size="sm" data-testid="leaderboard-toggle" />
          </Label>
        ) : (
          <p className="flex max-w-md items-start gap-1.5 text-xs text-muted-foreground" data-testid="leaderboard-off-note">
            <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Leaderboards are off for {me.org?.name ?? "this firm"}. In regulated teams a ranked list breeds anxiety at the bottom and suppresses the reporting compliance depends on. Cohort trends are shown instead; an admin can opt in under{" "}
              <Link href="/admin/policy" className="underline underline-offset-4">Policy & Boundary</Link>.
            </span>
          </p>
        )}
      </div>

      {compare && a && b && a !== b && (
        <QueryState query={cmp} skeleton={<DashboardSkeleton tiles={2} />}>
          {(c) => <CompareCard c={c} fallbackA={groups.find((g) => g.teamId === a)} fallbackB={groups.find((g) => g.teamId === b)} source={source} />}
        </QueryState>
      )}
      {compare && a === b && <p className="text-sm text-revise">Pick two different groups to compare.</p>}

      <Panel title={ranked ? "Groups, ranked" : "Groups"} description={ranked ? "Ranked by hours back per person. Remember what this does to the bottom of the list." : "Alphabetical. Sort any column; nothing here is a scoreboard."} footer={<SourceLine source={source} baseline={baseline} />} testId="panel-groups">
        <RankingTable
          testId="groups-table"
          rowTestId="group-row"
          rows={teamId ? groups.filter((g) => g.teamId === teamId) : groups}
          rowKey={(g) => g.teamId}
          defaultSort={ranked ? { key: "hoursBackPerPerson", dir: "desc" } : { key: "team", dir: "asc" }}
          columns={[
            ...(ranked ? [{ key: "rank", header: "#", sortable: false, render: (g: GroupRow) => <span className="tabular text-muted-foreground">{[...groups].sort((x, y) => y.hoursBackPerPerson - x.hoursBackPerPerson).findIndex((x) => x.teamId === g.teamId) + 1}</span> }] : []),
            { key: "team", header: "Team", sortValue: (g) => g.teamName, render: (g) => (
              <div>
                <div className="font-medium">{g.teamName}</div>
                <div className="text-xs text-muted-foreground">{g.size} people{g.programStartedOn ? ` · since ${fmt.dateShort(g.programStartedOn)}` : ""}</div>
              </div>
            ) },
            { key: "activePct", header: "Active", align: "right", sortValue: (g) => g.activePct, render: (g) => <Bar01 value={g.activePct} /> },
            { key: "rungMix", header: "Rung mix", sortValue: (g) => weightedRung(g.rungMix), render: (g) => <RungMixBar counts={g.rungMix} className="w-28" /> },
            { key: "hoursBackPerPerson", header: "Hours back / person", align: "right", sortValue: (g) => g.hoursBackPerPerson, render: (g) => `${g.hoursBackPerPerson.toFixed(1)}h` },
            { key: "skills", header: "Published / adopted", align: "right", sortValue: (g) => g.skillsPublished, render: (g) => `${g.skillsPublished} / ${g.skillsAdopted}` },
            { key: "promotionThroughput", header: "Promotions / wk", align: "right", sortValue: (g) => g.promotionThroughput, render: (g) => g.promotionThroughput.toFixed(2) },
            { key: "reworkRate", header: "Rework", align: "right", sortValue: (g) => g.reworkRate, render: (g) => <span className={g.reworkRate > 0.5 ? "text-revise" : ""}>{fmt.pct(g.reworkRate)}</span> },
            { key: "queue", header: "Champion queue", align: "right", sortValue: (g) => g.championQueueAgeDays, render: (g) => <span className={g.championQueueAgeDays > 5 ? "text-fail" : ""}>{g.championQueueAgeDays.toFixed(1)}d</span> },
          ]}
        />
      </Panel>
    </div>
  )
}

function weightedRung(mix: number[]) {
  const n = mix.reduce((a, b) => a + b, 0) || 1
  return mix.reduce((a, c, i) => a + c * i, 0) / n
}

function GroupPick({ value, onChange, groups, testId }: { value: string | null; onChange: (v: string) => void; groups: GroupRow[]; testId: string }) {
  return (
    <Select value={value ?? ""} onValueChange={(v) => v && onChange(v as string)}>
      <SelectTrigger size="sm" className="min-w-40" data-testid={testId}>
        <SelectValue>{(v: string) => groups.find((g) => g.teamId === v)?.teamName ?? "Pick a group"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {groups.map((g) => (
          <SelectItem key={g.teamId} value={g.teamId}>
            {g.teamName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function CompareCard({ c, fallbackA, fallbackB, source }: { c: GroupsCompare; fallbackA?: GroupRow; fallbackB?: GroupRow; source: string }) {
  const A = c.a ?? fallbackA
  const B = c.b ?? fallbackB
  const rows = useMemo(() => {
    if (c.metrics?.length) return c.metrics.map((m) => ({ ...m, format: (v: number) => (m.unit === "%" ? fmt.pct(v) : m.unit ? `${v.toFixed(1)}${m.unit}` : v.toFixed(1)), higherIsBetter: m.higherIsBetter ?? true }))
    if (!A || !B) return []
    return METRICS.map((m) => {
      const norm = (g: GroupRow) => {
        const raw = Number(g[m.key] ?? 0)
        return m.perPerson ? (raw / Math.max(1, g.size)) * 10 : raw
      }
      return { key: String(m.key), label: m.label, a: norm(A), b: norm(B), format: m.fmt, higherIsBetter: m.higherIsBetter }
    })
  }, [c, A, B])
  if (!A || !B) return null
  return (
    <Panel title={`${A.teamName} vs ${B.teamName}`} description={`Normalised ${c.normalisedFor?.join(", ") ?? "per person and for program start date"}.`} footer={<SourceLine source={source} baseline={`${A.teamName}: ${A.size} people${A.programStartedOn ? ` since ${fmt.dateShort(A.programStartedOn)}` : ""} · ${B.teamName}: ${B.size} people${B.programStartedOn ? ` since ${fmt.dateShort(B.programStartedOn)}` : ""}`} />} testId="compare-card">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
        <div className="text-right font-display text-lg" data-testid="compare-a-name">{A.teamName}</div>
        <div />
        <div className="font-display text-lg" data-testid="compare-b-name">{B.teamName}</div>
        <div className="col-span-3 flex gap-4">
          <RungMixBar counts={A.rungMix} className="flex-1" />
          <span className="w-32 text-center text-[11px] text-muted-foreground">rung mix</span>
          <RungMixBar counts={B.rungMix} className="flex-1" />
        </div>
        {rows.map((r) => {
          const max = Math.max(r.a, r.b) || 1
          const aWins = r.higherIsBetter ? r.a > r.b : r.a < r.b
          const tie = r.a === r.b
          return (
            <CompareRow key={r.key} label={r.label} a={r.format(r.a)} b={r.format(r.b)} aw={r.a / max} bw={r.b / max} aWins={!tie && aWins} bWins={!tie && !aWins} />
          )
        })}
      </div>
    </Panel>
  )
}

function CompareRow({ label, a, b, aw, bw, aWins, bWins }: { label: string; a: string; b: string; aw: number; bw: number; aWins: boolean; bWins: boolean }) {
  return (
    <>
      <div className="flex items-center justify-end gap-2" data-testid="compare-row-a">
        <span className={cn("tabular", aWins && "font-medium")}>{a}</span>
        <span className="h-2 w-28 rounded-l-sm bg-muted"><span className="float-right block h-full rounded-l-sm" style={{ width: `${aw * 100}%`, background: aWins ? "var(--glow)" : "var(--muted-foreground)" }} /></span>
      </div>
      <div className="w-40 text-center text-xs text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2" data-testid="compare-row-b">
        <span className="h-2 w-28 rounded-r-sm bg-muted"><span className="block h-full rounded-r-sm" style={{ width: `${bw * 100}%`, background: bWins ? "var(--glow)" : "var(--muted-foreground)" }} /></span>
        <span className={cn("tabular", bWins && "font-medium")}>{b}</span>
      </div>
    </>
  )
}
