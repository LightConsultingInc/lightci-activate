"use client"

import { ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { fmt } from "@/lib/format"
import type { PracticeDecision, SubmissionView } from "@/hooks/learner/types"

/** Score out of 10 for an attempt: the v2 field when stored, otherwise the grade's 0..1 score. */
export function score10Of(s: SubmissionView): number | null {
  if (typeof s.score10 === "number") return Math.round(s.score10)
  if (s.grade) return Math.round(s.grade.score * 10)
  return null
}

export function decisionOf(s: SubmissionView): PracticeDecision | null {
  if (s.decision) return s.decision
  if (s.grade) return s.grade.decision === "pass" ? "pass" : "try_again"
  return null
}

/** Previous attempts, score only, collapsed. */
export function EarlierTries({ submissions }: { submissions: SubmissionView[] }) {
  if (!submissions.length) return null
  return (
    <Collapsible className="rounded-xl border bg-card" data-testid="earlier-tries">
      <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium" data-testid="earlier-tries-toggle">
        <span>Earlier tries <span className="tabular ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{submissions.length}</span></span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t">
        <ul className="divide-y">
          {[...submissions].reverse().map((s) => {
            const score = score10Of(s)
            const decision = decisionOf(s)
            return (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm" data-testid="earlier-try" data-decision={decision ?? "ungraded"}>
                <span className="text-muted-foreground">Try {s.attempt} · {fmt.ago(s.submittedAt)}</span>
                {score == null ? (
                  <span className="text-xs text-muted-foreground">Not scored yet</span>
                ) : (
                  <span className="tabular font-medium" data-testid="earlier-try-score">{score} / 10{decision === "pass" ? " · Pass" : ""}</span>
                )}
              </li>
            )
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
