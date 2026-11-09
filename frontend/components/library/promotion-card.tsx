import Link from "next/link"
import { ArrowUpRight, GitPullRequest } from "lucide-react"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { GradeChip } from "./grade-chip"
import { PersonChip } from "./person-chip"
import type { PromotionDecision, PromotionView } from "@/hooks/library/types"

export const DECISION_META: Record<PromotionDecision, { label: string; cls: string }> = {
  pending: { label: "Awaiting approval", cls: "bg-info-soft text-info" },
  approved: { label: "Approved", cls: "bg-pass-soft text-pass" },
  merged: { label: "Published", cls: "bg-pass text-paper" },
  sent_back: { label: "Sent back", cls: "bg-revise-soft text-glow-foreground" },
  withdrawn: { label: "Withdrawn", cls: "bg-muted text-muted-foreground" },
}

export function DecisionChip({ decision, className }: { decision: PromotionDecision; className?: string }) {
  const m = DECISION_META[decision] ?? DECISION_META.pending
  return <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-xs font-medium", m.cls, className)} data-testid="decision-chip" data-decision={decision}>{m.label}</span>
}

export function PrRef({ p, className }: { p: Pick<PromotionView, "prNumber" | "prUrl">; className?: string }) {
  const label = p.prNumber != null ? `#${p.prNumber}` : "PR"
  if (p.prUrl) return <a href={p.prUrl} target="_blank" rel="noopener noreferrer" className={cn("inline-flex items-center gap-1 font-mono text-xs underline-offset-4 hover:underline", className)} data-testid="pr-link"><GitPullRequest className="size-3.5" />{label}</a>
  return <span className={cn("inline-flex items-center gap-1 font-mono text-xs text-muted-foreground", className)} title="Not connected to GitHub yet, so this request is tracked inside Activate" data-testid="pr-local"><GitPullRequest className="size-3.5" />{label} <span className="rounded bg-muted px-1 text-[10px] font-sans">not on GitHub</span></span>
}

/** Compact promotion row: skill, version, requester, PR, grade, approvals progress. Links to the one-screen approval. */
export function PromotionCard({ p, className }: { p: PromotionView; className?: string }) {
  const approved = new Set(p.approvals.filter((a) => a.decision === "approve").map((a) => a.role))
  return (
    <Link href={`/promotions/${p.id}`} className={cn("group flex flex-col gap-2 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md hover:glow-ring", p.highExposure && "border-fail/40", className)} data-testid="promotion-card" data-decision={p.decision}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display truncate text-base font-medium">{p.skill.name} <span className="font-mono text-xs text-muted-foreground">v{p.version}</span></p>
          <p className="truncate text-xs text-muted-foreground">{p.skill.triggerLine}</p>
        </div>
        <DecisionChip decision={p.decision} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <PersonChip person={p.requestedBy} size="xs" muted />
        <PrRef p={p} />
        <GradeChip grade={p.grade ? { score: p.grade.score, decision: p.grade.decision } : null} />
        {p.highExposure && <span className="rounded-full bg-fail-soft px-2 py-0.5 font-medium text-fail">Compliance required</span>}
        <span className="ml-auto flex items-center gap-1" title="Who needs to sign off">
          {p.requiredApproverRoles.map((r) => (
            <span key={r} className={cn("rounded-full border px-1.5 py-0.5 capitalize", approved.has(r) ? "border-pass/40 bg-pass-soft text-pass" : "border-dashed text-muted-foreground")}>{r}</span>
          ))}
        </span>
        <span className="text-muted-foreground">{fmt.ago(p.createdAt)}</span>
        <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  )
}
