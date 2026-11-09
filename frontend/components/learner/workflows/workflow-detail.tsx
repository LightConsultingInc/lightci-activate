"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Hammer, MessageCircleQuestion, Pencil, Plus, Save, ShieldCheck, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ErrorState } from "@/components/shell/empty-state"
import { useMe, hasRole } from "@/hooks/use-me"
import { Chip, StatusPipeline, skillStatusTone } from "../chips"
import { WorkflowSchemaView } from "../workflow-schema-view"
import { WorkflowSchemaForm, EMPTY_SCHEMA, Field } from "../workflow-schema-form"
import { CompletenessMeter, ScoreBars } from "./score-bars"
import { useAddBaseline, useAddMeasurement, useCreateInterview, usePatchWorkflow, useRequestBuild, useWorkflow } from "@/hooks/learner/queries"
import { fmt } from "@/lib/format"
import type { WorkflowDetail as WD, WorkflowSchema } from "@/hooks/learner/types"

const METHODS = { interview_estimate: "Your estimate", time_diary: "Time diary" }

export function WorkflowDetail({ id }: { id: string }) {
  const q = useWorkflow(id)
  if (q.isPending) return <div className="space-y-4" data-testid="workflow-loading"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64" /><Skeleton className="h-40" /></div>
  if (q.isError) return <ErrorState title="Couldn't load this workflow" detail={q.error.message} retry={() => q.refetch()} />
  return <Loaded w={q.data} key={q.data.id} />
}

function Loaded({ w }: { w: WD }) {
  const me = useMe()
  const router = useRouter()
  const patch = usePatchWorkflow(w.id)
  const build = useRequestBuild(w.id)
  const create = useCreateInterview()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Partial<WorkflowSchema>>({ ...EMPTY_SCHEMA, ...w.schema })
  const [name, setName] = useState(w.name)
  const [builtSkill, setBuiltSkill] = useState<{ slug: string; name: string } | null>(null)

  const canBuild = hasRole(me, "champion") || (me.user?.rung ?? 0) >= 3
  const monthlyBack = w.hoursBackPerWeek != null ? w.hoursBackPerWeek * 4.33 : null
  // Equal to the time before means nothing has been measured since; hide it rather than repeat the same number.
  const hasNewTime = w.measuredMinutesPerWeek != null && w.measuredMinutesPerWeek !== w.baselineMinutesPerWeek

  const save = () => patch.mutate({ name: name.trim() || w.name, schema: draft }, { onSuccess: () => setEditing(false) })
  const continueInterview = () => create.mutate({ mode: "workflow", workflowMapId: w.id }, { onSuccess: (iv) => router.push(`/onboarding?interview=${iv.id}&mode=workflow&workflow=${w.id}`) })

  return (
    <div className="space-y-6" data-testid="workflow-detail">
      <header className="space-y-3">
        <Link href="/workflows" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3" /> My Workflows</Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">{w.teamName ?? "Workflow"}</p>
            {editing ? <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-10 font-display text-2xl" data-testid="workflow-name-input" /> : <h1 className="mt-1 font-display text-3xl font-medium leading-tight md:text-4xl" data-testid="workflow-name">{w.name}</h1>}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <StatusPipeline status={w.status} />
              <CompletenessMeter value={w.completeness} />
              {w.championVerified && <span className="inline-flex items-center gap-1 text-xs text-pass"><ShieldCheck className="size-3.5" /> Champion verified</span>}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="outline" onClick={continueInterview} disabled={create.isPending} data-testid="workflow-continue-interview">
              <MessageCircleQuestion data-icon="inline-start" /> Keep describing it
            </Button>
            {canBuild && (
              <Button onClick={() => build.mutate(undefined, { onSuccess: (r) => { setBuiltSkill({ slug: r.skill.slug, name: r.skill.name }); toast.success(`Claude drafted "${r.skill.name}"`) } })} disabled={build.isPending} data-testid="workflow-request-build">
                <Hammer data-icon="inline-start" /> {build.isPending ? "Drafting a skill…" : "Draft a skill from this"}
              </Button>
            )}
          </div>
        </div>
        {builtSkill && (
          <div className="rounded-lg border border-pass/40 bg-pass-soft p-3 text-sm animate-rise" data-testid="built-skill">
            Claude drafted <Link href={`/library/${builtSkill.slug}`} className="font-medium underline underline-offset-4">{builtSkill.name}</Link> with a few test examples and a note of what information it may use. It&apos;s your draft: check how it does, then ask to share it with your team.
          </div>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5 lg:col-span-2" data-testid="workflow-schema">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-medium">How the work goes</h2>
            {editing ? (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setDraft({ ...EMPTY_SCHEMA, ...w.schema }); setName(w.name) }} disabled={patch.isPending} data-testid="workflow-cancel-edit"><X data-icon="inline-start" /> Cancel</Button>
                <Button size="sm" onClick={save} disabled={patch.isPending} data-testid="workflow-save"><Save data-icon="inline-start" /> {patch.isPending ? "Saving…" : "Save"}</Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)} data-testid="workflow-edit"><Pencil data-icon="inline-start" /> Edit</Button>
            )}
          </div>
          {editing ? <WorkflowSchemaForm value={draft} onChange={setDraft} /> : <WorkflowSchemaView schema={w.schema} />}
        </section>

        <div className="space-y-6">
          {w.score && (
            <section className="rounded-xl border bg-card p-5" data-testid="workflow-scorer">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-xl font-medium">Worth handing to Claude</h2>
                <span className="font-display text-3xl tabular">{Math.round(w.score.composite)}<span className="text-xs text-muted-foreground">/100</span></span>
              </div>
              <ScoreBars score={w.score} className="mt-3" />
              {w.score.rationale && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{w.score.rationale}</p>}
            </section>
          )}

          <section className="rounded-xl border bg-card p-5" data-testid="workflow-hours">
            <h2 className="font-display text-xl font-medium">Time each week</h2>
            {w.baselineMinutesPerWeek == null && !hasNewTime ? <p className="mt-2 text-xs text-muted-foreground">Add how long this takes you below, so any time saved can be counted.</p> : (
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                {w.baselineMinutesPerWeek != null && <div><dt className="eyebrow">Before</dt><dd className="font-display text-2xl tabular">{fmt.hours(w.baselineMinutesPerWeek)}<span className="text-xs text-muted-foreground"> a week</span></dd></div>}
                {hasNewTime && <div><dt className="eyebrow">Now</dt><dd className="font-display text-2xl tabular">{fmt.hours(w.measuredMinutesPerWeek ?? 0)}<span className="text-xs text-muted-foreground"> a week</span></dd></div>}
              </dl>
            )}
            {w.hoursBackPerWeek != null && w.hoursBackPerWeek > 0 && <p className="mt-2 text-sm text-pass">Saves about {w.hoursBackPerWeek.toFixed(1)}h a week{monthlyBack != null ? ` · about ${monthlyBack.toFixed(0)}h a month` : ""}</p>}
          </section>

          <section className="rounded-xl border bg-card p-5" data-testid="workflow-skills">
            <h2 className="font-display text-xl font-medium">Skills for this</h2>
            {w.linkedSkills.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No skill made from this yet.{canBuild ? " Use “Draft a skill from this” and Claude will write a first version." : " From L3, or with your champion’s help, Claude can draft one for you."}</p> : (
              <ul className="mt-2 divide-y">
                {w.linkedSkills.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <Link href={`/library/${s.slug}`} className="min-w-0 truncate hover:underline hover:underline-offset-4">{s.name}</Link>
                    <Chip tone={skillStatusTone(s.status)}>{s.status.replace("_", " ")}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BaselinesCard w={w} />
        <MeasurementsCard w={w} />
      </div>
    </div>
  )
}

function BaselinesCard({ w }: { w: WD }) {
  const add = useAddBaseline(w.id)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ method: "interview_estimate" as "time_diary" | "interview_estimate", minutesPerWeek: "", reworkMinutesPerWeek: "0" })
  return (
    <section className="rounded-xl border bg-card p-5" data-testid="workflow-baselines">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-medium">Time before</h2>
        <Button variant="ghost" size="xs" onClick={() => setOpen((o) => !o)} data-testid="baseline-toggle"><Plus data-icon="inline-start" /> Add time before</Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">How long this took before Claude helped, so time saved is counted against something real.</p>
      {open && (
        <form
          className="mt-3 grid gap-3 rounded-lg border p-3 sm:grid-cols-3"
          onSubmit={(e) => { e.preventDefault(); add.mutate({ method: form.method, minutesPerWeek: Number(form.minutesPerWeek), reworkMinutesPerWeek: Number(form.reworkMinutesPerWeek) }, { onSuccess: () => setOpen(false) }) }}
          data-testid="baseline-form"
        >
          <Field label="How you know">
            <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v as typeof form.method })} items={METHODS}>
              <SelectTrigger className="w-full" size="sm"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="interview_estimate">Your estimate</SelectItem><SelectItem value="time_diary">Time diary</SelectItem></SelectContent>
            </Select>
          </Field>
          <Field label="Minutes a week"><Input type="number" min={0} required value={form.minutesPerWeek} onChange={(e) => setForm({ ...form, minutesPerWeek: e.target.value })} data-testid="baseline-minutes" /></Field>
          <Field label="Minutes fixing things a week"><Input type="number" min={0} value={form.reworkMinutesPerWeek} onChange={(e) => setForm({ ...form, reworkMinutesPerWeek: e.target.value })} /></Field>
          <div className="sm:col-span-3"><Button type="submit" size="sm" disabled={add.isPending} data-testid="baseline-submit">{add.isPending ? "Saving…" : "Save"}</Button></div>
        </form>
      )}
      {w.baselines.length === 0 ? <p className="mt-3 rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Nothing added yet.</p> : (
        <Table className="mt-3">
          <TableHeader><TableRow><TableHead>Added</TableHead><TableHead>How</TableHead><TableHead className="text-right">Min a week</TableHead><TableHead className="text-right">Fixing</TableHead></TableRow></TableHeader>
          <TableBody>
            {w.baselines.map((b) => (
              <TableRow key={b.id}><TableCell>{fmt.date(b.capturedAt)}</TableCell><TableCell className="text-muted-foreground">{METHODS[b.method] ?? b.method.replace("_", " ")}</TableCell><TableCell className="tabular text-right">{b.minutesPerWeek}</TableCell><TableCell className="tabular text-right">{b.reworkMinutesPerWeek}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}

function MeasurementsCard({ w }: { w: WD }) {
  const add = useAddMeasurement(w.id)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => {
    const now = Date.now()
    return { method: "time_diary" as "time_diary" | "interview_estimate", minutesPerWeek: "", reworkMinutesPerWeek: "0", periodStart: new Date(now - 7 * 86400_000).toISOString().slice(0, 10), periodEnd: new Date(now).toISOString().slice(0, 10) }
  })
  return (
    <section className="rounded-xl border bg-card p-5" data-testid="workflow-measurements">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-medium">Time now</h2>
        <Button variant="ghost" size="xs" onClick={() => setOpen((o) => !o)} data-testid="measurement-toggle"><Plus data-icon="inline-start" /> Add time now</Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">How long this takes now, including time spent fixing things. These go into your time-saved report.</p>
      {open && (
        <form
          className="mt-3 grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
          onSubmit={(e) => { e.preventDefault(); add.mutate({ method: form.method, minutesPerWeek: Number(form.minutesPerWeek), reworkMinutesPerWeek: Number(form.reworkMinutesPerWeek), periodStart: form.periodStart, periodEnd: form.periodEnd }, { onSuccess: () => setOpen(false) }) }}
          data-testid="measurement-form"
        >
          <Field label="From"><Input type="date" required value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} /></Field>
          <Field label="To"><Input type="date" required value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} /></Field>
          <Field label="Minutes a week"><Input type="number" min={0} required value={form.minutesPerWeek} onChange={(e) => setForm({ ...form, minutesPerWeek: e.target.value })} data-testid="measurement-minutes" /></Field>
          <Field label="Minutes fixing things a week"><Input type="number" min={0} value={form.reworkMinutesPerWeek} onChange={(e) => setForm({ ...form, reworkMinutesPerWeek: e.target.value })} /></Field>
          <Field label="How you know">
            <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v as typeof form.method })} items={METHODS}>
              <SelectTrigger className="w-full" size="sm"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="time_diary">Time diary</SelectItem><SelectItem value="interview_estimate">Your estimate</SelectItem></SelectContent>
            </Select>
          </Field>
          <div className="flex items-end"><Button type="submit" size="sm" disabled={add.isPending} data-testid="measurement-submit">{add.isPending ? "Saving…" : "Save"}</Button></div>
        </form>
      )}
      {w.measurements.length === 0 ? <p className="mt-3 rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Nothing added yet.</p> : (
        <Table className="mt-3">
          <TableHeader><TableRow><TableHead>Dates</TableHead><TableHead>How</TableHead><TableHead className="text-right">Min a week</TableHead><TableHead className="text-right">Fixing</TableHead></TableRow></TableHeader>
          <TableBody>
            {w.measurements.map((m) => (
              <TableRow key={m.id}><TableCell>{fmt.dateShort(m.periodStart)} – {fmt.dateShort(m.periodEnd)}</TableCell><TableCell className="text-muted-foreground">{m.source === "self" ? "You" : "Counted for you"} · {METHODS[m.method] ?? m.method.replace("_", " ")}</TableCell><TableCell className="tabular text-right">{m.minutesPerWeek}</TableCell><TableCell className="tabular text-right">{m.reworkMinutesPerWeek}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
