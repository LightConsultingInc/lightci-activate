"use client"

import { useState } from "react"
import { Clock, RefreshCw } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useAnswerRevisit } from "@/hooks/learner/queries"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { RevisitAnswer, RevisitSummary } from "@/hooks/learner/types"
import { MarkdownLite } from "./markdown-lite"

const INTERVALS = [2, 7, 21, 60, 120]

type Props = { revisit: RevisitSummary | null; onOpenChange: (open: boolean) => void }

/** A 2–5 minute retrieval prompt answered inline. Shows score, feedback and the next due date after grading. */
export function RevisitSheet({ revisit, onOpenChange }: Props) {
  const [response, setResponse] = useState("")
  const [result, setResult] = useState<RevisitAnswer | null>(null)
  const answer = useAnswerRevisit()

  const close = (open: boolean) => {
    if (!open) {
      setResponse("")
      setResult(null)
    }
    onOpenChange(open)
  }

  return (
    <Sheet open={Boolean(revisit)} onOpenChange={close}>
      <SheetContent className="sm:max-w-md" data-testid="revisit-sheet">
        {revisit && (
          <>
            <SheetHeader>
              <p className="eyebrow">Quick recap {revisit.intervalStep + 1} of {INTERVALS.length}</p>
              <SheetTitle className="font-display text-xl">{revisit.competencyName}</SheetTitle>
              <SheetDescription className="flex items-center gap-1.5">
                <Clock className="size-3.5" /> {revisit.overdue ? "Overdue" : "Due"} {fmt.ago(revisit.dueAt)} · 2–5 minutes, from memory
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-4 overflow-y-auto px-4">
              <div className="rounded-lg border bg-glow-soft/50 p-4">
                <MarkdownLite text={revisit.prompt} />
              </div>
              {!result ? (
                <>
                  <Textarea
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                    placeholder="Answer in your own words. Try not to look it up: remembering it is what makes it stick."
                    className="min-h-40"
                    data-testid="revisit-answer-input"
                  />
                  <Button
                    className="w-full"
                    disabled={response.trim().length < 10 || answer.isPending}
                    onClick={() => answer.mutate({ id: revisit.id, response }, { onSuccess: setResult })}
                    data-testid="revisit-submit"
                  >
                    {answer.isPending ? "Checking…" : "Send answer"}
                  </Button>
                </>
              ) : (
                <div className="space-y-4 animate-rise" data-testid="revisit-result">
                  <div className="flex items-end justify-between rounded-lg border bg-card p-4">
                    <div>
                      <p className="eyebrow">Score</p>
                      <p className="font-display text-3xl tabular">{Math.round(result.score * 100)}<span className="text-sm text-muted-foreground"> / 100</span></p>
                    </div>
                    <div className="text-right">
                      <p className="eyebrow">Next recap</p>
                      <p className={cn("text-sm font-medium", result.score >= 0.8 ? "text-pass" : "text-glow-foreground")}>{fmt.date(result.nextDueAt)}</p>
                      <p className="text-[11px] text-muted-foreground">{result.score >= 0.8 ? `Next one in ${INTERVALS[Math.min(result.intervalStep, INTERVALS.length - 1)]} days` : "Back in 2 days, while it's fresh"}</p>
                    </div>
                  </div>
                  <div>
                    <p className="eyebrow mb-1.5">Feedback</p>
                    <MarkdownLite text={result.feedback} />
                  </div>
                  <details className="rounded-lg border p-3 text-sm">
                    <summary className="cursor-pointer text-muted-foreground">Your answer</summary>
                    <p className="mt-2 whitespace-pre-wrap">{response}</p>
                  </details>
                  <Button variant="outline" className="w-full" onClick={() => close(false)} data-testid="revisit-done">
                    <RefreshCw data-icon="inline-start" /> Done
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
