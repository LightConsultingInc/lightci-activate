"use client"

import { useState } from "react"
import { InfoIcon } from "lucide-react"
import { useIntegrationMutations, useIntegrations } from "@/hooks/mc/use-mc"
import type { IntegrationKind } from "@/hooks/mc/types"
import { QueryState } from "@/components/mission-control/states"
import { RoleGate, useCanAdmin } from "@/components/mission-control/role-gate"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminHeader } from "./admin-header"
import { KeyCard } from "./key-card"

const ORDER: IntegrationKind[] = ["anthropic", "claude_compliance", "claude_analytics", "claude_admin", "github"]

export function IntegrationsView() {
  return (
    <RoleGate roles={["sponsor", "admin"]} surface="Company admin">
      <Inner />
    </RoleGate>
  )
}

function Inner() {
  const q = useIntegrations()
  const canWrite = useCanAdmin()
  const { save, verify, remove } = useIntegrationMutations()
  const [busy, setBusy] = useState<{ kind: IntegrationKind; op: "save" | "verify" | "remove" } | null>(null)
  const run = async <T,>(kind: IntegrationKind, op: "save" | "verify" | "remove", p: Promise<T>) => {
    setBusy({ kind, op })
    try {
      return await p
    } finally {
      setBusy(null)
    }
  }
  return (
    <>
      <AdminHeader title="Integrations & Keys" description="Your firm uploads its own Claude Enterprise keys. LightCI's platform key stands in only for the Anthropic API, and only until you add your own." />
      <div className="mb-4 flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground" data-testid="integrations-note">
        <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
        <p>
          Secrets are AES-256-GCM encrypted at rest and never returned to the browser. Saving a key verifies it against the provider immediately. Anything a missing key would power shows an explicit “Not configured” state instead of a guess.
          {!canWrite && " You are viewing as a sponsor: read-only."}
        </p>
      </div>
      <QueryState query={q} skeleton={<div className="grid gap-4 md:grid-cols-2">{ORDER.map((k) => <Skeleton key={k} className="h-64 rounded-xl" />)}</div>}>
        {(rows) => (
          <div className="grid gap-4 md:grid-cols-2 animate-rise" data-testid="key-cards">
            {ORDER.map((kind) => {
              const s = rows.find((r) => r.kind === kind) ?? { kind, configured: false, source: "none" as const, last4: null, status: null, verifiedAt: null, verificationDetail: null, config: {} }
              return (
                <KeyCard
                  key={kind}
                  summary={s}
                  canWrite={canWrite}
                  busy={busy?.kind === kind ? busy.op : null}
                  onSave={(secret, config) => run(kind, "save", save.mutateAsync({ kind, secret, config }))}
                  onVerify={() => run(kind, "verify", verify.mutateAsync(kind))}
                  onRemove={() => run(kind, "remove", remove.mutateAsync(kind))}
                />
              )
            })}
          </div>
        )}
      </QueryState>
    </>
  )
}
