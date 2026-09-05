"use client"

import { GitCommitHorizontal, RotateCcw, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { PersonChip } from "../person-chip"
import type { SkillDetail } from "@/hooks/library/types"

export function VersionsTab({ skill, isChampion }: { skill: SkillDetail; isChampion: boolean }) {
  const versions = [...skill.versions].sort((a, b) => b.version - a.version)
  if (versions.length === 0) return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No versions committed yet. Saving the skill creates v1.</p>
  return (
    <ol className="relative ml-3 border-l pl-6" data-testid="versions-timeline">
      {versions.map((v, i) => {
        const prev = versions[i + 1]
        const delta = v.gradeScore != null && prev?.gradeScore != null ? v.gradeScore - prev.gradeScore : null
        const isCurrent = v.version === skill.version
        return (
          <li key={v.id} className="relative pb-8 last:pb-0" data-testid="version-row" data-version={v.version}>
            <span className={cn("absolute -left-[31px] top-1 grid size-5 place-items-center rounded-full border-2 bg-background", isCurrent ? "border-glow" : "border-border")}>
              <GitCommitHorizontal className="size-3 text-muted-foreground" />
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold">v{v.version}</span>
              {v.tag && <span className="inline-flex items-center gap-1 rounded-full bg-pass-soft px-2 py-0.5 font-mono text-[11px] text-pass"><Tag className="size-3" />{v.tag}</span>}
              {isCurrent && <span className="rounded-full bg-glow-soft px-2 py-0.5 text-[11px] font-medium text-glow-foreground">current</span>}
              {v.commitSha && <span className="font-mono text-[11px] text-muted-foreground">{v.commitSha.slice(0, 7)}</span>}
              <span className="text-xs text-muted-foreground">{fmt.date(v.createdAt)}</span>
              {v.gradeScore != null && (
                <span className="ml-auto inline-flex items-center gap-1 text-xs tabular">
                  grade {fmt.score(v.gradeScore)}
                  {delta != null && delta !== 0 && <span className={delta > 0 ? "text-pass" : "text-fail"}>{delta > 0 ? "▲" : "▼"} {Math.abs(delta * 10).toFixed(1)}</span>}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm">{v.changelog || <span className="text-muted-foreground italic">No changelog</span>}</p>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <PersonChip person={v.author} size="xs" muted />
              {v.approvers.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  approved by
                  <span className="flex -space-x-1.5">
                    {v.approvers.map((a) => (
                      <Avatar key={a.id} className="size-5 border border-background text-[9px]" title={a.name}>
                        {a.avatarUrl && <AvatarImage src={a.avatarUrl} alt="" />}
                        <AvatarFallback className="bg-pass-soft text-pass">{fmt.initials(a.name)}</AvatarFallback>
                      </Avatar>
                    ))}
                  </span>
                </span>
              )}
              {!isCurrent && (
                <Tooltip>
                  <TooltipTrigger render={<span className="ml-auto inline-flex" />}>
                    <Button size="xs" variant="outline" disabled={!isChampion} data-testid="version-rollback" aria-disabled={!isChampion}>
                      <RotateCcw data-icon="inline-start" /> Roll back
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isChampion ? "Opens a revert PR to this version; goes through the promotion queue." : "Only the team champion can roll back a version."}</TooltipContent>
                </Tooltip>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
