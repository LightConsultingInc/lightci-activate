"use client"

import { useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/shell/empty-state"
import { useLadder } from "@/hooks/learner/queries"
import { LadderHeader } from "./ladder-header"
import { NextUpCard, RevisitsDue } from "./next-up-card"
import { CompetenciesPanel } from "./competencies-panel"
import { JudgementPanel } from "./judgement-panel"
import { CoachNotes, MySkillsPanel, MyWorkflowsSummary, RecentGrades } from "./side-panels"
import { RevisitSheet } from "../revisit-sheet"
import type { RevisitSummary } from "@/hooks/learner/types"

export function LadderView() {
  const q = useLadder()
  const [revisit, setRevisit] = useState<RevisitSummary | null>(null)

  if (q.isPending) return <LadderSkeleton />
  if (q.isError) return <ErrorState title="Couldn't load your ladder" detail={q.error.message} retry={() => q.refetch()} />
  const l = q.data

  return (
    <div className="space-y-6 animate-rise" data-testid="ladder-view">
      <LadderHeader ladder={l} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <NextUpCard exercise={l.nextUp} queued={l.queued} />
          <CompetenciesPanel competencies={l.competencies} currentRung={l.rung} />
          <JudgementPanel judgement={l.judgement} minJudgement={l.progress.gate.minJudgement} />
        </div>
        <div className="space-y-6">
          <RevisitsDue revisits={l.revisitsDue} onOpen={setRevisit} />
          <MySkillsPanel />
          <MyWorkflowsSummary />
          <RecentGrades grades={l.recentGrades} />
          <CoachNotes notes={l.coachNotes} />
        </div>
      </div>
      <RevisitSheet revisit={revisit} onOpenChange={(o) => !o && setRevisit(null)} />
    </div>
  )
}

function LadderSkeleton() {
  return (
    <div className="space-y-6" data-testid="ladder-loading">
      <Skeleton className="h-56 w-full rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-96" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    </div>
  )
}
