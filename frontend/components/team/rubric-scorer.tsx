"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, RotateCcw, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Input } from "@/components/ui/input"
import { describeError } from "@/components/library/skill-actions"
import { useGradeReview } from "@/hooks/library/queries"
import { cn } from "@/lib/utils"
import type { GradeView, ReviewGradeResponse, RubricScore } from "@/hooks/library/types"

const DEFAULT_CRITERIA: Omit<RubricScore, "score" | "note">[] = [
  { criterion: "trigger_clarity", label: "Clear about when to use it, in the words people actually use" },
  { criterion: "boundary", label: "Says what it can and can't touch, and sticks to it" },
  { criterion: "sample_cases", label: "Examples cover when to use it, when not to, and the grey areas" },
  { criterion: "output_quality", label: "Output is usable on a real case" },
  { criterion: "critique", label: "Their own review caught the real problems" },
]

/** Champion scoring: one slider + note per criterion, overall feedback, pass/revise. Shows how close the champion was to Claude's suggested score afterwards. */
export function RubricScorer({ submissionId, draft, onGraded }: { submissionId: string; draft: GradeView | null; onGraded?: (g: ReviewGradeResponse) => void }) {
  const grade = useGradeReview()
  const base = useMemo(() => (draft?.rubric?.length ? draft.rubric : DEFAULT_CRITERIA.map((c) => ({ ...c, score: 0.7, note: "" }))), [draft])
  const [rows, setRows] = useState<RubricScore[]>(() => base.map((r) => ({ ...r, note: "" })))
  const [feedback, setFeedback] = useState("")
  const [decision, setDecision] = useState<"pass" | "revise">(draft?.decision === "revise" ? "revise" : "pass")
  const [result, setResult] = useState<ReviewGradeResponse | null>(null)
  const mean = rows.reduce((s, r) => s + r.score, 0) / Math.max(1, rows.length)

  const update = (i: number, p: Partial<RubricScore>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const submit = () =>
    grade.mutate({ submissionId, rubric: rows, feedback: feedback.trim(), decision }, {
      onSuccess: (g) => { setResult(g); onGraded?.(g); toast.success(`Graded ${decision}`, { description: "They'll see your scores and feedback." }) },
      onError: (e) => toast.error("Couldn't submit the grade", { description: describeError(e) }),
    })

  if (result) {
    const agreement = result.agreement?.score ?? (draft ? 1 - rows.reduce((s, r) => { const d = draft.rubric.find((x) => x.criterion === r.criterion); return s + (d ? Math.abs(d.score - r.score) : 0) }, 0) / Math.max(1, rows.length) : null)
    return (
      <div className="rounded-xl border bg-card p-5" data-testid="review-graded">
        <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-4 text-pass" /> Grade recorded: {result.decision} · {(result.score * 10).toFixed(1)}/10</p>
        {agreement != null && (
          <div className="mt-3 rounded-lg bg-muted/40 p-3 text-sm" data-testid="grader-agreement">
            <p className="eyebrow">How close you were to Claude’s score</p>
            <p className="font-display mt-1 text-2xl tabular">{Math.round(agreement * 100)}%</p>
            <p className="text-xs text-muted-foreground">{agreement >= 0.85 ? "Very close to Claude's suggestion." : agreement >= 0.7 ? "A few differences; your notes show where. Both scores are kept." : "Quite different from Claude's suggestion. Worth a look at where you each saw it differently; it counts toward your own L5 progress."}</p>
            {result.agreement?.perCriterion && (
              <ul className="mt-2 space-y-0.5 text-xs">{result.agreement.perCriterion.map((c) => <li key={c.criterion} className="flex justify-between"><span>{rows.find((r) => r.criterion === c.criterion)?.label ?? c.criterion}</span><span className={cn("tabular", Math.abs(c.delta) > 0.2 ? "text-fail" : "text-muted-foreground")}>{c.delta > 0 ? "+" : ""}{(c.delta * 10).toFixed(1)}</span></li>)}</ul>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card p-5" data-testid="rubric-scorer">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Your scores</p>
        <p className="text-sm tabular text-muted-foreground">overall <span className="font-display text-xl text-foreground">{(mean * 10).toFixed(1)}</span>/10</p>
      </div>
      <ul className="mt-4 space-y-4">
        {rows.map((r, i) => {
          const d = draft?.rubric.find((x) => x.criterion === r.criterion)
          return (
            <li key={r.criterion} data-testid="rubric-criterion">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{r.label}</span>
                <span className="tabular">{(r.score * 10).toFixed(1)}{d && <span className="ml-1 text-xs text-muted-foreground" title="Claude's suggested score">· Claude {(d.score * 10).toFixed(1)}</span>}</span>
              </div>
              <Slider value={[Math.round(r.score * 100)]} min={0} max={100} step={5} onValueChange={(v) => update(i, { score: (Array.isArray(v) ? v[0] : v) / 100 })} className="mt-2" aria-label={r.label} />
              <Input value={r.note} onChange={(e) => update(i, { note: e.target.value })} placeholder={d?.note ? `Claude noted: ${d.note.slice(0, 90)}` : "Note for them (optional)"} className="mt-2 h-8 text-xs" />
            </li>
          )
        })}
      </ul>
      <div className="mt-5">
        <p className="text-sm font-medium">Feedback</p>
        <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What to keep, what to change before it goes near a client…" className="mt-1.5 min-h-24" data-testid="review-feedback" />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup value={[decision]} onValueChange={(v) => { const d = v[0] as "pass" | "revise" | undefined; if (d) setDecision(d) }} variant="outline" spacing={0} data-testid="review-decision">
          <ToggleGroupItem value="pass" className="data-pressed:bg-pass-soft data-pressed:text-pass"><CheckCircle2 data-icon="inline-start" /> Pass</ToggleGroupItem>
          <ToggleGroupItem value="revise" className="data-pressed:bg-revise-soft data-pressed:text-glow-foreground"><RotateCcw data-icon="inline-start" /> Revise</ToggleGroupItem>
        </ToggleGroup>
        <Button onClick={submit} disabled={grade.isPending || feedback.trim().length < 10} data-testid="review-grade-submit">{grade.isPending ? <Spinner className="size-4" /> : <Send data-icon="inline-start" />} Submit grade</Button>
      </div>
      {feedback.trim().length < 10 && <p className="mt-2 text-xs text-muted-foreground">Write at least a sentence; they read it before they see the score.</p>}
    </div>
  )
}
