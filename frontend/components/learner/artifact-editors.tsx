"use client"

import { ArrowUp, ChevronDown, FilePlus2, FileText, Loader2, Pencil, Plug, Plus, SlidersHorizontal, Trash2, Upload, X } from "lucide-react"
import { useRef, useState } from "react"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

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

export type PromptSurface = {
  kind: "prompt"
  prompt: string
  /** Attached material (the sample, or whatever the learner pasted as a file). Sent with the prompt. */
  material: string
  attachmentName: string | null
  /** Connectors offered (the person's own tools) and the ones switched on for this chat. */
  available: string[]
  connectors: string[]
  output: string | null
}
export type ProjectSurface = {
  kind: "project"
  name: string
  instructions: string
  files: { name: string; content: string }[]
  testTask: string
  available: string[]
  connectors: string[]
  output: string | null
}
export type SkillSurface = { kind: "skill"; skillMd: string; sampleRequests: string[]; results: SkillRunResult[] | null }
export type WorkflowSurface = { kind: "workflow"; schema: Partial<WorkflowSchema>; skillDraft: string | null }
export type ReviewSurface = { kind: "review"; submissionId: string; score: number | null; notes: string }
export type SurfaceState = PromptSurface | ProjectSurface | SkillSurface | WorkflowSurface | ReviewSurface

export const MAX_PROJECT_FILES = 4
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
    case "prompt": {
      // Never pre-write the prompt: the box starts empty (or with the learner's own last draft). It gives too much away otherwise.
      const prompt = last?.content ?? ""
      // Sample material rides along as an attachment, the way a file would in Claude; after a sent version, keep exactly what they sent.
      const material = last ? (last.material ?? "") : str(f.material)
      // Every tool we know about starts switched on, including ones learned since the last try; switching off is per run.
      const available = ex.connectors ?? []
      const connectors = available
      return { kind: "prompt", prompt, material, attachmentName: material ? (last ? "Attached material" : "Sample material, made up") : null, available, connectors, output: null }
    }
    case "project": {
      const available = ex.connectors ?? []
      return {
        kind: "project",
        name: last?.name ?? (spec.workflowName ? `${spec.workflowName}` : "My Project"),
        // Nothing pre-written: the learner sets instructions and files themselves (their own last try is kept).
        instructions: last?.content ?? "",
        files: (last?.files ?? []).slice(0, MAX_PROJECT_FILES),
        // A test message from before the no-placeholders rule (bracketed slots) starts empty; the learner writes a real one.
        testTask: /\[[^\]]+\]/.test(str(f.testTask, last?.testTask ?? "")) ? "" : str(f.testTask, last?.testTask ?? ""),
        available,
        connectors: available,
        output: null,
      }
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
    case "prompt": return { kind: "prompt", prompt: s.prompt, material: s.material.trim() || undefined, connectors: s.connectors }
    case "project": return { kind: "project", name: s.name, instructions: s.instructions, files: s.files, testTask: s.testTask, connectors: s.connectors }
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
    case "prompt": return { type: "prompt_run", content: s.prompt, material: s.material.trim() || undefined, connectors: s.connectors, output: s.output ?? undefined }
    case "project": return { type: "project", name: s.name, content: s.instructions, files: s.files, testTask: s.testTask, connectors: s.connectors, output: s.output ?? undefined }
    case "skill": return { type: "skill", content: s.skillMd, sampleRequests: s.sampleRequests, results: s.results ?? undefined }
    case "workflow": return { type: "workflow", content: JSON.stringify(s.schema, null, 2), skillDraft: s.skillDraft ?? undefined }
    case "review": return { type: "review", content: s.notes, score10: s.score ?? undefined, submissionId: s.submissionId || undefined }
  }
}

/** Is there enough to press Run? */
export function canRun(s: SurfaceState): { ok: boolean; reason?: string } {
  switch (s.kind) {
    case "prompt": return s.prompt.trim().length >= 10 ? { ok: true } : { ok: false, reason: "Write your prompt first." }
    case "project":
      if (s.instructions.trim().length < 10) return { ok: false, reason: "Set the Project's instructions first." }
      if (s.testTask.trim().length < 5) return { ok: false, reason: "Write the message you'll test the Project with." }
      return { ok: true }
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

/**
 * The prompt practice looks like Claude's own message box: an empty composer, a + menu with the person's connectors
 * (switched on by default; the run simulates them) and the sample material as an attachment, the model label, and
 * the send arrow, which is Run. Nothing is pre-written in the box.
 */
export function PromptInput({ value, onChange, disabled, rung, reminder, onRun, runLabel, runDisabled }: EditorProps<PromptSurface> & { rung?: number; reminder?: string; onRun?: () => void; runLabel?: string; runDisabled?: boolean }) {
  const toggle = (name: string) =>
    onChange({ ...value, connectors: value.connectors.includes(name) ? value.connectors.filter((c) => c !== name) : [...value.connectors, name] })
  const running = Boolean(runLabel && runLabel !== "Run" && runLabel !== "Run again")
  return (
    <div className="space-y-3" data-testid="prompt-editor">
      {rung != null && rung <= 1 && reminder && <p className="text-xs text-muted-foreground" data-testid="prompt-reminder">{reminder}</p>}
      <div className={cn("rounded-2xl border bg-background p-3 shadow-sm", disabled && "opacity-90")} data-testid="composer">
        <Textarea
          value={value.prompt}
          onChange={(e) => onChange({ ...value, prompt: e.target.value })}
          disabled={disabled}
          className="min-h-40 resize-y border-0 bg-transparent px-1 py-1 text-[15px] leading-relaxed shadow-none focus-visible:ring-0"
          placeholder="How can I help you today?"
          aria-label="Your prompt"
          data-testid="prompt-input"
        />
        {value.material && value.attachmentName && (
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs" data-testid="prompt-attachment">
              <FileText className="size-3.5 text-muted-foreground" /> {value.attachmentName}
              {!disabled && (
                <button type="button" className="ml-1 text-muted-foreground hover:text-foreground" aria-label="Remove attachment" onClick={() => onChange({ ...value, material: "", attachmentName: null })} data-testid="prompt-attachment-remove">
                  <X className="size-3" />
                </button>
              )}
            </span>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<button type="button" className="grid size-8 place-items-center rounded-lg border text-muted-foreground hover:bg-muted disabled:opacity-50" aria-label="Add" disabled={disabled} data-testid="composer-plus" />}
            >
              <Plus className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64" data-testid="composer-menu">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Connectors</DropdownMenuLabel>
                {value.available.length === 0 && <p className="px-2 pb-1.5 text-xs text-muted-foreground">None yet. Name the tools you work in at your next interview and they appear here.</p>}
                {value.available.map((name) => (
                  <DropdownMenuCheckboxItem key={name} checked={value.connectors.includes(name)} onCheckedChange={() => toggle(name)} data-testid="composer-connector" data-name={name}>
                    {name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="grid size-8 place-items-center rounded-lg border text-muted-foreground/60" aria-hidden><SlidersHorizontal className="size-4" /></span>
          {value.connectors.length > 0 && (
            <span className="ml-1 hidden items-center gap-1 text-[11px] text-muted-foreground sm:inline-flex" data-testid="composer-connectors-on">
              <Plug className="size-3" /> {value.connectors.join(" · ")}
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">Claude Opus 5 <ChevronDown className="size-3" /></span>
          {onRun && (
            <Button size="sm" onClick={onRun} disabled={runDisabled} className="h-8 gap-1.5 rounded-lg px-2.5" data-testid="run-button" aria-label={runLabel ?? "Run"}>
              {running ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
              <span className="text-xs">{runLabel ?? "Run"}</span>
            </Button>
          )}
        </div>
      </div>
      {value.available.length > 0 && !disabled && (
        <p className="text-xs text-muted-foreground">Your tools show under the + as connectors, switched on. Name one in your prompt and Claude will pull from it, with sample records in this practice.</p>
      )}
    </div>
  )
}

/**
 * The Project practice looks like a Claude Project page: the name, the box that starts a chat inside it
 * (the test message; send = Run), and the right rail with Instructions (edit in place), Files (upload text
 * files or paste one) and Connected tools (the person's connectors, switched on). Nothing is pre-written.
 */
export function ProjectInput({ value, onChange, disabled, onRun, runLabel, runDisabled }: EditorProps<ProjectSurface> & { onRun?: () => void; runLabel?: string; runDisabled?: boolean }) {
  const [editing, setEditing] = useState<"instructions" | number | null>(value.instructions.trim() ? null : "instructions")
  const [renaming, setRenaming] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const files = value.files
  const setFile = (i: number, patch: Partial<{ name: string; content: string }>) => onChange({ ...value, files: files.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
  const addFile = (file: { name: string; content: string }) => {
    if (files.length >= MAX_PROJECT_FILES) return
    onChange({ ...value, files: [...files, file] })
  }
  const upload = async (list: FileList | null) => {
    if (!list) return
    for (const f of Array.from(list).slice(0, MAX_PROJECT_FILES - files.length)) {
      const text = await f.text().catch(() => "")
      addFile({ name: f.name, content: text.slice(0, 20_000) })
    }
  }
  const toggle = (name: string) => onChange({ ...value, connectors: value.connectors.includes(name) ? value.connectors.filter((c) => c !== name) : [...value.connectors, name] })
  const running = Boolean(runLabel && runLabel !== "Run" && runLabel !== "Run again")
  return (
    <div className="grid gap-5 @3xl:grid-cols-[minmax(0,1fr)_260px]" data-testid="project-builder">
      <div className="space-y-4">
        <div>
          <p className="eyebrow">Project</p>
          {renaming && !disabled ? (
            <Input autoFocus value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} onBlur={() => setRenaming(false)} onKeyDown={(e) => e.key === "Enter" && setRenaming(false)} className="mt-1 h-9 font-display text-xl" aria-label="Project name" data-testid="project-name-input" />
          ) : (
            <button type="button" className="mt-1 inline-flex items-center gap-2 text-left font-display text-2xl font-medium leading-tight hover:underline hover:underline-offset-4 disabled:no-underline" onClick={() => setRenaming(true)} disabled={disabled} data-testid="project-name">
              {value.name || "Untitled Project"} {!disabled && <Pencil className="size-3.5 text-muted-foreground" />}
            </button>
          )}
        </div>
        <div className={cn("rounded-2xl border bg-background p-3 shadow-sm", disabled && "opacity-90")} data-testid="composer">
          <Textarea
            value={value.testTask}
            onChange={(e) => onChange({ ...value, testTask: e.target.value })}
            disabled={disabled}
            className="min-h-28 resize-y border-0 bg-transparent px-1 py-1 text-[15px] leading-relaxed shadow-none focus-visible:ring-0"
            placeholder="Start a chat in this project…"
            aria-label="Your message to test the Project"
            data-testid="project-test-task"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="grid size-8 place-items-center rounded-lg border text-muted-foreground/60" aria-hidden><Plus className="size-4" /></span>
            <span className="grid size-8 place-items-center rounded-lg border text-muted-foreground/60" aria-hidden><SlidersHorizontal className="size-4" /></span>
            {value.connectors.length > 0 && (
              <span className="ml-1 hidden items-center gap-1 text-[11px] text-muted-foreground sm:inline-flex" data-testid="composer-connectors-on"><Plug className="size-3" /> {value.connectors.join(" · ")}</span>
            )}
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">Claude Opus 5 <ChevronDown className="size-3" /></span>
            {onRun && (
              <Button size="sm" onClick={onRun} disabled={runDisabled} className="h-8 gap-1.5 rounded-lg px-2.5" data-testid="run-button" aria-label={runLabel ?? "Run"}>
                {running ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                <span className="text-xs">{runLabel ?? "Run"}</span>
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">This is the first message a teammate would send inside your Project. Claude answers it with your instructions, files and connectors in place.</p>
      </div>

      <aside className="space-y-3 text-sm">
        <section className="rounded-xl border bg-card p-3" data-testid="project-instructions-card">
          <div className="flex items-center justify-between">
            <p className="font-medium">Instructions</p>
            {!disabled && editing !== "instructions" && (
              <button type="button" className="inline-flex items-center gap-1 text-xs text-claude hover:underline" onClick={() => setEditing("instructions")} data-testid="project-instructions-edit"><Pencil className="size-3" /> Edit</button>
            )}
          </div>
          {editing === "instructions" && !disabled ? (
            <div className="mt-2 space-y-2">
              <Textarea autoFocus value={value.instructions} onChange={(e) => onChange({ ...value, instructions: e.target.value })} className="min-h-40 text-[13px] leading-relaxed" placeholder="How should Claude behave in this project? Write it the way you'd brief a careful new hire." aria-label="Project instructions" data-testid="project-instructions" />
              <div className="flex justify-end"><Button size="xs" onClick={() => setEditing(null)} disabled={value.instructions.trim().length < 10} data-testid="project-instructions-save">Save</Button></div>
            </div>
          ) : value.instructions.trim() ? (
            <p className="mt-1.5 line-clamp-6 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground" data-testid="project-instructions-preview">{value.instructions}</p>
          ) : (
            <p className="mt-1.5 text-xs text-muted-foreground">Set project instructions: how you like this task done, written once.</p>
          )}
        </section>

        <section className="rounded-xl border bg-card p-3" data-testid="project-files-card">
          <p className="font-medium">Files <span className="text-xs font-normal text-muted-foreground">{files.length} of {MAX_PROJECT_FILES}</span></p>
          {files.length === 0 && <p className="mt-1.5 text-xs text-muted-foreground">A template, a one-page summary, a good past example. Short beats long.</p>}
          <ul className="mt-1.5 space-y-1.5">
            {files.map((f, i) => (
              <li key={i} className="rounded-lg border" data-testid="project-file">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  {editing === i && !disabled ? (
                    <Input value={f.name} onChange={(e) => setFile(i, { name: e.target.value })} className="h-6 text-xs" aria-label="File name" data-testid="project-file-name" />
                  ) : (
                    <button type="button" className="min-w-0 flex-1 truncate text-left text-xs hover:underline" onClick={() => !disabled && setEditing(i)} data-testid="project-file-open">{f.name}</button>
                  )}
                  <span className="text-[10px] text-muted-foreground tabular">{f.content.trim() ? `${Math.max(1, Math.round(f.content.trim().split(/\s+/).length))} words` : "empty"}</span>
                  {!disabled && <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Remove file" onClick={() => { setEditing(null); onChange({ ...value, files: files.filter((_, j) => j !== i) }) }}><Trash2 className="size-3.5" /></button>}
                </div>
                {editing === i && !disabled && (
                  <div className="border-t p-2">
                    <Textarea value={f.content} onChange={(e) => setFile(i, { content: e.target.value })} className="min-h-32 font-mono text-xs" placeholder="Paste the file's text" aria-label="File content" data-testid="project-file-content" />
                    <div className="mt-1.5 flex justify-end"><Button size="xs" variant="outline" onClick={() => setEditing(null)}>Done</Button></div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!disabled && files.length < MAX_PROJECT_FILES && (
            <div className="mt-2 flex flex-wrap gap-2">
              <input ref={fileInput} type="file" accept=".txt,.md,.csv,.json,.html,.htm,text/*" multiple className="hidden" onChange={(e) => { void upload(e.target.files); e.target.value = "" }} data-testid="project-upload-input" />
              <button type="button" className="inline-flex items-center gap-1 text-xs text-claude hover:underline" onClick={() => fileInput.current?.click()} data-testid="project-upload"><Upload className="size-3" /> Upload a file</button>
              <button type="button" className="inline-flex items-center gap-1 text-xs text-claude hover:underline" onClick={() => { addFile({ name: `note-${files.length + 1}.md`, content: "" }); setEditing(files.length) }} data-testid="project-add-file"><FilePlus2 className="size-3" /> Paste text as a file</button>
            </div>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground">Text files here (.txt, .md, .csv). For a Word or PDF file, paste its text.</p>
        </section>

        <section className="rounded-xl border bg-card p-3" data-testid="project-connected-card">
          <p className="font-medium">Connected</p>
          {value.available.length === 0 ? (
            <p className="mt-1.5 text-xs text-muted-foreground">None yet. Tools you name in your work appear here.</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {value.available.map((name) => {
                const on = value.connectors.includes(name)
                return (
                  <li key={name}>
                    <button type="button" className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-xs hover:bg-muted disabled:hover:bg-transparent" onClick={() => toggle(name)} disabled={disabled} aria-pressed={on} data-testid="project-connector" data-name={name}>
                      <span className="inline-flex items-center gap-1.5"><Plug className="size-3 text-muted-foreground" /> {name}</span>
                      <span className={cn("relative inline-block h-4 w-7 rounded-full", on ? "bg-claude" : "bg-foreground/15")} aria-hidden><span className={cn("absolute top-0.5 size-3 rounded-full bg-paper", on ? "left-3.5" : "left-0.5")} /></span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </aside>
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
export function PracticeInput({ value, onChange, disabled, review, rung, reminder, onRun, runLabel, runDisabled }: EditorProps<SurfaceState> & { review?: ExerciseDetail["review"]; rung?: number; reminder?: string; onRun?: () => void; runLabel?: string; runDisabled?: boolean }) {
  switch (value.kind) {
    case "prompt": return <PromptInput value={value} onChange={onChange} disabled={disabled} rung={rung} reminder={reminder} onRun={onRun} runLabel={runLabel} runDisabled={runDisabled} />
    case "project": return <ProjectInput value={value} onChange={onChange} disabled={disabled} onRun={onRun} runLabel={runLabel} runDisabled={runDisabled} />
    case "skill": return <SkillInput value={value} onChange={onChange} disabled={disabled} />
    case "workflow": return <WorkflowInput value={value} onChange={onChange} disabled={disabled} />
    case "review": return <ReviewInput value={value} onChange={onChange} disabled={disabled} review={review} />
  }
}

export function kindLabel(k: PracticeKind) {
  return { prompt: "Your prompt", project: "Your Project", skill: "Your skill", workflow: "Your map", review: "Your review" }[k]
}

