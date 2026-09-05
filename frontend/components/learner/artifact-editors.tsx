"use client"

import { useMemo } from "react"
import { FilePlus2, Play, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChipListEditor } from "./chip-list-editor"
import { CopyButton } from "./copy-button"
import { MarkdownLite } from "./markdown-lite"
import { WorkflowSchemaForm, EMPTY_SCHEMA, Field } from "./workflow-schema-form"
import { cn } from "@/lib/utils"
import type { Artifact, Boundary, ExerciseDetail, SampleCase, WorkflowSchema, WorkSurface } from "@/hooks/learner/types"

// ───────────────────────── Surface state ─────────────────────────

export type PromptSurface = { kind: "prompt"; prompt: string; context: string; output: string | null; model?: string }
export type ProjectSurface = { kind: "project"; instructions: string; files: { name: string; content: string }[]; rationale: string }
export type SkillSurface = { kind: "skill"; skillMd: string; sampleCases: SampleCase[]; boundary: Boundary }
export type WorkflowSurface = { kind: "workflow"; schema: Partial<WorkflowSchema> }
export type TextSurface = { kind: "text"; surface: "orientation" | "review"; response: string }
export type SurfaceState = PromptSurface | ProjectSurface | SkillSurface | WorkflowSurface | TextSurface

const str = (v: unknown, d = "") => (typeof v === "string" ? v : d)

/** Build the initial editor state from the exercise's `starter` (pre-filled surface state) or the last submission. */
export function initialSurface(ex: ExerciseDetail): SurfaceState {
  const s = (ex.starter ?? {}) as Record<string, unknown>
  const last = ex.submissions?.[ex.submissions.length - 1]?.artifact
  switch (ex.workSurface as WorkSurface) {
    case "prompt":
      return { kind: "prompt", prompt: last?.content ?? str(s.prompt), context: str(s.context), output: last?.output ?? null }
    case "project":
      return {
        kind: "project",
        instructions: last?.content ?? str(s.instructions),
        files: last?.files ?? ((s.files as { name: string; content: string }[]) ?? []),
        rationale: last?.rationale ?? str(s.rationale),
      }
    case "skill":
      return {
        kind: "skill",
        skillMd: last?.content ?? str(s.skillMd, "---\nname: \ndescription: \n---\n\n"),
        sampleCases: last?.sampleCases ?? ((s.sampleCases as SampleCase[]) ?? []),
        boundary: {
          mayRead: (last?.boundary?.mayRead as string[]) ?? ((s.boundary as Boundary)?.mayRead ?? []),
          mustNeverReceive: (last?.boundary?.mustNeverReceive as string[]) ?? ((s.boundary as Boundary)?.mustNeverReceive ?? []),
          humanReview: (last?.boundary?.humanReview as string[]) ?? ((s.boundary as Boundary)?.humanReview ?? []),
        },
      }
    case "workflow": {
      let schema: Partial<WorkflowSchema> = (s.schema as Partial<WorkflowSchema>) ?? {}
      if (last?.content) {
        try {
          schema = JSON.parse(last.content)
        } catch {
          /* keep starter */
        }
      }
      return { kind: "workflow", schema: { ...EMPTY_SCHEMA, ...schema } }
    }
    default:
      return { kind: "text", surface: ex.workSurface === "review" ? "review" : "orientation", response: last?.content ?? str(s.response) }
  }
}

export function toArtifact(s: SurfaceState): Artifact {
  switch (s.kind) {
    case "prompt":
      return { type: "prompt_run", content: s.prompt, output: s.output ?? undefined }
    case "project":
      return { type: "project", content: s.instructions, files: s.files, rationale: s.rationale }
    case "skill":
      return { type: "skill", content: s.skillMd, sampleCases: s.sampleCases, boundary: s.boundary }
    case "workflow":
      return { type: "workflow", content: JSON.stringify(s.schema, null, 2) }
    default:
      return { type: s.surface === "review" ? "review" : "text", content: s.response }
  }
}

/** Is there enough in the surface to submit? Mirrors what Grader needs, not what looks nice. */
export function surfaceReady(s: SurfaceState): { ready: boolean; reason?: string } {
  switch (s.kind) {
    case "prompt":
      if (s.prompt.trim().length < 20) return { ready: false, reason: "Write your prompt first." }
      if (!s.output) return { ready: false, reason: "Run it with Claude (or paste the output back) before you critique." }
      return { ready: true }
    case "project":
      if (s.instructions.trim().length < 40) return { ready: false, reason: "Project instructions need more than a line." }
      if (s.rationale.trim().length < 20) return { ready: false, reason: "Say what you included and left out, and why." }
      return { ready: true }
    case "skill":
      if (!/^---[\s\S]*?---/.test(s.skillMd.trim())) return { ready: false, reason: "SKILL.md needs frontmatter with a name and description." }
      if (s.sampleCases.length < 2) return { ready: false, reason: "Add at least two sample cases (one that should trigger, one that shouldn't)." }
      if (s.boundary.mustNeverReceive.length === 0) return { ready: false, reason: "Declare what the skill must never receive." }
      return { ready: true }
    case "workflow":
      if (!s.schema.purpose || !(s.schema.steps?.length)) return { ready: false, reason: "Purpose and at least one step are needed." }
      return { ready: true }
    default:
      return s.response.trim().length >= 30 ? { ready: true } : { ready: false, reason: "Write your response first." }
  }
}

// ───────────────────────── Editors ─────────────────────────

const TRIGGER_LABELS = { yes: "Should", no: "Should not", ambiguous: "Ambiguous" }

type EditorProps<T extends SurfaceState> = { value: T; onChange: (v: T) => void; disabled?: boolean }

export function PromptEditor({ value, onChange, disabled, onRun, running, canRun, runBlockedReason }: EditorProps<PromptSurface> & { onRun: () => void; running: boolean; canRun: boolean; runBlockedReason?: string }) {
  return (
    <div className="space-y-4" data-testid="prompt-editor">
      <Field label="Your prompt" hint="Write it as you would to a sharp new colleague: role, task, inputs, what good looks like, format.">
        <Textarea value={value.prompt} onChange={(e) => onChange({ ...value, prompt: e.target.value })} disabled={disabled} className="min-h-40 font-mono text-[13px]" placeholder="You are helping me prepare…" data-testid="prompt-input" />
      </Field>
      <Field label="Context (optional)" hint="Paste the material Claude needs. Nothing from the must-never-leave list.">
        <Textarea value={value.context} onChange={(e) => onChange({ ...value, context: e.target.value })} disabled={disabled} className="min-h-24 font-mono text-[13px]" placeholder="Meeting agenda, template, prior example…" data-testid="prompt-context-input" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onRun} disabled={disabled || running || !canRun} data-testid="run-button">
          <Play data-icon="inline-start" /> {running ? "Running…" : value.output ? "Run again" : "Run with Claude"}
        </Button>
        {!canRun && runBlockedReason && <p className="text-xs text-muted-foreground">{runBlockedReason}</p>}
      </div>
      {value.output != null && (
        <div className="rounded-lg border bg-card animate-rise" data-testid="run-output">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="eyebrow">Claude&apos;s output{value.model ? ` · ${value.model}` : ""}</p>
            <CopyButton text={value.output} size="xs" testId="copy-output" />
          </div>
          <div className="max-h-[28rem] overflow-y-auto p-4">
            <MarkdownLite text={value.output} />
          </div>
        </div>
      )}
    </div>
  )
}

export function ProjectBuilder({ value, onChange, disabled }: EditorProps<ProjectSurface>) {
  const files = value.files
  const setFile = (i: number, patch: Partial<{ name: string; content: string }>) => onChange({ ...value, files: files.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
  return (
    <div className="space-y-5" data-testid="project-builder">
      <Field label="Project instructions" hint="The standing brief every chat in this Project inherits. Keep it tight: what the task is, how you want it done, what to refuse.">
        <Textarea value={value.instructions} onChange={(e) => onChange({ ...value, instructions: e.target.value })} disabled={disabled} className="min-h-40" data-testid="project-instructions" />
      </Field>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Project knowledge ({files.length} file{files.length === 1 ? "" : "s"})</Label>
          {!disabled && (
            <Button type="button" variant="ghost" size="xs" onClick={() => onChange({ ...value, files: [...files, { name: `file-${files.length + 1}.md`, content: "" }] })} data-testid="project-add-file">
              <FilePlus2 data-icon="inline-start" /> Add file
            </Button>
          )}
        </div>
        {files.length === 0 && <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">No files yet. Add the canonical examples and reference material, and leave out what changes weekly.</p>}
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li key={i} className="rounded-lg border" data-testid="project-file">
              <div className="flex items-center gap-2 border-b px-2 py-1.5">
                <Input value={f.name} onChange={(e) => setFile(i, { name: e.target.value })} disabled={disabled} className="h-7 font-mono text-xs" aria-label="File name" />
                {!disabled && <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove file" onClick={() => onChange({ ...value, files: files.filter((_, j) => j !== i) })}><Trash2 /></Button>}
              </div>
              <Textarea value={f.content} onChange={(e) => setFile(i, { content: e.target.value })} disabled={disabled} className="min-h-24 rounded-t-none border-0 font-mono text-xs focus-visible:ring-0" placeholder="File content" />
            </li>
          ))}
        </ul>
      </div>
      <Field label="Include / exclude rationale" hint="What went in, what stayed out, and why. Grader reads this as closely as the instructions.">
        <Textarea value={value.rationale} onChange={(e) => onChange({ ...value, rationale: e.target.value })} disabled={disabled} className="min-h-28" placeholder="Included the two best past review packs as examples; excluded the CRM export because it changes weekly and carries account numbers." data-testid="project-rationale" />
      </Field>
    </div>
  )
}

function parseFrontmatter(md: string): { fields: [string, string][]; body: string; ok: boolean } {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!m) return { fields: [], body: md, ok: false }
  const fields = m[1].split("\n").map((l) => l.match(/^([\w-]+):\s*(.*)$/)).filter(Boolean).map((x) => [x![1], x![2]] as [string, string])
  return { fields, body: m[2], ok: fields.length > 0 }
}

export function SkillEditor({ value, onChange, disabled }: EditorProps<SkillSurface>) {
  const fm = useMemo(() => parseFrontmatter(value.skillMd), [value.skillMd])
  const cases = value.sampleCases
  const setCase = (i: number, patch: Partial<SampleCase>) => onChange({ ...value, sampleCases: cases.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  const setBoundary = (k: keyof Boundary, v: string[]) => onChange({ ...value, boundary: { ...value.boundary, [k]: v } })
  return (
    <div className="space-y-6" data-testid="skill-editor">
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Field label="SKILL.md" hint="Frontmatter (name, description), then the body. Progressive disclosure: the description is the trigger; details live below.">
          <Textarea value={value.skillMd} onChange={(e) => onChange({ ...value, skillMd: e.target.value })} disabled={disabled} className="min-h-[24rem] font-mono text-[13px] leading-relaxed" spellCheck={false} data-testid="skill-md-input" />
        </Field>
        <div className="space-y-3">
          <p className="eyebrow">Live preview</p>
          <div className={cn("rounded-lg border p-3 text-xs", fm.ok ? "bg-card" : "border-revise/50 bg-revise-soft")} data-testid="skill-frontmatter-preview">
            {fm.ok ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {fm.fields.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="font-mono text-muted-foreground">{k}</dt>
                    <dd className={cn("break-words", !v && "text-fail italic")}>{v || "empty"}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-glow-foreground">No frontmatter found. Start the file with <code className="font-mono">---</code>, <code className="font-mono">name:</code>, <code className="font-mono">description:</code>, <code className="font-mono">---</code>.</p>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border bg-card p-3">
            {fm.body.trim() ? <MarkdownLite text={fm.body} className="text-xs" /> : <p className="text-xs text-muted-foreground italic">Body preview appears here.</p>}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Sample cases ({cases.length})</Label>
          {!disabled && (
            <Button type="button" variant="ghost" size="xs" onClick={() => onChange({ ...value, sampleCases: [...cases, { input: "", shouldTrigger: "yes", expected: "" }] })} data-testid="skill-add-case">
              <FilePlus2 data-icon="inline-start" /> Add case
            </Button>
          )}
        </div>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Input</TableHead>
                <TableHead className="w-32">Should trigger</TableHead>
                <TableHead>Expected behaviour</TableHead>
                {!disabled && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-xs whitespace-normal text-muted-foreground">Canonical examples beat edge-case lists. Add one clear yes, one clear no, and one ambiguous case.</TableCell></TableRow>
              )}
              {cases.map((c, i) => (
                <TableRow key={i} data-testid="skill-sample-case">
                  <TableCell className="whitespace-normal align-top"><Textarea value={c.input} onChange={(e) => setCase(i, { input: e.target.value })} disabled={disabled} className="min-h-12 text-xs" /></TableCell>
                  <TableCell className="align-top">
                    <Select value={c.shouldTrigger} disabled={disabled} items={TRIGGER_LABELS} onValueChange={(v) => setCase(i, { shouldTrigger: v as SampleCase["shouldTrigger"] })}>
                      <SelectTrigger size="sm" className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Should</SelectItem>
                        <SelectItem value="no">Should not</SelectItem>
                        <SelectItem value="ambiguous">Ambiguous</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="whitespace-normal align-top"><Textarea value={c.expected} onChange={(e) => setCase(i, { expected: e.target.value })} disabled={disabled} className="min-h-12 text-xs" /></TableCell>
                  {!disabled && <TableCell className="align-top"><Button type="button" variant="ghost" size="icon-sm" aria-label="Remove case" onClick={() => onChange({ ...value, sampleCases: cases.filter((_, j) => j !== i) })}><Trash2 /></Button></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-3" data-testid="boundary-editor">
        <Label className="text-xs">Boundary declaration</Label>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="May read" hint="Data classes this skill is allowed to see.">
            <ChipListEditor value={value.boundary.mayRead} onChange={(v) => setBoundary("mayRead", v)} tone="pass" disabled={disabled} placeholder="Templates, public filings…" testId="boundary-may-read" />
          </Field>
          <Field label="Must never receive" hint="Hard stop. Checked against the firm's forbidden classes.">
            <ChipListEditor value={value.boundary.mustNeverReceive} onChange={(v) => setBoundary("mustNeverReceive", v)} tone="fail" disabled={disabled} placeholder="Client SSNs, account numbers…" testId="boundary-must-never" />
          </Field>
          <Field label="Human review" hint="Where a person signs before output leaves.">
            <ChipListEditor value={value.boundary.humanReview} onChange={(v) => setBoundary("humanReview", v)} tone="revise" disabled={disabled} placeholder="Before sending to a client" testId="boundary-human-review" />
          </Field>
        </div>
      </div>
    </div>
  )
}

export function WorkflowEditor({ value, onChange, disabled }: EditorProps<WorkflowSurface>) {
  return <WorkflowSchemaForm value={value.schema} onChange={(schema) => onChange({ ...value, schema })} disabled={disabled} />
}

export function TextResponseEditor({ value, onChange, disabled }: EditorProps<TextSurface>) {
  return (
    <div className="space-y-2" data-testid="text-editor">
      <Field label={value.surface === "review" ? "Your review" : "Your response"} hint={value.surface === "review" ? "Grade it as you would a colleague's draft: what holds, what fails, what you would change." : "Answer in your own words. Specific beats polished."}>
        <Textarea value={value.response} onChange={(e) => onChange({ ...value, response: e.target.value })} disabled={disabled} className="min-h-56" data-testid="text-response-input" />
      </Field>
    </div>
  )
}
