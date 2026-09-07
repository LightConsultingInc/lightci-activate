"use client"

import { FilePlus2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MarkdownLite } from "./markdown-lite"
import { WorkflowSchemaForm, EMPTY_SCHEMA, Field } from "./workflow-schema-form"
import type { Artifact, ExerciseDetail, PracticeKind, PracticeSpec, RunBody, RunResult, SkillRunResult, WorkflowSchema } from "@/hooks/learner/types"

// ───────────────────────── Surface state ─────────────────────────
// One input per kind (docs/practice-model.md). The output of Run lives next to the input so
// "Try again" can clear it while keeping the draft.

export type PromptSurface = { kind: "prompt"; prompt: string; material: string; output: string | null }
export type ProjectSurface = { kind: "project"; instructions: string; files: { name: string; content: string }[]; testTask: string; output: string | null }
export type SkillSurface = { kind: "skill"; skillMd: string; sampleRequests: string[]; results: SkillRunResult[] | null }
export type WorkflowSurface = { kind: "workflow"; schema: Partial<WorkflowSchema>; skillDraft: string | null }
export type ReviewSurface = { kind: "review"; submissionId: string; score: number | null; notes: string }
export type SurfaceState = PromptSurface | ProjectSurface | SkillSurface | WorkflowSurface | ReviewSurface

export const MAX_PROJECT_FILES = 2
export const SAMPLE_REQUESTS = 3
/** What each of the three sample requests is for (L3). */
export const SAMPLE_REQUEST_LABELS = ["Should fire", "Should not fire", "Borderline"] as const
/** What each of the two Project file slots is for (L2). */
export const PROJECT_FILE_LABELS = ["Your template or last finished example", "One-page summary of the rules"] as const
/** Policy reminder, from the firm's own boundary (never a blanket "no names"). Empty when nothing is forbidden. */
export function policyReminder(forbidden: string[] | undefined, dataReminder?: string | null): string {
  if (dataReminder) return dataReminder
  const items = (forbidden ?? []).map((c) => c.replace(/_/g, " ")).filter(Boolean)
  if (items.length === 0) return ""
  return `Paste or upload what you need. Your firm's policy keeps these out of Claude: ${items.join(", ")}.`
}
const SKILL_TEMPLATE = "---\nname: \ndescription: \n---\n\n"

const str = (v: unknown, d = "") => (typeof v === "string" ? v : d)
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])
const fileList = (v: unknown): { name: string; content: string }[] =>
  Array.isArray(v) ? v.filter((f): f is { name: string; content: string } => !!f && typeof f === "object" && typeof (f as { name?: unknown }).name === "string").map((f) => ({ name: f.name, content: str(f.content) })) : []

/** Pad or trim to exactly three sample requests. */
function threeRequests(v: unknown): string[] {
  const list = strList(v).slice(0, SAMPLE_REQUESTS)
  while (list.length < SAMPLE_REQUESTS) list.push("")
  return list
}

/**
 * The practice spec: `starter.practice` when the API sends the v2 shape, otherwise reconstructed from
 * `workSurface` plus the loose starter keys older exercises carry (`starterPrompt`, `instructions`, `schema`…).
 */
export function practiceSpec(ex: ExerciseDetail): PracticeSpec {
  const s = (ex.starter ?? {}) as Record<string, unknown>
  const p = s.practice
  if (p && typeof p === "object" && typeof (p as PracticeSpec).kind === "string") {
    const spec = p as PracticeSpec
    return { ask: str(spec.ask, ex.title), kind: spec.kind, workflowName: spec.workflowName ?? ex.workflowName ?? ex.contextTag ?? null, prefill: spec.prefill ?? {} }
  }
  const kind: PracticeKind = ex.workSurface === "orientation" ? "prompt" : ex.workSurface
  return {
    ask: ex.ask ?? ex.title,
    kind,
    workflowName: ex.workflowName ?? (typeof s.workflowName === "string" && s.workflowName ? s.workflowName : null) ?? ex.contextTag ?? null,
    prefill: {
      prompt: str(s.prompt, str(s.starterPrompt)),
      material: str(s.context, str(s.material)),
      instructions: str(s.instructions),
      files: fileList(s.files),
      testTask: str(s.testTask),
      skillMd: str(s.skillMd),
      sampleRequests: strList(s.sampleRequests),
      schema: (s.schema as Partial<WorkflowSchema>) ?? undefined,
      submissionId: str(s.submissionId),
    },
  }
}

/** The editor's starting state: the prefill, or the last attempt's draft when there is one (Try again keeps the draft). */
export function initialSurface(ex: ExerciseDetail, spec: PracticeSpec = practiceSpec(ex)): SurfaceState {
  const f = spec.prefill
  const last = ex.submissions?.[ex.submissions.length - 1]?.artifact
  switch (spec.kind) {
    case "prompt":
      {
        const prompt = last?.content ?? str(f.prompt)
        // The sample material belongs to the first draft only; once the learner has sent a version, keep exactly what they sent.
        const material = last ? (last.material ?? "") : str(f.material)
        // One box: any separately stored material is appended so nothing is hidden behind a toggle.
        return { kind: "prompt", prompt: material && !prompt.includes(material) ? `${prompt.trimEnd()}\n\n${material}` : prompt, material: "", output: null }
      }
    case "project":
      return {
        kind: "project",
        instructions: last?.content ?? str(f.instructions),
        files: (last?.files ?? fileList(f.files)).slice(0, MAX_PROJECT_FILES),
        testTask: str(f.testTask, last?.testTask ?? ""),
        output: null,
      }
    case "skill":
      return { kind: "skill", skillMd: last?.content ?? str(f.skillMd, SKILL_TEMPLATE), sampleRequests: threeRequests(last?.sampleRequests ?? f.sampleRequests), results: null }
    case "workflow": {
      let schema: Partial<WorkflowSchema> = f.schema ?? {}
      if (last?.content) {
        try {
          schema = JSON.parse(last.content)
        } catch {
          /* keep the prefill */
        }
      }
      return { kind: "workflow", schema: { ...EMPTY_SCHEMA, ...schema }, skillDraft: null }
    }
    case "review":
      return { kind: "review", submissionId: str(f.submissionId, last?.submissionId ?? ""), score: last?.score10 ?? null, notes: last?.content ?? "" }
  }
}

export function toRunBody(s: SurfaceState): RunBody | null {
  switch (s.kind) {
    case "prompt": return { kind: "prompt", prompt: s.prompt, material: s.material.trim() || undefined }
    case "project": return { kind: "project", instructions: s.instructions, files: s.files, testTask: s.testTask }
    case "skill": return { kind: "skill", skillMd: s.skillMd, sampleRequests: s.sampleRequests }
    case "workflow": return { kind: "workflow", schema: s.schema }
    default: return null
  }
}

/** Fold a run result into the surface. */
export function withRunResult(s: SurfaceState, r: RunResult): SurfaceState {
  switch (s.kind) {
    case "prompt": return { ...s, output: r.output ?? "" }
    case "project": return { ...s, output: r.output ?? "" }
    case "skill": return { ...s, results: r.results ?? [] }
    case "workflow": return { ...s, skillDraft: r.skillDraft ?? "" }
    default: return s
  }
}

/** Drop the output but keep every word the learner typed. */
export function clearOutput(s: SurfaceState): SurfaceState {
  switch (s.kind) {
    case "prompt": return { ...s, output: null }
    case "project": return { ...s, output: null }
    case "skill": return { ...s, results: null }
    case "workflow": return { ...s, skillDraft: null }
    default: return s
  }
}

export function hasOutput(s: SurfaceState): boolean {
  switch (s.kind) {
    case "prompt": return s.output != null
    case "project": return s.output != null
    case "skill": return s.results != null
    case "workflow": return s.skillDraft != null
    default: return false
  }
}

export function toArtifact(s: SurfaceState): Artifact {
  switch (s.kind) {
    case "prompt": return { type: "prompt_run", content: s.prompt, material: s.material.trim() || undefined, output: s.output ?? undefined }
    case "project": return { type: "project", content: s.instructions, files: s.files, testTask: s.testTask, output: s.output ?? undefined }
    case "skill": return { type: "skill", content: s.skillMd, sampleRequests: s.sampleRequests, results: s.results ?? undefined }
    case "workflow": return { type: "workflow", content: JSON.stringify(s.schema, null, 2), skillDraft: s.skillDraft ?? undefined }
    case "review": return { type: "review", content: s.notes, score10: s.score ?? undefined, submissionId: s.submissionId || undefined }
  }
}

/** Is there enough to press Run? */
export function canRun(s: SurfaceState): { ok: boolean; reason?: string } {
  switch (s.kind) {
    case "prompt": return s.prompt.trim().length >= 10 ? { ok: true } : { ok: false, reason: "Write your prompt first." }
    case "project": return s.instructions.trim().length >= 10 ? { ok: true } : { ok: false, reason: "Write the Project instructions first." }
    case "skill":
      if (!/^---[\s\S]*?---/.test(s.skillMd.trim())) return { ok: false, reason: "Start SKILL.md with the name and description block." }
      if (s.sampleRequests.some((r) => !r.trim())) return { ok: false, reason: "Fill in all three sample requests." }
      return { ok: true }
    case "workflow": return s.schema.purpose?.trim() && s.schema.steps?.length ? { ok: true } : { ok: false, reason: "Add the purpose and at least one step." }
    default: return { ok: false }
  }
}

/** Is there enough to send for feedback? Everything but review needs an output. */
export function canSubmit(s: SurfaceState): { ok: boolean; reason?: string } {
  if (s.kind === "review") return s.score != null ? { ok: true } : { ok: false, reason: "Give it a score first." }
  return hasOutput(s) ? { ok: true } : { ok: false, reason: "Run it first, then send it for feedback." }
}

// ───────────────────────── Inputs ─────────────────────────

type EditorProps<T extends SurfaceState> = { value: T; onChange: (v: T) => void; disabled?: boolean }

export function PromptInput({ value, onChange, disabled, rung, reminder }: EditorProps<PromptSurface> & { rung?: number; reminder?: string }) {
  return (
    <div className="space-y-3" data-testid="prompt-editor">
      {rung != null && rung <= 1 && reminder && <p className="text-xs text-muted-foreground" data-testid="prompt-reminder">{reminder}</p>}
      <Textarea
        value={value.prompt}
        onChange={(e) => onChange({ ...value, prompt: e.target.value })}
        disabled={disabled}
        className="min-h-56 text-[15px] leading-relaxed"
        placeholder="You are helping me prepare…"
        aria-label="Your prompt"
        data-testid="prompt-input"
      />
    </div>
  )
}

export function ProjectInput({ value, onChange, disabled }: EditorProps<ProjectSurface>) {
  const files = value.files
  const setFile = (i: number, patch: Partial<{ name: string; content: string }>) => onChange({ ...value, files: files.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
  return (
    <div className="space-y-5" data-testid="project-builder">
      <Field label="Project instructions" hint="The standing brief every chat in this Project starts from.">
        <Textarea value={value.instructions} onChange={(e) => onChange({ ...value, instructions: e.target.value })} disabled={disabled} className="min-h-40 text-[15px] leading-relaxed" data-testid="project-instructions" />
      </Field>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Files ({files.length} of {MAX_PROJECT_FILES})</Label>
          {!disabled && files.length < MAX_PROJECT_FILES && (
            <Button type="button" variant="ghost" size="xs" onClick={() => onChange({ ...value, files: [...files, { name: `file-${files.length + 1}.md`, content: "" }] })} data-testid="project-add-file">
              <FilePlus2 data-icon="inline-start" /> Add file
            </Button>
          )}
        </div>
        {files.length === 0 && <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">Paste one or two things Claude should always have: a good past example, a template.</p>}
        <ul className="grid gap-2 md:grid-cols-2">
          {files.map((f, i) => (
            <li key={i} className="rounded-lg border" data-testid="project-file" data-slot-label={PROJECT_FILE_LABELS[i]}>
              <p className="eyebrow border-b px-2 py-1.5 normal-case tracking-normal" data-testid="project-file-label">{PROJECT_FILE_LABELS[i] ?? `File ${i + 1}`}</p>
              <div className="flex items-center gap-2 border-b px-2 py-1.5">
                <Input value={f.name} onChange={(e) => setFile(i, { name: e.target.value })} disabled={disabled} className="h-7 font-mono text-xs" aria-label="File name" data-testid="project-file-name" />
                {!disabled && <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove file" onClick={() => onChange({ ...value, files: files.filter((_, j) => j !== i) })}><Trash2 /></Button>}
              </div>
              <Textarea value={f.content} onChange={(e) => setFile(i, { content: e.target.value })} disabled={disabled} className="min-h-28 rounded-t-none border-0 font-mono text-xs focus-visible:ring-0" placeholder="File content" data-testid="project-file-content" />
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-lg border bg-muted/40 p-3" data-testid="project-test-task">
        <p className="eyebrow mb-1">We&apos;ll test it with</p>
        <p className="text-sm leading-relaxed">{value.testTask || "The test task arrives with the exercise."}</p>
      </div>
    </div>
  )
}

const SAMPLE_PLACEHOLDERS = ["Can you draft the follow-up for the Henderson call?", "What's the weather in Boston tomorrow?", "Summarise yesterday's call notes for me."]

export function SkillInput({ value, onChange, disabled }: EditorProps<SkillSurface>) {
  const setRequest = (i: number, v: string) => onChange({ ...value, sampleRequests: value.sampleRequests.map((r, j) => (j === i ? v : r)) })
  return (
    <div className="space-y-5" data-testid="skill-editor">
      <Field label="SKILL.md" hint="Name and description at the top decide when it fires; the rest says how to do the work.">
        <Textarea value={value.skillMd} onChange={(e) => onChange({ ...value, skillMd: e.target.value })} disabled={disabled} className="min-h-[22rem] font-mono text-[13px] leading-relaxed" spellCheck={false} data-testid="skill-md-input" />
      </Field>
      <div className="space-y-2">
        <Label className="text-xs">Three things people would ask</Label>
        <ul className="space-y-2">
          {value.sampleRequests.map((r, i) => (
            <li key={i} className="grid gap-1 sm:grid-cols-[9rem_1fr] sm:items-center" data-testid="skill-sample-request-row">
              <Label htmlFor={`sample-request-${i}`} className="text-xs text-muted-foreground" data-testid="skill-sample-request-label">{SAMPLE_REQUEST_LABELS[i] ?? `Request ${i + 1}`}</Label>
              <Input id={`sample-request-${i}`} value={r} onChange={(e) => setRequest(i, e.target.value)} disabled={disabled} placeholder={SAMPLE_PLACEHOLDERS[i]} data-testid="skill-sample-request" />
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground">Run tries each one with your skill in place and shows whether it fired.</p>
      </div>
    </div>
  )
}

export function WorkflowInput({ value, onChange, disabled }: EditorProps<WorkflowSurface>) {
  return <WorkflowSchemaForm value={value.schema} onChange={(schema) => onChange({ ...value, schema })} disabled={disabled} />
}

/** Read-only view of a teammate's artifact plus the learner's score and notes (L5). */
export function ReviewInput({ value, onChange, disabled, review }: EditorProps<ReviewSurface> & { review: ExerciseDetail["review"] }) {
  const a = review?.artifact
  const mono = a?.type === "skill" || a?.type === "workflow"
  return (
    <div className="space-y-5" data-testid="review-editor">
      <div className="rounded-lg border" data-testid="review-artifact">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <p className="eyebrow">{review?.person?.name ? `${review.person.name}'s work` : "Their work"}{review?.exerciseTitle ? ` · ${review.exerciseTitle}` : ""}</p>
          {a?.type && <span className="text-[11px] text-muted-foreground">{artifactLabel(a.type)}</span>}
        </div>
        <div className="max-h-[32rem] overflow-y-auto p-4">
          {!a ? (
            <p className="text-sm text-muted-foreground italic">Nothing to review arrived with this exercise.</p>
          ) : mono ? (
            <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed">{a.content}</pre>
          ) : (
            <MarkdownLite text={a.content} />
          )}
          {a?.files?.length ? (
            <ul className="mt-4 space-y-2">
              {a.files.map((f, i) => (
                <li key={i} className="rounded-md border">
                  <p className="border-b px-2 py-1 font-mono text-xs text-muted-foreground">{f.name}</p>
                  <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap p-2 font-mono text-xs">{f.content}</pre>
                </li>
              ))}
            </ul>
          ) : null}
          {a?.output && (
            <div className="mt-4 border-t pt-3">
              <p className="eyebrow mb-1.5">What Claude made from it</p>
              <MarkdownLite text={a.output} className="text-sm" />
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <Field label="Your score" hint="0 to 10.">
          <Input
            type="number"
            min={0}
            max={10}
            step={1}
            inputMode="numeric"
            value={value.score ?? ""}
            onChange={(e) => {
              const n = e.target.value === "" ? null : Math.max(0, Math.min(10, Math.round(Number(e.target.value))))
              onChange({ ...value, score: n == null || Number.isNaN(n) ? null : n })
            }}
            disabled={disabled}
            className="tabular text-lg"
            data-testid="review-score"
          />
        </Field>
        <Field label="Notes" hint="What holds, what does not, what you would change.">
          <Textarea value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} disabled={disabled} className="min-h-28" data-testid="review-notes" />
        </Field>
      </div>
    </div>
  )
}

function artifactLabel(t: Artifact["type"]) {
  return { prompt_run: "Prompt and output", project: "Project", skill: "Skill", workflow: "Workflow map", text: "Response", review: "Review" }[t] ?? t
}

/** The one input for the exercise's kind. */
export function PracticeInput({ value, onChange, disabled, review, rung, reminder }: EditorProps<SurfaceState> & { review?: ExerciseDetail["review"]; rung?: number; reminder?: string }) {
  switch (value.kind) {
    case "prompt": return <PromptInput value={value} onChange={onChange} disabled={disabled} rung={rung} reminder={reminder} />
    case "project": return <ProjectInput value={value} onChange={onChange} disabled={disabled} />
    case "skill": return <SkillInput value={value} onChange={onChange} disabled={disabled} />
    case "workflow": return <WorkflowInput value={value} onChange={onChange} disabled={disabled} />
    case "review": return <ReviewInput value={value} onChange={onChange} disabled={disabled} review={review} />
  }
}

export function kindLabel(k: PracticeKind) {
  return { prompt: "Your prompt", project: "Your Project", skill: "Your skill", workflow: "Your map", review: "Your review" }[k]
}

