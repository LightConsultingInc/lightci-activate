"use client"

import Link from "next/link"
import { CheckIcon, CircleIcon, ArrowRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { SetupStep } from "@/hooks/mc/types"
import { cn } from "@/lib/utils"

/** Where each provisioning step is completed. Keys follow GET /org/setup. */
const STEP_LINKS: Record<string, { href: string; cta: string }> = {
  keys: { href: "/admin/integrations", cta: "Integrations & Keys" },
  sso: { href: "/admin/teams", cta: "Invite people" },
  groups: { href: "/admin/teams", cta: "Import groups" },
  context: { href: "/admin/policy", cta: "Company context" },
  governance: { href: "/admin/policy", cta: "Policy & Boundary" },
  repo: { href: "/admin/marketplace", cta: "Marketplace repo" },
  connector: { href: "/admin/integrations", cta: "Connector" },
  baseline: { href: "/mission-control/backlog", cta: "Backlog & baselines" },
}

/** The client provisioning checklist (spec §2.1) rendered as a wizard with step states and links. */
export function SetupChecklist({ steps, compact, linkBase = "", readOnly }: { steps: SetupStep[]; compact?: boolean; linkBase?: string; readOnly?: boolean }) {
  const done = steps.filter((s) => s.done).length
  const nextIdx = steps.findIndex((s) => !s.done)
  return (
    <div data-testid="setup-checklist" data-done={done} data-total={steps.length}>
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          <span className="tabular font-medium text-foreground">{done}</span> of {steps.length} steps complete
        </span>
        {done === steps.length && steps.length > 0 && <span className="font-medium text-pass">Ready for kickoff</span>}
      </div>
      <div className="mb-4 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted">
        {steps.map((s, i) => (
          <span key={s.key} className={cn("flex-1", s.done ? "bg-pass" : i === nextIdx ? "bg-glow" : "bg-transparent")} />
        ))}
      </div>
      <ol className={cn("space-y-1", compact && "space-y-0.5")}>
        {steps.map((s, i) => {
          const isNext = i === nextIdx
          const link = STEP_LINKS[s.key]
          return (
            <li key={s.key} className={cn("flex items-start gap-3 rounded-lg p-2", isNext && "bg-glow-soft/60 ring-1 ring-glow/40")} data-testid={`setup-step-${s.key}`} data-done={s.done}>
              <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[10px]", s.done ? "border-pass bg-pass text-white" : isNext ? "border-glow text-glow-foreground" : "text-muted-foreground")}>
                {s.done ? <CheckIcon className="size-3" /> : <CircleIcon className="size-2" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium", s.done && "text-muted-foreground")}>
                  <span className="mr-1.5 tabular text-xs text-muted-foreground">{i + 1}.</span>
                  {s.label}
                </p>
                {s.detail && !compact && <p className="text-xs text-muted-foreground">{s.detail}</p>}
              </div>
              {!s.done && link && !readOnly && (
                <Button size="xs" variant={isNext ? "default" : "ghost"} render={<Link href={`${linkBase}${link.href}`} />} data-testid="setup-step-link">
                  {link.cta} <ArrowRightIcon data-icon="inline-end" />
                </Button>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
