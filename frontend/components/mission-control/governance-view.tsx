"use client"

import Link from "next/link"
import { DownloadIcon, ShieldCheckIcon, ScaleIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useMe } from "@/hooks/use-me"
import { useGovernance } from "@/hooks/mc/use-mc"
import { personName, teamName } from "@/hooks/mc/normalise"
import type { Assignment, Governance } from "@/hooks/mc/types"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { McHeader } from "./mc-header"
import { Panel, QueryState, SourceLine } from "./states"
import { RankingTable } from "./ranking-table"
import { NotConfigured } from "./not-configured"
import { BoundaryDot } from "./skills-view"
import { jsonDownload, stamp } from "./csv-download"
import { RoleGate } from "./role-gate"

export function GovernanceView() {
  return (
    <RoleGate roles={["sponsor", "admin"]} surface="Mission Control">
      <Inner />
    </RoleGate>
  )
}

function Inner() {
  const q = useGovernance()
  const me = useMe()
  return (
    <>
      <McHeader
        title="Governance"
        description="Who approved what, with which grade; where the live plugin assignment has drifted from what you intended; and the Compliance API feed."
        filters={false}
        actions={
          <Button variant="outline" size="sm" disabled={!q.data} onClick={() => q.data && jsonDownload(`activate-audit-${me.org?.slug ?? "org"}-${stamp()}`, { exportedAt: new Date().toISOString(), org: me.org, ...q.data })} data-testid="audit-export">
            <DownloadIcon data-icon="inline-start" /> Audit export (JSON)
          </Button>
        }
      />
      <QueryState query={q}>{(d) => <Body d={d} />}</QueryState>
    </>
  )
}

export const MODE_LABEL: Record<string, string> = { hidden: "Hidden", available: "Available", auto: "Auto-installed", auto_installed: "Auto-installed" }

export function DriftBadge({ a }: { a: Assignment }) {
  if (!a.drift) return <Badge variant="outline" className="border-pass/40 bg-pass-soft text-foreground">In sync</Badge>
  return <Badge variant="outline" className="border-fail/40 bg-fail-soft text-foreground" data-testid="drift-badge">Drift</Badge>
}

export function driftHint(a: Assignment) {
  if (!a.drift) return null
  const obs = a.observedMode ? MODE_LABEL[a.observedMode] : "not assigned"
  return `Set ${a.plugin} to "${MODE_LABEL[a.intendedMode]}" for ${teamName(a.team)} in Claude admin → Plugins (live: ${obs}).`
}

function Body({ d }: { d: Governance }) {
  const me = useMe()
  const configured = d.complianceFeed?.configured ?? (d.eventsSource ? d.eventsSource === "compliance_api" : Boolean((me.org?.settings as { claudeComplianceConfigured?: boolean } | undefined)?.claudeComplianceConfigured))
  // "Configured" is not "live": a key can be present but rejected (scopes, network). Only claim
  // the Compliance API as the source when the rows actually came from it.
  const live = (d.complianceFeed?.source ?? d.eventsSource ?? (configured ? "compliance_api" : "audit_log")) === "compliance_api"
  const feedDetail = d.complianceFeed?.detail
  const events = d.complianceFeed?.events ?? d.events ?? []
  const boundaryVersion = d.boundary?.version
  return (
    <div className="space-y-6 animate-rise">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={<span className="inline-flex items-center gap-2"><ScaleIcon className="size-4" /> Usage policy</span>} description={`Version ${d.policy?.version ?? "—"}${d.policy?.updatedAt ? ` · updated ${fmt.date(d.policy.updatedAt)}` : ""}`} actions={<Button size="xs" variant="ghost" render={<Link href="/admin/policy" />}>Edit</Button>} testId="panel-policy">
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{d.policy?.text || "No usage policy written yet."}</p>
        </Panel>
        <Panel title={<span className="inline-flex items-center gap-2"><ShieldCheckIcon className="size-4" /> Compliance boundary</span>} description={boundaryVersion != null ? `Version ${boundaryVersion}${d.boundary.updatedAt ? ` · updated ${fmt.date(d.boundary.updatedAt)}` : ""}` : "Every skill must declare against this."} actions={<Button size="xs" variant="ghost" render={<Link href="/admin/policy" />}>Edit</Button>} testId="panel-boundary">
          <div className="grid gap-3 sm:grid-cols-2">
            <ChipGroup label="Allowed data classes" items={d.boundary?.allowedDataClasses} tone="pass" />
            <ChipGroup label="Forbidden data classes" items={d.boundary?.forbiddenDataClasses} tone="fail" />
            <ChipGroup label="Read-only systems" items={d.boundary?.readOnlySystems} tone="info" />
            <ChipGroup label="Human review points" items={d.boundary?.humanReviewPoints} tone="revise" />
          </div>
        </Panel>
      </div>

      <Panel title="Promotion log" description="Every merge into the marketplace repo: who approved, when, and the grade at the time." footer={<SourceLine source="Activate promotion queue + git history" baseline="Grader rubric threshold at time of approval" />} testId="panel-promotion-log">
        <RankingTable
          testId="promotion-log"
          rows={d.promotionLog ?? []}
          rowKey={(r) => `${r.at}-${typeof r.skill === "string" ? r.skill : r.skill.id}-${r.version}-${r.decision}`}
          defaultSort={{ key: "at", dir: "desc" }}
          dense
          emptyLabel="No promotions yet."
          columns={[
            { key: "at", header: "When", sortValue: (r) => r.at, render: (r) => <span className="text-muted-foreground">{fmt.date(r.at)}</span> },
            { key: "skill", header: "Skill", sortValue: (r) => personName(r.skill), render: (r) => (typeof r.skill === "string" ? <span className="font-medium">{r.skill}</span> : <Link href={`/library/${r.skill.slug}`} className="font-medium hover:underline">{r.skill.name}</Link>) },
            { key: "version", header: "Version", render: (r) => <span className="tabular">v{r.version}</span> },
            { key: "approvers", header: "Approvers", render: (r) => <span className="text-muted-foreground">{(r.approvers ?? []).map(personName).join(", ") || "—"}</span> },
            { key: "grade", header: "Grade", align: "right", sortValue: (r) => r.grade, render: (r) => (r.grade != null ? fmt.score(r.grade) : "—") },
            { key: "decision", header: "Decision", render: (r) => <Badge variant="outline" className={cn(r.decision === "approved" || r.decision === "merged" ? "border-pass/40 bg-pass-soft" : "border-revise/40 bg-revise-soft", "text-foreground")}>{r.decision}</Badge> },
          ]}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Compliance-touch skills" description="Skills whose boundary declares human-review points or reads a restricted class. These require Compliance approval to promote." testId="panel-compliance-touch">
          {(d.complianceTouch ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No skills touch a compliance boundary.</p>
          ) : (
            <ul className="divide-y">
              {d.complianceTouch.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-1.5" data-testid="compliance-touch-skill">
                  <Link href={`/library/${s.slug}`} className="flex items-center gap-2 hover:underline">
                    <BoundaryDot badge={s.boundaryBadge} />
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">v{s.version}</span>
                  </Link>
                  <span className="text-xs text-muted-foreground">{s.team?.name ?? "Shared"} · {s.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Assignment drift" description="Intended plugin ↔ group mode vs what Claude admin reports." footer={<SourceLine source="Activate assignments + Admin API" baseline="intended mode set in Marketplace repo" />} testId="panel-drift">
          <RankingTable
            testId="drift-table"
            rows={d.drift ?? []}
            rowKey={(a) => `${a.plugin}-${typeof a.team === "string" ? a.team : a.team.id}`}
            defaultSort={{ key: "drift", dir: "desc" }}
            dense
            emptyLabel="No assignments recorded."
            columns={[
              { key: "plugin", header: "Plugin", sortValue: (a) => a.plugin, render: (a) => <span className="font-mono text-xs">{a.plugin}</span> },
              { key: "team", header: "Team", sortValue: (a) => teamName(a.team), render: (a) => teamName(a.team) },
              { key: "intended", header: "Intended", render: (a) => MODE_LABEL[a.intendedMode] ?? a.intendedMode },
              { key: "observed", header: "Observed", render: (a) => <span className={a.drift ? "text-fail" : "text-muted-foreground"}>{a.observedMode ? MODE_LABEL[a.observedMode] : "unknown"}</span> },
              { key: "drift", header: "", sortValue: (a) => (a.drift ? 1 : 0), render: (a) => (
                <div className="flex flex-col items-start gap-1">
                  <DriftBadge a={a} />
                  {a.drift && <span className="max-w-64 text-[11px] leading-snug text-muted-foreground" data-testid="drift-hint">{driftHint(a)}</span>}
                </div>
              ) },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Compliance API events" description={live ? "Skill sharing, role assignment and plugin changes from your Claude Enterprise org." : configured ? "Compliance key present but the feed is unavailable; showing Activate's own audit log instead." : "Falls back to Activate's own audit log until the Compliance key is added."} footer={<SourceLine source={live ? "Claude Compliance API" : "Activate audit log"} baseline="n/a (event feed)" />} testId="panel-events">
        {!configured && <NotConfigured kind="claude_compliance" feature="The Compliance API event feed" className="mb-4" />}
        {configured && !live && (
          <p className="mb-4 rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground" data-testid="compliance-feed-unavailable" role="status">
            Compliance API feed unavailable{feedDetail ? `: ${feedDetail}` : ""}. Rows below are from Activate&apos;s audit log. Check the key&apos;s scopes under <Link href="/admin/integrations" className="underline underline-offset-4">Integrations &amp; Keys</Link>.
          </p>
        )}
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events in range.</p>
        ) : (
          <ol className="divide-y">
            {events.slice(0, 50).map((e, i) => (
              <li key={`${e.at}-${i}`} className="grid grid-cols-[9rem_10rem_1fr] gap-3 py-1.5 text-sm" data-testid="gov-event">
                <span className="text-muted-foreground tabular">{fmt.date(e.at)}</span>
                <span className="truncate font-mono text-xs">{e.type}</span>
                <span className="truncate">
                  <span className="text-muted-foreground">{personName(e.actor)}</span> · {e.detail}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  )
}

export function ChipGroup({ label, items, tone = "info", testId }: { label: string; items?: string[]; tone?: "pass" | "fail" | "info" | "revise"; testId?: string }) {
  const toneCls = { pass: "border-pass/40 bg-pass-soft", fail: "border-fail/40 bg-fail-soft", info: "border-info/40 bg-info-soft", revise: "border-revise/40 bg-revise-soft" }[tone]
  return (
    <div data-testid={testId}>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">
        {(items ?? []).length === 0 && <span className="text-xs italic text-muted-foreground">none declared</span>}
        {(items ?? []).map((it) => (
          <span key={it} className={cn("rounded-full border px-2 py-0.5 font-mono text-[11px]", toneCls)}>
            {it}
          </span>
        ))}
      </div>
    </div>
  )
}
