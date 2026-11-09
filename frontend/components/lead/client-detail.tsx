"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { ArrowUpRightIcon, Building2Icon, KeyRoundIcon, ShieldCheckIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/shell/page-header"
import { useLeadClient, useLeadMutations, useLeadSignIn } from "@/hooks/mc/use-mc"
import type { IntegrationSummary, LeadClientDetail } from "@/hooks/mc/types"
import { ApiError } from "@/lib/api"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Panel, QueryState } from "@/components/mission-control/states"
import { MetricTile } from "@/components/mission-control/metric-tile"
import { RungMixBar } from "@/components/mission-control/heatmap"
import { RoleGate } from "@/components/mission-control/role-gate"
import { SetupChecklist } from "@/components/admin/setup-checklist"
import { KEY_META } from "@/components/admin/key-card"

export function ClientDetail({ id }: { id: string }) {
  return (
    <RoleGate roles={["lead"]} surface="Client detail">
      <Inner id={id} />
    </RoleGate>
  )
}

function switchAndGo(orgId: string, href: string) {
  document.cookie = `activate_org=${encodeURIComponent(orgId)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`
  window.location.assign(href)
}

/**
 * Sign-in for this client. LightCI never configures the IdP: the lead invites the client's admin,
 * WorkOS emails them, and they connect their own provider from Company admin > Sign-in. The setup
 * links remain for walking a client through it on a call (they expire within minutes).
 */
function IdentityPanel({ c }: { c: LeadClientDetail }) {
  const { portalLink, inviteAdmin } = useLeadMutations()
  const org = c.org
  const status = useLeadSignIn(org.id)
  const s = status.data
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const open = (intent: "sso" | "dsync") =>
    portalLink.mutate(
      { id: org.id, intent },
      {
        onSuccess: ({ url }) => {
          window.open(url, "_blank", "noopener")
          toast.success(intent === "sso" ? "Single sign-on setup opened" : "Directory setup opened", { description: "Use it now, with the client on a call: the link expires within minutes." })
        },
        onError: (err) => toast.error("Couldn't create the setup link", { description: err instanceof ApiError ? err.detail : String(err) }),
      },
    )
  const invite = (e: React.FormEvent) => {
    e.preventDefault()
    inviteAdmin.mutate(
      { id: org.id, email, name: name || undefined },
      {
        onSuccess: (r) => {
          setEmail("")
          setName("")
          status.refetch()
          if (r.invitation === "sent") toast.success("Invitation sent", { description: `${r.person.email} gets an email from WorkOS, signs in, and connects their company's sign-in from Company admin > Sign-in.` })
          else toast.warning("Admin added, but the email didn't go out", { description: r.detail ?? "Try again in a minute." })
        },
        onError: (err) => toast.error("Couldn't invite them", { description: err instanceof ApiError ? err.detail : String(err) }),
      },
    )
  }
  const phaseLabel = !org.workosOrganizationId
    ? "No identity organisation"
    : !s
      ? "Checking…"
      : s.phase === "sso"
        ? "Single sign-on is on"
        : s.phase === "setup"
          ? "Waiting for the client to connect"
          : "Couldn't check right now"
  return (
    <Panel title={<span className="inline-flex items-center gap-2"><ShieldCheckIcon className="size-4" /> Sign-in</span>} description="Invite the client's admin. They connect their own identity provider; roles follow their groups on every sign-in." testId="client-identity">
      <dl className="grid gap-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <Badge variant="outline" className={cn("text-foreground", s?.phase === "sso" ? "border-pass/40 bg-pass-soft" : "text-muted-foreground")} data-testid="client-sso-status" data-phase={s?.phase ?? ""}>
              {phaseLabel}
            </Badge>
          </dd>
        </div>
        <div className="flex items-start justify-between gap-2">
          <dt className="text-muted-foreground">Email domains</dt>
          <dd className="text-right font-mono text-xs" data-testid="client-domains">{(org.emailDomains ?? []).length ? (org.emailDomains ?? []).join(", ") : "none yet"}</dd>
        </div>
        <div className="flex items-start justify-between gap-2">
          <dt className="text-muted-foreground">Admins</dt>
          <dd className="text-right text-xs" data-testid="client-admins">
            {s?.admins.length ? s.admins.map((a) => <span key={a.id} className="block">{a.email} · {a.status === "invited" ? "invited" : "signed in"}</span>) : "none yet"}
          </dd>
        </div>
      </dl>
      {org.workosOrganizationId && (
        <form onSubmit={invite} className="mt-3 grid gap-2" data-testid="client-invite-admin">
          <div className="flex flex-wrap gap-2">
            <Input aria-label="Admin email" type="email" required placeholder={`admin@${(org.emailDomains ?? [])[0] ?? "client.com"}`} value={email} onChange={(e) => setEmail(e.target.value)} className="min-w-48 flex-1" />
            <Input aria-label="Admin name" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} className="min-w-36 flex-1" />
          </div>
          <Button type="submit" size="xs" disabled={inviteAdmin.isPending || !email} data-testid="client-invite-admin-submit">
            {inviteAdmin.isPending ? "Inviting…" : "Invite an admin"}
          </Button>
        </form>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="xs" variant="ghost" onClick={() => open("sso")} disabled={!org.workosOrganizationId || portalLink.isPending} data-testid="client-sso-link">
          Open single sign-on setup <ArrowUpRightIcon data-icon="inline-end" />
        </Button>
        <Button size="xs" variant="ghost" onClick={() => open("dsync")} disabled={!org.workosOrganizationId || portalLink.isPending} data-testid="client-dsync-link">
          Open directory setup <ArrowUpRightIcon data-icon="inline-end" />
        </Button>
      </div>
    </Panel>
  )
}

function Inner({ id }: { id: string }) {
  const q = useLeadClient(id)
  return (
    <QueryState query={q}>
      {(c) => <Body c={c} />}
    </QueryState>
  )
}

function Body({ c }: { c: LeadClientDetail }) {
  const org = c.org
  const steps = c.setup?.steps ?? c.checklist?.steps ?? []
  const integrations = c.integrations ?? []
  const quick = [
    { label: "Mission Control", href: "/mission-control" },
    { label: "Integrations & Keys", href: "/admin/integrations" },
    { label: "Teams & People", href: "/admin/teams" },
    { label: "Marketplace repo", href: "/admin/marketplace" },
    { label: "Promotion queue", href: "/promotions" },
  ]
  return (
    <>
      <PageHeader
        eyebrow={`Clients · ${org.slug}`}
        title={<span className="inline-flex items-center gap-3"><Building2Icon className="size-7 text-muted-foreground" /> {org.name}</span>}
        description={[org.industry ?? c.industry, org.sponsorName ?? c.sponsorName ? `Sponsor: ${org.sponsorName ?? c.sponsorName}` : null, org.residencyMode ? org.residencyMode.replace(/_/g, "-") : null, org.isDemo ? "Demo data" : null].filter(Boolean).join(" · ")}
        actions={
          <Button size="sm" onClick={() => switchAndGo(org.id, "/mission-control")} data-testid="client-open-mc">
            Open as this client <ArrowUpRightIcon data-icon="inline-end" />
          </Button>
        }
        className="pb-6"
      />
      <p className="-mt-4 mb-4 text-xs"><Link href="/lead/clients" className="text-muted-foreground underline underline-offset-4 hover:text-foreground" data-testid="client-back">← All clients</Link></p>
      <div className="space-y-6 animate-rise" data-testid="client-detail">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile testId="client-tile-active" label="Active on real work" value={fmt.pct(c.activePct ?? 0)} sub={`of ${c.seats ?? org.seats ?? 0} seats`} source="Analytics API" baseline={c.wave ? `wave target ${fmt.pct(c.wave.targets.activePct)}` : null} accent />
          <MetricTile testId="client-tile-skills" label="Skills published" value={c.skillsPublished ?? 0} source="Marketplace repo" baseline={c.wave ? `wave target ${c.wave.targets.skillsShipped}` : null} />
          <MetricTile testId="client-tile-escalations" label="Open escalations" value={c.openEscalations ?? 0} source="Activate" baseline="n/a (count)" delta={{ value: null, goodWhenUp: false }} />
          <div className="flex flex-col gap-1 rounded-xl bg-card p-4 ring-1 ring-foreground/10" data-testid="client-tile-rungs">
            <p className="text-xs font-medium text-muted-foreground">Rung distribution</p>
            <RungMixBar counts={c.rungDistribution ?? []} className="mt-2 h-3" />
            <p className="mt-1 text-[11px] text-muted-foreground">{(c.rungDistribution ?? []).map((n, i) => `L${i} ${n}`).join(" · ")}</p>
            <p className="mt-auto text-[11px] text-muted-foreground">Source: Activate ladder · Baseline: placement</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Panel title="Setup checklist" description="Spec §2.1. Links open the client's own admin surfaces after switching to that client." testId="client-setup">
            {steps.length ? <SetupChecklist steps={steps} readOnly /> : <p className="text-sm text-muted-foreground">Checklist not available for this client yet.</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {steps.filter((s) => !s.done).slice(0, 3).map((s) => (
                <Button key={s.key} size="xs" variant="outline" onClick={() => switchAndGo(org.id, "/admin/marketplace")}>
                  Work on “{s.label}” as client <ArrowUpRightIcon data-icon="inline-end" />
                </Button>
              ))}
            </div>
          </Panel>
          <div className="space-y-4">
            <IdentityPanel c={c} />
            <Panel title={<span className="inline-flex items-center gap-2"><KeyRoundIcon className="size-4" /> Integrations</span>} description="Read-only. The client admin uploads keys on their Integrations & Keys page." testId="client-integrations">
              {integrations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No integration summary returned.</p>
              ) : (
                <ul className="divide-y">
                  {integrations.map((i) => (
                    <IntegrationRow key={i.kind} i={i} />
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Wave" testId="client-wave">
              {c.wave ? (
                <div className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{c.wave.name}</span>
                    <Badge variant="outline" className="capitalize text-foreground">{c.wave.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{fmt.date(c.wave.startsOn)} – {fmt.date(c.wave.endsOn)} · {c.wave.teamIds?.length ?? 0} teams</p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div><dt className="text-muted-foreground">Skills target</dt><dd className="tabular font-medium">{c.wave.targets.skillsShipped}</dd></div>
                    <div><dt className="text-muted-foreground">Active target</dt><dd className="tabular font-medium">{fmt.pct(c.wave.targets.activePct)}</dd></div>
                    <div><dt className="text-muted-foreground">Baseline coverage</dt><dd className="tabular font-medium">{fmt.pct(c.wave.targets.baselineCoveragePct)}</dd></div>
                    <div><dt className="text-muted-foreground">Hours back / person</dt><dd className="tabular font-medium">{c.wave.targets.hoursBackPerPerson}h</dd></div>
                  </dl>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No wave planned yet.</p>
              )}
            </Panel>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={`Teams · ${c.teams?.length ?? 0}`} testId="client-teams">
            {(c.teams ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No teams yet. Import groups from Claude once the Admin key is in.</p>
            ) : (
              <ul className="divide-y text-sm">
                {(c.teams ?? []).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-1.5">
                    <div>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.pluginName ?? "no plugin"} · {t.champion?.name ?? "no champion"}{t.memberCount != null ? ` · ${t.memberCount} people` : ""}</div>
                    </div>
                    <Badge variant="outline" className={cn("text-foreground", t.inProgram ? "border-pass/40 bg-pass-soft" : "text-muted-foreground")}>{t.inProgram ? "in program" : "paused"}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Quick links" description="Each switches the app to this client first." testId="client-quick-links">
            <div className="flex flex-wrap gap-2">
              {quick.map((l) => (
                <Button key={l.href} size="sm" variant="outline" onClick={() => switchAndGo(org.id, l.href)} data-testid="client-quick-link">
                  {l.label} <ArrowUpRightIcon data-icon="inline-end" />
                </Button>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}

function IntegrationRow({ i }: { i: IntegrationSummary }) {
  const meta = KEY_META[i.kind]
  const label = !i.configured ? "Not configured" : i.source === "platform" ? "Using LightCI's key" : i.status === "verified" ? "Verified" : i.status === "invalid" ? "Invalid" : "Unverified"
  const tone = !i.configured ? "text-muted-foreground" : i.source === "platform" ? "border-glow bg-glow-soft text-glow-foreground" : i.status === "verified" ? "border-pass/40 bg-pass-soft text-foreground" : i.status === "invalid" ? "border-fail/40 bg-fail-soft text-foreground" : "border-revise/40 bg-revise-soft text-foreground"
  return (
    <li className="flex items-center justify-between gap-2 py-1.5 text-sm" data-testid={`client-integration-${i.kind}`}>
      <div className="min-w-0">
        <div className="font-medium">{meta?.title ?? i.kind}</div>
        <div className="truncate text-xs text-muted-foreground">{i.source === "org" && i.last4 ? `••••${i.last4}` : ""}{i.verifiedAt ? ` · verified ${fmt.ago(i.verifiedAt)}` : ""}{i.verificationDetail && i.status === "invalid" ? ` · ${i.verificationDetail}` : ""}</div>
      </div>
      <Badge variant="outline" className={tone}>{label}</Badge>
    </li>
  )
}
