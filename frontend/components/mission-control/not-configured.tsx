"use client"

import Link from "next/link"
import { KeyRoundIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCanAdmin } from "./role-gate"
import { cn } from "@/lib/utils"

const KEY_LABEL = {
  claude_compliance: "Compliance Access Key",
  claude_analytics: "Analytics API key",
  claude_admin: "Admin API key",
  anthropic: "Anthropic API key",
  github: "GitHub token",
} as const

/** Honest "not configured" state for features that depend on a client-uploaded Claude Enterprise key. */
export function NotConfigured({ kind, feature, className }: { kind: keyof typeof KEY_LABEL; feature: string; className?: string }) {
  const canAdmin = useCanAdmin()
  return (
    <div className={cn("flex flex-col items-start gap-3 rounded-xl border border-dashed bg-muted/30 p-5 text-sm", className)} data-testid={`not-configured-${kind}`} role="status">
      <div className="flex items-center gap-2 text-muted-foreground">
        <KeyRoundIcon className="size-4" />
        <span className="font-medium text-foreground">Not configured — add a {KEY_LABEL[kind]}</span>
      </div>
      <p className="max-w-prose text-muted-foreground">
        {feature} reads from your Claude Enterprise organisation with a {KEY_LABEL[kind]} that your firm creates and uploads. LightCI never holds this key on your behalf. Until it is added this panel stays empty rather than guessing.
      </p>
      <Button size="sm" variant="outline" render={<Link href="/admin/integrations" />} data-testid="not-configured-link">
        {canAdmin ? "Add the key in Integrations & Keys" : "See Integrations & Keys"}
      </Button>
    </div>
  )
}
