"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { IntakeProfile, WorkflowSchema } from "@/hooks/learner/types"

type Props = {
  scribe: IntakeProfile | Partial<WorkflowSchema>
  mode: "intake" | "workflow" | "champion"
  completeness: number
  /** The checker's notes steer the interviewer's next question; they are not shown to the learner. */
  checkerFlags: { field: string; issue: string }[]
  className?: string
}

/** The live scribe: fills in as the person talks. Empty fields are shown greyed, so progress is visible. */
export function ScribeCard({
  scribe,
  mode,
  completeness,
  className,
}: Props) {
  const pct = Math.round(Math.max(0, Math.min(1, completeness)) * 100)
  return (
    <aside
      className={cn(
        "rounded-xl border bg-card p-5 ring-1 ring-foreground/5",
        className
      )}
      data-testid="scribe-card"
    >
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">
          {mode === "intake" ? "What we've noted" : "Your workflow, so far"}
        </p>
        <span
          className="text-xs text-muted-foreground tabular"
          data-testid="scribe-completeness"
        >
          {pct}% complete
        </span>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Interview completeness"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700",
            pct >= 85 ? "bg-pass" : "bg-glow"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {pct >= 85
          ? "Enough to place you. Finish whenever you like."
          : "Keep going: a few more details and we're done."}
      </p>

      <dl className="mt-5 space-y-4 text-sm">
        {mode === "intake" ? (
          <IntakeFields p={scribe as IntakeProfile} />
        ) : (
          <WorkflowFields s={scribe as Partial<WorkflowSchema>} />
        )}
      </dl>

    </aside>
  )
}

function Field({
  label,
  filled,
  children,
}: {
  label: string
  filled: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn("transition-opacity", !filled && "opacity-50")}
      data-filled={filled}
    >
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {filled ? (
          <Check className="size-3 text-pass" />
        ) : (
          <span className="inline-block size-3 rounded-full border border-dashed border-muted-foreground/60" />
        )}
        {label}
      </dt>
      <dd className="mt-1">
        {filled ? (
          children
        ) : (
          <span className="text-muted-foreground italic">Listening…</span>
        )}
      </dd>
    </div>
  )
}

function Tags({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <li key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs">
          {t}
        </li>
      ))}
    </ul>
  )
}

function IntakeFields({ p }: { p: IntakeProfile }) {
  const wf = p.weeklyWorkflows ?? []
  return (
    <>
      <Field label="Role" filled={Boolean(p.role)}>
        {p.role}
      </Field>
      <Field
        label="Responsibilities"
        filled={(p.responsibilities?.length ?? 0) > 0}
      >
        <Tags items={p.responsibilities ?? []} />
      </Field>
      <Field label="Weekly workflows" filled={wf.length > 0}>
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
                {w.minutesPerRun != null ? `${w.minutesPerRun} min` : "? min"} ×{" "}
                {w.runsPerWeek != null ? `${w.runsPerWeek}/wk` : "?/wk"}
              </p>
            </li>
          ))}
        </ul>
      </Field>
      <Field label="Claude use today" filled={Boolean(p.claudeUseToday)}>
        {p.claudeUseToday}
      </Field>
      <Field label="Comfort" filled={p.selfRatedComfort != null}>
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
      </Field>
    </>
  )
}

function WorkflowFields({ s }: { s: Partial<WorkflowSchema> }) {
  return (
    <>
      <Field label="Purpose" filled={Boolean(s.purpose)}>
        {s.purpose}
      </Field>
      <Field label="Trigger" filled={Boolean(s.trigger)}>
        {s.trigger}
      </Field>
      <Field
        label="Cadence"
        filled={Boolean(s.frequency) || s.minutesPerRun != null}
      >
        {s.frequency?.replace("_", " ")}
        {s.minutesPerRun != null ? ` · ${s.minutesPerRun} min/run` : ""}
        {s.runsPerWeek != null ? ` · ${s.runsPerWeek} runs/wk` : ""}
      </Field>
      <Field label="Inputs" filled={(s.inputs?.length ?? 0) > 0}>
        <Tags items={(s.inputs ?? []).map((i) => i.name)} />
      </Field>
      <Field label="Steps" filled={(s.steps?.length ?? 0) > 0}>
        <ol className="list-decimal space-y-0.5 pl-4 text-xs">
          {(s.steps ?? []).map((st, i) => (
            <li key={i}>
              {st.action}{" "}
              <span className="text-muted-foreground">({st.actor})</span>
            </li>
          ))}
        </ol>
      </Field>
      <Field label="Decisions" filled={(s.decisions?.length ?? 0) > 0}>
        <Tags items={(s.decisions ?? []).map((d) => d.point)} />
      </Field>
      <Field label="Exceptions" filled={(s.exceptions?.length ?? 0) > 0}>
        <Tags items={(s.exceptions ?? []).map((e) => e.case)} />
      </Field>
      <Field label="Systems" filled={(s.systems?.length ?? 0) > 0}>
        <Tags items={s.systems ?? []} />
      </Field>
      <Field
        label="Must never leave"
        filled={(s.mustNeverLeave?.length ?? 0) > 0}
      >
        <Tags items={s.mustNeverLeave ?? []} />
      </Field>
      <Field label="Outputs" filled={(s.outputs?.length ?? 0) > 0}>
        <Tags items={(s.outputs ?? []).map((o) => o.name)} />
      </Field>
      <Field label="Human review" filled={(s.humanReview?.length ?? 0) > 0}>
        <Tags items={s.humanReview ?? []} />
      </Field>
    </>
  )
}
