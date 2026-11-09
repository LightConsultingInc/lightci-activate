"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { HealthFlag } from "@/hooks/library/types"

export const HEALTH_META: Record<HealthFlag, { label: string; explain: string; tone: "fail" | "revise" | "info" }> = {
  unused_30d: { label: "Not used lately", explain: "Nobody has used it in the last 30 days. Worth checking its description still matches how people ask for it.", tone: "info" },
  grade_below_threshold: { label: "Score dropped", explain: "Its latest check scored below the bar for sharing. Worth revising.", tone: "fail" },
  boundary_gap: { label: "Data list out of date", explain: "Your firm added a kind of private information this skill does not mention yet. Update what it may use before sharing a new version.", tone: "fail" },
  owner_left: { label: "Owner left", explain: "The person who owns it has left the firm. Your champion should hand it to someone else.", tone: "revise" },
  overlapping_trigger: { label: "Overlaps", explain: "Its description overlaps another skill in the library. Consider merging them or making the description sharper.", tone: "revise" },
  pending_review: { label: "Waiting for approval", explain: "A request to share it is waiting for someone to approve it.", tone: "info" },
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
