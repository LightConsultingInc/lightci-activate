"use client"

import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChipListEditor } from "./chip-list-editor"
import type { WorkflowSchema } from "@/hooks/learner/types"

type S = Partial<WorkflowSchema>
type Props = { value: S; onChange: (v: S) => void; disabled?: boolean }

const FREQUENCIES = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", ad_hoc: "Ad hoc" }
const ACTORS = { human: "Human", claude: "Claude", system: "System" }

export const EMPTY_SCHEMA: WorkflowSchema = {
  purpose: "", trigger: "", frequency: "weekly", minutesPerRun: 30, runsPerWeek: 1,
  inputs: [], steps: [], decisions: [], exceptions: [], systems: [], mustNeverLeave: [], outputs: [], humanReview: [],
}

/** Editable form for the Interviewer's WorkflowSchema. Used by the L4 exercise surface and /workflows/[id] edit mode. */
export function WorkflowSchemaForm({ value, onChange, disabled }: Props) {
  const set = <K extends keyof WorkflowSchema>(k: K, v: WorkflowSchema[K]) => onChange({ ...value, [k]: v })
  const inputs = value.inputs ?? []
  const steps = value.steps ?? []
  const decisions = value.decisions ?? []
  const exceptions = value.exceptions ?? []
  const outputs = value.outputs ?? []

  return (
    <div className="space-y-6" data-testid="workflow-schema-form">
      <Section title="What and when">
        <Field label="Purpose" hint="One sentence: what this workflow produces and for whom.">
          <Textarea value={value.purpose ?? ""} onChange={(e) => set("purpose", e.target.value)} disabled={disabled} placeholder="Prepare the Monday client review pack for each advisor" data-testid="wf-purpose" />
        </Field>
        <Field label="Trigger" hint="What kicks it off.">
          <Input value={value.trigger ?? ""} onChange={(e) => set("trigger", e.target.value)} disabled={disabled} placeholder="Friday 3pm, once the CRM export lands" data-testid="wf-trigger" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Frequency">
            <Select value={value.frequency ?? "weekly"} onValueChange={(v) => set("frequency", v as WorkflowSchema["frequency"])} disabled={disabled} items={FREQUENCIES}>
              <SelectTrigger className="w-full" data-testid="wf-frequency"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="ad_hoc">Ad hoc</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Minutes per run">
            <Input type="number" min={0} value={value.minutesPerRun ?? ""} onChange={(e) => set("minutesPerRun", Number(e.target.value))} disabled={disabled} data-testid="wf-minutes" />
          </Field>
          <Field label="Runs per week">
            <Input type="number" min={0} step="0.5" value={value.runsPerWeek ?? ""} onChange={(e) => set("runsPerWeek", Number(e.target.value))} disabled={disabled} data-testid="wf-runs" />
          </Field>
        </div>
      </Section>

      <Section title="Inputs" action={!disabled && <AddButton onClick={() => set("inputs", [...inputs, { name: "", source: "", dataClass: "" }])} testId="wf-add-input" />}>
        {inputs.length === 0 && <Empty>No inputs yet. What does the workflow read?</Empty>}
        {inputs.map((inp, i) => (
          <Row key={i} onRemove={disabled ? undefined : () => set("inputs", inputs.filter((_, j) => j !== i))}>
            <Input value={inp.name} placeholder="Input" disabled={disabled} onChange={(e) => set("inputs", inputs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <Input value={inp.source} placeholder="Source system" disabled={disabled} onChange={(e) => set("inputs", inputs.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)))} />
            <Input value={inp.dataClass ?? ""} placeholder="Data class" disabled={disabled} onChange={(e) => set("inputs", inputs.map((x, j) => (j === i ? { ...x, dataClass: e.target.value } : x)))} />
          </Row>
        ))}
      </Section>

      <Section title="Steps" action={!disabled && <AddButton onClick={() => set("steps", [...steps, { order: steps.length + 1, action: "", actor: "human" }])} testId="wf-add-step" />}>
        {steps.length === 0 && <Empty>No steps yet. Walk through it as you would on a normal week.</Empty>}
        {steps.map((st, i) => (
          <Row key={i} onRemove={disabled ? undefined : () => set("steps", steps.filter((_, j) => j !== i).map((x, j) => ({ ...x, order: j + 1 })))}>
            <span className="tabular w-5 shrink-0 text-xs text-muted-foreground">{i + 1}.</span>
            <Input className="flex-[3]" value={st.action} placeholder="What happens" disabled={disabled} onChange={(e) => set("steps", steps.map((x, j) => (j === i ? { ...x, action: e.target.value } : x)))} />
            <Select value={st.actor} disabled={disabled} items={ACTORS} onValueChange={(v) => set("steps", steps.map((x, j) => (j === i ? { ...x, actor: v as WorkflowSchema["steps"][number]["actor"] } : x)))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="human">Human</SelectItem>
                <SelectItem value="claude">Claude</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
            <Input className="flex-1" value={st.system ?? ""} placeholder="System" disabled={disabled} onChange={(e) => set("steps", steps.map((x, j) => (j === i ? { ...x, system: e.target.value } : x)))} />
          </Row>
        ))}
      </Section>

      <Section title="Decisions" action={!disabled && <AddButton onClick={() => set("decisions", [...decisions, { point: "", rule: "" }])} testId="wf-add-decision" />}>
        {decisions.length === 0 && <Empty>Where does a person judge something? Name the rule they apply.</Empty>}
        {decisions.map((d, i) => (
          <Row key={i} onRemove={disabled ? undefined : () => set("decisions", decisions.filter((_, j) => j !== i))}>
            <Input value={d.point} placeholder="Decision point" disabled={disabled} onChange={(e) => set("decisions", decisions.map((x, j) => (j === i ? { ...x, point: e.target.value } : x)))} />
            <Input className="flex-[2]" value={d.rule} placeholder="Rule applied" disabled={disabled} onChange={(e) => set("decisions", decisions.map((x, j) => (j === i ? { ...x, rule: e.target.value } : x)))} />
          </Row>
        ))}
      </Section>

      <Section title="Exceptions" action={!disabled && <AddButton onClick={() => set("exceptions", [...exceptions, { case: "", handling: "" }])} testId="wf-add-exception" />}>
        {exceptions.length === 0 && <Empty>The cases that break the normal path, and what you do then.</Empty>}
        {exceptions.map((ex, i) => (
          <Row key={i} onRemove={disabled ? undefined : () => set("exceptions", exceptions.filter((_, j) => j !== i))}>
            <Input value={ex.case} placeholder="Case" disabled={disabled} onChange={(e) => set("exceptions", exceptions.map((x, j) => (j === i ? { ...x, case: e.target.value } : x)))} />
            <Input className="flex-[2]" value={ex.handling} placeholder="Handling" disabled={disabled} onChange={(e) => set("exceptions", exceptions.map((x, j) => (j === i ? { ...x, handling: e.target.value } : x)))} />
          </Row>
        ))}
      </Section>

      <Section title="Systems and boundary">
        <Field label="Systems touched">
          <ChipListEditor value={value.systems ?? []} onChange={(v) => set("systems", v)} placeholder="Salesforce, Outlook, eMoney…" disabled={disabled} testId="wf-systems" />
        </Field>
        <Field label="Must never leave" hint="Data classes that never enter Claude.">
          <ChipListEditor value={value.mustNeverLeave ?? []} onChange={(v) => set("mustNeverLeave", v)} tone="fail" placeholder="Client SSNs, account numbers…" disabled={disabled} testId="wf-must-never-leave" />
        </Field>
        <Field label="Human review points" hint="Where a person signs off before anything is sent or entered.">
          <ChipListEditor value={value.humanReview ?? []} onChange={(v) => set("humanReview", v)} tone="revise" placeholder="Before the pack goes to the advisor" disabled={disabled} testId="wf-human-review" />
        </Field>
      </Section>

      <Section title="Outputs" action={!disabled && <AddButton onClick={() => set("outputs", [...outputs, { name: "", destination: "" }])} testId="wf-add-output" />}>
        {outputs.length === 0 && <Empty>What comes out, and where it goes.</Empty>}
        {outputs.map((o, i) => (
          <Row key={i} onRemove={disabled ? undefined : () => set("outputs", outputs.filter((_, j) => j !== i))}>
            <Input value={o.name} placeholder="Output" disabled={disabled} onChange={(e) => set("outputs", outputs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <Input value={o.destination} placeholder="Destination" disabled={disabled} onChange={(e) => set("outputs", outputs.map((x, j) => (j === i ? { ...x, destination: e.target.value } : x)))} />
          </Row>
        ))}
      </Section>
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="eyebrow">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  )
}
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
function Row({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 flex-wrap items-center gap-2 *:min-w-0 *:flex-1">{children}</div>
      {onRemove && (
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove row"><Trash2 /></Button>
      )}
    </div>
  )
}
function AddButton({ onClick, testId }: { onClick: () => void; testId: string }) {
  return (
    <Button type="button" variant="ghost" size="xs" onClick={onClick} data-testid={testId}><Plus data-icon="inline-start" /> Add</Button>
  )
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">{children}</p>
}
