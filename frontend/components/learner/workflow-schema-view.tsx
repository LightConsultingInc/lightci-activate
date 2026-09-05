import { cn } from "@/lib/utils"
import type { WorkflowSchema } from "@/hooks/learner/types"

/** Read-only pretty view of a workflow schema. Missing sections are shown, not hidden, so gaps are visible. */
export function WorkflowSchemaView({ schema, className }: { schema: Partial<WorkflowSchema>; className?: string }) {
  const s = schema ?? {}
  return (
    <div className={cn("space-y-6 text-sm", className)} data-testid="workflow-schema-view">
      <Block label="Purpose">{s.purpose || <Missing />}</Block>
      <div className="grid gap-4 sm:grid-cols-3">
        <Block label="Trigger">{s.trigger || <Missing />}</Block>
        <Block label="Frequency">{s.frequency ? s.frequency.replace("_", " ") : <Missing />}</Block>
        <Block label="Time">{s.minutesPerRun != null ? <span className="tabular">{s.minutesPerRun} min × {s.runsPerWeek ?? "?"}/wk</span> : <Missing />}</Block>
      </div>
      <Block label="Inputs">
        {s.inputs?.length ? (
          <ul className="divide-y rounded-lg border">
            {s.inputs.map((i, k) => (
              <li key={k} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span>{i.name}</span>
                <span className="text-xs text-muted-foreground">{i.source}{i.dataClass ? ` · ${i.dataClass}` : ""}</span>
              </li>
            ))}
          </ul>
        ) : <Missing />}
      </Block>
      <Block label="Steps">
        {s.steps?.length ? (
          <ol className="space-y-1.5">
            {[...s.steps].sort((a, b) => a.order - b.order).map((st, k) => (
              <li key={k} className="flex items-start gap-3">
                <span className="tabular mt-0.5 w-5 shrink-0 text-xs text-muted-foreground">{st.order}.</span>
                <span className="flex-1">{st.action}</span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px]", st.actor === "claude" ? "bg-claude-soft text-claude" : st.actor === "system" ? "bg-info-soft text-info" : "bg-muted text-muted-foreground")}>{st.actor}{st.system ? ` · ${st.system}` : ""}</span>
              </li>
            ))}
          </ol>
        ) : <Missing />}
      </Block>
      <div className="grid gap-4 sm:grid-cols-2">
        <Block label="Decisions">
          {s.decisions?.length ? <ul className="space-y-1.5">{s.decisions.map((d, k) => <li key={k}><span className="font-medium">{d.point}</span> <span className="text-muted-foreground">— {d.rule}</span></li>)}</ul> : <Missing />}
        </Block>
        <Block label="Exceptions">
          {s.exceptions?.length ? <ul className="space-y-1.5">{s.exceptions.map((e, k) => <li key={k}><span className="font-medium">{e.case}</span> <span className="text-muted-foreground">— {e.handling}</span></li>)}</ul> : <Missing />}
        </Block>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Block label="Systems"><Tags items={s.systems} /></Block>
        <Block label="Must never leave"><Tags items={s.mustNeverLeave} tone="bg-fail-soft text-fail" /></Block>
        <Block label="Human review"><Tags items={s.humanReview} tone="bg-revise-soft text-glow-foreground" /></Block>
      </div>
      <Block label="Outputs">
        {s.outputs?.length ? <ul className="space-y-1">{s.outputs.map((o, k) => <li key={k}>{o.name} <span className="text-muted-foreground">→ {o.destination}</span></li>)}</ul> : <Missing />}
      </Block>
    </div>
  )
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow mb-1.5">{label}</p>
      <div>{children}</div>
    </div>
  )
}
function Missing() {
  return <span className="text-xs text-muted-foreground italic">Not captured yet</span>
}
function Tags({ items, tone = "bg-muted" }: { items?: string[]; tone?: string }) {
  if (!items?.length) return <Missing />
  return <ul className="flex flex-wrap gap-1.5">{items.map((t, i) => <li key={i} className={cn("rounded-full px-2 py-0.5 text-xs", tone)}>{t}</li>)}</ul>
}
