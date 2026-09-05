"use client"

import { ShieldAlert, ShieldCheck, ShieldEllipsis } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { BoundaryBadgeLevel } from "@/hooks/library/types"

export const BOUNDARY_META: Record<BoundaryBadgeLevel, { label: string; explain: string; icon: typeof ShieldCheck; cls: string }> = {
  green: {
    label: "Clear boundary",
    explain: "Reads no restricted data classes and has no human-review steps. Anyone at the required rung can adopt it.",
    icon: ShieldCheck,
    cls: "bg-pass-soft text-pass border-pass/30",
  },
  amber: {
    label: "Human review",
    explain: "Declares human-review steps (for example before send or before CRM entry). Output is a draft until a named person signs it.",
    icon: ShieldEllipsis,
    cls: "bg-revise-soft text-glow-foreground border-revise/40",
  },
  red: {
    label: "Restricted classes",
    explain: "Touches data classes your compliance boundary restricts. Publishing requires compliance approval in addition to the champion.",
    icon: ShieldAlert,
    cls: "bg-fail-soft text-fail border-fail/30",
  },
}

/** The boundary badge rides on the card itself. Tooltip explains what the colour means in plain words. */
export function BoundaryBadge({ level, className, compact }: { level: BoundaryBadgeLevel; className?: string; compact?: boolean }) {
  const m = BOUNDARY_META[level] ?? BOUNDARY_META.amber
  const Icon = m.icon
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className={cn("inline-flex h-5 cursor-help items-center gap-1 rounded-full border px-1.5 text-xs font-medium", m.cls, className)} data-testid="boundary-badge" data-level={level} />}
      >
        <Icon className="size-3" />
        {!compact && <span>{m.label}</span>}
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        <span><strong className="font-medium">{m.label}.</strong> {m.explain}</span>
      </TooltipContent>
    </Tooltip>
  )
}
