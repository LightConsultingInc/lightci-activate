"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowUpRight, Check, CheckCircle2, ChevronLeft, CircleDashed, FlaskConical, ShieldAlert, ShieldCheck, Tag, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { Paper } from "@/components/brand/grain"
import { RungBadge } from "@/components/brand/rung"
import { ErrorState } from "@/components/shell/empty-state"
import { useMe, hasRole } from "@/hooks/use-me"
import { useDecidePromotion, usePromotion } from "@/hooks/library/queries"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { BoundaryBadge } from "./boundary-badge"
import { GradeCard } from "./grade-card"
import { LineDiff } from "./line-diff"
import { PersonChip } from "./person-chip"
import { DecisionChip, PrRef } from "./promotion-card"
import { describeError } from "./skill-actions"
import type { PromotionDetail } from "@/hooks/library/types"

/** One-screen approval: everything an approver needs to say yes or send back without leaving the page. */
export function ApprovalPanel({ id }: { id: string }) {
  const q = usePromotion(id)
  if (q.isPending) return <div className="space-y-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-40" /><Skeleton className="h-96" /></div>
  if (q.isError) return <ErrorState title="Couldn't load this promotion" detail={describeError(q.error)} retry={() => q.refetch()} />
  return <ApprovalBody p={q.data} />
}

function ApprovalBody({ p }: { p: PromotionDetail }) {
  const me = useMe()
  const decide = useDecidePromotion(p.id)
  const [note, setNote] = useState("")
  const [sendBack, setSendBack] = useState(false)
  const approvedRoles = new Set(p.approvals.filter((a) => a.decision === "approve").map((a) => a.role))
  const myRoles = (me.user?.roles ?? []) as string[]
  const canDecide = p.decision === "pending" && p.requiredApproverRoles.some((r) => (myRoles.includes(r) || hasRole(me, "admin")) && !approvedRoles.has(r))
  const isRequester = me.user?.id === p.requestedBy.id
  const bc = p.boundaryCheck
  const bcState = !bc.ok && bc.touchesRestrictedClasses.length ? "restricted" : !bc.ok && bc.missingDeclarations.length ? "missing" : bc.humanReviewRequired ? "review" : "ok"
  const tag = p.tag ?? (p.decision === "merged" ? `${p.skill.slug}@v${p.version}` : null)

  const onApprove = () => decide.mutate({ action: "approve", note: note.trim() || undefined }, { onSuccess: (d) => toast.success(d.decision === "merged" ? `Merged and published as ${p.skill.slug}@v${p.version}` : "Approved", { description: d.decision === "merged" ? "Auto-sync will pull it into Claude Enterprise; Activate confirms when the plugin appears." : `Still needs: ${d.requiredApproverRoles.filter((r) => !d.approvals.some((a) => a.role === r && a.decision === "approve")).join(", ")}` }), onError: (e) => toast.error("Couldn't approve", { description: describeError(e) }) })
  const onSendBack = () => decide.mutate({ action: "send-back", note: note.trim() }, { onSuccess: () => { setSendBack(false); toast.success("Sent back with your note") }, onError: (e) => toast.error("Couldn't send back", { description: describeError(e) }) })

  return (
    <div className="animate-rise space-y-6" data-testid="approval-panel" data-decision={p.decision}>
      <Link href="/promotions" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="back-to-promotions"><ChevronLeft className="size-4" /> Promotion queue</Link>

      {p.highExposure && (
        <div className="flex items-center gap-3 rounded-xl border border-fail bg-fail px-4 py-3 text-paper" role="alert" data-testid="compliance-banner">
          <ShieldAlert className="size-5 shrink-0" />
          <div><p className="font-semibold">Compliance approval required</p><p className="text-sm opacity-90">This version touches restricted data classes. It cannot merge until a compliance approver signs alongside the champion.</p></div>
        </div>
      )}

      <Paper className="rounded-2xl border bg-card p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <DecisionChip decision={p.decision} />
              <BoundaryBadge level={p.skill.boundaryBadge} />
              <RungBadge rung={p.skill.rungRequired} />
              <PrRef p={p} />
              {p.branch && <span className="font-mono text-xs text-muted-foreground">{p.branch}</span>}
            </div>
            <h1 className="font-display mt-3 text-3xl font-medium leading-tight">{p.skill.name} <span className="font-mono text-lg text-muted-foreground">v{p.version}</span></h1>
            <p className="mt-1 text-muted-foreground">{p.skill.triggerLine}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span className="inline-flex items-center gap-2 text-muted-foreground">Requested by <PersonChip person={p.requestedBy} size="xs" /></span>
              <span className="text-muted-foreground">{fmt.ago(p.createdAt)}</span>
              {p.skill.team && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{p.skill.team.name}</span>}
              <Button size="xs" variant="ghost" render={<Link href={`/library/${p.skill.slug}`} />} data-testid="approval-open-skill">Open skill <ArrowUpRight data-icon="inline-end" /></Button>
            </div>
          </div>
          {p.decision === "merged" && tag && (
            <div className="rounded-xl border border-pass/40 bg-pass-soft p-4 text-center" data-testid="merged-tag">
              <p className="inline-flex items-center gap-1 font-mono text-sm text-pass"><Tag className="size-3.5" />{tag}</p>
              <p className="mt-1 text-xs text-muted-foreground">Published {p.decidedAt ? fmt.date(p.decidedAt) : ""}</p>
            </div>
          )}
        </div>
      </Paper>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Boundary check" icon={bcState === "ok" ? <ShieldCheck className="size-4 text-pass" /> : <ShieldAlert className="size-4 text-fail" />} testId="boundary-check" tone={bcState === "ok" ? "pass" : bcState === "review" ? "revise" : "fail"}>
          <p className="font-medium">{{ ok: "OK: within the org boundary", restricted: "Restricted classes touched", missing: "Missing declarations", review: "Human review required" }[bcState]}</p>
          {bc.touchesRestrictedClasses.length > 0 && <p className="mt-1 text-xs">Touches: <span className="font-mono">{bc.touchesRestrictedClasses.join(", ")}</span></p>}
          {bc.missingDeclarations.length > 0 && <p className="mt-1 text-xs">Undeclared: <span className="font-mono">{bc.missingDeclarations.join(", ")}</span></p>}
          {bc.humanReviewRequired && <p className="mt-1 text-xs">Output must be reviewed by a named person before it leaves the firm.</p>}
          {bc.notes && <p className="mt-2 text-xs text-muted-foreground">{bc.notes}</p>}
        </Section>
        <Section title="Tests" icon={<FlaskConical className="size-4" />} testId="test-results">
          {p.testResults ? <pre className="max-h-40 overflow-auto font-mono text-xs whitespace-pre-wrap">{p.testResults}</pre> : <p className="text-muted-foreground">No test run recorded. CI validates frontmatter and the manifest on merge.</p>}
        </Section>
        <Section title="Approvals" icon={<CheckCircle2 className="size-4" />} testId="approvals">
          <ul className="space-y-2">
            {p.requiredApproverRoles.map((role) => {
              const a = p.approvals.find((x) => x.role === role && x.decision === "approve")
              return (
                <li key={role} className="flex items-center justify-between gap-2 text-sm">
                  <span className="inline-flex items-center gap-2 capitalize">{a ? <Check className="size-4 text-pass" /> : <CircleDashed className="size-4 text-muted-foreground" />}{role}</span>
                  {a ? (a.person ? <PersonChip person={a.person} size="xs" muted /> : <span className="text-xs text-muted-foreground">{fmt.ago(a.at)}</span>) : <span className="text-xs text-muted-foreground">waiting</span>}
                </li>
              )
            })}
          </ul>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4" data-testid="diff-summary">
            <p className="eyebrow">Diff summary</p>
            <p className="mt-1 text-sm">{p.diffSummary.summary || "No summary."}</p>
            <p className="mt-1 text-xs text-muted-foreground tabular">{p.diffSummary.filesChanged} file{p.diffSummary.filesChanged === 1 ? "" : "s"} · <span className="text-pass">+{p.diffSummary.additions}</span> <span className="text-fail">−{p.diffSummary.deletions}</span></p>
          </div>
          <LineDiff before={p.previousSkillMd} after={p.skillMd} />
        </div>
        <div className="space-y-4">
          {p.grade ? <GradeCard grade={p.grade} title="Grade card" /> : <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No grade attached. Promotion normally requires a passing grade; treat this as a send-back.</div>}
          <div className="rounded-xl border bg-card p-4" data-testid="decision-timeline">
            <p className="eyebrow mb-3">Decision timeline</p>
            <ol className="relative ml-2 space-y-4 border-l pl-4 text-sm">
              <li className="relative"><Dot /><p>Requested by <span className="font-medium">{p.requestedBy.name}</span></p><p className="text-xs text-muted-foreground">{fmt.date(p.createdAt)}</p></li>
              {[...p.approvals].sort((a, b) => a.at.localeCompare(b.at)).map((a, i) => (
                <li key={i} className="relative" data-testid="timeline-approval">
                  <Dot tone={a.decision === "approve" ? "pass" : "revise"} />
                  <p><span className="capitalize">{a.role}</span> {a.decision === "approve" ? "approved" : "sent back"}{a.person && <> · {a.person.name}</>}</p>
                  {a.note && <p className="mt-0.5 rounded bg-muted/50 px-2 py-1 text-xs">{a.note}</p>}
                  <p className="text-xs text-muted-foreground">{fmt.date(a.at)}</p>
                </li>
              ))}
              {p.decision === "merged" && <li className="relative"><Dot tone="pass" /><p>Merged and published{tag && <> as <span className="font-mono">{tag}</span></>}</p>{p.decidedAt && <p className="text-xs text-muted-foreground">{fmt.date(p.decidedAt)}</p>}</li>}
              {p.decision === "pending" && <li className="relative"><Dot tone="muted" /><p className="text-muted-foreground">Awaiting {p.requiredApproverRoles.filter((r) => !approvedRoles.has(r)).join(" and ") || "merge"}</p></li>}
            </ol>
          </div>
        </div>
      </div>

      {p.decision === "pending" && (
        <div className="sticky bottom-4 z-10 rounded-2xl border bg-background/85 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/70" data-testid="approval-actions">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the author (required when sending back)…" className="min-h-14" data-testid="approval-note" />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{canDecide ? `Approving as ${p.requiredApproverRoles.filter((r) => myRoles.includes(r) && !approvedRoles.has(r)).join(", ") || "admin"}.` : isRequester ? "You requested this; someone else must approve." : "Your role is not one of the required approvers."}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSendBack(true)} disabled={!canDecide || decide.isPending} data-testid="promotion-send-back"><Undo2 data-icon="inline-start" /> Send back with note</Button>
              <Button onClick={onApprove} disabled={!canDecide || decide.isPending} data-testid="promotion-approve">{decide.isPending ? <Spinner className="size-4" /> : <Check data-icon="inline-start" />} Approve</Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={sendBack} onOpenChange={setSendBack}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display text-xl">Send back to {p.requestedBy.name}?</DialogTitle><DialogDescription>Say what needs to change. The note goes on the PR and into the skill’s discussion.</DialogDescription></DialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Declare account_numbers under must-never-receive and add a should-not case for statements." className="min-h-24" autoFocus data-testid="send-back-note" />
          <DialogFooter showCloseButton><Button variant="destructive" onClick={onSendBack} disabled={note.trim().length < 5 || decide.isPending} data-testid="send-back-confirm">{decide.isPending && <Spinner className="size-4" />} Send back</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Section({ title, icon, children, testId, tone }: { title: string; icon: React.ReactNode; children: React.ReactNode; testId?: string; tone?: "pass" | "fail" | "revise" }) {
  return (
    <div className={cn("rounded-xl border bg-card p-4 text-sm", tone === "pass" && "border-pass/30", tone === "fail" && "border-fail/40 bg-fail-soft/40", tone === "revise" && "border-revise/40 bg-revise-soft/40")} data-testid={testId} data-tone={tone}>
      <p className="eyebrow mb-2 inline-flex items-center gap-1.5">{icon}{title}</p>
      {children}
    </div>
  )
}

function Dot({ tone = "ink" }: { tone?: "ink" | "pass" | "revise" | "muted" }) {
  const c = { ink: "bg-foreground", pass: "bg-pass", revise: "bg-revise", muted: "bg-muted-foreground/40" }[tone]
  return <span className={cn("absolute -left-[21px] top-1.5 size-2.5 rounded-full ring-2 ring-background", c)} />
}
