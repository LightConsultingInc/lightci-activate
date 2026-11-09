"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useLicense, useLicenseMutations } from "@/hooks/mc/use-mc"
import type { LicenseState } from "@/hooks/mc/types"
import { ApiError } from "@/lib/api"
import { fmt } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Panel, QueryState } from "@/components/mission-control/states"
import { RoleGate, useCanAdmin } from "@/components/mission-control/role-gate"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminHeader } from "./admin-header"

const STATUS_LABEL: Record<LicenseState["status"], string> = {
  "n/a": "Not needed",
  valid: "Active",
  expiring: "Expiring soon",
  grace: "Expired, grace period",
  expired: "Expired, read-only",
  missing: "Not installed",
  invalid: "Could not be verified",
}

export function LicenseView() {
  return (
    <RoleGate roles={["admin"]} surface="License">
      <Inner />
    </RoleGate>
  )
}

function Inner() {
  const q = useLicense(true)
  const canWrite = useCanAdmin()
  const { install } = useLicenseMutations()
  const [token, setToken] = useState("")
  return (
    <>
      <AdminHeader title="License" description="Installations your company runs itself need a license from LightCI: how many seats, until when. Nothing is ever deleted when it lapses." />
      <QueryState query={q} skeleton={<Skeleton className="h-64 rounded-xl" />}>
        {(s) => (
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr] animate-rise" data-testid="license-view">
            <Panel title="Current license" testId="license-status">
              {s.status === "n/a" ? (
                <p className="text-sm text-muted-foreground">This installation is run by LightCI, so there is no license to manage here.</p>
              ) : (
                <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <Badge variant="outline" className={s.status === "valid" ? "border-pass/40 bg-pass-soft text-foreground" : s.status === "expiring" || s.status === "grace" ? "border-revise/40 bg-revise-soft text-foreground" : "border-fail/40 bg-fail-soft text-foreground"} data-testid="license-badge">
                      {STATUS_LABEL[s.status]}
                    </Badge>
                  </dd>
                  <dt className="text-muted-foreground">Licensed to</dt>
                  <dd>{s.org ?? "—"}</dd>
                  <dt className="text-muted-foreground">Seats</dt>
                  <dd className="tabular" data-testid="license-seats">{s.seats !== null ? `${s.seatsUsed ?? 0} of ${s.seats} in use` : "—"}</dd>
                  <dt className="text-muted-foreground">Expires</dt>
                  <dd>{s.expiresAt ? `${fmt.date(s.expiresAt)}${s.daysToExpiry !== null && s.daysToExpiry >= 0 ? ` (in ${s.daysToExpiry} days)` : ""}` : "—"}</dd>
                  {s.features.length > 0 && (
                    <>
                      <dt className="text-muted-foreground">Includes</dt>
                      <dd>{s.features.join(", ")}</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">Installed from</dt>
                  <dd className="capitalize">{s.source === "none" ? "—" : s.source}</dd>
                </dl>
              )}
              {s.message && (
                <p className="mt-4 rounded-md border bg-muted/40 px-3 py-2 text-sm" data-testid="license-message">{s.message}</p>
              )}
            </Panel>
            {s.status !== "n/a" && (
              <Panel title="Install a renewed license" description="Paste the license LightCI sent you. It is checked before it is saved; the old one stays until the new one is accepted." testId="license-install">
                <form
                  className="grid gap-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    install.mutate(token.trim(), {
                      onSuccess: () => {
                        setToken("")
                        toast.success("License installed")
                      },
                      onError: (err) => toast.error("That license was not accepted", { description: err instanceof ApiError ? err.detail : String(err) }),
                    })
                  }}
                >
                  <div className="grid gap-1">
                    <Label htmlFor="license-token" className="text-xs">License</Label>
                    <Textarea id="license-token" value={token} onChange={(e) => setToken(e.target.value)} rows={5} className="font-mono text-xs" placeholder="eyJhbGciOiJFZERTQSIs…" disabled={!canWrite} data-testid="license-input" />
                  </div>
                  <Button type="submit" size="sm" disabled={!canWrite || token.trim().length < 20 || install.isPending} data-testid="license-submit">
                    {install.isPending ? "Checking…" : "Install license"}
                  </Button>
                </form>
              </Panel>
            )}
          </div>
        )}
      </QueryState>
    </>
  )
}
