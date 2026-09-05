import { ShieldAlert } from "lucide-react"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { GradeChip } from "./grade-chip"
import { PersonChip } from "./person-chip"
import type { GradeView } from "@/hooks/library/types"

/** Rubric bars + feedback + security findings. Used on skill detail, promotion approval and the review pane. */
export function GradeCard({ grade, title = "Grade", className, compact = false }: { grade: GradeView; title?: string; className?: string; compact?: boolean }) {
  const by = grade.gradedBy === "grader" ? null : grade.gradedBy
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)} data-testid="grade-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="eyebrow">{title}</p>
          <GradeChip grade={grade} size="md" />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {by ? <PersonChip person={by} size="xs" muted /> : <span className="rounded-full bg-claude-soft px-2 py-0.5 text-claude">Grader</span>}
          <span>{fmt.ago(grade.gradedAt)}</span>
        </div>
      </div>
      <ul className="mt-4 space-y-2.5">
        {grade.rubric.map((r) => (
          <li key={r.criterion} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 text-sm" data-testid="rubric-row">
            <span className="font-medium">{r.label}</span>
            <span className="tabular text-muted-foreground">{fmt.score(r.score)}</span>
            <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${Math.round(r.score * 100)}%`, background: r.score >= 0.7 ? "var(--pass)" : r.score >= 0.5 ? "var(--revise)" : "var(--fail)" }} />
            </div>
            {!compact && r.note && <p className="col-span-2 text-xs text-muted-foreground">{r.note}</p>}
          </li>
        ))}
      </ul>
      {!compact && grade.feedback && <p className="mt-4 border-l-2 border-glow pl-3 text-sm leading-relaxed">{grade.feedback}</p>}
      {!compact && grade.teachingMoment && <p className="mt-2 text-sm text-muted-foreground italic">{grade.teachingMoment}</p>}
      {grade.securityFindings?.length > 0 && (
        <div className="mt-4 rounded-lg border border-fail/30 bg-fail-soft/60 p-3" data-testid="security-findings">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-fail"><ShieldAlert className="size-3.5" /> Security review</p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {grade.securityFindings.map((f, i) => (
              <li key={i} className="flex gap-2"><span className={cn("mt-0.5 shrink-0 rounded px-1 text-[10px] font-semibold uppercase", f.severity === "high" ? "bg-fail text-paper" : f.severity === "medium" ? "bg-revise text-ink" : "bg-muted text-muted-foreground")}>{f.severity}</span>{f.finding}</li>
            ))}
          </ul>
        </div>
      )}
      {grade.securityFindings?.length === 0 && !compact && <p className="mt-3 text-xs text-muted-foreground">Security review: no findings.</p>}
    </div>
  )
}
