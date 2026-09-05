"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Pencil, Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { usePatchSkill } from "@/hooks/library/queries"
import { BoundaryBadge, BOUNDARY_META } from "../boundary-badge"
import { describeError } from "../skill-actions"
import { ChipListEditor } from "./chip-list-editor"
import type { BoundaryDeclaration, SkillDetail } from "@/hooks/library/types"

export function BoundaryTab({ skill, canEdit }: { skill: SkillDetail; canEdit: boolean }) {
  const patch = usePatchSkill(skill.slug)
  const [editing, setEditing] = useState(false)
  const [b, setB] = useState<BoundaryDeclaration>(skill.boundary)
  const org = skill.orgBoundary
  const conflicts = useMemo(() => {
    if (!org) return { reads: [] as string[], missing: [] as string[] }
    const forbidden = new Set(org.forbiddenDataClasses)
    return {
      reads: b.mayRead.filter((c) => forbidden.has(c)),
      missing: org.forbiddenDataClasses.filter((c) => !b.mustNeverReceive.includes(c)),
    }
  }, [org, b])
  const save = () => patch.mutate({ id: skill.id, boundary: b }, { onSuccess: () => { setEditing(false); toast.success("Boundary saved") }, onError: (e) => toast.error("Couldn't save", { description: describeError(e) }) })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <BoundaryBadge level={skill.boundaryBadge} />
          <p className="text-sm text-muted-foreground">{BOUNDARY_META[skill.boundaryBadge].explain}</p>
        </div>
        {canEdit && (editing ? (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X data-icon="inline-start" /> Discard</Button>
            <Button size="sm" onClick={save} disabled={patch.isPending} data-testid="boundary-save">{patch.isPending ? <Spinner className="size-3.5" /> : <Save data-icon="inline-start" />} Save</Button>
          </div>
        ) : <Button size="sm" variant="outline" onClick={() => setEditing(true)} data-testid="boundary-edit"><Pencil data-icon="inline-start" /> Edit declaration</Button>)}
      </div>
      {(conflicts.reads.length > 0 || conflicts.missing.length > 0) && (
        <div className="rounded-xl border border-fail/30 bg-fail-soft/60 p-4 text-sm" data-testid="boundary-conflicts">
          <p className="font-medium text-fail">Conflicts with the org boundary</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {conflicts.reads.length > 0 && <li>Reads restricted classes: <span className="font-mono">{conflicts.reads.join(", ")}</span>. Publishing needs compliance approval.</li>}
            {conflicts.missing.length > 0 && <li>Missing “must never receive” declarations for: <span className="font-mono">{conflicts.missing.join(", ")}</span>.</li>}
          </ul>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <ChipListEditor testId="boundary-may-read" label="May read" hint="Data classes and systems this skill is allowed to take as input." tone="pass" values={b.mayRead} editing={editing} onChange={(v) => setB({ ...b, mayRead: v })} conflicts={conflicts.reads} placeholder="crm_summary_export" />
        <ChipListEditor testId="boundary-never" label="Must never receive" hint="Pasted, uploaded or connected. Mirror the firm's forbidden classes." tone="fail" values={b.mustNeverReceive} editing={editing} onChange={(v) => setB({ ...b, mustNeverReceive: v })} placeholder="account_numbers" />
        <ChipListEditor testId="boundary-review" label="Human review" hint="Points where a named person signs before anything leaves the firm or enters a system of record." tone="revise" values={b.humanReview} editing={editing} onChange={(v) => setB({ ...b, humanReview: v })} placeholder="before_send" />
      </div>
      {org && (
        <div className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
          <p className="eyebrow mb-2">Org boundary (for reference)</p>
          <p><span className="font-medium text-foreground">Forbidden:</span> {org.forbiddenDataClasses.join(", ") || "none"} · <span className="font-medium text-foreground">Allowed:</span> {org.allowedDataClasses.join(", ") || "none"} · <span className="font-medium text-foreground">Review points:</span> {org.humanReviewPoints.join(", ") || "none"}</p>
        </div>
      )}
    </div>
  )
}
