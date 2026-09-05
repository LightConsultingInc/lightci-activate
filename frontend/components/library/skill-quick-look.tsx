"use client"

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { RungBadge } from "@/components/brand/rung"
import { ErrorState } from "@/components/shell/empty-state"
import { useSkill } from "@/hooks/library/queries"
import { fmt } from "@/lib/format"
import { BoundaryBadge } from "./boundary-badge"
import { GradeChip } from "./grade-chip"
import { HealthFlags } from "./health-flags"
import { MarkdownLite } from "./markdown-lite"
import { PersonChip } from "./person-chip"
import { SkillActions, describeError } from "./skill-actions"
import { StatusRibbon } from "./status-ribbon"
import type { SkillCard } from "@/hooks/library/types"

/** App-wide quick-look drawer: swapped in place by the caller passing a different `skill`; full page is one click away. */
export function SkillQuickLook({ skill, onClose }: { skill: SkillCard | null; onClose: () => void }) {
  return (
    <Sheet open={Boolean(skill)} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto" data-testid="skill-quick-look">
        {skill && <QuickLookBody skill={skill} />}
      </SheetContent>
    </Sheet>
  )
}

function QuickLookBody({ skill }: { skill: SkillCard }) {
  const q = useSkill(skill.slug)
  const d = q.data
  return (
    <>
      <SheetHeader className="pb-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusRibbon status={skill.status} variant="chip" successor={d?.successor} />
          <BoundaryBadge level={skill.boundaryBadge} />
          <RungBadge rung={skill.rungRequired} />
        </div>
        <SheetTitle className="font-display mt-2 text-2xl font-medium leading-tight">{skill.name}</SheetTitle>
        <SheetDescription className="text-base">{skill.triggerLine}</SheetDescription>
      </SheetHeader>

      <div className="px-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-muted/30 p-3 text-sm sm:grid-cols-3">
          <Fact label="Owner"><PersonChip person={skill.owner} size="xs" /></Fact>
          <Fact label="Team">{skill.team?.name ?? "Shared"}</Fact>
          <Fact label="Version"><span className="font-mono">v{skill.version}</span></Fact>
          <Fact label="Active users 30d"><span className="tabular">{fmt.num(skill.activeUsers30d)}</span></Fact>
          <Fact label="Runs 30d"><span className="tabular">{fmt.num(skill.runs30d)}</span></Fact>
          <Fact label="Grade"><GradeChip grade={skill.grade} /></Fact>
        </dl>
        {skill.health.length > 0 && <div className="mt-3"><HealthFlags flags={skill.health} max={6} /></div>}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <SkillActions skill={skill} size="sm" showOpen={false} />
          <Button size="sm" render={<Link href={`/library/${skill.slug}`} />} data-testid="quick-look-open-full">
            Open full page <ArrowUpRight data-icon="inline-end" />
          </Button>
        </div>

        <p className="eyebrow mt-6 mb-2">SKILL.md</p>
        {q.isPending ? (
          <div className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-24 w-full" /></div>
        ) : q.isError ? (
          <ErrorState title="Couldn't load SKILL.md" detail={describeError(q.error)} retry={() => q.refetch()} />
        ) : (
          <MarkdownLite source={d?.skillMd ?? ""} className="pb-8" />
        )}
      </div>
    </>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow !text-[10px]">{label}</dt>
      <dd className="mt-1 truncate">{children}</dd>
    </div>
  )
}
