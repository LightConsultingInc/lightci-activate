"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Building2Icon, PlusIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { PageHeader } from "@/components/shell/page-header"
import { useLeadClients, useLeadMutations } from "@/hooks/mc/use-mc"
import { fmt } from "@/lib/format"
import { ApiError } from "@/lib/api"
import { Panel, QueryState } from "@/components/mission-control/states"
import { RankingTable } from "@/components/mission-control/ranking-table"
import { RungMixBar } from "@/components/mission-control/heatmap"
import { Bar01 } from "@/components/mission-control/adoption-view"
import { RoleGate } from "@/components/mission-control/role-gate"
import { ClientSwitcher } from "./client-switcher"

export function ClientsView() {
  return (
    <RoleGate roles={["lead"]} surface="Clients & Provisioning">
      <Inner />
    </RoleGate>
  )
}

function Inner() {
  const q = useLeadClients()
  const router = useRouter()
  return (
    <>
      <PageHeader eyebrow="LightCI · Activation lead" title="Clients & Provisioning" description="Every client org, its wave, and the provisioning state. Keys are uploaded by each client's admin, never here." actions={<><ClientSwitcher /><ProvisionDialog onCreated={(id) => router.push(`/lead/clients/${id}`)} /></>} className="pb-6" />
      <QueryState query={q}>
        {(rows) => (
          <Panel title={`Clients · ${rows.length}`} testId="panel-clients">
            <RankingTable
              testId="clients-table"
              rowTestId="client-row"
              rows={rows}
              rowKey={(c) => c.org.id}
              rowHref={(c) => `/lead/clients/${c.org.id}`}
              defaultSort={{ key: "name", dir: "asc" }}
              emptyLabel="No clients provisioned yet."
              columns={[
                { key: "name", header: "Client", sortValue: (c) => c.org.name, render: (c) => (
                  <div className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-md bg-muted"><Building2Icon className="size-3.5 text-muted-foreground" /></span>
                    <div>
                      <div className="font-medium">{c.org.name}</div>
                      <div className="text-xs text-muted-foreground">{c.org.slug}{c.org.industry ? ` · ${c.org.industry}` : ""}{c.org.isDemo ? " · demo" : ""}</div>
                    </div>
                  </div>
                ) },
                { key: "seats", header: "Seats", align: "right", sortValue: (c) => c.seats, render: (c) => c.seats },
                { key: "active", header: "Active", align: "right", sortValue: (c) => c.activePct, render: (c) => <Bar01 value={c.activePct} /> },
                { key: "rungs", header: "Rung mix", sortValue: (c) => weighted(c.rungDistribution), render: (c) => <RungMixBar counts={c.rungDistribution ?? []} className="w-28" /> },
                { key: "skills", header: "Skills published", align: "right", sortValue: (c) => c.skillsPublished, render: (c) => c.skillsPublished },
                { key: "esc", header: "Open escalations", align: "right", sortValue: (c) => c.openEscalations, render: (c) => (c.openEscalations ? <Badge variant="outline" className="border-fail/40 bg-fail-soft text-foreground">{c.openEscalations}</Badge> : <span className="text-muted-foreground">0</span>) },
                { key: "wave", header: "Wave", sortValue: (c) => c.wave?.number ?? -1, render: (c) => (c.wave ? <span>{c.wave.name} <span className="text-xs text-muted-foreground capitalize">· {c.wave.status} · {fmt.dateShort(c.wave.startsOn)}–{fmt.dateShort(c.wave.endsOn)}</span></span> : <span className="text-xs text-muted-foreground">no wave</span>) },
                { key: "open", header: "", sortable: false, render: (c) => <Button size="xs" variant="ghost" render={<Link href={`/lead/clients/${c.org.id}`} onClick={(e) => e.stopPropagation()} />}>Open</Button> },
              ]}
            />
          </Panel>
        )}
      </QueryState>
    </>
  )
}

function weighted(mix: number[] | undefined) {
  if (!mix?.length) return 0
  const n = mix.reduce((a, b) => a + b, 0) || 1
  return mix.reduce((a, c, i) => a + c * i, 0) / n
}

const slugify = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)

function ProvisionDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const { provision } = useLeadMutations()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: "", slug: "", emailDomains: "", workosOrganizationId: "", industry: "", sponsorName: "", seats: 25 })
  const [createIdentity, setCreateIdentity] = useState(true)
  const [linkExisting, setLinkExisting] = useState(false)
  const [slugTouched, setSlugTouched] = useState(false)
  const set = (k: keyof typeof f, v: string | number) => setF((s) => ({ ...s, [k]: v, ...(k === "name" && !slugTouched ? { slug: slugify(String(v)) } : {}) }))
  const valid = f.name.trim().length > 1 && /^[a-z0-9-]{2,}$/.test(f.slug) && f.seats > 0 && (!createIdentity || linkExisting || f.emailDomains.trim().length > 0)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" data-testid="provision-open" />}>
        <PlusIcon data-icon="inline-start" /> Provision client
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" data-testid="provision-dialog">
        <DialogHeader>
          <DialogTitle>Provision a client</DialogTitle>
          <DialogDescription>Creates the Activate org and, by default, the client&apos;s identity organisation so their IT team can connect single sign-on themselves. The client&apos;s admin then uploads their Claude Enterprise keys and links the marketplace repo from the setup checklist.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            provision.mutate(
              {
                name: f.name.trim(),
                slug: f.slug,
                emailDomains: f.emailDomains.trim() || undefined,
                createIdentityOrganization: linkExisting ? false : createIdentity,
                workosOrganizationId: linkExisting ? f.workosOrganizationId.trim() || undefined : undefined,
                industry: f.industry.trim() || undefined,
                sponsorName: f.sponsorName.trim() || undefined,
                seats: Number(f.seats),
              },
              {
                onSuccess: (org) => {
                  toast.success(`${org.name} provisioned`, { description: "Next: the checklist on the client page." })
                  setOpen(false)
                  onCreated(org.id)
                },
                onError: (err) => toast.error("Couldn't provision", { description: err instanceof ApiError ? err.detail : String(err) }),
              },
            )
          }}
          data-testid="provision-form"
        >
          <div className="grid gap-1"><Label htmlFor="pv-name" className="text-xs">Company name</Label><Input id="pv-name" required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Meridian Wealth Partners" data-testid="provision-name" /></div>
          <div className="grid gap-1"><Label htmlFor="pv-slug" className="text-xs">Slug</Label><Input id="pv-slug" required value={f.slug} onChange={(e) => { setSlugTouched(true); set("slug", slugify(e.target.value)) }} placeholder="meridian" className="font-mono" data-testid="provision-slug" /><p className="text-[11px] text-muted-foreground">Used for the marketplace repo name: <span className="font-mono">{f.slug || "<slug>"}-claude-marketplace</span></p></div>
          <div className="grid gap-1">
            <Label htmlFor="pv-domains" className="text-xs">Company email domains</Label>
            <Input id="pv-domains" value={f.emailDomains} onChange={(e) => set("emailDomains", e.target.value)} placeholder="acme.com, acme.co.uk" className="font-mono" data-testid="provision-domains" />
            <p className="text-[11px] text-muted-foreground">People with these addresses are sent to this client&apos;s single sign-on.</p>
          </div>
          <div className="grid gap-2 rounded-lg border p-3 text-xs" data-testid="provision-identity">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-3.5" checked={createIdentity && !linkExisting} disabled={linkExisting} onChange={(e) => setCreateIdentity(e.target.checked)} data-testid="provision-create-identity" />
              <span>Create the identity organisation now (their IT admin connects SSO from a link you send them)</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-3.5" checked={linkExisting} onChange={(e) => setLinkExisting(e.target.checked)} data-testid="provision-link-existing" />
              <span>Link an existing WorkOS organisation instead</span>
            </label>
            {linkExisting && (
              <Input id="pv-workos" value={f.workosOrganizationId} onChange={(e) => set("workosOrganizationId", e.target.value)} placeholder="org_01H…" className="font-mono" data-testid="provision-workos" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1"><Label htmlFor="pv-industry" className="text-xs">Industry</Label><Input id="pv-industry" value={f.industry} onChange={(e) => set("industry", e.target.value)} placeholder="Wealth management" data-testid="provision-industry" /></div>
            <div className="grid gap-1"><Label htmlFor="pv-seats" className="text-xs">Seats</Label><Input id="pv-seats" type="number" min={1} required value={f.seats} onChange={(e) => set("seats", Number(e.target.value))} className="tabular" data-testid="provision-seats" /></div>
          </div>
          <div className="grid gap-1"><Label htmlFor="pv-sponsor" className="text-xs">Executive sponsor</Label><Input id="pv-sponsor" value={f.sponsorName} onChange={(e) => set("sponsorName", e.target.value)} placeholder="Elena Marsh, COO" data-testid="provision-sponsor" /></div>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={!valid || provision.isPending} data-testid="provision-submit">{provision.isPending ? "Provisioning…" : "Provision"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
