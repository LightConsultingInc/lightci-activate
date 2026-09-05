"use client"

import { useRouter } from "next/navigation"
import { SparklesIcon, TrendingUpIcon, PauseCircleIcon } from "lucide-react"
import { RungBadge } from "@/components/brand/rung"
import { Badge } from "@/components/ui/badge"
import { useMcPeople } from "@/hooks/mc/use-mc"
import { useMcFilters } from "@/hooks/mc/use-mc-filters"
import type { McPerson, McPeople } from "@/hooks/mc/types"
import { fmt } from "@/lib/format"
import { McHeader } from "./mc-header"
import { Panel, QueryState, SourceLine } from "./states"
import { RankingTable } from "./ranking-table"
import { ScoreBar, ScoreLegend } from "./score-bar"
import { PersonCell } from "./person-cell"
import { RoleGate } from "./role-gate"

export function PeopleView() {
  return (
    <RoleGate roles={["sponsor", "admin"]} surface="Mission Control">
      <Inner />
    </RoleGate>
  )
}

function Inner() {
  const q = useMcPeople()
  const { teamId } = useMcFilters()
  return (
    <>
      <McHeader title="People" description="Who is moving, who is stuck, and who should be grading others. Scores are shown as their components, never alone." filters={{ team: true, range: false }} />
      <QueryState query={q}>{(d) => <Body d={d} teamId={teamId} />}</QueryState>
    </>
  )
}

function Body({ d, teamId }: { d: McPeople; teamId: string | null }) {
  const router = useRouter()
  const people = (d.people ?? []).filter((p) => !teamId || p.teamId === teamId)
  const rising = people.filter((p) => p.rising)
  const stalled = people.filter((p) => p.stalled)
  const champions = people.filter((p) => p.championCandidate)
  const go = (p: McPerson) => router.push(`/people/${p.id}`)
  const source = d.source ?? "Activate ladder + Analytics API"
  const baseline = d.baseline ?? "person baseline (minutes/week before Activate)"

  return (
    <div className="space-y-6 animate-rise">
      <div className="grid gap-4 lg:grid-cols-3">
        <Section icon={<TrendingUpIcon className="size-4 text-pass" />} title="Rising" count={rising.length} description="Fastest rung progression, last 30 days." people={rising} go={go} testId="people-rising" render={(p) => <RungBadge rung={p.rung} showName={false} />} />
        <Section icon={<PauseCircleIcon className="size-4 text-revise" />} title="Stalled" count={stalled.length} description="No progression past the stall threshold, or activity down more than half." people={stalled} go={go} testId="people-stalled" render={(p) => <span className="text-xs text-muted-foreground">{p.stalledReason ? reasonLabel(p.stalledReason) : "reason unknown"}</span>} />
        <Section icon={<SparklesIcon className="size-4 text-glow-foreground" />} title="Champion candidates" count={champions.length} description="High influence and grade quality, not yet L5." people={champions} go={go} testId="people-champions" render={(p) => <span className="tabular text-xs text-muted-foreground">{p.adoptedByOthers} adopters</span>} />
      </div>

      <Panel title={`Ranking · ${people.length} people`} description="Click a column to sort. Click a row for the person page." footer={<SourceLine source={source} baseline={baseline} />} testId="panel-people-ranking">
        <ScoreLegend className="mb-3" />
        <RankingTable
          testId="people-ranking"
          rowTestId="people-row"
          rows={people}
          rowKey={(p) => p.id}
          onRowClick={go}
          defaultSort={{ key: "rung", dir: "desc" }}
          columns={[
            { key: "person", header: "Person", sortValue: (p) => p.name, render: (p) => <PersonCell person={p} sub={p.teamName ?? p.title ?? undefined} /> },
            { key: "rung", header: "Rung", sortValue: (p) => p.rung, render: (p) => <RungBadge rung={p.rung} showName={false} /> },
            { key: "hoursBack", header: "Hours back / wk", align: "right", sortValue: (p) => p.hoursBackPerWeek, render: (p) => <span className={p.baselineMinutesPerWeek === null ? "text-muted-foreground" : ""}>{p.hoursBackPerWeek.toFixed(1)}h</span> },
            { key: "skillsPublished", header: "Skills published", align: "right", sortValue: (p) => p.skillsPublished, render: (p) => p.skillsPublished },
            { key: "influence", header: "Influence", align: "right", sortValue: (p) => p.adoptedByOthers, render: (p) => <span title="Skills adopted by others">{p.adoptedByOthers}</span> },
            { key: "gradeQuality", header: "Grade quality", align: "right", sortValue: (p) => p.gradeQuality, render: (p) => fmt.pct(p.gradeQuality) },
            { key: "activeDays", header: "Active days / 30", align: "right", sortValue: (p) => p.activeDays30, render: (p) => p.activeDays30 },
            { key: "score", header: "Activation score (components)", sortValue: (p) => p.activationScore?.composite, render: (p) => (p.activationScore ? <ScoreBar composite={p.activationScore.composite} components={p.activationScore.components} /> : <span className="text-xs text-muted-foreground">—</span>) },
            {
              key: "flags",
              header: "",
              sortable: false,
              render: (p) => (
                <span className="flex gap-1">
                  {p.rising && <Badge variant="outline" className="border-pass/40 bg-pass-soft text-foreground">Rising</Badge>}
                  {p.stalled && <Badge variant="outline" className="border-revise/40 bg-revise-soft text-foreground">Stalled</Badge>}
                  {p.championCandidate && <Badge variant="outline" className="border-glow bg-glow-soft text-glow-foreground">Champion?</Badge>}
                </span>
              ),
            },
          ]}
        />
      </Panel>
    </div>
  )
}

function reasonLabel(r: string) {
  return ({ blocked: "blocked", no_time: "no time", tool_issue: "tool issue", not_relevant: "not relevant", activity_drop: "activity dropped" } as Record<string, string>)[r] ?? r.replace(/_/g, " ")
}

function Section({ icon, title, count, description, people, go, render, testId }: { icon: React.ReactNode; title: string; count: number; description: string; people: McPerson[]; go: (p: McPerson) => void; render: (p: McPerson) => React.ReactNode; testId: string }) {
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          {icon}
          {title}
          <span className="tabular rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{count}</span>
        </span>
      }
      description={description}
      testId={testId}
    >
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody in this bucket right now.</p>
      ) : (
        <ul className="divide-y">
          {people.slice(0, 6).map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => go(p)} className="flex w-full items-center justify-between gap-2 py-1.5 text-left hover:bg-muted/40" data-testid={`${testId}-item`}>
                <PersonCell person={p} sub={p.teamName ?? undefined} />
                {render(p)}
              </button>
            </li>
          ))}
          {people.length > 6 && <li className="pt-2 text-xs text-muted-foreground">+{people.length - 6} more in the ranking below</li>}
        </ul>
      )}
    </Panel>
  )
}
