"use client"

import { Activity, Users } from "lucide-react"
import { RungBadge } from "@/components/brand/rung"
import { BoundaryBadge } from "./boundary-badge"
import { GradeChip } from "./grade-chip"
import { HealthFlags } from "./health-flags"
import { PersonChip } from "./person-chip"
import { SkillActions } from "./skill-actions"
import { StatusRibbon } from "./status-ribbon"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { SkillCard as SkillCardT } from "@/hooks/library/types"

/**
 * The one canonical skill card. Resting field budget: name, trigger, owner, team, 30d usage, grade, boundary, health.
 * Version and "updated" are revealed on hover. Click anywhere opens the quick-look; the buttons stop propagation.
 */
export function SkillCard({ skill, onQuickLook, className, compact = false, showActions = true, index = 0 }: { skill: SkillCardT; onQuickLook?: (s: SkillCardT) => void; className?: string; compact?: boolean; showActions?: boolean; index?: number }) {
  const open = () => onQuickLook?.(skill)
  return (
    <article
      className={cn(
        "group/card relative flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground transition-shadow animate-rise",
        onQuickLook && "cursor-pointer hover:shadow-md hover:glow-ring focus-visible:glow-ring outline-none",
        skill.status === "deprecated" && "opacity-75",
        className,
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      onClick={open}
      onKeyDown={(e) => { if (onQuickLook && (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); open() } }}
      tabIndex={onQuickLook ? 0 : undefined}
      role={onQuickLook ? "button" : undefined}
      aria-label={onQuickLook ? `Quick look at ${skill.name}` : undefined}
      data-testid="skill-card"
      data-slug={skill.slug}
      data-status={skill.status}
    >
      <StatusRibbon status={skill.status} />
      <header className={cn("flex items-start justify-between gap-3", skill.status !== "published" && "pt-4")}>
        <div className="min-w-0">
          <h3 className="font-display truncate text-lg font-medium leading-tight">{skill.name}</h3>
          <p className={cn("mt-1 text-sm text-muted-foreground", compact ? "line-clamp-1" : "line-clamp-2")} title={skill.triggerLine}>{skill.triggerLine}</p>
        </div>
        <BoundaryBadge level={skill.boundaryBadge} compact />
      </header>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        <PersonChip person={skill.owner} size="xs" />
        {skill.team && <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground" data-testid="team-chip">{skill.team.name}</span>}
        <RungBadge rung={skill.rungRequired} showName={false} className="h-5 px-1.5 text-[11px]" />
      </div>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="inline-flex items-center gap-1 tabular" title="Active users, last 30 days"><Users className="size-3.5" />{fmt.num(skill.activeUsers30d)}</span>
          <span className="inline-flex items-center gap-1 tabular" title="Runs, last 30 days"><Activity className="size-3.5" />{fmt.num(skill.runs30d)}</span>
          <GradeChip grade={skill.grade} />
        </div>
        <HealthFlags flags={skill.health} max={2} />
      </footer>

      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100" data-testid="skill-version">
          v{skill.version} · {fmt.ago(skill.updatedAt)}
        </span>
        {showActions && <SkillActions skill={skill} size="xs" />}
      </div>
    </article>
  )
}

export function SkillCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4" aria-hidden>
      <div className="h-5 w-2/3 rounded bg-muted" />
      <div className="h-4 w-full rounded bg-muted" />
      <div className="h-4 w-1/2 rounded bg-muted" />
      <div className="mt-auto h-4 w-1/3 rounded bg-muted" />
    </div>
  )
}
