"use client"

import { ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { GradeCard } from "../grade-card"
import { DecisionChip } from "../chips"
import { fmt } from "@/lib/format"
import type { SubmissionView } from "@/hooks/learner/types"

/** Previous attempts, collapsed with a count so "closed" differs from "empty". */
export function AttemptHistory({ submissions }: { submissions: SubmissionView[] }) {
  if (!submissions.length) return null
  return (
    <Collapsible className="rounded-xl border bg-card" data-testid="attempt-history">
      <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium">
        <span>Previous attempts <span className="tabular ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{submissions.length}</span></span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t">
        <ul className="divide-y">
          {[...submissions].reverse().map((s) => (
            <li key={s.id} className="p-4" data-testid="attempt">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p className="font-medium">Attempt {s.attempt} <span className="ml-1 text-xs text-muted-foreground">{fmt.ago(s.submittedAt)}{s.coldAttempt ? " · cold" : ""}</span></p>
                {s.grade ? <span className="flex items-center gap-2"><span className="tabular text-xs">{Math.round(s.grade.score * 100)}</span><DecisionChip decision={s.grade.decision} /></span> : <span className="text-xs text-muted-foreground">Awaiting grade</span>}
              </div>
              <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                <div><dt className="eyebrow">Expectation · {Math.round(s.expectationConfidence * 100)}%</dt><dd className="mt-0.5 line-clamp-3">{s.expectationText}</dd></div>
                <div><dt className="eyebrow">Critique</dt><dd className="mt-0.5 line-clamp-3">{s.critiqueText || "—"}</dd></div>
              </dl>
              {s.grade && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted-foreground">Full grade card</summary>
                  <GradeCard grade={s.grade} compact className="mt-2" />
                </details>
              )}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
