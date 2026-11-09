"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { ArrowUpRightIcon, CheckCircle2Icon, CircleDashedIcon } from "lucide-react"
import { useSignInMutations, useSignInStatus, type SetupIntent } from "@/hooks/mc/use-mc"
import type { SignInStatus } from "@/hooks/mc/types"
import { ApiError } from "@/lib/api"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Panel, QueryState } from "@/components/mission-control/states"
import { RoleGate } from "@/components/mission-control/role-gate"
import { AdminHeader } from "./admin-header"

export function SignInView() {
  return (
    <RoleGate roles={["admin"]} surface="Sign-in">
      <Inner />
    </RoleGate>
  )
}

const DIRECTORY_STATE: Record<string, string> = {
  active: "Connected",
  validating: "Checking the connection",
  invalid_credentials: "Needs new credentials",
  inactive: "Paused",
  deleting: "Being removed",
}

function Inner() {
  const search = useSearchParams()
  const router = useRouter()
  // Back from WorkOS: ask it again instead of showing a cached answer.
  const returned = search.get("returned")
  const q = useSignInStatus(true, Boolean(returned))
  const { setupLink } = useSignInMutations()

  useEffect(() => {
    if (!returned || !q.data) return
    const s = q.data
    if (returned === "domain_verification")
      toast[s.domains?.some((d) => d.state === "verified") ? "success" : "info"](s.domains?.some((d) => d.state === "verified") ? "Your domain is verified" : "Your domain isn't verified yet", {
        description: s.domains?.some((d) => d.state === "verified") ? "Next, connect your sign-in." : "DNS changes can take a while to show. Check back in a few minutes.",
      })
    else if (returned === "sso")
      toast[s.phase === "sso" ? "success" : "info"](s.phase === "sso" ? "Single sign-on is connected" : "Single sign-on isn't active yet", {
        description: s.phase === "sso" ? "From now on everyone at your company signs in with their work account." : "If you finished the steps, give it a minute and refresh this page.",
      })
    else toast.success("Back from the directory setup", { description: "People will appear here as your directory syncs." })
    router.replace("/admin/sign-in")
  }, [returned, q.data, router])

  const go = (intent: SetupIntent) =>
    setupLink.mutate(intent, {
      onSuccess: ({ url }) => window.location.assign(url),
      onError: (err) => toast.error("Couldn't open the setup page", { description: err instanceof ApiError ? err.detail : String(err) }),
    })

  return (
    <>
      <AdminHeader
        title="Sign-in"
        description="Connect your company's own sign-in (Microsoft Entra ID, Okta, Google and others) so everyone uses their work account. You do this yourself; it takes about ten minutes."
      />
      <QueryState query={q} skeleton={<Skeleton className="h-64 rounded-xl" />}>
        {(s) => (s.provider === "oidc" ? <SelfHosted /> : <Steps s={s} go={go} pending={setupLink.isPending} />)}
      </QueryState>
    </>
  )
}

function SelfHosted() {
  return (
    <Panel title="Your sign-in" testId="sign-in-self-hosted">
      <p className="text-sm text-muted-foreground">
        This installation signs everyone in through the identity provider configured when it was installed. To change it, update the installation&apos;s settings.
      </p>
    </Panel>
  )
}

function Steps({ s, go, pending }: { s: SignInStatus; go: (intent: SetupIntent) => void; pending: boolean }) {
  const connected = s.phase === "sso"
  const directory = s.directories?.[0] ?? null
  const disabled = s.phase === "none" || pending
  // WorkOS only activates single sign-on for a company that has proved it owns an email domain.
  const domainVerified = Boolean(s.domains?.some((d) => d.state === "verified"))
  const domainsKnown = s.domains !== null
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] animate-rise" data-testid="sign-in-view" data-phase={s.phase}>
      <div className="grid gap-4">
        <Panel title="Status" testId="sign-in-status">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("text-foreground", connected ? "border-pass/40 bg-pass-soft" : "border-revise/40 bg-revise-soft")}
              data-testid="sign-in-phase"
            >
              {connected ? "Single sign-on is on" : s.phase === "none" ? "Not ready yet" : s.phase === "unknown" ? "Couldn't check right now" : "Setting up"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {connected
                ? "Everyone at your company signs in with their work account. Other ways of signing in are switched off."
                : s.phase === "none"
                  ? "LightCI is still creating your company's sign-in. Nothing to do yet."
                  : "Until you connect your sign-in, only the admins listed here can get in."}
            </span>
          </div>
        </Panel>

        <Panel title="1. Prove you own your email domain" testId="sign-in-step-domain">
          <StepState done={domainVerified} />
          <p className="mt-2 text-sm text-muted-foreground">
            Add one DNS record to your email domain (your IT or web team can do this in a few minutes). It proves the domain is yours, so only your company&apos;s sign-in can be used for addresses on it.
          </p>
          <Button className="mt-3" size="sm" variant={domainVerified ? "outline" : "default"} onClick={() => go("domain_verification")} disabled={disabled} data-testid="sign-in-verify-domain">
            {domainVerified ? "Review your domain" : "Verify your domain"} <ArrowUpRightIcon data-icon="inline-end" />
          </Button>
        </Panel>

        <Panel title="2. Connect your sign-in" testId="sign-in-step-sso">
          <StepState done={connected} />
          <p className="mt-2 text-sm text-muted-foreground">
            Opens a guided setup page from WorkOS, our sign-in partner. Pick your provider (for Microsoft, choose Microsoft Entra ID with SAML) and follow the steps in your provider&apos;s admin console.
          </p>
          {domainsKnown && !domainVerified && !connected && (
            <p className="mt-2 text-xs text-muted-foreground" data-testid="sign-in-needs-domain">Verify your domain first: single sign-on can&apos;t be switched on until it is.</p>
          )}
          <Button className="mt-3" size="sm" onClick={() => go("sso")} disabled={disabled || (domainsKnown && !domainVerified && !connected)} data-testid="sign-in-connect-sso">
            {connected ? "Review your sign-in" : "Connect your sign-in"} <ArrowUpRightIcon data-icon="inline-end" />
          </Button>
        </Panel>

        <Panel title="3. Keep people in step automatically (optional)" testId="sign-in-step-directory">
          <StepState done={directory?.state === "active"} label={directory ? (DIRECTORY_STATE[directory.state] ?? directory.state) : undefined} />
          <p className="mt-2 text-sm text-muted-foreground">
            Connect your directory so new joiners can sign in straight away and leavers lose access the day they leave. You can also choose which groups become admins, sponsors and champions here. Without it, people appear the first time they sign in and you remove leavers by hand.
          </p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => go("dsync")} disabled={disabled} data-testid="sign-in-connect-directory">
            {directory ? "Review your directory" : "Connect your directory"} <ArrowUpRightIcon data-icon="inline-end" />
          </Button>
        </Panel>

        <Panel title="4. Who gets which role" testId="sign-in-step-roles">
          <p className="text-sm text-muted-foreground">
            Everyone who signs in can learn. To give people more, put them in a group in your provider and assign that group a role during step 3: <span className="font-medium text-foreground">activate-admin</span> runs Activate for your company, <span className="font-medium text-foreground">activate-sponsor</span> sees company-wide results, <span className="font-medium text-foreground">activate-champion</span> supports a team. You can also change anyone&apos;s role under Teams &amp; People.
          </p>
        </Panel>
      </div>

      <div className="grid content-start gap-4">
        <Panel title="Email domains" testId="sign-in-domains">
          <ul className="grid gap-1.5 text-sm">
            {s.emailDomains.map((domain) => ({ domain, state: s.domains?.find((d) => d.domain === domain)?.state ?? "" })).map((d) => (
              <li key={d.domain} className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs">{d.domain}</span>
                {d.state && <span className="text-xs text-muted-foreground">{d.state === "verified" ? "Verified" : "Not verified yet"}</span>}
              </li>
            ))}
            {s.emailDomains.length === 0 && <li className="text-muted-foreground">None set. Ask LightCI to add your company&apos;s email domain.</li>}
          </ul>
        </Panel>
        <AdminsPanel s={s} />
      </div>
    </div>
  )
}

function StepState({ done, label }: { done: boolean; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", done ? "text-pass" : "text-muted-foreground")}>
      {done ? <CheckCircle2Icon className="size-3.5" /> : <CircleDashedIcon className="size-3.5" />}
      {label ?? (done ? "Done" : "Not done yet")}
    </span>
  )
}

function AdminsPanel({ s }: { s: SignInStatus }) {
  const { inviteAdmin } = useSignInMutations()
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    inviteAdmin.mutate(
      { email, name: name || undefined },
      {
        onSuccess: (r) => {
          setEmail("")
          setName("")
          if (r.invitation === "sent") toast.success("Invitation sent", { description: `${r.person.email} will get an email from WorkOS to set up their first sign-in.` })
          else toast.warning("Added, but the email didn't go out", { description: r.detail ?? "Try again in a minute." })
        },
        onError: (err) => toast.error("Couldn't invite them", { description: err instanceof ApiError ? err.detail : String(err) }),
      },
    )
  }
  return (
    <Panel title="Admins" description="Admins can get in before single sign-on is connected." testId="sign-in-admins">
      <ul className="grid gap-2 text-sm">
        {s.admins.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2" data-testid="sign-in-admin">
            <span className="min-w-0">
              <span className="block truncate font-medium">{a.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{a.email}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{a.status === "invited" ? "Invited" : a.lastSeenAt ? `Last in ${fmt.date(a.lastSeenAt)}` : "Active"}</span>
          </li>
        ))}
        {s.admins.length === 0 && <li className="text-muted-foreground">No admins yet.</li>}
      </ul>
      {s.phase !== "none" && (
        <form onSubmit={submit} className="mt-4 grid gap-2" data-testid="sign-in-invite-form">
          <Label htmlFor="admin-email">Invite another admin</Label>
          <Input id="admin-email" type="email" required placeholder="name@yourcompany.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input aria-label="Their name" placeholder="Their name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" size="sm" disabled={inviteAdmin.isPending || !email}>
            {inviteAdmin.isPending ? "Sending…" : "Send invitation"}
          </Button>
        </form>
      )}
    </Panel>
  )
}
