"use client"

import { useRef, useMemo } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowUpRight, ClipboardCheck, GitPullRequest } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { RungBadge } from "@/components/brand/rung"
import { PageHeader } from "@/components/shell/page-header"
import { EmptyState, ErrorState } from "@/components/shell/empty-state"
import { GradeCard } from "@/components/library/grade-card"
import { MarkdownLite } from "@/components/library/markdown-lite"
import { PersonChip } from "@/components/library/person-chip"
import { describeError } from "@/components/library/skill-actions"
import { useTeam } from "@/hooks/library/queries"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { RubricScorer } from "./rubric-scorer"
import type { Artifact, ReviewItem } from "@/hooks/library/types"

export function ReviewQueue() {
  const q = useTeam()
  const sp = useSearchParams()
  const router = useRouter()
  const queue = q.data?.reviewQueue
  const items = useMemo(() => queue ?? [], [queue])
  const selectedId = sp.get("submission")
  // Remember items we have shown so a just-graded submission stays on screen after it leaves the queue.
  const seen = useRef(new Map<string, ReviewItem>())
  items.forEach((i) => seen.current.set(i.submission.id, i))
  const selected = useMemo(
    () => items.find((i) => i.submission.id === selectedId) ?? (selectedId ? seen.current.get(selectedId) : undefined) ?? items[0] ?? null,
    [items, selectedId],
  )
  const promos = q.data?.promotionQueue.length ?? 0

  if (q.isPending) return <><PageHeader eyebrow="Champion" title="Review Queue" /><div className="grid gap-4 lg:grid-cols-[20rem_1fr]"><Skeleton className="h-64" /><Skeleton className="h-96" /></div></>
  if (q.isError) return <><PageHeader eyebrow="Champion" title="Review Queue" /><ErrorState title="Couldn't load the queue" detail={describeError(q.error)} retry={() => q.refetch()} /></>

  return (
    <>
      <PageHeader
        eyebrow="Champion"
        title="Review Queue"
        description="Teammates' L3/L4 submissions waiting on your grade. Grading is your L5 exercise: the Grader's draft is there for reference, your read is the one that counts."
        actions={promos > 0 && <Button variant="outline" render={<Link href="/promotions" />} data-testid="reviews-to-promotions"><GitPullRequest data-icon="inline-start" /> {promos} promotion{promos === 1 ? "" : "s"} awaiting you</Button>}
      />
      {items.length === 0 && !selected ? (
        <EmptyState icon={<ClipboardCheck className="size-5" />} title="Nothing to grade right now" description="When someone on the team submits a skill exercise, say an RMD letter drafter with its sample cases, it lands here with the learner's expectation and critique alongside the artifact." action={promos > 0 ? <Button render={<Link href="/promotions" />}>Review promotions instead</Button> : undefined} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          <ul className="space-y-1.5 self-start rounded-xl border bg-card p-1.5" data-testid="review-list">
            {items.map((r) => (
              <li key={r.submission.id}>
                <button type="button" onClick={() => router.replace(`/team/reviews?submission=${r.submission.id}`, { scroll: false })} className={cn("w-full rounded-lg p-3 text-left transition-colors hover:bg-muted/60", selected?.submission.id === r.submission.id && "bg-muted")} data-testid="review-item" aria-current={selected?.submission.id === r.submission.id}>
                  <p className="truncate text-sm font-medium">{r.exercise.title}</p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <PersonChip person={r.person} size="xs" muted />
                    <span>{fmt.ago(r.submission.submittedAt)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {selected && <ReviewPane key={selected.submission.id} item={selected} />}
        </div>
      )}
    </>
  )
}

function ReviewPane({ item }: { item: ReviewItem }) {
  const { submission: s, exercise: e, person } = item
  return (
    <div className="space-y-4" data-testid="review-pane">
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <RungBadge rung={e.rung} />
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{e.kind}</span>
          <span className="text-xs text-muted-foreground">attempt {s.attempt}{s.coldAttempt && " · cold attempt"} · {fmt.date(s.submittedAt)}</span>
          {e.skillId && <Button size="xs" variant="ghost" className="ml-auto" render={<Link href={`/library?q=${encodeURIComponent(e.title)}`} />}>Related skill <ArrowUpRight data-icon="inline-end" /></Button>}
        </div>
        <h2 className="font-display mt-2 text-2xl font-medium">{e.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{e.brief}</p>
        <div className="mt-3"><PersonChip person={person} size="md" showTitle href={`/people/${person.id}`} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel label="Learner’s expectation" testId="review-expectation">
          <p className="text-sm leading-relaxed">{s.expectationText}</p>
          <p className="mt-2 text-xs text-muted-foreground">Confidence it passes: <span className="tabular font-medium text-foreground">{fmt.pct(s.expectationConfidence)}</span></p>
        </Panel>
        <Panel label="Learner’s critique" testId="review-critique">
          {s.critiqueText ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{s.critiqueText}</p> : <p className="text-sm text-muted-foreground italic">No critique written. That is itself a finding.</p>}
        </Panel>
      </div>

      <Panel label={`Artifact · ${s.artifact.type.replace("_", " ")}`} testId="review-artifact"><ArtifactView a={s.artifact} /></Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {s.grade ? <GradeCard grade={s.grade} title="Grader's draft (reference)" compact /> : <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">The Grader has not drafted a rubric for this submission.</div>}
        <RubricScorer submissionId={s.id} draft={s.grade} />
      </div>
    </div>
  )
}

function Panel({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return <div className="rounded-xl border bg-card p-4" data-testid={testId}><p className="eyebrow mb-2">{label}</p>{children}</div>
}

function ArtifactView({ a }: { a: Artifact }) {
  const md = a.type === "skill" || a.type === "workflow" || a.type === "project" || a.type === "text" || a.type === "review"
  return (
    <div className="space-y-3">
      {md ? <div className="rounded-lg border bg-muted/20 p-4"><MarkdownLite source={a.content} /></div> : <pre className="overflow-x-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs whitespace-pre-wrap">{a.content}</pre>}
      {a.output && <div><p className="eyebrow mb-1">Claude’s output</p><div className="rounded-lg border p-4"><MarkdownLite source={a.output} /></div></div>}
      {a.rationale && <div><p className="eyebrow mb-1">Include / exclude rationale</p><p className="text-sm">{a.rationale}</p></div>}
      {a.sampleCases && a.sampleCases.length > 0 && (
        <div><p className="eyebrow mb-1">Sample cases</p>
          <ul className="space-y-1 text-xs">{a.sampleCases.map((c, i) => <li key={i} className="grid grid-cols-[6rem_1fr_1fr] gap-2 rounded border p-2"><span className="font-medium">{c.shouldTrigger === "yes" ? "Should" : c.shouldTrigger === "no" ? "Should not" : "Ambiguous"}</span><span>{c.input}</span><span className="text-muted-foreground">{c.expected}</span></li>)}</ul>
        </div>
      )}
      {a.boundary && (
        <div><p className="eyebrow mb-1">Boundary</p>
          <div className="flex flex-wrap gap-3 text-xs">{Object.entries(a.boundary).map(([k, v]) => <span key={k}><span className="font-medium">{k}:</span> <span className="font-mono">{v.join(", ") || "—"}</span></span>)}</div>
        </div>
      )}
      {a.files && a.files.length > 0 && (
        <details className="rounded-lg border p-3 text-xs"><summary className="cursor-pointer font-medium">{a.files.length} attached file{a.files.length === 1 ? "" : "s"}</summary>
          {a.files.map((f) => <pre key={f.name} className="mt-2 overflow-x-auto rounded bg-muted/30 p-2 font-mono whitespace-pre-wrap"><span className="text-muted-foreground">{"// "}{f.name}</span>{"\n"}{f.content}</pre>)}
        </details>
      )}
    </div>
  )
}
