import Link from "next/link"
import { cn } from "@/lib/utils"
import type { SkillCard, SkillStatus } from "@/hooks/library/types"

export const STATUS_META: Record<SkillStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-muted text-muted-foreground" },
  in_review: { label: "In review", cls: "bg-info-soft text-info" },
  published: { label: "Published", cls: "bg-pass-soft text-pass" },
  deprecated: { label: "Deprecated", cls: "bg-fail-soft text-fail" },
}

/** Status ribbon: a small angled tab at the top-left of a card, or an inline chip. Deprecated shows the successor. */
export function StatusRibbon({ status, successor, variant = "ribbon", className }: { status: SkillStatus; successor?: SkillCard | null; variant?: "ribbon" | "chip"; className?: string }) {
  const m = STATUS_META[status] ?? STATUS_META.draft
  if (variant === "chip") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", m.cls, className)} data-testid="status-chip" data-status={status}>
        {m.label}
        {status === "deprecated" && successor && (
          <>
            <span className="opacity-60">→</span>
            <Link href={`/library/${successor.slug}`} className="underline underline-offset-2" data-testid="successor-link">{successor.name}</Link>
          </>
        )}
      </span>
    )
  }
  if (status === "published") return null
  return (
    <span className={cn("absolute left-0 top-3 rounded-r-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] shadow-sm", m.cls, className)} data-testid="status-ribbon" data-status={status}>
      {m.label}
    </span>
  )
}
