"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { DownloadCloudIcon, MailPlusIcon, PlusIcon, UsersIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { RungBadge } from "@/components/brand/rung"
import { usePeople, useTeamMutations, useTeams } from "@/hooks/mc/use-mc"
import type { Person, Role, Team } from "@/hooks/mc/types"
import { fmt } from "@/lib/format"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Panel, QueryState } from "@/components/mission-control/states"
import { RankingTable } from "@/components/mission-control/ranking-table"
import { PersonCell } from "@/components/mission-control/person-cell"
import { NotConfigured } from "@/components/mission-control/not-configured"
import { RoleGate, useCanAdmin } from "@/components/mission-control/role-gate"
import { AdminHeader } from "./admin-header"

const NONE = "__none__"
const ROLES: Role[] = ["learner", "champion", "sponsor", "admin"]

export function TeamsView() {
  return (
    <RoleGate roles={["sponsor", "admin"]} surface="Company admin">
      <Inner />
    </RoleGate>
  )
}

function Inner() {
  const teams = useTeams()
  const people = usePeople()
  const canWrite = useCanAdmin()
  const m = useTeamMutations()
  const [importErr, setImportErr] = useState<string | null>(null)
  const err = (e: unknown) => (e instanceof ApiError ? e.detail || e.title : String(e))

  return (
    <>
      <AdminHeader
        title="Teams & People"
        description="Teams mirror your Claude admin groups. Each has a champion, a plugin in the marketplace repo, and an in-program flag."
        actions={
          canWrite && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={m.importGroups.isPending}
                data-testid="import-groups"
                onClick={() =>
                  m.importGroups.mutate(undefined, {
                    onSuccess: (r) => {
                      setImportErr(null)
                      toast.success(`Imported ${r?.groups ?? 0} groups from Claude`, { description: `${r?.created ?? 0} teams created, ${r?.linked ?? 0} linked to an existing team.` })
                    },
                    onError: (e) => {
                      if (e instanceof ApiError && e.status === 501) setImportErr(e.detail || "Admin API key not configured.")
                      else toast.error("Import failed", { description: err(e) })
                    },
                  })
                }
              >
                <DownloadCloudIcon data-icon="inline-start" /> {m.importGroups.isPending ? "Importing…" : "Import groups from Claude"}
              </Button>
              <NewTeamDialog onCreate={(b) => m.create.mutateAsync(b)} />
              <InviteDialog teams={teams.data ?? []} onInvite={(b) => m.invite.mutateAsync(b) as Promise<InviteResult>} />
            </>
          )
        }
      />
      {importErr && (
        <div className="mb-4" data-testid="import-groups-501">
          <NotConfigured kind="claude_admin" feature="Importing groups from Claude" />
          <p className="mt-1 text-xs text-muted-foreground">API said: {importErr}</p>
        </div>
      )}
      <div className="space-y-6 animate-rise">
        <QueryState query={teams}>
          {(rows) => (
            <Panel title={`Teams · ${rows.length}`} testId="panel-teams">
              <RankingTable
                testId="teams-table"
                rowTestId="team-row"
                rows={rows}
                rowKey={(t) => t.id}
                defaultSort={{ key: "name", dir: "asc" }}
                emptyLabel="No teams yet. Import groups from Claude or add one."
                columns={[
                  { key: "name", header: "Team", sortValue: (t) => t.name, render: (t) => (
                    <div>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.slug}{t.programStartedOn ? ` · since ${fmt.dateShort(t.programStartedOn)}` : ""}{(t.memberCount ?? t.members) != null ? ` · ${t.memberCount ?? t.members} people` : ""}</div>
                    </div>
                  ) },
                  { key: "champion", header: "Champion", sortValue: (t) => t.champion?.name ?? "", render: (t) => <ChampionSelect team={t} people={(people.data ?? []).filter((p) => p.teamId === t.id || p.roles.includes("champion"))} disabled={!canWrite} onChange={(id) => m.patch.mutateAsync({ id: t.id, championPersonId: id }).then(() => toast.success("Champion updated")).catch((e) => toast.error("Couldn't update champion", { description: err(e) }))} /> },
                  { key: "plugin", header: "Plugin", sortValue: (t) => t.pluginName ?? "", render: (t) => <InlineText value={t.pluginName ?? ""} placeholder="plugin name" disabled={!canWrite} mono testId="team-plugin" onCommit={(v) => m.patch.mutateAsync({ id: t.id, pluginName: v || null }).then(() => toast.success("Plugin name saved")).catch((e) => toast.error("Couldn't save", { description: err(e) }))} /> },
                  { key: "rbac", header: "Claude group", sortValue: (t) => t.rbacGroupId ?? "", render: (t) => <InlineText value={t.rbacGroupId ?? ""} placeholder="grp_…" disabled={!canWrite} mono testId="team-rbac" onCommit={(v) => m.patch.mutateAsync({ id: t.id, rbacGroupId: v || null }).then(() => toast.success("Group id saved")).catch((e) => toast.error("Couldn't save", { description: err(e) }))} /> },
                  { key: "inProgram", header: "In program", align: "center", sortValue: (t) => (t.inProgram ? 1 : 0), render: (t) => (
                    <Switch size="sm" checked={t.inProgram} disabled={!canWrite} data-testid="team-in-program" onCheckedChange={(v) => m.patch.mutateAsync({ id: t.id, inProgram: v }).then(() => toast.success(v ? `${t.name} is in the program` : `${t.name} paused`)).catch((e) => toast.error("Couldn't update", { description: err(e) }))} />
                  ) },
                  { key: "link", header: "", sortable: false, render: (t) => <Button size="xs" variant="ghost" render={<Link href={`/mission-control/groups?team=${t.id}`} />}>Open</Button> },
                ]}
              />
            </Panel>
          )}
        </QueryState>

        <QueryState query={people}>
          {(rows) => <PeopleTable rows={rows} teams={teams.data ?? []} canWrite={canWrite} onPatch={(b) => m.patchPerson.mutateAsync(b)} />}
        </QueryState>
      </div>
    </>
  )
}

function ChampionSelect({ team, people, disabled, onChange }: { team: Team; people: Person[]; disabled: boolean; onChange: (id: string | null) => void }) {
  const current = team.championPersonId ?? team.champion?.id ?? NONE
  const options = useMemo(() => {
    const list = [...people]
    if (team.champion && !list.find((p) => p.id === team.champion!.id)) list.unshift({ ...(team.champion as unknown as Person) })
    return list
  }, [people, team.champion])
  return (
    <Select value={current} onValueChange={(v) => onChange(v === NONE ? null : (v as string))} disabled={disabled}>
      <SelectTrigger size="sm" className="min-w-40" data-testid="team-champion-select">
        <SelectValue>{(v: string) => (v === NONE || !v ? <span className="text-muted-foreground">No champion</span> : options.find((p) => p.id === v)?.name ?? team.champion?.name ?? "Champion")}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No champion</SelectItem>
        {options.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function InlineText({ value, onCommit, placeholder, disabled, mono, testId }: { value: string; onCommit: (v: string) => void; placeholder?: string; disabled?: boolean; mono?: boolean; testId?: string }) {
  const [v, setV] = useState(value)
  const [editing, setEditing] = useState(false)
  if (disabled) return <span className={cn("text-sm", mono && "font-mono text-xs", !value && "text-muted-foreground italic")}>{value || "—"}</span>
  return (
    <Input
      value={editing ? v : value}
      onFocus={() => { setV(value); setEditing(true) }}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { setEditing(false); if (v !== value) onCommit(v.trim()) }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(value); setEditing(false) } }}
      placeholder={placeholder}
      className={cn("h-7 w-44 text-xs", mono && "font-mono")}
      data-testid={testId}
    />
  )
}

function PeopleTable({ rows, teams, canWrite, onPatch }: { rows: Person[]; teams: Team[]; canWrite: boolean; onPatch: (b: { id: string; teamId?: string | null; roles?: Role[]; status?: Person["status"] }) => Promise<unknown> }) {
  const [q, setQ] = useState("")
  const [teamFilter, setTeamFilter] = useState<string>(NONE)
  const filtered = rows.filter((p) => (teamFilter === NONE || p.teamId === teamFilter) && (!q || `${p.name} ${p.email} ${p.title ?? ""}`.toLowerCase().includes(q.toLowerCase())))
  const err = (e: unknown) => (e instanceof ApiError ? e.detail || e.title : String(e))
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name
  return (
    <Panel
      title={`People · ${rows.length}`}
      description="Team and roles are editable inline. Level comes from the work each person has done and can't be edited here."
      actions={
        <>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="h-7 w-48 text-xs" data-testid="people-search" />
          <Select value={teamFilter} onValueChange={(v) => setTeamFilter((v as string) ?? NONE)}>
            <SelectTrigger size="sm" data-testid="people-team-filter">
              <SelectValue>{(v: string) => (v === NONE ? "All teams" : teamName(v) ?? "Team")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All teams</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      }
      testId="panel-people"
    >
      <RankingTable
        testId="people-table"
        rowTestId="person-row"
        rows={filtered}
        rowKey={(p) => p.id}
        defaultSort={{ key: "name", dir: "asc" }}
        emptyLabel={q ? "Nobody matches that search." : "No people yet. Invite someone or import groups."}
        columns={[
          { key: "name", header: "Person", sortValue: (p) => p.name, render: (p) => <PersonCell person={{ name: p.name, avatarUrl: p.avatarUrl, title: p.title }} sub={p.email} /> },
          { key: "rung", header: "Level", sortValue: (p) => p.rung ?? -1, render: (p) => (p.rung != null ? <RungBadge rung={p.rung} showName={false} /> : <span className="text-xs text-muted-foreground">—</span>) },
          { key: "team", header: "Team", sortValue: (p) => teamName(p.teamId) ?? "", render: (p) => (
            <Select value={p.teamId ?? NONE} disabled={!canWrite} onValueChange={(v) => onPatch({ id: p.id, teamId: v === NONE ? null : (v as string) }).then(() => toast.success(`${p.name} moved`)).catch((e) => toast.error("Couldn't move", { description: err(e) }))}>
              <SelectTrigger size="sm" className="min-w-36" data-testid="person-team-select">
                <SelectValue>{(v: string) => (v === NONE ? <span className="text-muted-foreground">No team</span> : teamName(v) ?? p.teamName ?? "Team")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No team</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) },
          { key: "roles", header: "Roles", sortValue: (p) => p.roles.join(","), render: (p) => (
            <div className="flex flex-wrap gap-1" data-testid="person-roles">
              {ROLES.map((r) => {
                const on = p.roles.includes(r)
                return (
                  <button
                    key={r}
                    type="button"
                    disabled={!canWrite || (r === "learner" && on && p.roles.length === 1)}
                    onClick={() => {
                      const next = on ? p.roles.filter((x) => x !== r) : [...p.roles, r]
                      onPatch({ id: p.id, roles: next.length ? next : ["learner"] }).then(() => toast.success(`${p.name}: ${on ? "removed" : "added"} ${r}`)).catch((e) => toast.error("Couldn't change roles", { description: err(e) }))
                    }}
                    className={cn("rounded-full border px-2 py-0.5 text-[11px] capitalize transition-colors", on ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:border-foreground/40", !canWrite && "cursor-default")}
                    data-testid={`role-${r}`}
                    aria-pressed={on}
                  >
                    {r}
                  </button>
                )
              })}
              {p.roles.includes("lead") && <Badge variant="outline" className="border-glow bg-glow-soft text-glow-foreground">LightCI lead</Badge>}
            </div>
          ) },
          { key: "status", header: "Status", sortValue: (p) => p.status, render: (p) => <Badge variant="outline" className={cn("capitalize text-foreground", p.status === "active" ? "border-pass/40 bg-pass-soft" : p.status === "invited" ? "border-info/40 bg-info-soft" : "border-border text-muted-foreground")}>{p.status}</Badge> },
          { key: "last", header: "Last active", sortValue: (p) => p.lastActiveAt ?? "", render: (p) => <span className="text-xs text-muted-foreground">{p.lastActiveAt ? fmt.ago(p.lastActiveAt) : "never"}</span> },
          { key: "open", header: "", sortable: false, render: (p) => <Button size="xs" variant="ghost" render={<Link href={`/people/${p.id}`} />}>Open</Button> },
        ]}
      />
    </Panel>
  )
}

function NewTeamDialog({ onCreate }: { onCreate: (b: { name: string; pluginName?: string; rbacGroupId?: string }) => Promise<unknown> }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [plugin, setPlugin] = useState("")
  const [group, setGroup] = useState("")
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" data-testid="new-team-open" />}>
        <PlusIcon data-icon="inline-start" /> New team
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New team</DialogTitle>
          <DialogDescription>Usually one team per Claude admin group. The plugin name becomes a folder in your marketplace repo.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); onCreate({ name: name.trim(), pluginName: plugin.trim() || undefined, rbacGroupId: group.trim() || undefined }).then(() => { toast.success(`${name} created`); setOpen(false); setName(""); setPlugin(""); setGroup("") }).catch((err) => toast.error("Couldn't create the team", { description: err instanceof ApiError ? err.detail : String(err) })) }} data-testid="new-team-form">
          <div className="grid gap-1"><Label htmlFor="nt-name" className="text-xs">Name</Label><Input id="nt-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Client Service Ops" required data-testid="new-team-name" /></div>
          <div className="grid gap-1"><Label htmlFor="nt-plugin" className="text-xs">Plugin name</Label><Input id="nt-plugin" value={plugin} onChange={(e) => setPlugin(e.target.value)} placeholder="cso-operations" className="font-mono" data-testid="new-team-plugin" /></div>
          <div className="grid gap-1"><Label htmlFor="nt-group" className="text-xs">Claude group id</Label><Input id="nt-group" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="grp_client_service_ops" className="font-mono" data-testid="new-team-group" /></div>
          <DialogFooter showCloseButton><Button type="submit" disabled={!name.trim()} data-testid="new-team-save">Create team</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type InviteResult = { ok: boolean; personId: string; invitation?: "sent" | "failed" | "skipped"; detail?: string }

function InviteDialog({ teams, onInvite }: { teams: Team[]; onInvite: (b: { email: string; teamId?: string }) => Promise<InviteResult> }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [teamId, setTeamId] = useState<string>(NONE)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" data-testid="invite-open" />}>
        <MailPlusIcon data-icon="inline-start" /> Invite
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite by email</DialogTitle>
          <DialogDescription>They sign in with your firm&apos;s SSO. If they already exist in Claude, the identity joins on email.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); onInvite({ email: email.trim(), teamId: teamId === NONE ? undefined : teamId }).then((r) => {
            // The person row is created either way; the WorkOS email can still fail (unknown domain, SSO not linked). Say so.
            if (r?.invitation === "failed") toast.warning(`${email} added as invited, but the invitation email was not sent`, { description: r.detail || "WorkOS rejected the invitation. Ask them to sign in with SSO; the row is already waiting." })
            else if (r?.invitation === "skipped") toast.info(`${email} added as invited`, { description: "Email invitations are off in this environment; they can sign in with SSO." })
            else toast.success(`Invited ${email}`)
            setOpen(false); setEmail("")
          }).catch((err) => toast.error("Couldn't send the invite", { description: err instanceof ApiError ? err.detail : String(err) })) }} data-testid="invite-form">
          <div className="grid gap-1"><Label htmlFor="inv-email" className="text-xs">Work email</Label><Input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@meridianwp.com" data-testid="invite-email" /></div>
          <div className="grid gap-1">
            <Label className="text-xs">Team</Label>
            <Select value={teamId} onValueChange={(v) => setTeamId((v as string) ?? NONE)}>
              <SelectTrigger className="w-full" data-testid="invite-team"><SelectValue>{(v: string) => (v === NONE ? "Assign later" : teams.find((t) => t.id === v)?.name ?? "Team")}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Assign later</SelectItem>
                {teams.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter showCloseButton><Button type="submit" disabled={!email.trim()} data-testid="invite-send"><UsersIcon data-icon="inline-start" /> Send invite</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
