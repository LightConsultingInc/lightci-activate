import { cn } from "@/lib/utils"
import type { CompetencyStatus, ExerciseMode, WorkflowStatus } from "@/hooks/learner/types"
import { MonitorSmartphone, Sparkles } from "lucide-react"

const tone = {
  pass: "bg-pass-soft text-pass border-pass/30",
  revise: "bg-revise-soft text-glow-foreground border-revise/40",
  fail: "bg-fail-soft text-fail border-fail/30",
  info: "bg-info-soft text-info border-info/30",
  claude: "bg-claude-soft text-claude border-claude/30",
  neutral: "bg-muted text-muted-foreground border-border",
  glow: "bg-glow-soft text-glow-foreground border-glow/50",
} as const

export function Chip({ tone: t = "neutral", className, children, ...rest }: React.ComponentProps<"span"> & { tone?: keyof typeof tone }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap", tone[t], className)} {...rest}>
      {children}
    </span>
  )
}

export function DecisionChip({ decision, className }: { decision: "pass" | "revise"; className?: string }) {
  return (
    <Chip tone={decision === "pass" ? "pass" : "revise"} className={className} data-testid="decision-chip" data-decision={decision}>
      {decision === "pass" ? "Pass" : "Revise"}
    </Chip>
  )
}

export function ModeBadge({ mode, className }: { mode: ExerciseMode; className?: string }) {
  return mode === "in_claude" ? (
    <Chip tone="claude" className={className} data-testid="mode-badge">
      <Sparkles className="size-3" /> In Claude
    </Chip>
  ) : (
    <Chip tone="info" className={className} data-testid="mode-badge">
      <MonitorSmartphone className="size-3" /> In app
    </Chip>
  )
}

const competencyStatus: Record<CompetencyStatus, { label: string; tone: keyof typeof tone }> = {
  locked: { label: "Locked", tone: "neutral" },
  in_progress: { label: "In progress", tone: "glow" },
  mastered: { label: "Mastered", tone: "pass" },
  decayed: { label: "Decayed", tone: "revise" },
}
export function CompetencyStatusChip({ status }: { status: CompetencyStatus }) {
  const s = competencyStatus[status]
  return <Chip tone={s.tone} data-testid="competency-status">{s.label}</Chip>
}

export const WORKFLOW_PIPELINE: WorkflowStatus[] = ["candidate", "in_build", "shipped", "measured"]
export const workflowStatusLabel: Record<WorkflowStatus, string> = { candidate: "Candidate", scored: "Scored", in_build: "In build", shipped: "Shipped", measured: "Measured" }

/** candidate → in build → shipped → measured, with `scored` folded into candidate. */
export function StatusPipeline({ status, className }: { status: WorkflowStatus; className?: string }) {
  const idx = Math.max(0, WORKFLOW_PIPELINE.indexOf(status === "scored" ? "candidate" : status))
  return (
    <ol className={cn("flex items-center gap-1", className)} data-testid="status-pipeline" aria-label={`Status: ${workflowStatusLabel[status]}`}>
      {WORKFLOW_PIPELINE.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span
            className={cn("h-1.5 w-6 rounded-full transition-colors", i < idx ? "bg-pass" : i === idx ? "bg-glow" : "bg-border")}
            title={workflowStatusLabel[s]}
          />
        </li>
      ))}
      <li className="ml-1 text-xs text-muted-foreground">{workflowStatusLabel[status]}</li>
    </ol>
  )
}

export function skillStatusTone(status: string): keyof typeof tone {
  return status === "published" ? "pass" : status === "in_review" ? "info" : status === "deprecated" ? "neutral" : "glow"
}
