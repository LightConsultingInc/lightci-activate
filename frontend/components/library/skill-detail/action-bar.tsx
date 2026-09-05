"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Archive, ArrowUpRight, GitPullRequest } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDeprecateSkill, useRequestPromotion } from "@/hooks/library/queries"
import { PromotionCard } from "../promotion-card"
import { SkillActions, describeError } from "../skill-actions"
import type { PromotionView, SkillDetail } from "@/hooks/library/types"

export function ActionBar({ skill, isOwner, isChampion }: { skill: SkillDetail; isOwner: boolean; isChampion: boolean }) {
  const request = useRequestPromotion(skill.slug)
  const deprecate = useDeprecateSkill(skill.slug)
  const [result, setResult] = useState<PromotionView | null>(null)
  const [confirmDeprecate, setConfirmDeprecate] = useState(false)

  const latest = skill.grades?.[0] ?? null
  const pending = skill.promotion && skill.promotion.decision === "pending" ? skill.promotion : null
  let blocked: string | null = null
  if (skill.status === "published") blocked = "This version is already published."
  else if (skill.status === "deprecated") blocked = "Deprecated skills cannot be promoted."
  else if (pending) blocked = `Promotion #${pending.prNumber ?? ""} is already awaiting approval.`
  else if (!latest) blocked = "Grade this version first. Promotion requires a passing grade."
  else if (latest.decision !== "pass") blocked = `Latest grade is “${latest.decision}” (${(latest.score * 10).toFixed(1)}/10). Revise and re-grade to reach a pass.`

  const onRequest = () =>
    request.mutate(skill.id, {
      onSuccess: (p) => { setResult(p); toast.success("Promotion requested", { description: p.prUrl ? `PR #${p.prNumber} opened.` : `Local PR #${p.prNumber} recorded; no GitHub repo is configured.` }) },
      onError: (e) => toast.error("Couldn't request promotion", { description: describeError(e) }),
    })
  const onDeprecate = () =>
    deprecate.mutate({ id: skill.id }, { onSuccess: () => { setConfirmDeprecate(false); toast.success(`${skill.name} deprecated`, { description: "It stays readable in the library; adopting is off." }) }, onError: (e) => toast.error("Couldn't deprecate", { description: describeError(e) }) })

  return (
    <>
      <div className="sticky bottom-4 z-10 mt-8 flex flex-wrap items-center gap-2 rounded-2xl border bg-background/85 p-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/70" data-testid="skill-action-bar">
        <SkillActions skill={skill} size="default" showOpen={false} variant="bar" />
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <Button variant="outline" onClick={onRequest} disabled={Boolean(blocked) || request.isPending} data-testid="skill-request-promotion" aria-disabled={Boolean(blocked)}>
              {request.isPending ? <Spinner className="size-4" /> : <GitPullRequest data-icon="inline-start" />} Request promotion
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-72">{blocked ?? "Packages this version as a PR with the grade card, boundary check and diff summary for the champion."}</TooltipContent>
        </Tooltip>
        {pending && (
          <Button variant="ghost" render={<Link href={`/promotions/${pending.id}`} />} data-testid="skill-open-promotion">
            View promotion <ArrowUpRight data-icon="inline-end" />
          </Button>
        )}
        {(isOwner || isChampion) && skill.status !== "deprecated" && (
          <Button variant="ghost" className="ml-auto text-muted-foreground hover:text-fail" onClick={() => setConfirmDeprecate(true)} data-testid="skill-deprecate">
            <Archive data-icon="inline-start" /> Deprecate
          </Button>
        )}
      </div>

      <Dialog open={Boolean(result)} onOpenChange={(o) => { if (!o) setResult(null) }}>
        <DialogContent className="sm:max-w-lg" data-testid="promotion-result">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Promotion request packaged</DialogTitle>
            <DialogDescription>The Promoter ran the boundary check and summarised the diff. Required approvers: {result?.requiredApproverRoles.join(" + ")}.</DialogDescription>
          </DialogHeader>
          {result && (
            <>
              <PromotionCard p={result} />
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="font-medium">{result.boundaryCheck.ok ? "Boundary check passed" : "Boundary check flagged"}</p>
                <p className="text-muted-foreground">{result.boundaryCheck.notes || result.diffSummary.summary}</p>
              </div>
            </>
          )}
          <DialogFooter showCloseButton>
            {result && <Button render={<Link href={`/promotions/${result.id}`} />}>Open approval screen</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDeprecate} onOpenChange={setConfirmDeprecate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Deprecate {skill.name}?</DialogTitle>
            <DialogDescription>The plugin is removed from group assignments and the library shows a successor if one is set later. Existing adopters keep read access.</DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <Button variant="destructive" onClick={onDeprecate} disabled={deprecate.isPending} data-testid="skill-deprecate-confirm">{deprecate.isPending && <Spinner className="size-4" />} Deprecate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
