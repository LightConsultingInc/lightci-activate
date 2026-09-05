"use client"

import { TrendingDown, TrendingUp, Minus } from "lucide-react"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { LadderView } from "@/hooks/learner/types"

function explain(j: LadderView["judgement"]) {
  const parts: string[] = []
  if (j.calibration >= 0.8) parts.push("Your confidence before a run closely matches how it turns out.")
  else if (j.calibration >= 0.6) parts.push("Your predictions are in the right neighbourhood but not tight yet.")
  else parts.push("Your predicted confidence and the actual grades often disagree.")
  if (j.overconfidentRate >= 0.3) parts.push(`You were overconfident on ${fmt.pct(j.overconfidentRate)} of predictions; that is penalised 1.5× because shipping ungraded AI output is the failure this guards against.`)
  else if (j.overconfidentRate > 0) parts.push(`Overconfident on ${fmt.pct(j.overconfidentRate)} of predictions, which is within a healthy range.`)
  if (j.critiqueQuality >= 0.75) parts.push("Your critiques find the weaknesses Grader finds.")
  else if (j.critiqueQuality >= 0.5) parts.push("Your critiques catch some real issues; push past tone and formatting to substance.")
  else parts.push("Your critiques mostly miss what Grader flags. Read the output as if a client will.")
  return parts.join(" ")
}

export function JudgementPanel({ judgement, minJudgement }: { judgement: LadderView["judgement"]; minJudgement: number }) {
  const Trend = judgement.trend === "up" ? TrendingUp : judgement.trend === "down" ? TrendingDown : Minus
  const ok = judgement.score >= minJudgement
  return (
    <section className="rounded-xl border bg-card p-5" data-testid="judgement-panel">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-display text-xl font-medium">Judgement</h2>
          <p className="text-xs text-muted-foreground">Half calibration (Brier), half critique quality.</p>
        </div>
        <div className="text-right">
          <p className={cn("font-display text-3xl tabular", ok ? "text-pass" : "text-glow-foreground")} data-testid="judgement-score">{fmt.pct(judgement.score)}</p>
          <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground"><Trend className="size-3.5" /> {judgement.trend === "flat" ? "holding" : `trending ${judgement.trend}`} · gate {fmt.pct(minJudgement)}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Meter label="Calibration" value={judgement.calibration} />
        <Meter label="Critique quality" value={judgement.critiqueQuality} />
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground" data-testid="judgement-explanation">{explain(judgement)}</p>
    </section>
  )
}

function Meter({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm"><span>{label}</span><span className="tabular text-xs">{pct}%</span></div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-muted" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-glow transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
