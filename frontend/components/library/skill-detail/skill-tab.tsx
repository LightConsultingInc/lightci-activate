"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Gavel, Pencil, Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useGradeSkill, usePatchSkill } from "@/hooks/library/queries"
import { GradeCard } from "../grade-card"
import { MarkdownLite } from "../markdown-lite"
import { describeError } from "../skill-actions"
import type { SkillDetail } from "@/hooks/library/types"

export function SkillTab({ skill, canEdit, editing, setEditing }: { skill: SkillDetail; canEdit: boolean; editing: boolean; setEditing: (v: boolean) => void }) {
  const patch = usePatchSkill(skill.slug)
  const grade = useGradeSkill(skill.slug)
  const [md, setMd] = useState(skill.skillMd)
  const [name, setName] = useState(skill.name)
  const [trigger, setTrigger] = useState(skill.triggerLine)
  const dirty = md !== skill.skillMd || name !== skill.name || trigger !== skill.triggerLine
  const latest = skill.grades?.[0] ?? null

  const save = () =>
    patch.mutate(
      { id: skill.id, ...(md !== skill.skillMd ? { skillMd: md } : {}), ...(name !== skill.name ? { name } : {}), ...(trigger !== skill.triggerLine ? { triggerLine: trigger } : {}) },
      { onSuccess: (d) => { setEditing(false); toast.success("Saved", { description: d.version > skill.version ? `Saved as version ${d.version}.` : "No content change, no new version." }) }, onError: (e) => toast.error("Couldn't save", { description: describeError(e) }) },
    )
  const runGrade = () =>
    grade.mutate(skill.id, {
      onSuccess: (d) => toast[d.grade.decision === "pass" ? "success" : "info"](`Checked: ${d.grade.decision === "pass" ? "pass" : "needs changes"} (${(d.grade.score * 10).toFixed(1)}/10)`, { description: d.grade.feedback?.slice(0, 140) }),
      onError: (e) => toast.error("The check didn't finish", { description: describeError(e) }),
    })

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="eyebrow">SKILL.md · v{skill.version}</p>
          {canEdit && (
            editing ? (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} data-testid="skill-edit-cancel"><X data-icon="inline-start" /> Discard</Button>
                <Button size="sm" onClick={save} disabled={!dirty || patch.isPending} data-testid="skill-save">{patch.isPending ? <Spinner className="size-3.5" /> : <Save data-icon="inline-start" />} Save version</Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} data-testid="skill-edit"><Pencil data-icon="inline-start" /> Edit</Button>
            )
          )}
        </div>
        {editing ? (
          <div className="space-y-3" data-testid="skill-editor">
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
              <div className="grid gap-1.5"><Label htmlFor="sk-name">Name</Label><Input id="sk-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="grid gap-1.5"><Label htmlFor="sk-trigger">When to use it</Label><Input id="sk-trigger" value={trigger} onChange={(e) => setTrigger(e.target.value)} /></div>
            </div>
            <Textarea value={md} onChange={(e) => setMd(e.target.value)} spellCheck={false} className="min-h-[60vh] resize-y font-mono text-xs leading-relaxed" data-testid="skill-md-editor" />
            <p className="text-xs text-muted-foreground">Saving creates a new version. Its score resets, so run “Check this version” again before asking to share it.</p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-6"><MarkdownLite source={skill.skillMd} /></div>
        )}
      </div>
      <aside className="space-y-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="eyebrow">Check it</p>
          <p className="mt-1 text-sm text-muted-foreground">Claude reads the skill against a checklist and looks for anything unsafe. It needs a pass before you can share it.</p>
          <Button className="mt-3 w-full" variant={latest?.decision === "pass" ? "outline" : "default"} onClick={runGrade} disabled={grade.isPending || editing} data-testid="skill-grade">
            {grade.isPending ? <Spinner className="size-3.5" /> : <Gavel data-icon="inline-start" />} {grade.isPending ? "Checking…" : latest ? "Check this version again" : "Check this version"}
          </Button>
        </div>
        {latest ? <GradeCard grade={latest} title="Latest check" /> : (
          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground" data-testid="grade-empty">Not checked yet. Claude looks at how clearly it says when to use it, how it handles private information, how it does on the test examples, and more.</div>
        )}
        {skill.grades.length > 1 && (
          <div className="rounded-xl border bg-card p-4">
            <p className="eyebrow mb-2">Earlier checks</p>
            <ul className="space-y-1 text-xs">
              {skill.grades.slice(1, 6).map((g) => (
                <li key={g.id} className="flex items-center justify-between"><span className="text-muted-foreground">{new Date(g.gradedAt).toLocaleDateString()}</span><span className="tabular">{(g.score * 10).toFixed(1)}/10 · {g.decision === "pass" ? "pass" : "needs changes"}</span></li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  )
}
