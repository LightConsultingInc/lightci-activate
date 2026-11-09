"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { toast } from "sonner"
import { AlertTriangleIcon, GitPullRequestIcon, PauseCircleIcon, WavesIcon, ArrowUpRightIcon, UserCheckIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { PageHeader } from "@/components/shell/page-header"
import { useLeadMutations, useLeadQueue } from "@/hooks/mc/use-mc"
import type { Escalation, LeadQueue, Person, PromotionView, StalledItem, WaveStatus } from "@/hooks/mc/types"
import { fmt } from "@/lib/format"
import { ApiError, apiFetch } from "@/lib/api"
import { cn } from "@/lib/utils"
import { QueryState } from "@/components/mission-control/states"
import { RoleGate } from "@/components/mission-control/role-gate"
import { Bar01 } from "@/components/mission-control/adoption-view"
import { ClientSwitcher } from "./client-switcher"
import { QueueCard, QueueColumn } from "./queue-column"
import { SlaTimer } from "./sla-timer"

export function LeadConsole() {
  return (
    <RoleGate roles={["lead"]} surface="The Lead Console">
      <Inner />
    </RoleGate>
  )
}

function Inner() {
  const q = useLeadQueue()
  const [selected, setSelected] = useState<Escalation | null>(null)
  return (
    <>
      <PageHeader eyebrow="LightCI · Activation lead" title="Lead Console" description="One queue across every client. Each card opens to a one-screen decision." actions={<ClientSwitcher />} className="pb-6" />
      <QueryState query={q}>
        {(d) => (
          <>
            <Columns d={d} onEscalation={setSelected} />
            <EscalationDrawer e={selected} onClose={() => setSelected(null)} />
          </>
        )}
      </QueryState>
    </>
  )
}

const AGENT_LABEL: Record<Escalation["sourceAgent"], string> = { coach: "Coach", builder: "Builder", interviewer: "Interviewer", promoter: "Promoter", grader: "Grader", system: "System" }

/** `/lead/queue` sends `{ id, name, slug? }`; older builds sent a plain label. */
function subjectOf(e: Escalation): { name: string | null; slug: string | null; href: string | null } {
  const s = e.subject
  if (!s) return { name: null, slug: null, href: null }
  if (typeof s === "string") return { name: s, slug: null, href: null }
  return { name: s.name ?? null, slug: s.slug ?? null, href: s.href ?? null }
}

function subjectHref(e: Escalation) {
  const s = subjectOf(e)
  if (s.href) return s.href
  if (!e.subjectId) return null
  switch (e.subjectType) {
    case "person": return `/people/${e.subjectId}`
    case "exercise": return `/exercise/${e.subjectId}`
    // Library routes are by slug; without one, land on the library rather than a 404.
    case "skill": return s.slug ? `/library/${s.slug}` : "/library"
    case "workflow": return `/workflows?id=${e.subjectId}`
    case "promotion_request": return `/promotions/${e.subjectId}`
    case "team": return `/mission-control/groups?team=${e.subjectId}`
  }
}

function Columns({ d, onEscalation }: { d: LeadQueue; onEscalation: (e: Escalation) => void }) {
  const esc = (d.escalations ?? []).filter((e) => e.state !== "resolved")
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 animate-rise" data-testid="lead-columns">
      <QueueColumn title="Escalations" description="Coach couldn't unblock; Builder low confidence; Interviewer schema incomplete." count={esc.length} icon={<AlertTriangleIcon className="size-4 text-fail" />} tone="fail" testId="lead-col-escalations" empty="Nothing escalated. The agents are coping.">
        {esc.map((e) => (
          <QueueCard key={e.id} org={e.org?.name ?? "Client"} title={e.reason} meta={`${AGENT_LABEL[e.sourceAgent]} · ${subjectOf(e).name ?? e.subjectType.replace(/_/g, " ")} · ${fmt.ago(e.createdAt)}`} right={<SlaTimer dueAt={e.slaDueAt} />} onClick={() => onEscalation(e)} testId="lead-escalation-card">
            {e.assignee && <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground"><UserCheckIcon className="size-3" /> {e.assignee.name}</p>}
          </QueueCard>
        ))}
      </QueueColumn>

      <QueueColumn title="Approvals" description="Promotions awaiting a human where the champion isn't yet trusted or exposure is high." count={(d.approvals ?? []).length} icon={<GitPullRequestIcon className="size-4 text-info" />} tone="info" testId="lead-col-approvals" empty="No promotions waiting on LightCI.">
        {(d.approvals ?? []).map((p) => (
          <ApprovalCard key={p.id} p={p} />
        ))}
      </QueueColumn>

      <QueueColumn title="Stalled" description="Client, team or learner metrics under threshold." count={(d.stalled ?? []).length} icon={<PauseCircleIcon className="size-4 text-revise" />} tone="revise" testId="lead-col-stalled" empty="Nothing under threshold.">
        {(d.stalled ?? []).map((s, i) => (
          <StalledCard key={s.id ?? `${s.org.id}-${s.metric}-${i}`} s={s} />
        ))}
      </QueueColumn>

      <QueueColumn title="Wave status" description="Per client: week, skills shipped vs target, baseline coverage, active %." count={(d.waves ?? []).length} icon={<WavesIcon className="size-4 text-pass" />} tone="pass" testId="lead-col-waves" empty="No active waves.">
        {(d.waves ?? []).map((w) => (
          <WaveCard key={w.wave.id} w={w} />
        ))}
      </QueueColumn>
    </div>
  )
}

function ApprovalCard({ p }: { p: PromotionView }) {
  return (
    <QueueCard org={p.org?.name ?? p.skill.team?.name ?? "Client"} title={<span className="inline-flex items-center gap-1">{p.skill.name} <span className="text-xs text-muted-foreground">v{p.version}</span></span>} meta={`by ${p.requestedBy?.name ?? "—"} · ${p.grade ? `grade ${fmt.score(p.grade.score)}` : "ungraded"} · needs ${p.requiredApproverRoles.join(" + ")}`} right={<span className="flex items-center gap-1">{p.highExposure && <Badge variant="outline" className="border-fail/40 bg-fail-soft text-foreground">High exposure</Badge>}<SlaTimer dueAt={p.slaDueAt} /></span>} testId="lead-approval-card">
      <div className="mt-2 flex justify-end">
        <Button size="xs" render={<Link href={`/promotions/${p.id}`} />} data-testid="approval-open">
          Review <ArrowUpRightIcon data-icon="inline-end" />
        </Button>
      </div>
    </QueueCard>
  )
}

const METRIC_LABEL: Record<string, string> = { weeklyActivePct: "Active on real work this week", activityDrop: "Days since activity dropped", activePct: "Active on real work", hoursBack: "Hours back / wk", stalledDays: "Days stalled", revisitCompliance: "Revisit compliance", championQueueAgeDays: "Champion queue age", baselineCoveragePct: "Baseline coverage" }
const fmtMetric = (k: string, v: number) => (/pct|compliance|rate/i.test(k) ? fmt.pct(v) : /days|age|drop/i.test(k) ? `${Math.round(v)}d` : /hours/i.test(k) ? `${v.toFixed(1)}h` : String(v))

function StalledCard({ s }: { s: StalledItem }) {
  const href = s.person ? `/people/${s.person.id}` : s.team ? `/mission-control/groups?team=${s.team.id}` : `/lead/clients/${s.org.id}`
  const who = s.person ? s.person.name : s.team ? s.team.name : "Whole client"
  return (
    <QueueCard org={s.org.name} title={who} meta={`${METRIC_LABEL[s.metric] ?? s.metric}: ${fmtMetric(s.metric, s.value)} vs target ${fmtMetric(s.metric, s.threshold)}${s.since ? ` · since ${fmt.dateShort(s.since)}` : ""}`} right={<SlaTimer dueAt={s.slaDueAt} />} testId="lead-stalled-card">
      <div className="mt-2 flex justify-end">
        <Button size="xs" variant="outline" render={<Link href={href} />} data-testid="stalled-open">
          Open {s.person ? "person" : s.team ? "team" : "client"} <ArrowUpRightIcon data-icon="inline-end" />
        </Button>
      </div>
    </QueueCard>
  )
}

function WaveCard({ w }: { w: WaveStatus }) {
  const weeks = Math.max(1, Math.round((new Date(w.wave.endsOn).getTime() - new Date(w.wave.startsOn).getTime()) / (7 * 86400_000)))
  const behind = w.skillsShipped < (w.target * w.week) / weeks
  return (
    <QueueCard org={w.org.name} title={`${w.wave.name} · week ${w.week} of ${weeks}`} right={<Badge variant="outline" className={cn("capitalize text-foreground", w.status === "on_track" || w.status === "active" ? "border-pass/40 bg-pass-soft" : "border-revise/40 bg-revise-soft")}>{w.status.replace(/_/g, " ")}</Badge>} testId="lead-wave-card">
      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Skills shipped</dt>
          <dd className={cn("font-display text-lg tabular", behind && "text-revise")}>{w.skillsShipped}<span className="text-xs text-muted-foreground"> / {w.target}</span></dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Baseline cov.</dt>
          <dd className="font-display text-lg tabular">{fmt.pct(w.baselineCoveragePct)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Active</dt>
          <dd className="font-display text-lg tabular">{fmt.pct(w.activePct)}</dd>
        </div>
      </dl>
      <div className="mt-1.5"><Bar01 value={w.activePct} color={w.activePct >= w.wave.targets.activePct ? "var(--pass)" : "var(--revise)"} /></div>
      <div className="mt-2 flex justify-end">
        <Button size="xs" variant="ghost" render={<Link href={`/lead/clients/${w.org.id}`} />}>Client <ArrowUpRightIcon data-icon="inline-end" /></Button>
      </div>
    </QueueCard>
  )
}

function EscalationDrawer({ e, onClose }: { e: Escalation | null; onClose: () => void }) {
  const { resolve, assign } = useLeadMutations()
  // Assignees must belong to the escalation's org, not whichever client the lead happens to be scoped to
  // (and an unscoped lead has no org at all), so fetch people for that org explicitly.
  const people = useQuery({
    queryKey: ["lead", "people", e?.orgId ?? null],
    enabled: Boolean(e?.orgId),
    queryFn: () => apiFetch<Person[]>("/api/people", { headers: { "X-Activate-Org": e!.orgId } }),
  })
  const [resolution, setResolution] = useState("")
  const [assignee, setAssignee] = useState<string>("")
  const href = e ? subjectHref(e) : null
  const err = (x: unknown) => (x instanceof ApiError ? x.detail || x.title : String(x))
  return (
    <Sheet open={Boolean(e)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-md" data-testid="escalation-drawer">
        {e && (
          <>
            <SheetHeader>
              <p className="eyebrow">{e.org?.name ?? "Client"} · {AGENT_LABEL[e.sourceAgent]}</p>
              <SheetTitle>{e.reason}</SheetTitle>
              <SheetDescription>
                {e.subjectType.replace(/_/g, " ")}{subjectOf(e).name ? `: ${subjectOf(e).name}` : ""} · raised {fmt.ago(e.createdAt)} · <SlaTimer dueAt={e.slaDueAt} />
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4">
              {href && (
                <Button variant="outline" size="sm" render={<Link href={href} />} data-testid="escalation-open-subject">
                  Open the {e.subjectType.replace(/_/g, " ")} <ArrowUpRightIcon data-icon="inline-end" />
                </Button>
              )}
              <div className="grid gap-1.5">
                <Label className="text-xs">Assign to</Label>
                <div className="flex gap-2">
                  <Select value={assignee || e.assigneePersonId || ""} onValueChange={(v) => setAssignee((v as string) ?? "")}>
                    <SelectTrigger className="flex-1" data-testid="escalation-assignee">
                      <SelectValue>{(v: string) => (people.data ?? []).find((p) => p.id === v)?.name ?? e.assignee?.name ?? "Choose a person"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(people.data ?? []).filter((p) => p.roles.some((r) => r === "champion" || r === "lead" || r === "sponsor" || r === "admin")).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} <span className="text-muted-foreground">· {p.roles.join(", ")}</span></SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" disabled={!assignee || assign.isPending} data-testid="escalation-assign" onClick={() => assign.mutate({ id: e.id, personId: assignee }, { onSuccess: () => toast.success("Assigned"), onError: (x) => toast.error("Couldn't assign", { description: err(x) }) })}>
                    Assign
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Champions, sponsors and leads of this client.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="resolution" className="text-xs">Resolution</Label>
                <Textarea id="resolution" value={resolution} onChange={(ev) => setResolution(ev.target.value)} rows={4} placeholder="What you decided and why. Goes on the escalation and into the audit log." data-testid="escalation-resolution" />
              </div>
            </div>
            <SheetFooter className="flex-row justify-end">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button disabled={!resolution.trim() || resolve.isPending} data-testid="escalation-resolve" onClick={() => resolve.mutate({ id: e.id, resolution: resolution.trim() }, { onSuccess: () => { toast.success("Escalation resolved"); setResolution(""); onClose() }, onError: (x) => toast.error("Couldn't resolve", { description: err(x) }) })}>
                {resolve.isPending ? "Resolving…" : "Resolve"}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
