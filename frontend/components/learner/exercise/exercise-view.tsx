"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Clock, Loader2, Lock, Play, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { rungMeta } from "@/components/brand/rung"
import { ErrorState } from "@/components/shell/empty-state"
import { Chip } from "../chips"
import { PracticeInput, canRun, canSubmit, clearOutput, hasOutput, initialSurface, kindLabel, policyReminder, practiceSpec, toArtifact, toRunBody, withRunResult, type SurfaceState } from "../artifact-editors"
import { useMe } from "@/hooks/use-me"
import { SkipMenu } from "./skip-menu"
import { Nudge } from "./nudge"
import { RunOutput } from "./run-output"
import { FeedbackCard, type FeedbackResult } from "./feedback-card"
import { EarlierTries, decisionOf, score10Of } from "./earlier-tries"
import { useExercise, useHint, useRunPractice, useStartExercise, useSubmit } from "@/hooks/learner/queries"
import { cn } from "@/lib/utils"
import type { ExerciseDetail, Feedback, SubmissionView } from "@/hooks/learner/types"

export function ExerciseView({ id }: { id: string }) {
  const q = useExercise(id)
  if (q.isPending) return <ExerciseSkeleton />
  if (q.isError) return <ErrorState title="Couldn't load this practice" detail={q.error.message} retry={() => q.refetch()} />
  return <ExerciseLoaded key={q.data.id} ex={q.data} />
}

/** The three lines for an earlier attempt: stored on the attempt, or split out of the grade's feedback text. */
function feedbackOf(s: SubmissionView): Feedback {
  if (s.feedback) return s.feedback
  const text = s.grade?.feedback ?? ""
  const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean)
  return { worked: parts[0] ?? text, change: parts[1] ?? "", tryNext: parts.slice(2).join(" ") || (s.grade?.teachingMoment ?? "") }
}

function resultFromSubmission(s: SubmissionView | undefined): FeedbackResult | null {
  if (!s) return null
  const score10 = score10Of(s)
  const decision = decisionOf(s)
  if (score10 == null || !decision) return null
  return { feedback: feedbackOf(s), score10, decision, nextUp: null }
}

function ExerciseLoaded({ ex }: { ex: ExerciseDetail }) {
  const start = useStartExercise(ex.id)
  const hint = useHint(ex.id)
  const run = useRunPractice(ex.id)
  const submit = useSubmit(ex.id)

  const spec = useMemo(() => practiceSpec(ex), [ex])
  const me = useMe()
  const boundary = (me.org?.settings as { boundary?: { forbiddenDataClasses?: string[] } } | undefined)?.boundary
  const reminder = policyReminder(boundary?.forbiddenDataClasses, (ex as { dataReminder?: string | null }).dataReminder)
  const moduleCode = rungMeta(ex.rung).code
  const finished = ex.status === "passed"
  const lastGraded = useMemo(() => [...ex.submissions].reverse().find((s) => s.grade || s.score10 != null), [ex.submissions])

  const [surface, setSurface] = useState<SurfaceState>(() => initialSurface(ex, spec))
  const [result, setResult] = useState<FeedbackResult | null>(() => (finished ? resultFromSubmission(lastGraded) : null))
  const startedRef = useRef(false)
  const resultsRef = useRef<HTMLDivElement>(null)

  // The score must never hide below the fold: bring the results column into view as soon as it fills.
  useEffect(() => {
    if (result || run.isPending) resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [result, run.isPending])

  useEffect(() => {
    if (ex.status === "queued" && !startedRef.current) {
      startedRef.current = true
      start.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex.status])

  const runnable = canRun(surface)
  const submittable = canSubmit(surface)
  const busy = run.isPending || submit.isPending
  const locked = result !== null || finished || busy
  const isReview = surface.kind === "review"
  const hasRun = hasOutput(surface)
  // Once something is running or came back, the page widens into two columns: your work on the left, what came back on the right.
  const showResults = hasRun || result !== null || busy

  /** Grade what is on the surface: Coach's three lines, a score, pass or try again. */
  const grade = (s: SurfaceState) =>
    submit.mutate(
      { artifact: toArtifact(s) },
      {
        onSuccess: (res) => {
          // The score card is on screen now, so no toast: one number, one place.
          // On "try again" the API's next-up is this same item; a link to the page you are on would do nothing.
          const nextUp = res.nextUp && res.nextUp.id !== ex.id ? res.nextUp : null
          setResult({ feedback: res.feedback, score10: res.score10, decision: res.decision, nextUp, promotion: res.promotion, agreement: res.agreement })
        },
      },
    )

  /** One press: Claude does the task, the output appears, then Coach's feedback lands under it. */
  const doRun = () => {
    const body = toRunBody(surface)
    if (!body || !runnable.ok) return
    run.mutate(body, {
      onSuccess: (r) => {
        const next = withRunResult(surface, r)
        setSurface(next)
        grade(next)
      },
    })
  }

  /** Review practice has nothing to run: score it and send. */
  const doSubmit = () => {
    if (!submittable.ok) return
    grade(surface)
  }

  /** Keep the draft, drop the output and the feedback. */
  const tryAgain = () => {
    setResult(null)
    setSurface((s) => clearOutput(s))
  }

  // Every attempt, minus the latest one while its feedback is showing above.
  const latestId = ex.submissions[ex.submissions.length - 1]?.id
  const earlier = result ? ex.submissions.filter((s) => s.id !== latestId) : ex.submissions

  return (
    <div className={cn("mx-auto space-y-6", showResults ? "max-w-6xl" : "max-w-4xl")} data-testid="exercise-view" data-status={ex.status} data-kind={spec.kind} data-layout={showResults ? "two-column" : "single"}>
      <header className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Link href={`/modules/${moduleCode}?tab=practice`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" data-testid="exercise-back">
            <ArrowLeft className="size-3" /> {moduleCode} {rungMeta(ex.rung).name} · Practice
          </Link>
          {!finished && <SkipMenu exerciseId={ex.id} disabled={submit.isPending} />}
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {spec.workflowName && <p className="eyebrow" data-testid="workflow-name">{spec.workflowName}</p>}
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid="exercise-minutes"><Clock className="size-3" /> ~{ex.estimatedMinutes} min</span>
          </div>
          <h1 className="font-display text-3xl font-medium leading-tight md:text-4xl" data-testid="exercise-ask">{spec.ask}</h1>
          <Nudge hints={ex.hints ?? []} revealed={ex.hintsRevealed ?? 0} total={ex.hintsTotal ?? 0} onReveal={() => hint.mutate()} pending={hint.isPending} className="pt-1" />
        </div>
      </header>

      <div className={cn(showResults && "grid gap-6 lg:grid-cols-2 lg:items-start")}>
      <section className={cn("rounded-xl border bg-card p-5 lg:order-1", locked && "opacity-90")} data-testid="work-surface" data-surface={spec.kind} data-locked={locked}>
        <div className="mb-4 flex items-center justify-between">
          <p className="eyebrow">{kindLabel(spec.kind)}</p>
          {locked && <Chip tone="neutral"><Lock className="size-3" /> Sent</Chip>}
        </div>
        <PracticeInput value={surface} onChange={setSurface} disabled={locked} review={ex.review} rung={ex.rung} reminder={reminder} />
        {!isReview && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={doRun} disabled={locked || !runnable.ok} data-testid="run-button">
              <Play data-icon="inline-start" /> {run.isPending ? "Claude is working…" : submit.isPending ? "Coach is reading it…" : hasRun ? "Run again" : "Run"}
            </Button>
            {!runnable.ok && !locked && runnable.reason && <p className="text-xs text-muted-foreground">{runnable.reason}</p>}
            {!locked && runnable.ok && <p className="text-xs text-muted-foreground">Claude does the task, then Coach tells you what worked and what to change.</p>}
          </div>
        )}
        {isReview && !locked && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={doSubmit} disabled={!submittable.ok || submit.isPending} data-testid="submit-button">
              <Send data-icon="inline-start" /> {submit.isPending ? "Getting feedback…" : "Submit for feedback"}
            </Button>
            {!submittable.ok && submittable.reason && <p className="text-xs text-muted-foreground">{submittable.reason}</p>}
          </div>
        )}
      </section>

      {showResults && (
        <div ref={resultsRef} className="order-first space-y-6 scroll-mt-20 lg:order-2" data-testid="results-column">
          {run.isPending && <PendingCard testId="run-pending">Claude is working on it…</PendingCard>}
          {submit.isPending && <PendingCard testId="submit-pending">Coach is reading it…</PendingCard>}
          {result && <FeedbackCard result={result} moduleCode={moduleCode} onTryAgain={finished ? undefined : tryAgain} />}
          <RunOutput surface={surface} />
        </div>
      )}
      </div>

      <EarlierTries submissions={earlier} />
    </div>
  )
}

/** A quiet card that holds the score's place while Claude or Coach is working. */
function PendingCard({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-5 text-sm text-muted-foreground" data-testid={testId} role="status">
      <Loader2 className="size-4 animate-spin text-glow-foreground" /> {children}
    </div>
  )
}

function ExerciseSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="exercise-loading">
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-2/3" />
      </div>
      <Skeleton className="h-80 w-full" />
      <Skeleton className="h-10 w-48 self-end" />
    </div>
  )
}
