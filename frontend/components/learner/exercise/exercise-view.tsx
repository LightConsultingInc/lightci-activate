"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Clock, Lock, Sparkles, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { RungBadge } from "@/components/brand/rung"
import { ErrorState } from "@/components/shell/empty-state"
import { ModeBadge, Chip } from "../chips"
import { MarkdownLite } from "../markdown-lite"
import { ExpectationCritiqueStepper, type StepperStep } from "../expectation-critique-stepper"
import { initialSurface, toArtifact, surfaceReady, PromptEditor, ProjectBuilder, SkillEditor, WorkflowEditor, TextResponseEditor, type SurfaceState } from "../artifact-editors"
import { OpenInClaudeDialog } from "./open-in-claude-dialog"
import { SkipMenu } from "./skip-menu"
import { AttemptHistory } from "./attempt-history"
import { useExercise, useExpect, useHint, useRunClaude, useStartExercise, useSubmit } from "@/hooks/learner/queries"
import { cn } from "@/lib/utils"
import type { ExerciseDetail, ExerciseSummary, GradeView } from "@/hooks/learner/types"

type Result = { grade: GradeView; nextUp: ExerciseSummary | null; promotion?: { newRung: number } } | null

export function ExerciseView({ id }: { id: string }) {
  const q = useExercise(id)
  if (q.isPending) return <ExerciseSkeleton />
  if (q.isError) return <ErrorState title="Couldn't load this exercise" detail={q.error.message} retry={() => q.refetch()} />
  return <ExerciseLoaded key={q.data.id} ex={q.data} />
}

function ExerciseLoaded({ ex }: { ex: ExerciseDetail }) {
  const start = useStartExercise(ex.id)
  const expect = useExpect(ex.id)
  const hint = useHint(ex.id)
  const run = useRunClaude(ex.id)
  const submit = useSubmit(ex.id)

  const lastGraded = useMemo(() => [...ex.submissions].reverse().find((s) => s.grade), [ex.submissions])
  const finished = ex.status === "passed"

  const [surface, setSurface] = useState<SurfaceState>(() => initialSurface(ex))
  const [expectation, setExpectation] = useState(() => ({
    text: ex.starter?.draftExpectation?.expectationText ?? "",
    confidence: Math.round((ex.starter?.draftExpectation?.expectationConfidence ?? 0.6) * 100),
  }))
  const [expectationLocked, setExpectationLocked] = useState(Boolean(ex.starter?.draftExpectation))
  const [critique, setCritique] = useState("")
  const [step, setStep] = useState<StepperStep>(finished && lastGraded?.grade ? 5 : ex.starter?.draftExpectation ? 2 : 1)
  const [maxReached, setMaxReached] = useState<StepperStep>(step)
  const [result, setResult] = useState<Result>(finished && lastGraded?.grade ? { grade: lastGraded.grade, nextUp: null } : null)
  const [claudeOpen, setClaudeOpen] = useState(false)
  const startedRef = useRef(false)

  useEffect(() => {
    if (ex.status === "queued" && !startedRef.current) {
      startedRef.current = true
      start.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex.status])

  const goto = (s: StepperStep) => {
    setStep(s)
    setMaxReached((m) => (s > m ? s : m))
  }

  const confirmExpectation = () => {
    expect.mutate(
      { expectationText: expectation.text.trim(), expectationConfidence: expectation.confidence / 100 },
      {
        onSuccess: () => {
          setExpectationLocked(true)
          goto(2)
        },
      },
    )
  }

  const doRun = () => {
    if (surface.kind !== "prompt") return
    run.mutate(
      { prompt: surface.prompt, context: surface.context || undefined },
      { onSuccess: (r) => setSurface((s) => (s.kind === "prompt" ? { ...s, output: r.output, model: r.model } : s)) },
    )
  }

  const coldAttempt = !ex.workedExample
  const ready = surfaceReady(surface)

  const doSubmit = () => {
    submit.mutate(
      { expectationText: expectation.text.trim(), expectationConfidence: expectation.confidence / 100, artifact: toArtifact(surface), critiqueText: critique.trim(), coldAttempt },
      {
        onSuccess: (res) => {
          setResult({ grade: res.grade, nextUp: res.nextUp, promotion: res.promotion })
          goto(5)
          toast[res.grade.decision === "pass" ? "success" : "message"](res.grade.decision === "pass" ? "Passed. Mastery updated." : "Graded: revise and resubmit when ready.")
        },
      },
    )
  }

  const revise = () => {
    setResult(null)
    setCritique("")
    setExpectationLocked(false)
    setStep(1)
    setMaxReached(1)
  }

  const pasteBack = (text: string, packPrompt: string) => {
    setSurface((s) => {
      switch (s.kind) {
        case "prompt": return { ...s, output: text, prompt: s.prompt.trim() ? s.prompt : packPrompt }
        case "project": return { ...s, instructions: text }
        case "skill": return { ...s, skillMd: text }
        case "workflow": {
          try { return { ...s, schema: { ...s.schema, ...JSON.parse(text) } } } catch { toast.error("Paste the workflow as JSON, or edit the form directly"); return s }
        }
        default: return { ...s, response: text }
      }
    })
    toast.success("Artifact pasted back. Read it, then critique it.")
  }

  const locked = step === 5 || step < 2
  const surfaceDisabled = locked || submit.isPending

  return (
    <div className="space-y-6" data-testid="exercise-view" data-status={ex.status}>
      <header className="space-y-3">
        <Link href="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" data-testid="exercise-back"><ArrowLeft className="size-3" /> My Ladder</Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <RungBadge rung={ex.rung} />
              <ModeBadge mode={ex.mode} />
              <Chip><Clock className="size-3" /> ~{ex.estimatedMinutes} min</Chip>
              {ex.contextTag && <Chip><Tag className="size-3" /> {ex.contextTag}</Chip>}
              {ex.kind !== "artifact" && <Chip tone="info">{ex.kind}</Chip>}
            </div>
            <h1 className="mt-2 font-display text-3xl font-medium leading-tight md:text-4xl" data-testid="exercise-title">{ex.title}</h1>
            {ex.rationale && <p className="mt-2 text-sm text-muted-foreground">{ex.rationale}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {ex.mode === "in_claude" && !finished && (
              <Button variant="outline" onClick={() => setClaudeOpen(true)} disabled={step < 2} data-testid="open-in-claude-button">
                <Sparkles data-icon="inline-start" className="text-claude" /> Do this in Claude
              </Button>
            )}
            {!finished && <SkipMenu exerciseId={ex.id} disabled={submit.isPending} />}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4" data-testid="exercise-brief">
          <p className="eyebrow mb-1.5">The task</p>
          <MarkdownLite text={ex.brief} />
          {(ex.skill || ex.workflow) && (
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              {ex.skill && <Link href={`/library/${ex.skill.slug}`} className="underline underline-offset-4">Skill: {ex.skill.name}</Link>}
              {ex.workflow && <Link href={`/workflows/${ex.workflow.id}`} className="underline underline-offset-4">Workflow: {ex.workflow.name}</Link>}
            </div>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className={cn("relative rounded-xl border bg-card p-5 lg:col-span-3", surfaceDisabled && step !== 5 && "select-none")} data-testid="work-surface" data-surface={ex.workSurface}>
          <div className="mb-4 flex items-center justify-between">
            <p className="eyebrow">Work surface · {surfaceLabel(ex.workSurface)}</p>
            {step === 5 && <Chip tone="neutral"><Lock className="size-3" /> Submitted</Chip>}
          </div>
          <div className={cn(step < 2 && "pointer-events-none opacity-40 blur-[1px]")} aria-hidden={step < 2}>
            {surface.kind === "prompt" && (
              <PromptEditor value={surface} onChange={setSurface} disabled={surfaceDisabled} onRun={doRun} running={run.isPending} canRun={expectationLocked && surface.prompt.trim().length >= 20} runBlockedReason={!expectationLocked ? "Lock in your expectation first." : "Write a prompt of at least a sentence."} />
            )}
            {surface.kind === "project" && <ProjectBuilder value={surface} onChange={setSurface} disabled={surfaceDisabled} />}
            {surface.kind === "skill" && <SkillEditor value={surface} onChange={setSurface} disabled={surfaceDisabled} />}
            {surface.kind === "workflow" && <WorkflowEditor value={surface} onChange={setSurface} disabled={surfaceDisabled} />}
            {surface.kind === "text" && <TextResponseEditor value={surface} onChange={setSurface} disabled={surfaceDisabled} />}
          </div>
          {step < 2 && (
            <div className="absolute inset-x-5 top-1/2 -translate-y-1/2 rounded-lg border bg-background/90 p-4 text-center text-sm shadow-sm backdrop-blur" data-testid="surface-locked">
              <Lock className="mx-auto mb-1 size-4 text-muted-foreground" />
              State your expectation in the Coach panel first. Prediction before the run is the whole point.
            </div>
          )}
        </section>

        <aside className="rounded-xl border bg-card lg:col-span-2 lg:sticky lg:top-16 lg:max-h-[calc(100svh-5rem)] lg:self-start">
          <ExpectationCritiqueStepper
            step={step}
            maxReached={maxReached}
            onStep={goto}
            coachIntro={ex.coachIntro}
            expectation={expectation}
            onExpectation={setExpectation}
            onConfirmExpectation={confirmExpectation}
            expectationPending={expect.isPending}
            hints={{ hints: ex.hints ?? [], revealed: ex.hintsRevealed ?? 0, total: ex.hintsTotal ?? 0, onReveal: () => hint.mutate(), pending: hint.isPending }}
            work={ready}
            critique={critique}
            onCritique={setCritique}
            onSubmit={doSubmit}
            submitting={submit.isPending}
            coldAttempt={coldAttempt}
            workedExample={ex.workedExample}
            result={result}
            onRevise={revise}
            locked={finished}
          />
        </aside>
      </div>

      <AttemptHistory submissions={result && step === 5 ? ex.submissions.filter((s) => s.grade?.id !== result.grade.id) : ex.submissions} />

      {ex.mode === "in_claude" && <OpenInClaudeDialog exerciseId={ex.id} open={claudeOpen} onOpenChange={setClaudeOpen} onPasteBack={pasteBack} />}
    </div>
  )
}

function surfaceLabel(s: ExerciseDetail["workSurface"]) {
  return { prompt: "Prompt and output", project: "Project builder", skill: "Skill editor", workflow: "Workflow map", orientation: "Read and respond", review: "Review" }[s] ?? s
}

function ExerciseSkeleton() {
  return (
    <div className="space-y-6" data-testid="exercise-loading">
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Skeleton className="h-96 lg:col-span-3" />
        <Skeleton className="h-96 lg:col-span-2" />
      </div>
    </div>
  )
}
