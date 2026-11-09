"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CheckCircle2Icon, CircleDashedIcon, EyeIcon, EyeOffIcon, KeyRoundIcon, ShieldAlertIcon, Trash2Icon, RefreshCwIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { IntegrationKind, IntegrationSummary } from "@/hooks/mc/types"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { ApiError } from "@/lib/api"

export const KEY_META: Record<IntegrationKind, { title: string; owner: string; unlocks: string; without: string; placeholder: string; help: string; platformFallback: boolean; configFields?: { key: string; label: string; placeholder: string }[] }> = {
  anthropic: {
    title: "Anthropic API key",
    owner: "Optional · your firm's key",
    unlocks: "Every AI step in Activate (the interview, feedback on practice, drafting skills, readouts) runs on your own Anthropic account, so model spend and data handling sit under your agreement.",
    without: "Without it, Activate uses LightCI's platform key. Everything works; usage is billed to LightCI and shows as “Using LightCI's key”.",
    placeholder: "sk-ant-…",
    help: "Create it in console.anthropic.com → API keys. Grant it to a workspace you can see spend for.",
    platformFallback: true,
  },
  claude_compliance: {
    title: "Claude Compliance Access Key",
    owner: "Required for governance · your firm's key",
    unlocks: "The Compliance API event feed in Governance: skill sharing, role assignment, plugin changes. Also the audit export's Claude-side events.",
    without: "Without it the Governance event feed shows “Not configured” and falls back to Activate's own audit log. Nothing fails silently.",
    placeholder: "Compliance access key",
    help: "Requested from Anthropic by your Claude Enterprise primary owner. LightCI cannot create or hold this on your behalf.",
    platformFallback: false,
  },
  claude_analytics: {
    title: "Claude Analytics API key",
    owner: "Recommended · your firm's key",
    unlocks: "Daily active-on-real-work, surfaces, connectors, premium seat utilisation and skill activations across Adoption, Groups, Skills and Cost.",
    without: "Without it, adoption and seat-cost figures say they are not connected yet; progress on the ladder still shows.",
    placeholder: "Analytics key with read:analytics",
    help: "Claude Enterprise → Organization settings → API keys → Analytics (scope read:analytics).",
    platformFallback: false,
  },
  claude_admin: {
    title: "Claude Admin API key",
    owner: "Recommended · your firm's key",
    unlocks: "Roster and group import into Teams & People, and observed plugin ↔ group assignment for drift detection.",
    without: "Without it, “Import groups from Claude” returns Not configured and assignment drift shows “unknown” for the observed mode.",
    placeholder: "Admin API key",
    help: "Claude Enterprise → Organization settings → API keys → Admin.",
    platformFallback: false,
  },
  github: {
    title: "GitHub token",
    owner: "Optional · your firm's marketplace repo",
    unlocks: "Promotion requests open real pull requests in your company's skill repository; merges commit to main.",
    without: "Without it, promotions are recorded locally with a PR number but no PR URL, and the repo is synced from the local working tree.",
    placeholder: "github_pat_…",
    help: "A fine-grained PAT with contents:write and pull_requests:write on the marketplace repo.",
    platformFallback: true,
    configFields: [{ key: "repo", label: "Repository", placeholder: "meridian/meridian-claude-marketplace" }],
  },
}

export function KeyCard({ summary, canWrite, onSave, onVerify, onRemove, busy }: {
  summary: IntegrationSummary
  canWrite: boolean
  onSave: (secret: string, config?: Record<string, string>) => Promise<unknown>
  onVerify: () => Promise<unknown>
  onRemove: () => Promise<unknown>
  busy?: "save" | "verify" | "remove" | null
}) {
  const meta = KEY_META[summary.kind]
  const usingPlatform = summary.configured && summary.source === "platform"
  const status: { label: string; tone: string; icon: React.ReactNode } = summary.status === "invalid"
    ? { label: "Invalid", tone: "border-fail/40 bg-fail-soft text-foreground", icon: <ShieldAlertIcon className="size-3" /> }
    : !summary.configured
    ? { label: "Not configured", tone: "border-border text-muted-foreground", icon: <CircleDashedIcon className="size-3" /> }
    : usingPlatform
      ? { label: "Using LightCI's key", tone: "border-glow bg-glow-soft text-glow-foreground", icon: <KeyRoundIcon className="size-3" /> }
      : summary.status === "verified"
        ? { label: "Verified", tone: "border-pass/40 bg-pass-soft text-foreground", icon: <CheckCircle2Icon className="size-3" /> }
        : { label: "Unverified", tone: "border-revise/40 bg-revise-soft text-foreground", icon: <CircleDashedIcon className="size-3" /> }

  return (
    <section className={cn("flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10", summary.status === "invalid" && "ring-fail/40")} data-testid={`key-card-${summary.kind}`} data-state={status.label}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-medium leading-tight">{meta.title}</h3>
          <p className="text-xs text-muted-foreground">{meta.owner}</p>
        </div>
        <Badge variant="outline" className={cn("gap-1", status.tone)} data-testid="key-status">
          {status.icon} {status.label}
        </Badge>
      </header>

      <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Key</dt>
        <dd className="font-mono" data-testid="key-last4">{summary.source === "org" && summary.last4 ? `••••••••${summary.last4}` : usingPlatform ? "LightCI platform key (not visible here)" : "—"}</dd>
        <dt className="text-muted-foreground">Verified</dt>
        <dd>{summary.verifiedAt ? `${fmt.date(summary.verifiedAt)} (${fmt.ago(summary.verifiedAt)})` : summary.source === "org" ? "not yet" : "—"}</dd>
        {summary.verificationDetail && (
          <>
            <dt className="text-muted-foreground">Detail</dt>
            <dd className={cn(summary.status === "invalid" && "text-fail")} data-testid="key-detail">{summary.verificationDetail}</dd>
          </>
        )}
        {Object.entries(summary.config ?? {}).map(([k, v]) => (
          <span key={k} className="contents">
            <dt className="text-muted-foreground capitalize">{k}</dt>
            <dd className="font-mono">{v}</dd>
          </span>
        ))}
      </dl>

      <div className="space-y-1.5 rounded-lg bg-muted/40 p-3 text-xs leading-relaxed">
        <p><span className="font-medium">Unlocks:</span> {meta.unlocks}</p>
        <p className="text-muted-foreground">{meta.without}</p>
      </div>

      <footer className="mt-auto flex flex-wrap items-center gap-2">
        {canWrite ? (
          <>
            <AddKeyDialog kind={summary.kind} replace={summary.source === "org"} onSave={onSave} busy={busy === "save"} />
            {summary.source === "org" && (
              <>
                <Button size="sm" variant="outline" onClick={() => onVerify().then(() => toast.success(`${meta.title} verified`)).catch((e) => toast.error("Verification failed", { description: e instanceof ApiError ? e.detail : String(e) }))} disabled={busy === "verify"} data-testid="key-verify">
                  <RefreshCwIcon data-icon="inline-start" className={busy === "verify" ? "animate-spin" : ""} /> Verify
                </Button>
                <RemoveDialog title={meta.title} fallback={meta.platformFallback} onRemove={onRemove} busy={busy === "remove"} />
              </>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Only a company admin can add or remove keys.</p>
        )}
      </footer>
    </section>
  )
}

function AddKeyDialog({ kind, replace, onSave, busy }: { kind: IntegrationKind; replace: boolean; onSave: (secret: string, config?: Record<string, string>) => Promise<unknown>; busy: boolean }) {
  const meta = KEY_META[kind]
  const [open, setOpen] = useState(false)
  const [secret, setSecret] = useState("")
  const [show, setShow] = useState(false)
  const [config, setConfig] = useState<Record<string, string>>({})
  const reset = () => {
    setSecret("")
    setShow(false)
    setConfig({})
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <DialogTrigger render={<Button size="sm" data-testid="key-add" />}>
        <KeyRoundIcon data-icon="inline-start" /> {replace ? "Replace key" : "Add key"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{replace ? "Replace" : "Add"} {meta.title}</DialogTitle>
          <DialogDescription>{meta.help} The key is encrypted at rest and never shown again — only its last four characters.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!secret.trim()) return
            onSave(secret, Object.keys(config).length ? config : undefined)
              .then(() => {
                toast.success(`${meta.title} saved`, { description: "We verified it against the provider; see the card for the result." })
                setOpen(false)
                reset()
              })
              .catch((e) => toast.error("Couldn't save the key", { description: e instanceof ApiError ? e.detail : String(e) }))
          }}
          data-testid="key-form"
        >
          <div className="grid gap-1">
            <Label htmlFor={`secret-${kind}`} className="text-xs">Secret</Label>
            <div className="relative">
              <Input id={`secret-${kind}`} type={show ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder={meta.placeholder} value={secret} onChange={(e) => setSecret(e.target.value)} className="pr-9 font-mono" data-testid="key-secret-input" />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-2 grid place-items-center text-muted-foreground hover:text-foreground" aria-label={show ? "Hide" : "Show"}>
                {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </button>
            </div>
          </div>
          {meta.configFields?.map((f) => (
            <div key={f.key} className="grid gap-1">
              <Label htmlFor={`cfg-${kind}-${f.key}`} className="text-xs">{f.label}</Label>
              <Input id={`cfg-${kind}-${f.key}`} placeholder={f.placeholder} value={config[f.key] ?? ""} onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))} className="font-mono" data-testid={`key-config-${f.key}`} />
            </div>
          ))}
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={!secret.trim() || busy} data-testid="key-save">
              {busy ? "Saving and verifying…" : "Save and verify"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RemoveDialog({ title, fallback, onRemove, busy }: { title: string; fallback: boolean; onRemove: () => Promise<unknown>; busy: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" className="text-destructive" data-testid="key-remove" />}>
        <Trash2Icon data-icon="inline-start" /> Remove
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove {title}?</DialogTitle>
          <DialogDescription>{fallback ? "Activate will fall back to LightCI's platform key. Features keep working; billing moves to LightCI." : "Features that depend on this key will show “Not configured” until a new key is added. Nothing is deleted from Claude."}</DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton>
          <Button variant="destructive" disabled={busy} data-testid="key-remove-confirm" onClick={() => onRemove().then(() => { toast.success(`${title} removed`); setOpen(false) }).catch((e) => toast.error("Couldn't remove the key", { description: e instanceof ApiError ? e.detail : String(e) }))}>
            {busy ? "Removing…" : "Remove key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
