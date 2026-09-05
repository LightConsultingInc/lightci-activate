import { cn } from "@/lib/utils"
import { fmt } from "@/lib/format"
import type { Decision } from "@/hooks/library/types"

const TONE: Record<Decision, string> = {
  pass: "bg-pass-soft text-pass border-pass/30",
  revise: "bg-revise-soft text-glow-foreground border-revise/40",
  fail: "bg-fail-soft text-fail border-fail/30",
}

/** Grade as a score-out-of-ten chip with the decision colour. `null` renders an honest "Ungraded". */
export function GradeChip({ grade, className, size = "sm" }: { grade: { score: number; decision: Decision } | null | undefined; className?: string; size?: "sm" | "md" }) {
  const base = cn("inline-flex items-center gap-1 rounded-full border font-medium tabular", size === "sm" ? "h-5 px-2 text-xs" : "h-7 px-3 text-sm", className)
  if (!grade) return <span className={cn(base, "border-dashed border-border text-muted-foreground")} data-testid="grade-chip" data-decision="none">Ungraded</span>
  return (
    <span className={cn(base, TONE[grade.decision] ?? TONE.revise)} data-testid="grade-chip" data-decision={grade.decision} title={`Grader decision: ${grade.decision}`}>
      {fmt.score(grade.score)}
      <span className="opacity-70">/10</span>
    </span>
  )
}

/** Circular grade ring for detail heroes. */
export function GradeRing({ grade, size = 72 }: { grade: { score: number; decision: Decision } | null | undefined; size?: number }) {
  const stroke = Math.max(4, size / 12)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = grade ? Math.max(0, Math.min(1, grade.score)) : 0
  const color = grade ? (grade.decision === "pass" ? "var(--pass)" : grade.decision === "fail" ? "var(--fail)" : "var(--revise)") : "var(--border)"
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} data-testid="grade-ring">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        {grade ? (
          <div>
            <div className="font-display font-medium tabular" style={{ fontSize: size / 3.4 }}>{fmt.score(grade.score)}</div>
            <div className="eyebrow mt-0.5" style={{ fontSize: Math.max(8, size / 11) }}>{grade.decision}</div>
          </div>
        ) : (
          <div className="eyebrow" style={{ fontSize: Math.max(8, size / 10) }}>Ungraded</div>
        )}
      </div>
    </div>
  )
}
