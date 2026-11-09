"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowUpRight, ClipboardCheck, GitPullRequest } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader, SectionHeader } from "@/components/shell/page-header"
import { EmptyState, ErrorState } from "@/components/shell/empty-state"
import { PersonChip } from "@/components/library/person-chip"
import { SkillCard } from "@/components/library/skill-card"
import { SkillQuickLook } from "@/components/library/skill-quick-look"
import { PromotionCard } from "@/components/library/promotion-card"
import { describeError } from "@/components/library/skill-actions"
import { useTeam } from "@/hooks/library/queries"
import { fmt } from "@/lib/format"
import { ApiError } from "@/lib/api"
import { StatsStrip } from "./stats-strip"
import { RosterTable } from "./roster-table"
import { BacklogTable } from "./backlog-table"
import { ReadoutDialog } from "./readout-dialog"
import type { SkillCard as SkillCardT } from "@/hooks/library/types"

export function TeamDashboard() {
  const q = useTeam()
  const [quick, setQuick] = useState<SkillCardT | null>(null)
  if (q.isPending) return <><PageHeader eyebrow="Champion" title="Team" /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="mt-6 h-64" /></>
  // Not on a team yet is a normal state for a new champion, not an error.
  if (q.isError && q.error instanceof ApiError && q.error.status === 404)
    return <><PageHeader eyebrow="Champion" title="Team" /><EmptyState title="You're not on a team yet" description="Once your admin puts you on a team under Teams & People, its people, their progress and its review queue show up here." className="mt-4" /></>
  if (q.isError) return <><PageHeader eyebrow="Champion" title="Team" /><ErrorState title="Couldn't load your team" detail={describeError(q.error)} retry={() => q.refetch()} /></>
  const t = q.data
  return (
    <>
      <PageHeader
        eyebrow="Champion"
        title={t.team.name}
        description={<span className="inline-flex flex-wrap items-center gap-2">Champion <PersonChip person={t.team.champion} size="xs" /> · plugin <span className="font-mono text-xs">{t.team.plugin}</span></span>}
        actions={<ReadoutDialog />}
      />
      <StatsStrip stats={t.stats} />

      <section className="mt-8" data-testid="team-roster">
        <SectionHeader title="Roster" description="Click a person to see their progress, time saved and coaching notes." />
        <RosterTable roster={t.roster} />
      </section>

      <section className="mt-8" data-testid="team-backlog">
        <SectionHeader title="Backlog" description="Tasks worth handing to Claude, best first: the most time saved, the team readiest for it, the least risk. Start with the top one." actions={<Button variant="ghost" size="sm" render={<Link href="/workflows" />}>All tasks <ArrowUpRight data-icon="inline-end" /></Button>} />
        <BacklogTable items={t.backlogTop} />
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section data-testid="team-review-queue">
          <SectionHeader title={<>Review queue <span className="ml-1 rounded-full bg-muted px-2 text-sm tabular text-muted-foreground">{t.reviewQueue.length}</span></>} description="Work your teammates have sent you to check." actions={<Button variant="outline" size="sm" render={<Link href="/team/reviews" />} data-testid="open-reviews"><ClipboardCheck data-icon="inline-start" /> Open queue</Button>} />
          {t.reviewQueue.length === 0 ? (
            <EmptyState title="Nothing to check" description="When a teammate sends in a skill or workflow to check, it shows up here with a suggested score from Claude to start from." className="p-6" />
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {t.reviewQueue.slice(0, 5).map((r) => (
                <li key={r.submission.id}>
                  <Link href={`/team/reviews?submission=${r.submission.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40" data-testid="review-preview-row">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.exercise.title}</p>
                      <p className="text-xs text-muted-foreground">L{r.exercise.rung} · attempt {r.submission.attempt} · {fmt.ago(r.submission.submittedAt)}</p>
                    </div>
                    <PersonChip person={r.person} size="xs" muted />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section data-testid="team-promotion-queue">
          <SectionHeader title={<>Skills to approve <span className="ml-1 rounded-full bg-muted px-2 text-sm tabular text-muted-foreground">{t.promotionQueue.length}</span></>} description="Skills waiting for your OK before the whole team can use them." actions={<Button variant="outline" size="sm" render={<Link href="/promotions" />} data-testid="open-promotions"><GitPullRequest data-icon="inline-start" /> Open queue</Button>} />
          {t.promotionQueue.length === 0 ? (
            <EmptyState title="All caught up" description="Once a teammate's skill passes its check and they ask to share it, it shows up here." className="p-6" />
          ) : (
            <div className="space-y-2">{t.promotionQueue.slice(0, 4).map((p) => <PromotionCard key={p.id} p={p} />)}</div>
          )}
        </section>
      </div>

      <section className="mt-8" data-testid="team-library">
        <SectionHeader title="Team library" description={`${t.library.length} skills set up for ${t.team.name}. Use counts cover the last 30 days.`} actions={<Button variant="ghost" size="sm" render={<Link href={`/library?team=${t.team.id}`} />}>Browse in library <ArrowUpRight data-icon="inline-end" /></Button>} />
        {t.library.length === 0 ? (
          <EmptyState title="No skills assigned yet" description="Turn a task from the backlog into a skill, or copy one another team already shares and adjust it for yours." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{t.library.map((s, i) => <SkillCard key={s.id} skill={s} index={i} onQuickLook={setQuick} compact />)}</div>
        )}
      </section>
      <SkillQuickLook skill={quick} onClose={() => setQuick(null)} />
    </>
  )
}
