"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Pencil, Plus, Save, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { usePatchSkill } from "@/hooks/library/queries"
import { describeError } from "../skill-actions"
import { cn } from "@/lib/utils"
import type { SampleCase, SkillDetail } from "@/hooks/library/types"

const KIND: Record<SampleCase["shouldTrigger"], { label: string; cls: string }> = {
  yes: { label: "Should trigger", cls: "bg-pass-soft text-pass" },
  no: { label: "Should not", cls: "bg-fail-soft text-fail" },
  ambiguous: { label: "Ambiguous", cls: "bg-revise-soft text-glow-foreground" },
}

export function SampleCasesTab({ skill, canEdit }: { skill: SkillDetail; canEdit: boolean }) {
  const patch = usePatchSkill(skill.slug)
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<SampleCase[]>(skill.sampleCases)
  const counts = { yes: rows.filter((r) => r.shouldTrigger === "yes").length, no: rows.filter((r) => r.shouldTrigger === "no").length, ambiguous: rows.filter((r) => r.shouldTrigger === "ambiguous").length }
  const coverage = (["yes", "no", "ambiguous"] as const).filter((k) => counts[k] > 0).length
  const update = (i: number, p: Partial<SampleCase>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const save = () => patch.mutate({ id: skill.id, sampleCases: rows.filter((r) => r.input.trim()) }, { onSuccess: () => { setEditing(false); toast.success("Sample cases saved") }, onError: (e) => toast.error("Couldn't save", { description: describeError(e) }) })

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {rows.length} cases · <span className={cn(coverage === 3 ? "text-pass" : "text-glow-foreground")}>{coverage}/3 kinds covered</span>. The Grader judges a skill against these without running it.
        </p>
        {canEdit && (editing ? (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X data-icon="inline-start" /> Discard</Button>
            <Button size="sm" onClick={save} disabled={patch.isPending} data-testid="cases-save">{patch.isPending ? <Spinner className="size-3.5" /> : <Save data-icon="inline-start" />} Save</Button>
          </div>
        ) : <Button size="sm" variant="outline" onClick={() => setEditing(true)} data-testid="cases-edit"><Pencil data-icon="inline-start" /> Edit cases</Button>)}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table data-testid="sample-cases-table">
          <TableHeader><TableRow><TableHead className="w-40">Kind</TableHead><TableHead>Input</TableHead><TableHead>Expected behaviour</TableHead>{editing && <TableHead className="w-10" />}</TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No sample cases yet. Add one that should trigger (an advisor asking for Tuesday’s meeting prep), one that should not (a request for an IPS rewrite), and one that’s ambiguous.</TableCell></TableRow>}
            {rows.map((r, i) => (
              <TableRow key={i} data-testid="sample-case-row">
                <TableCell className="align-top">
                  {editing ? (
                    <Select value={r.shouldTrigger} onValueChange={(v) => update(i, { shouldTrigger: v as SampleCase["shouldTrigger"] })} items={Object.fromEntries(Object.entries(KIND).map(([k, v]) => [k, v.label]))}>
                      <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>{(Object.keys(KIND) as SampleCase["shouldTrigger"][]).map((k) => <SelectItem key={k} value={k}>{KIND[k].label}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", KIND[r.shouldTrigger]?.cls)}>{KIND[r.shouldTrigger]?.label ?? r.shouldTrigger}</span>}
                </TableCell>
                <TableCell className="align-top text-sm whitespace-pre-wrap">{editing ? <Textarea value={r.input} onChange={(e) => update(i, { input: e.target.value })} className="min-h-16 text-xs" /> : r.input}</TableCell>
                <TableCell className="align-top text-sm whitespace-pre-wrap text-muted-foreground">{editing ? <Textarea value={r.expected} onChange={(e) => update(i, { expected: e.target.value })} className="min-h-16 text-xs" /> : r.expected}</TableCell>
                {editing && <TableCell className="align-top"><Button size="icon-xs" variant="ghost" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label="Remove case"><Trash2 /></Button></TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {editing && <div className="border-t p-2"><Button size="sm" variant="ghost" onClick={() => setRows((x) => [...x, { input: "", shouldTrigger: "yes", expected: "" }])} data-testid="cases-add"><Plus data-icon="inline-start" /> Add case</Button></div>}
      </div>
    </div>
  )
}
