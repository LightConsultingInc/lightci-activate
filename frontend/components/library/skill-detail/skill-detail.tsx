"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, Route } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { RungBadge } from "@/components/brand/rung"
import { Paper } from "@/components/brand/grain"
import { EmptyState, ErrorState } from "@/components/shell/empty-state"
import { useMe, hasRole } from "@/hooks/use-me"
import { useSkill } from "@/hooks/library/queries"
import { ApiError } from "@/lib/api"
import { fmt } from "@/lib/format"
import { BoundaryBadge } from "../boundary-badge"
import { GradeRing } from "../grade-chip"
import { HealthFlags } from "../health-flags"
import { PersonChip } from "../person-chip"
import { StatusRibbon } from "../status-ribbon"
import { describeError } from "../skill-actions"
import { ActionBar } from "./action-bar"
import { SkillTab } from "./skill-tab"
import { SampleCasesTab } from "./sample-cases-tab"
import { BoundaryTab } from "./boundary-tab"
import { VersionsTab } from "./versions-tab"
import { UsageTab } from "./usage-tab"
import { DiscussionTab } from "./discussion-tab"
import { Button } from "@/components/ui/button"

const TABS = ["skill", "cases", "boundary", "versions", "usage", "discussion"] as const
type Tab = (typeof TABS)[number]

export function SkillDetailView({ slug }: { slug: string }) {
  const me = useMe()
  const sp = useSearchParams()
  const router = useRouter()
  const q = useSkill(slug)
  const initialTab = (sp.get("tab") as Tab | null) ?? "skill"
  const [tab, setTab] = useState<Tab>(TABS.includes(initialTab) ? initialTab : "skill")
  const [editing, setEditing] = useState(sp.get("edit") === "1")

  if (q.isPending) return <DetailSkeleton />
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404)
      return <EmptyState title="No skill at this address" description="It may have been renamed or never published. The library search finds skills by name or trigger line." action={<Button render={<Link href="/library" />}>Back to the library</Button>} />
    return <ErrorState title="Couldn't load this skill" detail={describeError(q.error)} retry={() => q.refetch()} />
  }
  const skill = q.data
  const isOwner = Boolean(me.user && skill.owner && me.user.id === skill.owner.id)
  const isChampion = hasRole(me, "champion")
  const canEdit = isOwner || isChampion || skill.status === "draft"
  const latest = skill.grades?.[0] ?? (skill.grade ? { ...skill.grade } : null)

  const onEdit = (v: boolean) => {
    setEditing(v)
    const next = new URLSearchParams(sp.toString())
    if (v) next.set("edit", "1"); else next.delete("edit")
    router.replace(`/library/${slug}${next.toString() ? `?${next}` : ""}`, { scroll: false })
  }

  return (
    <div className="animate-rise">
      <Link href="/library" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="back-to-library"><ChevronLeft className="size-4" /> Library</Link>

      <Paper className="rounded-2xl border bg-card p-6 md:p-8" data-testid="skill-hero">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusRibbon status={skill.status} variant="chip" successor={skill.successor} />
              <BoundaryBadge level={skill.boundaryBadge} />
              <RungBadge rung={skill.rungRequired} />
              <span className="font-mono text-xs text-muted-foreground" data-testid="skill-version">v{skill.version}</span>
              {skill.plugin && <span className="font-mono text-xs text-muted-foreground">plugin/{skill.plugin}</span>}
            </div>
            <h1 className="font-display mt-3 text-3xl font-medium leading-tight md:text-4xl">{skill.name}</h1>
            <p className="mt-2 max-w-2xl text-base text-muted-foreground md:text-lg">{skill.triggerLine}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <PersonChip person={skill.owner} size="sm" showTitle />
              {skill.team && <span className="rounded-full bg-secondary px-2.5 py-0.5 text-sm" data-testid="team-chip">{skill.team.name}</span>}
              {skill.workflow && <Link href="/workflows" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><Route className="size-3.5" /> {skill.workflow.name}</Link>}
              <span className="text-muted-foreground tabular">{fmt.num(skill.activeUsers30d)} active · {fmt.num(skill.runs30d)} runs · 30d</span>
            </div>
            {skill.health.length > 0 && <div className="mt-3"><HealthFlags flags={skill.health} max={6} /></div>}
          </div>
          <div className="flex flex-col items-center gap-1">
            <GradeRing grade={latest} size={88} />
            <span className="eyebrow">grade</span>
          </div>
        </div>
      </Paper>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-6">
        <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b" data-testid="skill-tabs">
          <TabsTrigger value="skill" data-testid="tab-skill">Skill</TabsTrigger>
          <TabsTrigger value="cases" data-testid="tab-cases">Sample cases <Count n={skill.sampleCases.length} /></TabsTrigger>
          <TabsTrigger value="boundary" data-testid="tab-boundary">Boundary</TabsTrigger>
          <TabsTrigger value="versions" data-testid="tab-versions">Versions <Count n={skill.versions.length} /></TabsTrigger>
          <TabsTrigger value="usage" data-testid="tab-usage">Usage</TabsTrigger>
          <TabsTrigger value="discussion" data-testid="tab-discussion">Discussion <Count n={skill.comments.length} /></TabsTrigger>
        </TabsList>
        <div className="pt-6">
          <TabsContent value="skill"><SkillTab key={`${skill.id}-${skill.updatedAt}`} skill={skill} canEdit={canEdit} editing={editing} setEditing={onEdit} /></TabsContent>
          <TabsContent value="cases"><SampleCasesTab key={`${skill.id}-${skill.updatedAt}`} skill={skill} canEdit={canEdit} /></TabsContent>
          <TabsContent value="boundary"><BoundaryTab key={`${skill.id}-${skill.updatedAt}`} skill={skill} canEdit={canEdit} /></TabsContent>
          <TabsContent value="versions"><VersionsTab skill={skill} isChampion={isChampion} /></TabsContent>
          <TabsContent value="usage"><UsageTab skill={skill} /></TabsContent>
          <TabsContent value="discussion"><DiscussionTab skill={skill} /></TabsContent>
        </div>
      </Tabs>

      <ActionBar skill={skill} isOwner={isOwner} isChampion={isChampion} />
    </div>
  )
}

function Count({ n }: { n: number }) {
  return <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] tabular text-muted-foreground">{n}</span>
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-20" />
      <div className="rounded-2xl border bg-card p-8"><Skeleton className="h-5 w-64" /><Skeleton className="mt-4 h-9 w-2/3" /><Skeleton className="mt-3 h-5 w-1/2" /></div>
      <Skeleton className="h-8 w-96" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
