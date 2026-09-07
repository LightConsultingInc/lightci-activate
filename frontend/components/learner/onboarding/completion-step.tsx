"use client"

import Link from "next/link"
import { motion } from "motion/react"
import { ArrowRight, Route } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Grain } from "@/components/brand/grain"
import { RungBadge, rungMeta } from "@/components/brand/rung"
import { ModeBadge } from "../chips"
import { MarkdownLite } from "../markdown-lite"
import { useReducedMotion } from "@/hooks/learner/use-reduced-motion"
import type { InterviewComplete, WorkflowSummary } from "@/hooks/learner/types"

/** What starting at each level means, said the way a colleague would. */
const PLAIN_START = [
  "You'll begin with the basics: what Claude is good for and what to keep out of it.",
  "You'll begin with writing clear requests and checking what comes back before you use it.",
  "You'll begin by setting up a Project so Claude remembers how you like a repeated task done.",
  "You'll begin by turning one of your repeated tasks into a skill your team can reuse.",
  "You'll begin by mapping a whole workflow and getting it reviewed for the team.",
  "You'll begin by reviewing other people's work and running the team's queue.",
]

export function CompletionStep({
  result,
  workflows,
  mode,
}: {
  result: InterviewComplete
  workflows: WorkflowSummary[]
  mode: "intake" | "workflow" | "champion"
}) {
  const reduced = useReducedMotion()
  const first = result.exercises[0]
  const placed = result.placement
  const candidates = workflows.filter((w) =>
    result.workflowMapIds.includes(w.id)
  )
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-6"
      data-testid="completion-step"
    >
      <div className="relative overflow-hidden rounded-2xl bg-ink p-8 text-paper md:p-10">
        <Grain opacity={0.1} />
        <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="eyebrow text-paper/60">
              {mode === "intake" ? "Placement" : "Workflow mapped"}
            </p>
            {placed ? (
              <>
                <h1 className="mt-2 font-display text-4xl leading-tight font-medium">
                  You start at{" "}
                  <span className="text-glow">
                    {rungMeta(placed.rung).code} {rungMeta(placed.rung).name}
                  </span>
                </h1>
                <p className="mt-2 max-w-xl text-sm text-paper/70">
                  {PLAIN_START[Math.max(0, Math.min(5, placed.rung))]} You move up by doing real work well, not by finishing lessons.
                </p>
              </>
            ) : (
              <h1 className="mt-2 font-display text-4xl leading-tight font-medium">
                {mode === "intake"
                  ? "Your plan is ready"
                  : "Saved to your workflows"}
              </h1>
            )}
          </div>
          {placed && (
            <RungBadge
              rung={placed.rung}
              className="border-glow/60 text-paper"
            />
          )}
        </div>
        {placed?.evidence && (
          <div
            className="relative mt-6 rounded-lg border border-paper/15 bg-paper/5 p-4"
            data-testid="placement-evidence"
          >
            <p className="eyebrow text-paper/60">Evidence</p>
            <MarkdownLite
              text={
                Array.isArray(placed.evidence)
                  ? placed.evidence.map((e) => `- ${e}`).join("\n")
                  : placed.evidence
              }
              className="mt-1 text-paper/85"
            />
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          className="rounded-xl border bg-card p-5"
          data-testid="workflow-candidates"
        >
          <h2 className="flex items-center gap-2 font-display text-xl font-medium">
            <Route className="size-4 text-glow-foreground" /> Workflow
            candidates
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Scorer will rank these by value, hours, readiness and exposure.
            Coach draws your exercises from them.
          </p>
          {result.workflowMapIds.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No workflows were mapped this time.
            </p>
          ) : (
            <ul className="mt-3 divide-y">
              {(candidates.length
                ? candidates
                : result.workflowMapIds.map(
                    (id) =>
                      ({
                        id,
                        name: "Workflow",
                        baselineMinutesPerWeek: null,
                      }) as Pick<
                        WorkflowSummary,
                        "id" | "name" | "baselineMinutesPerWeek"
                      >
                  )
              ).map((w) => (
                <li
                  key={w.id}
                  className="flex items-center justify-between gap-2 py-2 text-sm"
                >
                  <Link
                    href={`/workflows/${w.id}`}
                    className="hover:underline hover:underline-offset-4"
                  >
                    {w.name}
                  </Link>
                  {w.baselineMinutesPerWeek != null && w.baselineMinutesPerWeek > 0 && (
                    <span className="text-xs text-muted-foreground tabular">
                      about {Math.round(w.baselineMinutesPerWeek)} min a week
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section
          className="rounded-xl border bg-card p-5 glow-ring"
          data-testid="first-exercise"
        >
          <p className="eyebrow">Your first exercise</p>
          {first ? (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <RungBadge rung={first.rung} />
                <ModeBadge mode={first.mode} />
                <span className="text-xs text-muted-foreground">
                  ~{first.estimatedMinutes} min
                </span>
              </div>
              <h3 className="mt-2 font-display text-2xl leading-snug font-medium">
                {first.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {first.rationale}
              </p>
              <Button
                size="lg"
                className="mt-4"
                render={<Link href={`/exercise/${first.id}`} />}
                data-testid="first-exercise-start"
              >
                Finish something real <ArrowRight data-icon="inline-end" />
              </Button>
            </>
          ) : (
            <>
              <h3 className="mt-2 font-display text-2xl font-medium">
                Coach is queueing it
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Head to your ladder; it will appear under Next up.
              </p>
            </>
          )}
        </section>
      </div>
      <div className="flex justify-end">
        <Button
          variant="outline"
          render={<Link href="/" />}
          data-testid="onboarding-go-ladder"
        >
          Go to My Ladder
        </Button>
      </div>
    </motion.div>
  )
}
