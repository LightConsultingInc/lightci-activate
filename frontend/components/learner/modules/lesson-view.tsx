"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Check, Clock, Lightbulb, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/shell/empty-state"
import { Paper } from "@/components/brand/grain"
import { lessonBySlug, moduleFor } from "@/content/lessons"
import { useLessonProgress } from "@/hooks/learner/use-lesson-progress"
import { useLessonChecked, useLessonPersonalised, useMemory } from "@/hooks/learner/queries"
import { useModuleReadiness } from "@/hooks/learner/use-module-readiness"
import { MarkdownLite } from "../markdown-lite"
import { LessonDiagram } from "../diagrams"
import { ClaudeMock } from "../mocks"
import { parseModuleCode } from "./module-state"
import { cn } from "@/lib/utils"

/**
 * One lesson: title, promise and minutes, the body, three key points, an example and a one-question
 * check (both tailored to the learner's own work when the API has an interview to draw on), then next lesson.
 * The example and check never show a skeleton: the generic content renders at once and swaps to the
 * tailored version when it lands (instantly when the module's readiness says it is already prepared).
 */
export function LessonView({ code, slug }: { code: string; slug: string }) {
  const rung = parseModuleCode(code)
  const lesson = lessonBySlug(slug)
  // Landing straight on a lesson must also start (and follow) the module preparation.
  useModuleReadiness(lesson ? `L${lesson.rung}` : "L0", { prepare: true, enabled: Boolean(lesson) })
  const { isDone, markDone } = useLessonProgress()
  const memory = useMemory()
  const personalised = useLessonPersonalised(lesson, memory.data?.version)
  const checked = useLessonChecked(slug)
  const [picked, setPicked] = useState<number | null>(null)

  if (rung == null || !lesson || lesson.rung !== rung) return <ErrorState title="No such lesson" detail={`"${slug}" is not part of ${code}.`} />
  const mod = moduleFor(rung)
  const idx = mod.lessons.findIndex((l) => l.slug === slug)
  const next = mod.lessons[idx + 1] ?? null
  const done = isDone(slug)
  // Static content while loading (or if the endpoint fails); the tailored version once it lands.
  const example = personalised.data?.example ?? lesson.example
  const check = personalised.data?.check ?? lesson.check
  const tailored = personalised.data?.personalised === true
  const revealed = picked !== null
  const correct = picked === check.answer

  const choose = (i: number) => {
    if (revealed) return
    setPicked(i)
    markDone(slug)
    checked.mutate({ correct: i === check.answer })
  }

  return (
    <article className="mx-auto max-w-3xl space-y-8 animate-rise" data-testid="lesson-view" data-slug={slug} data-done={done}>
      <header className="space-y-3">
        <Link href={`/modules/${mod.code}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" data-testid="lesson-back">
          <ArrowLeft className="size-3" /> {mod.code} {mod.name}
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Lesson {idx + 1} of {mod.lessons.length}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1"><Clock className="size-3" /> {lesson.minutes} min</span>
          {done && <span className="inline-flex items-center gap-1 text-pass" data-testid="lesson-done"><Check className="size-3" /> Done</span>}
        </div>
        <h1 className="font-display text-3xl font-medium leading-tight md:text-4xl" data-testid="lesson-title">{lesson.title}</h1>
        <p className="max-w-2xl text-base text-muted-foreground">{lesson.promise}</p>
      </header>

      <LessonDiagram scene={lesson.scene} />

      <MarkdownLite text={lesson.body} className="text-[15px] leading-relaxed" />

      {lesson.mock && <ClaudeMock kind={lesson.mock} />}

      <section className="rounded-xl border bg-card p-5" data-testid="lesson-key-points">
        <p className="eyebrow mb-3">Three things to keep</p>
        <ol className="space-y-2.5">
          {lesson.keyPoints.map((k, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-glow-soft text-xs font-semibold text-glow-foreground tabular">{i + 1}</span>
              <span>{k}</span>
            </li>
          ))}
        </ol>
      </section>

      <Paper className="rounded-xl border bg-card p-5" data-testid="lesson-example" data-personalised={tailored}>
        <div className="mb-1 flex items-center gap-2">
          <p className="eyebrow">{example.title}</p>
          {tailored && <span className="eyebrow text-glow-foreground" data-testid="lesson-tailored">· Tailored to your work</span>}
        </div>
        <MarkdownLite text={example.text} className="mt-1 text-[1.05rem] leading-relaxed" />
      </Paper>

      <section className="rounded-xl border bg-card p-5" data-testid="lesson-check" data-personalised={tailored}>
        <div className="mb-1 flex items-center gap-2">
          <p className="eyebrow">Quick check</p>
          {tailored && <span className="eyebrow text-glow-foreground">· Tailored to your work</span>}
        </div>
        <h2 className="text-base font-medium leading-snug">{check.question}</h2>
        <ul className="mt-3 grid gap-2">
          {check.options.map((o, i) => {
            const isAnswer = i === check.answer
            const isPicked = picked === i
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => choose(i)}
                  disabled={revealed}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
                    !revealed && "hover:border-foreground/50 hover:bg-muted/50",
                    revealed && isAnswer && "border-pass bg-pass-soft",
                    revealed && isPicked && !isAnswer && "border-fail bg-fail-soft",
                    revealed && !isPicked && !isAnswer && "opacity-60",
                  )}
                  data-testid="lesson-check-option"
                  data-index={i}
                  data-state={!revealed ? "idle" : isAnswer ? "correct" : isPicked ? "wrong" : "other"}
                >
                  <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold", revealed && isAnswer && "border-pass bg-pass text-ink", revealed && isPicked && !isAnswer && "border-fail bg-fail text-paper")}>
                    {revealed && isAnswer ? <Check className="size-3" /> : revealed && isPicked ? <X className="size-3" /> : String.fromCharCode(65 + i)}
                  </span>
                  <span>{o}</span>
                </button>
              </li>
            )
          })}
        </ul>
        {revealed && (
          <div className="mt-4 flex gap-3 rounded-lg border border-glow/40 bg-glow-soft p-4 animate-rise" data-testid="lesson-check-explanation" data-correct={correct}>
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-glow-foreground" />
            <div className="text-sm text-glow-foreground">
              <p className="font-medium">{correct ? "That's it." : "Not quite — here's the idea."}</p>
              <p className="mt-1 leading-relaxed">{check.explanation}</p>
            </div>
          </div>
        )}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <Button variant="outline" render={<Link href={`/modules/${mod.code}`} />} data-testid="lesson-back-to-module">
          <ArrowLeft data-icon="inline-start" /> Back to {mod.code}
        </Button>
        {next ? (
          <Button render={<Link href={`/modules/${mod.code}/learn/${next.slug}`} />} data-testid="lesson-next">
            Next: {next.title} <ArrowRight data-icon="inline-end" />
          </Button>
        ) : (
          <Button render={<Link href={`/modules/${mod.code}?tab=practice`} />} data-testid="lesson-next">
            Now practise it <ArrowRight data-icon="inline-end" />
          </Button>
        )}
      </footer>
    </article>
  )
}
