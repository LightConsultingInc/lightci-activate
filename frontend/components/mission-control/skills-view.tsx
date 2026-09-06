"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useMcSkills } from "@/hooks/mc/use-mc"
import { useMcFilters } from "@/hooks/mc/use-mc-filters"
import type { McSkills, SkillCard, SkillHealthFlag } from "@/hooks/mc/types"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { McHeader } from "./mc-header"
import { MetricTile } from "./metric-tile"
import { Panel, QueryState, SourceLine } from "./states"
import { RankingTable } from "./ranking-table"
import { PersonCell } from "./person-cell"
import { Bar01 } from "./adoption-view"
import { RoleGate } from "./role-gate"

export const HEALTH_LABEL: Record<SkillHealthFlag, { label: string; tone: string; hint: string }> = {
  unused_30d: { label: "Unused 30d", tone: "border-revise/40 bg-revise-soft", hint: "No activations in 30 days. Built but not adopted." },
  grade_below_threshold: { label: "Grade below threshold", tone: "border-fail/40 bg-fail-soft", hint: "Latest Grader score is under the publish bar." },
  boundary_gap: { label: "Boundary gap", tone: "border-fail/40 bg-fail-soft", hint: "Declared boundary does not cover the data the skill reads." },
  owner_left: { label: "Owner left", tone: "border-revise/40 bg-revise-soft", hint: "Owner is inactive or gone. Needs a new owner." },
  overlapping_trigger: { label: "Overlapping trigger", tone: "border-info/40 bg-info-soft", hint: "Trigger line collides with another skill's." },
  pending_review: { label: "Pending review", tone: "border-info/40 bg-info-soft", hint: "Waiting in the promotion queue." },
}

export function HealthBadges({ flags, max = 3 }: { flags: SkillHealthFlag[]; max?: number }) {
  if (!flags?.length) return <Badge variant="outline" className="border-pass/40 bg-pass-soft text-foreground">Healthy</Badge>
  return (
    <span className="flex flex-wrap gap-1">
      {flags.slice(0, max).map((f) => (
        <Badge key={f} variant="outline" className={cn("text-foreground", HEALTH_LABEL[f]?.tone)} title={HEALTH_LABEL[f]?.hint}>
          {HEALTH_LABEL[f]?.label ?? f}
        </Badge>
      ))}
      {flags.length > max && <Badge variant="outline">+{flags.length - max}</Badge>}
    </span>
  )
}

export function BoundaryDot({ badge }: { badge: SkillCard["boundaryBadge"] }) {
  const c = badge === "green" ? "bg-pass" : badge === "amber" ? "bg-revise" : "bg-fail"
  return <span className={cn("inline-block size-2 rounded-full", c)} title={`Boundary: ${badge}`} />
}

export function SkillsView() {
  return (
    <RoleGate roles={["sponsor", "admin"]} surface="Mission Control">
      <Inner />
    </RoleGate>
  )
}

function Inner() {
  const q = useMcSkills()
  const { teamId } = useMcFilters()
  return (
    <>
      <McHeader title="Skills health" description="The library as an asset: what is used, what is rotting, what has no owner, and what needs a re-grade." filters={{ team: true, range: false }} />
      <QueryState query={q}>{(d) => <Body d={d} teamId={teamId} />}</QueryState>
    </>
  )
}

function Body({ d, teamId }: { d: McSkills; teamId: string | null }) {
  const inTeam = (s: SkillCard) => !teamId || s.team?.id === teamId
  // `health` carries every non-deprecated card with its flags. Older payloads sent only the
  // flagged ones; `byTeam.skills` still counts the whole library, so size the library from both.
  const health = (d.health ?? []).filter(inTeam)
  const counts = (Object.keys(HEALTH_LABEL) as SkillHealthFlag[]).map((k) => ({ key: k, n: health.filter((s) => s.health?.includes(k)).length }))
  const flagged = health.filter((s) => s.health?.length).length
  const libraryFromTeams = (d.byTeam ?? []).filter((t) => !teamId || t.teamId === teamId).reduce((a, t) => a + (t.skills ?? 0), 0)
  const librarySize = Math.max(health.length, libraryFromTeams)
  const healthy = Math.max(0, librarySize - flagged)
  const source = d.source ?? "Marketplace repo + Analytics API activations"
  const baseline = d.baseline ?? "prior 30 days"

  const skillCols = (extra?: { key: string; header: string; render: (s: SkillCard) => React.ReactNode; sortValue?: (s: SkillCard) => number | string | null }) => [
    { key: "skill", header: "Skill", sortValue: (s: SkillCard) => s.name, render: (s: SkillCard) => (
      <Link href={`/library/${s.slug}`} className="flex items-center gap-2 hover:underline" onClick={(e) => e.stopPropagation()}>
        <BoundaryDot badge={s.boundaryBadge} />
        <span className="font-medium">{s.name}</span>
        <span className="text-xs text-muted-foreground">v{s.version}</span>
      </Link>
    ) },
    { key: "team", header: "Team", sortValue: (s: SkillCard) => s.team?.name ?? "", render: (s: SkillCard) => <span className="text-muted-foreground">{s.team?.name ?? "Shared"}</span> },
    { key: "users", header: "Active users 30d", align: "right" as const, sortValue: (s: SkillCard) => s.activeUsers30d, render: (s: SkillCard) => s.activeUsers30d },
    { key: "runs", header: "Runs 30d", align: "right" as const, sortValue: (s: SkillCard) => s.runs30d, render: (s: SkillCard) => fmt.num(s.runs30d) },
    { key: "grade", header: "Grade", align: "right" as const, sortValue: (s: SkillCard) => s.grade?.score ?? null, render: (s: SkillCard) => (s.grade ? <span className={s.grade.decision === "pass" ? "" : "text-revise"}>{fmt.score(s.grade.score)}</span> : <span className="text-muted-foreground">ungraded</span>) },
    ...(extra ? [extra] : []),
  ]

  return (
    <div className="space-y-6 animate-rise">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="skills-tiles">
        <MetricTile testId="tile-skills-total" label="Skills in library" value={librarySize} sub={`${healthy} healthy · ${flagged} flagged`} source={source} baseline="n/a (count, excludes deprecated)" accent />
        {counts.filter((c) => c.n > 0).slice(0, 3).map((c) => (
          <MetricTile key={c.key} testId={`tile-flag-${c.key}`} label={HEALTH_LABEL[c.key].label} value={c.n} sub={HEALTH_LABEL[c.key].hint} source={source} baseline={baseline} delta={{ value: null, goodWhenUp: false }} />
        ))}
        {counts.filter((c) => c.n > 0).length === 0 && <MetricTile testId="tile-flags-none" label="Health flags" value={0} sub="Nothing flagged" source={source} baseline={baseline} />}
      </div>

      <Panel title="Health rollup" description="Every flag, with the skills carrying it." footer={<SourceLine source={source} baseline={baseline} />} testId="panel-health">
        <div className="mb-3 flex flex-wrap gap-2">
          {counts.map((c) => (
            <span key={c.key} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs", c.n ? HEALTH_LABEL[c.key].tone : "text-muted-foreground")} data-testid={`flag-count-${c.key}`}>
              {HEALTH_LABEL[c.key].label} <span className="tabular font-medium">{c.n}</span>
            </span>
          ))}
        </div>
        <RankingTable testId="skills-health-table" rows={health.filter((s) => s.health?.length)} rowKey={(s) => s.id} defaultSort={{ key: "flags", dir: "desc" }} dense emptyLabel="No flagged skills. The library is healthy." columns={skillCols({ key: "flags", header: "Flags", sortValue: (s) => s.health?.length ?? 0, render: (s) => <HealthBadges flags={s.health} /> })} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Most used" description="By active users, last 30 days." footer={<SourceLine source="Analytics API activations" baseline={baseline} />} testId="panel-most-used">
          <RankingTable testId="skills-most-used" rows={(d.mostUsed ?? []).filter(inTeam)} rowKey={(s) => s.id} defaultSort={{ key: "users", dir: "desc" }} dense columns={skillCols()} />
        </Panel>
        <Panel title="Least used" description="Built and published, rarely activated. Candidates to deprecate or re-trigger." footer={<SourceLine source="Analytics API activations" baseline={baseline} />} testId="panel-least-used">
          <RankingTable testId="skills-least-used" rows={(d.leastUsed ?? []).filter(inTeam)} rowKey={(s) => s.id} defaultSort={{ key: "users", dir: "asc" }} dense columns={skillCols()} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Usage by team" footer={<SourceLine source="Analytics API activations" baseline={baseline} />} testId="panel-usage-by-team">
          <RankingTable
            testId="skills-by-team"
            rows={(d.byTeam ?? []).filter((t) => !teamId || t.teamId === teamId)}
            rowKey={(t) => t.teamId}
            defaultSort={{ key: "act", dir: "desc" }}
            dense
            columns={[
              { key: "team", header: "Team", sortValue: (t) => t.teamName, render: (t) => <span className="font-medium">{t.teamName}</span> },
              { key: "act", header: "Activations", align: "right", sortValue: (t) => t.activations30d, render: (t) => fmt.num(t.activations30d) },
              { key: "share", header: "Share", align: "right", sortValue: (t) => t.activations30d, render: (t) => <Bar01 value={t.activations30d / Math.max(1, (d.byTeam ?? []).reduce((a, x) => a + x.activations30d, 0))} /> },
            ]}
          />
        </Panel>
        <Panel title="Skills without owners" description="Nobody accountable for the boundary or the next version." testId="panel-unowned">
          {(d.unowned ?? []).filter(inTeam).length === 0 ? (
            <p className="text-sm text-muted-foreground">Every skill has an owner.</p>
          ) : (
            <ul className="divide-y">
              {(d.unowned ?? []).filter(inTeam).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-1.5" data-testid="unowned-skill">
                  <Link href={`/library/${s.slug}`} className="flex items-center gap-2 hover:underline">
                    <BoundaryDot badge={s.boundaryBadge} />
                    <span className="text-sm font-medium">{s.name}</span>
                  </Link>
                  <span className="text-xs text-muted-foreground">{s.team?.name ?? "Shared"}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Re-grade queue" description="Scheduled re-grades where the score moved, or the rubric changed." testId="panel-regrade">
          {(d.regradeQueue ?? []).filter(inTeam).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing waiting for a re-grade.</p>
          ) : (
            <ul className="divide-y">
              {(d.regradeQueue ?? []).filter(inTeam).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-1.5" data-testid="regrade-item">
                  <div className="min-w-0">
                    <Link href={`/library/${s.slug}`} className="text-sm font-medium hover:underline">{s.name}</Link>
                    <div className="text-xs text-muted-foreground">
                      {s.previous != null && s.current != null ? `${fmt.score(s.previous)} → ${fmt.score(s.current)}` : s.reason ?? "scheduled"}
                      {s.owner && <> · <PersonCell person={s.owner} className="inline-flex align-middle" /></>}
                    </div>
                  </div>
                  <Button size="xs" variant="outline" render={<Link href={`/library/${s.slug}`} />}>Open</Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
