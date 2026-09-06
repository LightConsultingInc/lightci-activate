"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { SaveIcon, HistoryIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useOrg, usePatchOrg } from "@/hooks/mc/use-mc"
import type { ComplianceBoundary, Org, OrgSettings } from "@/hooks/mc/types"
import { fmt } from "@/lib/format"
import { ApiError } from "@/lib/api"
import { Panel, QueryState } from "@/components/mission-control/states"
import { RoleGate, useCanAdmin } from "@/components/mission-control/role-gate"
import { AdminHeader } from "./admin-header"
import { ChipListEditor } from "./chip-list-editor"

const EMPTY_BOUNDARY: ComplianceBoundary = { allowedDataClasses: [], forbiddenDataClasses: [], readOnlySystems: [], humanReviewPoints: [] }

export function PolicyView() {
  return (
    <RoleGate roles={["sponsor", "admin"]} surface="Company admin">
      <Inner />
    </RoleGate>
  )
}

function Inner() {
  const q = useOrg()
  return (
    <>
      <AdminHeader title="Policy & Boundary" description="The usage policy people read; the compliance boundary every skill must declare against. Both are versioned, and every save carries an audit note." />
      <QueryState query={q}>{(org) => <Form key={org.updatedAt} org={org} />}</QueryState>
    </>
  )
}

function Form({ org }: { org: Org }) {
  const canWrite = useCanAdmin()
  const patch = usePatchOrg()
  const s = org.settings ?? {}
  const [policy, setPolicy] = useState(s.usagePolicy ?? "")
  const [boundary, setBoundary] = useState<ComplianceBoundary>({ ...EMPTY_BOUNDARY, ...(s.boundary ?? {}) })
  const [leaderboards, setLeaderboards] = useState(Boolean(s.leaderboardsEnabled))
  const [stalledAfter, setStalledAfter] = useState(s.stalledAfterDays ?? 10)
  const [method, setMethod] = useState<NonNullable<OrgSettings["baselineMethod"]>>(s.baselineMethod ?? "interview_estimate")
  const [note, setNote] = useState("")

  const policyDirty = policy !== (s.usagePolicy ?? "")
  const boundaryDirty = JSON.stringify(boundary) !== JSON.stringify({ ...EMPTY_BOUNDARY, ...(s.boundary ?? {}) })
  const settingsDirty = leaderboards !== Boolean(s.leaderboardsEnabled) || stalledAfter !== (s.stalledAfterDays ?? 10) || method !== (s.baselineMethod ?? "interview_estimate")
  const dirty = policyDirty || boundaryDirty || settingsDirty
  const overlap = useMemo(() => boundary.allowedDataClasses.filter((x) => boundary.forbiddenDataClasses.includes(x)), [boundary])
  // Versions are bookkeeping the API owns (org-settings.ts); the client never bumps them.
  const policyVersion = s.policyVersion ?? s.usagePolicyVersion ?? (s.usagePolicy ? 1 : 0)
  const boundaryVersion = s.boundaryVersion ?? (s.boundary ? 1 : 0)

  const onSave = () => {
    if (!note.trim()) {
      toast.error("Add an audit note", { description: "One line on why this changed. Compliance will read it later." })
      return
    }
    if (overlap.length) {
      toast.error("Allowed and forbidden classes overlap", { description: overlap.join(", ") })
      return
    }
    const settings: OrgSettings = {
      ...s,
      usagePolicy: policy,
      boundary,
      leaderboardsEnabled: leaderboards,
      stalledAfterDays: Number(stalledAfter) || 10,
      baselineMethod: method,
    }
    patch.mutate(
      { settings, auditNote: note.trim() },
      {
        onSuccess: () => {
          toast.success("Policy & boundary saved", { description: "Versions bumped where text changed. The audit log has your note." })
          setNote("")
        },
        onError: (e) => toast.error("Couldn't save", { description: e instanceof ApiError ? e.detail : String(e) }),
      },
    )
  }

  return (
    <form
      className="space-y-6 animate-rise"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
      data-testid="policy-form"
    >
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Usage policy" description={<span className="inline-flex items-center gap-1"><HistoryIcon className="size-3" /> Version {policyVersion}{s.policyUpdatedAt ? ` · changed ${fmt.date(s.policyUpdatedAt)}` : ""}{org.updatedAt ? ` · last saved ${fmt.date(org.updatedAt)}` : ""}</span>} testId="panel-usage-policy">
          <Textarea value={policy} onChange={(e) => setPolicy(e.target.value)} disabled={!canWrite} rows={14} className="min-h-72 text-sm leading-relaxed" placeholder="What Claude is approved for at your firm, what it is not, and who is accountable for outputs." data-testid="policy-text" />
          <p className="mt-2 text-xs text-muted-foreground">{policy.trim().split(/\s+/).filter(Boolean).length} words. Shown to every learner at onboarding and in Governance.</p>
        </Panel>
        <div className="space-y-4">
          <Panel title="Program settings" testId="panel-program-settings">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label htmlFor="leaderboards" className="text-sm">Leaderboards</Label>
                  <p className="text-xs text-muted-foreground">Off by default. Ranked lists breed anxiety at the bottom and suppress the reporting compliance depends on. Cohort trends stay on regardless.</p>
                </div>
                <Switch id="leaderboards" checked={leaderboards} onCheckedChange={setLeaderboards} disabled={!canWrite} data-testid="leaderboards-switch" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="stalled" className="text-sm">Stalled after</Label>
                <div className="flex items-center gap-2">
                  <Input id="stalled" type="number" min={3} max={60} value={stalledAfter} onChange={(e) => setStalledAfter(Number(e.target.value))} disabled={!canWrite} className="w-24 tabular" data-testid="stalled-after-days" />
                  <span className="text-sm text-muted-foreground">days without an artifact at the current rung</span>
                </div>
              </div>
              <div className="grid gap-1">
                <Label className="text-sm">Baseline method</Label>
                <Select value={method} onValueChange={(v) => v && setMethod(v as typeof method)} disabled={!canWrite}>
                  <SelectTrigger className="w-full" data-testid="baseline-method">
                    <SelectValue>{(v: string) => (v === "time_diary" ? "Time diary (week 1)" : "Interviewer estimate + champion sign-off")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interview_estimate">Interviewer estimate + champion sign-off</SelectItem>
                    <SelectItem value="time_diary">Time diary (week 1)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Default per workflow; a champion can override for one workflow.</p>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Compliance boundary" description={<span className="inline-flex items-center gap-1"><HistoryIcon className="size-3" /> Version {boundaryVersion}{s.boundaryUpdatedAt ? ` · changed ${fmt.date(s.boundaryUpdatedAt)}` : ""} · becomes the declaration schema every skill fills before promotion.</span>} testId="panel-boundary-editor">
        <div className="grid gap-4 md:grid-cols-2">
          <ChipListEditor label="Allowed data classes" hint="What a skill may read or receive." value={boundary.allowedDataClasses} onChange={(v) => setBoundary((b) => ({ ...b, allowedDataClasses: v }))} disabled={!canWrite} tone="pass" testId="boundary-allowed" />
          <ChipListEditor label="Forbidden data classes" hint="Never pasted, uploaded or connected. Promotion hard-gates on these." value={boundary.forbiddenDataClasses} onChange={(v) => setBoundary((b) => ({ ...b, forbiddenDataClasses: v }))} disabled={!canWrite} tone="fail" testId="boundary-forbidden" />
          <ChipListEditor label="Read-only systems" hint="Systems of record Claude may read but never write to." value={boundary.readOnlySystems} onChange={(v) => setBoundary((b) => ({ ...b, readOnlySystems: v }))} disabled={!canWrite} tone="info" testId="boundary-readonly" mono={false} />
          <ChipListEditor label="Human review points" hint="Where a named person must review before anything leaves." value={boundary.humanReviewPoints} onChange={(v) => setBoundary((b) => ({ ...b, humanReviewPoints: v }))} disabled={!canWrite} tone="revise" testId="boundary-review" />
        </div>
        {overlap.length > 0 && <p className="mt-3 text-sm text-fail" data-testid="boundary-overlap">Allowed and forbidden overlap: {overlap.join(", ")}. Fix before saving.</p>}
      </Panel>

      {canWrite && (
        <div className="sticky bottom-4 flex flex-wrap items-end gap-3 rounded-xl border bg-background/90 p-3 shadow-lg backdrop-blur" data-testid="policy-save-bar">
          <div className="flex-1 min-w-64">
            <Label htmlFor="audit-note" className="text-xs">Audit note (required)</Label>
            <Input id="audit-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Added eMoney to read-only systems after Compliance review on 3 Sep" data-testid="policy-audit-note" />
          </div>
          <Button type="submit" disabled={!dirty || patch.isPending} data-testid="policy-save">
            <SaveIcon data-icon="inline-start" /> {patch.isPending ? "Saving…" : dirty ? "Save changes" : "Nothing to save"}
          </Button>
        </div>
      )}
    </form>
  )
}
