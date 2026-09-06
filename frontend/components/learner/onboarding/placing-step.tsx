"use client"

import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Grain } from "@/components/brand/grain"
import { errorMessage } from "@/hooks/learner/queries"
import { useReducedMotion } from "@/hooks/learner/use-reduced-motion"
import { cn } from "@/lib/utils"
import type {
  IntakeProfile,
  InterviewView,
  WorkflowSchema,
} from "@/hooks/learner/types"

type Props = {
  mode: InterviewView["mode"]
  scribe: InterviewView["scribe"]
  /** Set when POST /complete failed; the card shows the API detail and a retry. */
  error?: unknown
  retry: () => void
}

/**
 * Shown from the moment the interview ends until placement returns: what we are doing, a calm
 * indeterminate glow bar, and a compact read-only view of what the scribe captured.
 */
export function PlacingStep({ mode, scribe, error, retry }: Props) {
  const reduced = useReducedMotion()
  const failed = error != null
  return (
    <div
      className="mx-auto max-w-3xl space-y-8"
      data-testid="placing-step"
      data-state={failed ? "failed" : "placing"}
    >
      <div className="relative overflow-hidden rounded-2xl bg-ink p-8 text-paper md:p-10">
        <Grain opacity={0.1} />
        <div className="relative">
          <p className="eyebrow text-paper/60">
            {failed ? "Placement paused" : "Placement"}
          </p>
          <h1 className="mt-2 font-display text-3xl leading-tight font-medium md:text-4xl">
            {failed
              ? "We couldn't finish your placement"
              : mode === "intake"
                ? "We're placing you on the ladder"
                : "We're saving your workflow map"}
          </h1>
          <p className="mt-2 text-sm text-paper/70" aria-live="polite">
            {failed
              ? errorMessage(error, "Something went wrong on our side.")
              : "Analyzing your interview — this takes a moment."}
          </p>
          {failed ? (
            <div className="mt-5 flex items-center gap-3">
              <Button
                onClick={retry}
                className="bg-paper text-ink hover:bg-paper/90"
                data-testid="placing-retry"
              >
                <RotateCcw data-icon="inline-start" /> Try again
              </Button>
              <p className="text-xs text-paper/60">
                Everything you said is saved; retrying only redoes the
                placement.
              </p>
            </div>
          ) : (
            <div
              className="mt-5 h-1 w-full overflow-hidden rounded-full bg-paper/10"
              role="progressbar"
              aria-label="Placing you"
              aria-busy
            >
              <div
                className={cn(
                  "h-full w-1/3 rounded-full bg-glow",
                  reduced
                    ? "w-full animate-glow-pulse"
                    : "animate-[placing-sweep_1.8s_ease-in-out_infinite]"
                )}
              />
            </div>
          )}
        </div>
      </div>

      <section
        className="rounded-xl border bg-card p-5"
        data-testid="placing-summary"
      >
        <p className="eyebrow">Here&apos;s what we&apos;ve captured so far</p>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          {mode === "intake" ? (
            <IntakeSummary p={scribe as IntakeProfile} />
          ) : (
            <WorkflowSummary s={scribe as Partial<WorkflowSchema>} />
          )}
        </dl>
      </section>

      <style>{`@keyframes placing-sweep { 0% { transform: translateX(-120%); } 100% { transform: translateX(320%); } }`}</style>
    </div>
  )
}

function Row({
  label,
  children,
  wide = false,
}: {
  label: string
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className={cn(wide && "sm:col-span-2")}>
      <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1">
        {children ?? (
          <span className="text-muted-foreground italic">Not captured</span>
        )}
      </dd>
    </div>
  )
}

const Tags = ({ items }: { items: string[] }) =>
  items.length ? (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <li key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs">
          {t}
        </li>
      ))}
    </ul>
  ) : null

function IntakeSummary({ p }: { p: IntakeProfile }) {
  const wf = p.weeklyWorkflows ?? []
  return (
    <>
      <Row label="Role">{p.role || null}</Row>
      <Row label="Comfort with Claude">
        {p.selfRatedComfort != null ? (
          <span
            className="flex items-center gap-1"
            aria-label={`${p.selfRatedComfort} of 5`}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className={cn(
                  "size-2.5 rounded-full",
                  (p.selfRatedComfort ?? 0) >= n ? "bg-glow" : "bg-border"
                )}
              />
            ))}
            <span className="ml-1 text-xs text-muted-foreground">
              {p.selfRatedComfort}/5
            </span>
          </span>
        ) : null}
      </Row>
      <Row label="Responsibilities" wide>
        <Tags items={p.responsibilities ?? []} />
      </Row>
      <Row label="Weekly workflows" wide>
        {wf.length ? (
          <ul className="divide-y rounded-lg border">
            {wf.map((w, i) => (
              <li
                key={i}
                className="flex items-baseline justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{w.name}</p>
                  {w.systems?.length ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {w.systems.join(", ")}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 text-xs text-muted-foreground tabular">
                  {w.minutesPerRun != null ? `${w.minutesPerRun} min` : "? min"}{" "}
                  × {w.runsPerWeek != null ? `${w.runsPerWeek}/wk` : "?/wk"}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </Row>
      <Row label="How you use Claude today" wide>
        {p.claudeUseToday || null}
      </Row>
    </>
  )
}

function WorkflowSummary({ s }: { s: Partial<WorkflowSchema> }) {
  return (
    <>
      <Row label="Purpose" wide>
        {s.purpose || null}
      </Row>
      <Row label="Trigger">{s.trigger || null}</Row>
      <Row label="Cadence">
        {s.frequency || s.minutesPerRun != null
          ? `${s.frequency?.replace("_", " ") ?? ""}${s.minutesPerRun != null ? ` · ${s.minutesPerRun} min/run` : ""}${s.runsPerWeek != null ? ` · ${s.runsPerWeek} runs/wk` : ""}`
          : null}
      </Row>
      <Row label="Steps" wide>
        {s.steps?.length ? (
          <ol className="list-decimal space-y-0.5 pl-4 text-xs">
            {s.steps.map((st, i) => (
              <li key={i}>
                {st.action}{" "}
                <span className="text-muted-foreground">({st.actor})</span>
              </li>
            ))}
          </ol>
        ) : null}
      </Row>
      <Row label="Systems">
        <Tags items={s.systems ?? []} />
      </Row>
      <Row label="Must never leave">
        <Tags items={s.mustNeverLeave ?? []} />
      </Row>
    </>
  )
}
