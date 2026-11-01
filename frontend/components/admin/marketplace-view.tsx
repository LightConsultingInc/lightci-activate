"use client"

import { toast } from "sonner"
import { GitBranchIcon, GitCommitHorizontalIcon, RefreshCwIcon, ExternalLinkIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useAssignments, useMarketplaceMutations, useMarketplaceStatus, useOrg, useSetup, useTeams } from "@/hooks/mc/use-mc"
import { teamIdOf, teamName } from "@/hooks/mc/normalise"
import type { Assignment, AssignmentMode } from "@/hooks/mc/types"
import { fmt } from "@/lib/format"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Panel, QueryState, SourceLine } from "@/components/mission-control/states"
import { RoleGate, useCanAdmin } from "@/components/mission-control/role-gate"
import { DriftBadge, MODE_LABEL, driftHint } from "@/components/mission-control/governance-view"
import { AdminHeader } from "./admin-header"
import { SetupChecklist } from "./setup-checklist"

// Matches the API vocabulary (skill-assignment.entity.ts): hidden | available | auto.
const MODES: AssignmentMode[] = ["hidden", "available", "auto"]

export function MarketplaceView() {
  return (
    <RoleGate roles={["sponsor", "admin"]} surface="Company admin">
      <Inner />
    </RoleGate>
  )
}

function Inner() {
  const status = useMarketplaceStatus()
  const assignments = useAssignments()
  const teams = useTeams()
  const setup = useSetup()
  const org = useOrg()
  const canWrite = useCanAdmin()
  const { sync, assign } = useMarketplaceMutations()
  const repoUrl = org.data?.marketplaceRepo?.provider === "github" && org.data.marketplaceRepo.owner && org.data.marketplaceRepo.repo ? `https://github.com/${org.data.marketplaceRepo.owner}/${org.data.marketplaceRepo.repo}` : null

  return (
    <>
      <AdminHeader
        title="Marketplace repo"
        description="The client-owned <firm>-claude-marketplace repository is the source of truth for published skills. Promotions merge into it; Claude Enterprise syncs from it."
        actions={
          canWrite && (
            <Button size="sm" disabled={sync.isPending} data-testid="marketplace-sync" onClick={() => sync.mutate(undefined, { onSuccess: () => toast.success("Repo synced", { description: "Published skills re-read from the repo." }), onError: (e) => toast.error("Sync failed", { description: e instanceof ApiError ? e.detail : String(e) }) })}>
              <RefreshCwIcon data-icon="inline-start" className={sync.isPending ? "animate-spin" : ""} /> {sync.isPending ? "Syncing…" : "Sync now"}
            </Button>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr] animate-rise">
        <div className="space-y-4">
          <QueryState query={status} skeleton={<Skeleton className="h-56 rounded-xl" />}>
            {(s) => (
              <Panel title={<span className="inline-flex items-center gap-2"><GitBranchIcon className="size-4" /> Repository</span>} description={s.mode === "github" ? "Linked to GitHub. Promotions open pull requests." : s.mode === "git" ? "Linked to a Git remote. Publishing pushes to it." : "Local working tree. Link a repository to publish for real."} testId="repo-status">
                <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">Repo</dt>
                  <dd className="truncate font-mono text-xs">{repoUrl ? <a href={repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">{s.repo ?? repoUrl} <ExternalLinkIcon className="size-3" /></a> : s.repo ?? "not linked"}</dd>
                  <dt className="text-muted-foreground">Branch</dt>
                  <dd className="font-mono text-xs">{s.branch}</dd>
                  <dt className="text-muted-foreground">Head</dt>
                  <dd className="inline-flex items-center gap-1 font-mono text-xs"><GitCommitHorizontalIcon className="size-3" /> {s.head ? s.head.slice(0, 10) : "—"} {s.dirty && <Badge variant="outline" className="border-revise/40 bg-revise-soft text-foreground" data-testid="repo-dirty">uncommitted changes</Badge>}</dd>
                  <dt className="text-muted-foreground">Contents</dt>
                  <dd className="tabular">{s.pluginCount} plugins · {s.skillCount} skills</dd>
                  <dt className="text-muted-foreground">Last sync</dt>
                  <dd>{s.lastSyncAt ? `${fmt.ago(s.lastSyncAt)} (${fmt.date(s.lastSyncAt)})` : "never"}</dd>
                  <dt className="text-muted-foreground">Mode</dt>
                  <dd><Badge variant="outline" className={cn("text-foreground", s.mode === "github" || s.mode === "git" ? "border-pass/40 bg-pass-soft" : "border-border")}>{s.mode}</Badge></dd>
                  {s.lastError && (
                    <>
                      <dt className="text-muted-foreground">Last problem</dt>
                      <dd className="text-xs text-fail" data-testid="repo-last-error">{s.lastError}</dd>
                    </>
                  )}
                </dl>
              </Panel>
            )}
          </QueryState>

          <QueryState query={setup} skeleton={<Skeleton className="h-72 rounded-xl" />}>
            {(s) => (
              <Panel title="Provisioning checklist" description="Everything a client needs before kickoff. Steps link to where they are done." testId="panel-setup">
                <SetupChecklist steps={s.steps ?? []} readOnly={!canWrite} />
              </Panel>
            )}
          </QueryState>
        </div>

        <QueryState query={assignments} skeleton={<Skeleton className="h-96 rounded-xl" />}>
          {(rows) => (
            <Panel title="Plugin ↔ team assignment" description="Intended mode is what you want in Claude admin → Plugins. Observed comes from the Admin API; drift means they disagree." footer={<SourceLine source="Activate assignments + Admin API (observed)" baseline="intended mode" />} testId="panel-assignments">
              <AssignmentMatrix rows={rows} teamsById={Object.fromEntries((teams.data ?? []).map((t) => [t.id, t.name]))} canWrite={canWrite} onChange={(a, mode) => assign.mutateAsync({ plugin: a.plugin, teamId: teamIdOf(a), intendedMode: mode }).then(() => toast.success(`${a.plugin} → ${teamName(a.team)}: ${MODE_LABEL[mode]}`)).catch((e) => toast.error("Couldn't save assignment", { description: e instanceof ApiError ? e.detail : String(e) }))} />
            </Panel>
          )}
        </QueryState>
      </div>
    </>
  )
}

function AssignmentMatrix({ rows, teamsById, canWrite, onChange }: { rows: Assignment[]; teamsById: Record<string, string>; canWrite: boolean; onChange: (a: Assignment, mode: AssignmentMode) => void }) {
  const plugins = Array.from(new Set(rows.map((r) => r.plugin))).sort()
  const teamIds = Array.from(new Set(rows.map(teamIdOf)))
  const byKey = new Map(rows.map((r) => [`${r.plugin}|${teamIdOf(r)}`, r]))
  if (!rows.length) return <p className="text-sm text-muted-foreground">No plugins in the repo yet. Sync after the first promotion merges.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="assignment-matrix">
        <thead>
          <tr>
            <th className="px-2 pb-2 text-left text-xs font-medium text-muted-foreground">Plugin</th>
            {teamIds.map((id) => (
              <th key={id} className="px-2 pb-2 text-left text-xs font-medium text-muted-foreground">{teamsById[id] ?? teamName(rows.find((r) => teamIdOf(r) === id)?.team)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {plugins.map((p) => (
            <tr key={p} className="border-t" data-testid="assignment-row">
              <td className="px-2 py-2 font-mono text-xs">{p}</td>
              {teamIds.map((id) => {
                const a = byKey.get(`${p}|${id}`)
                if (!a) return <td key={id} className="px-2 py-2 text-xs text-muted-foreground">—</td>
                return (
                  <td key={id} className="px-2 py-2 align-top">
                    <div className="flex flex-col gap-1">
                      <Select value={a.intendedMode} disabled={!canWrite} onValueChange={(v) => v && v !== a.intendedMode && onChange(a, v as AssignmentMode)}>
                        <SelectTrigger size="sm" className="min-w-32" data-testid="assignment-select" data-plugin={p} data-team={id}>
                          <SelectValue>{(v: string) => MODE_LABEL[v] ?? v}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {MODES.map((m) => (
                            <SelectItem key={m} value={m}>{MODE_LABEL[m]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span>observed: {a.observedMode ? MODE_LABEL[a.observedMode] : "unknown"}</span>
                        <DriftBadge a={a} />
                      </div>
                      {a.drift && <p className="max-w-52 text-[11px] leading-snug text-muted-foreground">{driftHint(a)}</p>}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
