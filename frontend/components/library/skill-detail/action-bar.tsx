"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Archive, ArrowUpRight, GitPullRequest } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useDeprecateSkill, useLibrary, useRequestPromotion } from "@/hooks/library/queries"
import { PromotionCard } from "../promotion-card"
import { SkillActions, describeError } from "../skill-actions"
import type { PromotionView, SkillDetail } from "@/hooks/library/types"

export function ActionBar({ skill, isOwner, isChampion }: { skill: SkillDetail; isOwner: boolean; isChampion: boolean }) {
  const request = useRequestPromotion(skill.slug)
  const deprecate = useDeprecateSkill(skill.slug)
  const [result, setResult] = useState<PromotionView | null>(null)
  const [confirmDeprecate, setConfirmDeprecate] = useState(false)
  const [successorId, setSuccessorId] = useState<string | null>(null)
  // Successor candidates: every other non-deprecated skill in the org (fetched only while the dialog is open).
  const lib = useLibrary({})
  const successors = (lib.data?.skills ?? []).filter((s) => s.id !== skill.id && s.status !== "deprecated").sort((a, b) => a.name.localeCompare(b.name))
  const successorName = successors.find((s) => s.id === successorId)?.name ?? null

  const latest = skill.grades?.[0] ?? null
  const pending = skill.promotion && skill.promotion.decision === "pending" ? skill.promotion : null
  let blocked: string | null = null
  if (skill.status === "published") blocked = "This version is already shared."
  else if (skill.status === "deprecated") blocked = "Retired skills can't be shared."
  else if (pending) blocked = "This version is already waiting for approval."
  else if (!latest) blocked = "Check this version first. It needs a pass before it can be shared."
  else if (latest.decision !== "pass") blocked = `Its latest check needs changes (${(latest.score * 10).toFixed(1)}/10). Change it and check it again to get a pass.`

  const onRequest = () =>
    request.mutate(skill.id, {
      onSuccess: (p) => { setResult(p); toast.success("Sent for approval", { description: p.prUrl ? `Request #${p.prNumber} opened.` : `Request #${p.prNumber} recorded.` }) },
      onError: (e) => toast.error("Couldn't send it for approval", { description: describeError(e) }),
    })
  const onDeprecate = () =>
    deprecate.mutate({ id: skill.id, successorSkillId: successorId ?? undefined }, { onSuccess: () => { setConfirmDeprecate(false); toast.success(`${skill.name} retired`, { description: successorName ? `The library now points people using it to ${successorName}.` : "It stays readable in the library, but nobody new can pick it up." }) }, onError: (e) => toast.error("Couldn't retire it", { description: describeError(e) }) })

  return (
    <>
      <div className="sticky bottom-4 z-10 mt-8 flex flex-wrap items-center gap-2 rounded-2xl border bg-background/85 p-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/70" data-testid="skill-action-bar">
        <SkillActions skill={skill} size="default" showOpen={false} variant="bar" />
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <Button variant="outline" onClick={onRequest} disabled={Boolean(blocked) || request.isPending} data-testid="skill-request-promotion" aria-disabled={Boolean(blocked)}>
              {request.isPending ? <Spinner className="size-4" /> : <GitPullRequest data-icon="inline-start" />} Ask to share
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-72">{blocked ?? "Sends this version to your champion to approve, with its score, its data rules and what changed."}</TooltipContent>
        </Tooltip>
        {pending && (
          <Button variant="ghost" render={<Link href={`/promotions/${pending.id}`} />} data-testid="skill-open-promotion">
            View request <ArrowUpRight data-icon="inline-end" />
          </Button>
        )}
        {(isOwner || isChampion) && skill.status !== "deprecated" && (
          <Button variant="ghost" className="ml-auto text-muted-foreground hover:text-fail" onClick={() => setConfirmDeprecate(true)} data-testid="skill-deprecate">
            <Archive data-icon="inline-start" /> Retire
          </Button>
        )}
      </div>

      <Dialog open={Boolean(result)} onOpenChange={(o) => { if (!o) setResult(null) }}>
        <DialogContent className="sm:max-w-lg" data-testid="promotion-result">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Sent for approval</DialogTitle>
            <DialogDescription>We checked its data rules and summarised what changed. Needs approval from: {result?.requiredApproverRoles.join(" and ")}.</DialogDescription>
          </DialogHeader>
          {result && (
            <>
              <PromotionCard p={result} />
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="font-medium">{result.boundaryCheck.ok ? "Data rules check passed" : "Data rules check found a problem"}</p>
                <p className="text-muted-foreground">{result.boundaryCheck.notes || result.diffSummary.summary}</p>
              </div>
            </>
          )}
          <DialogFooter showCloseButton>
            {result && <Button render={<Link href={`/promotions/${result.id}`} />}>Open the request</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDeprecate} onOpenChange={setConfirmDeprecate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Retire {skill.name}?</DialogTitle>
            <DialogDescription>It stops being handed out to teams. People already using it can still read it; pick a replacement so the library can point them to it.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <p className="text-sm font-medium">Replacement <span className="text-muted-foreground">(optional)</span></p>
            <Select value={successorId} onValueChange={(v) => setSuccessorId((v as string | null) || null)} items={[{ value: null, label: "No replacement" }, ...successors.map((s) => ({ value: s.id, label: s.name }))]}>
              <SelectTrigger className="w-full" data-testid="deprecate-successor"><SelectValue placeholder="No replacement" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>No replacement</SelectItem>
                {successors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} <span className="text-muted-foreground">· {s.status.replace("_", " ")}</span></SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter showCloseButton>
            <Button variant="destructive" onClick={onDeprecate} disabled={deprecate.isPending} data-testid="skill-deprecate-confirm">{deprecate.isPending && <Spinner className="size-4" />} Retire</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
