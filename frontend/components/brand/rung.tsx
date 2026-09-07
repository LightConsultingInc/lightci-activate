import { cn } from "@/lib/utils"

export const RUNGS = [
  { rung: 0, code: "L0", name: "Orientation", short: "What Claude is good for, and what to keep out" },
  { rung: 1, code: "L1", name: "Conversational", short: "Clear requests, checked before you use them" },
  { rung: 2, code: "L2", name: "Context", short: "A Project that remembers how you work" },
  { rung: 3, code: "L3", name: "Skill", short: "A repeatable skill your team can reuse" },
  { rung: 4, code: "L4", name: "Workflow", short: "A whole workflow, mapped and reviewed" },
  { rung: 5, code: "L5", name: "Champion", short: "Reviewing others and running the queue" },
] as const

export function rungMeta(rung: number) {
  return RUNGS[Math.max(0, Math.min(5, rung))]
}

export function rungColor(rung: number) {
  return `var(--rung-${Math.max(0, Math.min(5, rung))})`
}

/** Small rung chip: "L2 Context". */
export function RungBadge({ rung, className, showName = true }: { rung: number; className?: string; showName?: boolean }) {
  const m = rungMeta(rung)
  return (
    <span
      data-testid="rung-badge"
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium tabular", className)}
      style={{ borderColor: rungColor(rung), color: "var(--foreground)" }}
    >
      <span className="size-1.5 rounded-full" style={{ background: rungColor(rung) }} />
      {m.code}
      {showName && <span className="text-muted-foreground">{m.name}</span>}
    </span>
  )
}

/**
 * Progress ring for the header strip: rung in the centre, mastery progress around it.
 * `progress` is 0..1 toward the next rung.
 */
export function RungRing({ rung, progress, size = 96, className }: { rung: number; progress: number; size?: number; className?: string }) {
  const stroke = Math.max(4, size / 14)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, progress))
  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }} data-testid="rung-ring">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={rungColor(rung)} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center leading-none">
          <div className="font-display font-medium" style={{ fontSize: size / 3.2 }}>{rungMeta(rung).code}</div>
          <div className="eyebrow mt-1" style={{ fontSize: Math.max(8, size / 11) }}>{Math.round(p * 100)}%</div>
        </div>
      </div>
    </div>
  )
}
