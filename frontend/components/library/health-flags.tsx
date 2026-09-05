"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { HealthFlag } from "@/hooks/library/types"

export const HEALTH_META: Record<HealthFlag, { label: string; explain: string; tone: "fail" | "revise" | "info" }> = {
  unused_30d: { label: "Unused 30d", explain: "No activations in the last 30 days. Worth checking the trigger line still matches how people ask for it.", tone: "info" },
  grade_below_threshold: { label: "Grade slipped", explain: "The scheduled re-grade came back below the publishing threshold. A revision is recommended.", tone: "fail" },
  boundary_gap: { label: "Boundary gap", explain: "The org boundary gained a restricted class this skill does not declare. Update the declaration before the next promotion.", tone: "fail" },
  owner_left: { label: "Owner left", explain: "The owner is no longer in the org (from the Admin API). The champion should reassign it.", tone: "revise" },
  overlapping_trigger: { label: "Overlaps", explain: "The Grader flagged a trigger line that overlaps another skill in the library. Consider merging or sharpening the trigger.", tone: "revise" },
  pending_review: { label: "In queue", explain: "A promotion request is waiting on an approver.", tone: "info" },
}

const TONE = { fail: "bg-fail-soft text-fail border-fail/30", revise: "bg-revise-soft text-glow-foreground border-revise/40", info: "bg-info-soft text-info border-info/30" }

export function HealthFlags({ flags, className, max = 3 }: { flags: HealthFlag[]; className?: string; max?: number }) {
  if (!flags?.length) return null
  const shown = flags.slice(0, max)
  const rest = flags.length - shown.length
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)} data-testid="health-flags">
      {shown.map((f) => {
        const m = HEALTH_META[f] ?? { label: f, explain: "", tone: "info" as const }
        return (
          <Tooltip key={f}>
            <TooltipTrigger render={<span className={cn("inline-flex h-5 cursor-help items-center rounded-full border px-1.5 text-[11px] font-medium", TONE[m.tone])} data-testid={`health-${f}`} />}>{m.label}</TooltipTrigger>
            <TooltipContent className="max-w-64">{m.explain}</TooltipContent>
          </Tooltip>
        )
      })}
      {rest > 0 && <span className="text-[11px] text-muted-foreground">+{rest}</span>}
    </span>
  )
}
