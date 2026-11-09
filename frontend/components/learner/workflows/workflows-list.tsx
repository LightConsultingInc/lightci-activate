"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, MessageCircleQuestion, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState, ErrorState } from "@/components/shell/empty-state"
import { StatusPipeline } from "../chips"
import { CompletenessMeter, ScoreBars } from "./score-bars"
import { useCreateInterview, useMyWorkflows } from "@/hooks/learner/queries"
import { fmt } from "@/lib/format"

/** A measured time worth showing: present and different from the time before (equal means nothing was measured yet). */
function hasNewTime(w: { measuredMinutesPerWeek: number | null; baselineMinutesPerWeek: number | null }) {
  return w.measuredMinutesPerWeek != null && w.measuredMinutesPerWeek !== w.baselineMinutesPerWeek
}

export function WorkflowsList() {
  const q = useMyWorkflows()
  const router = useRouter()
  const create = useCreateInterview()

  if (q.isPending) return <div className="space-y-3" data-testid="workflows-loading">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36" />)}</div>
  if (q.isError) return <ErrorState title="Couldn't load your workflows" detail={q.error.message} retry={() => q.refetch()} />

  const items = q.data.slice().sort((a, b) => (b.score?.composite ?? -1) - (a.score?.composite ?? -1))
  if (items.length === 0) {
    return (
      <EmptyState
        title="No repeated work added yet"
        description="The work you described when you started shows up here, with the pieces most worth handing to Claude at the top. You can also add one now."
        action={
          <Button onClick={() => create.mutate({ mode: "workflow" }, { onSuccess: (iv) => router.push(`/onboarding?interview=${iv.id}&mode=workflow`) })} disabled={create.isPending} data-testid="workflows-map-new">
            <MessageCircleQuestion data-icon="inline-start" /> Describe a task you repeat
          </Button>
        }
      />
    )
  }

  const totalBack = items.reduce((s, w) => s + (w.hoursBackPerWeek ?? 0), 0)
  return (
    <div className="space-y-4" data-testid="workflows-list">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p><span className="tabular font-medium text-foreground">{items.length}</span> {items.length === 1 ? "task" : "tasks"}{totalBack > 0 && <> · about <span className="tabular font-medium text-foreground">{totalBack.toFixed(1)}h</span> a week saved so far</>}</p>
        <Button variant="outline" size="sm" onClick={() => create.mutate({ mode: "workflow" }, { onSuccess: (iv) => router.push(`/onboarding?interview=${iv.id}&mode=workflow`) })} disabled={create.isPending} data-testid="workflows-map-new">
          <MessageCircleQuestion data-icon="inline-start" /> Add another
        </Button>
      </div>
      <ol className="space-y-3">
        {items.map((w, i) => (
          <li key={w.id} className="rounded-xl border bg-card p-5 transition-shadow hover:ring-1 hover:ring-glow/40" data-testid="workflow-card">
            <div className="grid gap-5 md:grid-cols-[auto_1fr_16rem]">
              <div className="font-display text-3xl text-muted-foreground/60 tabular">{String(i + 1).padStart(2, "0")}</div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/workflows/${w.id}`} className="font-display text-xl font-medium hover:underline hover:underline-offset-4">{w.name}</Link>
                  {w.championVerified && <span className="inline-flex items-center gap-1 text-xs text-pass"><ShieldCheck className="size-3.5" /> Champion verified</span>}
                  {w.nextWave && <span className="rounded-full bg-glow-soft px-2 py-0.5 text-[11px] font-medium text-glow-foreground">Next to build</span>}
                </div>
                <StatusPipeline status={w.status} className="mt-2" />
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
                  <CompletenessMeter value={w.completeness} />
                  {w.baselineMinutesPerWeek != null && w.baselineMinutesPerWeek > 0 && <span>{hasNewTime(w) ? "Used to take" : "Takes"} about <span className="tabular text-foreground">{fmt.hours(w.baselineMinutesPerWeek)}</span> a week</span>}
                  {hasNewTime(w) && <span>Now about <span className="tabular text-foreground">{fmt.hours(w.measuredMinutesPerWeek ?? 0)}</span> a week</span>}
                  {w.hoursBackPerWeek != null && w.hoursBackPerWeek > 0 && <span className="text-pass">Saves about {w.hoursBackPerWeek.toFixed(1)}h a week</span>}
                  {w.linkedSkills.length > 0 && (
                    <span>
                      Skills: {w.linkedSkills.map((s, k) => <Link key={s.id} href={`/library/${s.slug}`} className="underline underline-offset-4">{s.name}{k < w.linkedSkills.length - 1 ? ", " : ""}</Link>)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col justify-between gap-3">
                {w.score ? (
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="eyebrow">Worth handing to Claude</span>
                      <span className="font-display text-2xl tabular" data-testid="workflow-score">{Math.round(w.score.composite)}<span className="text-xs text-muted-foreground">/100</span></span>
                    </div>
                    <ScoreBars score={w.score} compact className="mt-1.5" />
                  </div>
                ) : <div />}
                <Button variant="outline" size="sm" render={<Link href={`/workflows/${w.id}`} />} data-testid="workflow-open">Open <ArrowRight data-icon="inline-end" /></Button>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
