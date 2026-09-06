"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, Clock, Lock, Sparkles, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { RungBadge, rungMeta } from "@/components/brand/rung"
import { ErrorState } from "@/components/shell/empty-state"
import { ModeBadge, Chip } from "../chips"
import { MarkdownLite } from "../markdown-lite"
import { initialSurface, toArtifact, surfaceReady, PromptEditor, ProjectBuilder, SkillEditor, WorkflowEditor, TextResponseEditor, type SurfaceState } from "../artifact-editors"
import { OpenInClaudeDialog } from "./open-in-claude-dialog"
import { SkipMenu } from "./skip-menu"
import { AttemptHistory } from "./attempt-history"
import { Beats, type Beat } from "./beats"
import { CoachPanel } from "./coach-panel"
import { SelfCheck, critiqueFrom, selfCheckItems } from "./self-check"
import { ResultBeat } from "./result-beat"
import { useCompetencyCatalog, useExercise, useExpect, useHint, useRunClaude, useStartExercise, useSubmit } from "@/hooks/learner/queries"
import { cn } from "@/lib/utils"
import type { ExerciseDetail, ExerciseSummary, GradeView } from "@/hooks/learner/types"

type Result = { grade: GradeView; nextUp: ExerciseSummary | null; promotion?: { newRung: number } } | null

const MIN_EXPECTATION = 10

export function ExerciseView({ id }: { id: string }) {
  const q = useExercise(id)
  if (q.isPending) return <ExerciseSkeleton />
  if (q.isError) return <ErrorState title="Couldn't load this practice" detail={q.error.message} retry={() => q.refetch()} />
  return <ExerciseLoaded key={q.data.id} ex={q.data} />
}

function ExerciseLoaded({ ex }: { ex: ExerciseDetail }) {
  const start = useStartExercise(ex.id)
  const expect = useExpect(ex.id)
  const hint = useHint(ex.id)
  const run = useRunClaude(ex.id)
  const submit = useSubmit(ex.id)
  const catalog = useCompetencyCatalog()
  const sp = useSearchParams()

  const lastGraded = useMemo(() => [...ex.submissions].reverse().find((s) => s.grade), [ex.submissions])
  const finished = ex.status === "passed"
  const moduleCode = rungMeta(ex.rung).code

  const [surface, setSurface] = useState<SurfaceState>(() => initialSurface(ex))
  const [expectation, setExpectation] = useState(() => ex.starter?.draftExpectation?.expectationText ?? "")
  const [savedExpectation, setSavedExpectation] = useState(() => ex.starter?.draftExpectation?.expectationText ?? "")
  const [confidence, setConfidence] = useState(() => Math.round((ex.starter?.draftExpectation?.expectationConfidence ?? 0.6) * 100))
  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const [note, setNote] = useState("")
  const [beat, setBeat] = useState<Beat>(finished && lastGraded?.grade ? "result" : "build")
  const [result, setResult] = useState<Result>(finished && lastGraded?.grade ? { grade: lastGraded.grade, nextUp: null } : null)
  const [coachOpen, setCoachOpen] = useState(true)
  const [claudeOpen, setClaudeOpen] = useState(() => sp.get("claude") === "1" && ex.mode === "in_claude" && ex.status !== "passed")
  const startedRef = useRef(false)

  useEffect(() => {
    if (ex.status === "queued" && !startedRef.current) {
      startedRef.current = true
      start.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex.status])

  const items = useMemo(() => selfCheckItems(ex.competencyCodes, catalog.data), [ex.competencyCodes, catalog.data])
  const coldAttempt = !ex.workedExample
  const ready = surfaceReady(surface)
  const expectationOk = expectation.trim().length >= MIN_EXPECTATION

  /** Save the note-to-self so the API lets a run happen (and so it survives a reload). */
  const ensureExpectation = async () => {
    const text = expectation.trim()
    if (text.length < MIN_EXPECTATION) {
      toast.message("First, one sentence: what do you expect to get back?")
      return false
    }
    if (text === savedExpectation) return true
    try {
      await expect.mutateAsync({ expectationText: text, expectationConfidence: confidence / 100 })
      setSavedExpectation(text)
      return true
    } catch {
      return false
    }
  }

  const doRun = async () => {
    if (surface.kind !== "prompt") return
    if (!(await ensureExpectation())) return
    run.mutate(
      { prompt: surface.prompt, context: surface.context || undefined },
      { onSuccess: (r) => setSurface((s) => (s.kind === "prompt" ? { ...s, output: r.output, model: r.model } : s)) },
    )
  }

  const goCheck = async () => {
    if (!ready.ready) return
    if (!(await ensureExpectation())) return
    setBeat("check")
  }

  const doSubmit = () => {
    submit.mutate(
      {
        expectationText: expectation.trim(),
        expectationConfidence: confidence / 100,
        artifact: toArtifact(surface),
        critiqueText: critiqueFrom(items, checked, note),
        coldAttempt,
      },
      {
        onSuccess: (res) => {
          setResult({ grade: res.grade, nextUp: res.nextUp, promotion: res.promotion })
          setBeat("result")
          toast[res.grade.decision === "pass" ? "success" : "message"](res.grade.decision === "pass" ? "Passed. Nice work." : "Graded: revise and send it again when ready.")
        },
      },
    )
  }

  const revise = () => {
    setResult(null)
    setChecked(new Set())
    setNote("")
    setBeat("build")
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
    toast.success("Pasted back. Read it once more, then Check.")
  }

  const surfaceDisabled = beat !== "build" || submit.isPending || finished
  const reachable: Record<Beat, boolean> = { build: !finished, check: ready.ready && !finished, result: result !== null }

  const beatNote =
    beat === "build" ? "Build it here. Write your one-line expectation first, then work. I'm beside you if you get stuck."
    : beat === "check" ? "Read what you made as a client would. Tick only what truly holds."
    : "Compare your check with the grader's. The gaps are where to look next time."

  const workSurface = (
    <section className={cn("relative rounded-xl border bg-card p-5", surfaceDisabled && "select-none")} data-testid="work-surface" data-surface={ex.workSurface}>
      <div className="mb-4 flex items-center justify-between">
        <p className="eyebrow">Your work · {surfaceLabel(ex.workSurface)}</p>
        {(beat === "result" || finished) && <Chip tone="neutral"><Lock className="size-3" /> Submitted</Chip>}
        {beat === "check" && !finished && <Chip tone="glow">Read-only while you check</Chip>}
      </div>
      {surface.kind === "prompt" && (
        <PromptEditor
          value={surface}
          onChange={setSurface}
          disabled={surfaceDisabled}
          onRun={doRun}
          running={run.isPending || expect.isPending}
          canRun={surface.prompt.trim().length >= 20 && expectationOk}
          runBlockedReason={!expectationOk ? "Jot down what you expect back first (one sentence, above)." : "Write a prompt of at least a sentence."}
        />
      )}
      {surface.kind === "project" && <ProjectBuilder value={surface} onChange={setSurface} disabled={surfaceDisabled} />}
      {surface.kind === "skill" && <SkillEditor value={surface} onChange={setSurface} disabled={surfaceDisabled} />}
      {surface.kind === "workflow" && <WorkflowEditor value={surface} onChange={setSurface} disabled={surfaceDisabled} />}
      {surface.kind === "text" && <TextResponseEditor value={surface} onChange={setSurface} disabled={surfaceDisabled} />}
    </section>
  )

  return (
    <div className="space-y-6" data-testid="exercise-view" data-status={ex.status} data-beat={beat}>
      <header className="space-y-3">
        <Link href={`/modules/${moduleCode}?tab=practice`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" data-testid="exercise-back">
          <ArrowLeft className="size-3" /> {moduleCode} {rungMeta(ex.rung).name} · Practice
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <RungBadge rung={ex.rung} />
              <ModeBadge mode={ex.mode} />
              <Chip><Clock className="size-3" /> ~{ex.estimatedMinutes} min</Chip>
              {ex.contextTag && <Chip><Tag className="size-3" /> {ex.contextTag}</Chip>}
            </div>
            <h1 className="mt-2 font-display text-3xl font-medium leading-tight md:text-4xl" data-testid="exercise-title">{ex.title}</h1>
            {ex.rationale && <p className="mt-2 text-sm text-muted-foreground">{ex.rationale}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {ex.mode === "in_claude" && !finished && (
              <Button variant="outline" onClick={() => setClaudeOpen(true)} disabled={beat !== "build"} data-testid="open-in-claude-button">
                <Sparkles data-icon="inline-start" className="text-claude" /> Do this in Claude
              </Button>
            )}
            {!finished && <SkipMenu exerciseId={ex.id} disabled={submit.isPending} />}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4" data-testid="exercise-brief">
          <p className="eyebrow mb-1.5">What to do</p>
          <MarkdownLite text={ex.brief} />
          {(ex.skill || ex.workflow) && (
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              {ex.skill && <Link href={`/library/${ex.skill.slug}`} className="underline underline-offset-4">Skill: {ex.skill.name}</Link>}
              {ex.workflow && <Link href={`/workflows/${ex.workflow.id}`} className="underline underline-offset-4">Workflow: {ex.workflow.name}</Link>}
            </div>
          )}
        </div>
      </header>

      <Beats beat={beat} reachable={reachable} onBeat={(b) => (b === "check" ? void goCheck() : setBeat(b))} />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className={cn("space-y-4", coachOpen || beat === "check" ? "lg:col-span-3" : "lg:col-span-4")}>
          {beat === "build" && (
            <div className="rounded-xl border bg-card p-4" data-testid="expectation-note">
              <label htmlFor="expectation" className="text-sm font-medium">Before you run anything: in a sentence, what do you expect to get back?</label>
              <p className="mt-0.5 text-xs text-muted-foreground">A note to yourself, not a test. You will compare it with what actually comes back.</p>
              <div className="mt-2 flex gap-2">
                <Input
                  id="expectation"
                  value={expectation}
                  onChange={(e) => setExpectation(e.target.value)}
                  onBlur={() => { if (expectationOk && expectation.trim() !== savedExpectation) void ensureExpectation() }}
                  disabled={finished}
                  placeholder="A tidy three-part email, but it will probably invent a figure I never gave it…"
                  data-testid="expectation-input"
                />
              </div>
              {savedExpectation && savedExpectation === expectation.trim() && <p className="mt-1 text-[11px] text-muted-foreground" data-testid="expectation-saved">Noted.</p>}
            </div>
          )}

          {beat === "result" && result && (
            <ResultBeat grade={result.grade} nextUp={result.nextUp} promotion={result.promotion} items={items} checked={checked} moduleCode={moduleCode} onRevise={revise} canRevise={!finished} />
          )}

          {workSurface}

          {beat === "build" && !finished && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              {!ready.ready && ready.reason && <p className="text-xs text-muted-foreground">{ready.reason}</p>}
              <Button size="lg" disabled={!ready.ready || expect.isPending} onClick={() => void goCheck()} data-testid="work-continue">
                Looks done, let me check it <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          )}
        </div>

        <div className={cn("lg:sticky lg:top-16 lg:max-h-[calc(100svh-5rem)] lg:self-start", coachOpen || beat === "check" ? "lg:col-span-2" : "lg:col-span-1")}>
          {beat === "check" ? (
            <SelfCheck
              items={items}
              loading={catalog.isPending}
              checked={checked}
              onToggle={(c, on) => setChecked((prev) => { const n = new Set(prev); if (on) n.add(c); else n.delete(c); return n })}
              confidence={confidence}
              onConfidence={setConfidence}
              note={note}
              onNote={setNote}
              onSubmit={doSubmit}
              submitting={submit.isPending}
              onBack={() => setBeat("build")}
              disabled={finished}
            />
          ) : (
            <CoachPanel
              open={coachOpen}
              onOpenChange={setCoachOpen}
              coachIntro={ex.coachIntro}
              beatNote={beatNote}
              hints={{ hints: ex.hints ?? [], revealed: ex.hintsRevealed ?? 0, total: ex.hintsTotal ?? 0, onReveal: () => hint.mutate(), pending: hint.isPending }}
              workedExample={ex.workedExample}
              className="lg:max-h-[calc(100svh-5rem)] lg:overflow-y-auto"
            />
          )}
        </div>
      </div>

      <AttemptHistory submissions={result && beat === "result" ? ex.submissions.filter((s) => s.grade?.id !== result.grade.id) : ex.submissions} />

      {ex.mode === "in_claude" && <OpenInClaudeDialog exerciseId={ex.id} open={claudeOpen} onOpenChange={setClaudeOpen} onPasteBack={pasteBack} />}
    </div>
  )
}

function surfaceLabel(s: ExerciseDetail["workSurface"]) {
  return { prompt: "Prompt and output", project: "Project", skill: "Skill", workflow: "Workflow map", orientation: "Your response", review: "Your review" }[s] ?? s
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
      <Skeleton className="h-14 w-full" />
      <div className="grid gap-6 lg:grid-cols-5">
        <Skeleton className="h-96 lg:col-span-3" />
        <Skeleton className="h-96 lg:col-span-2" />
      </div>
    </div>
  )
}
