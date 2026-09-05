import { Award, Flag, Gavel, Ruler, Siren, Sparkles } from "lucide-react"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { JourneyEvent } from "@/hooks/library/types"

const META: Record<JourneyEvent["type"], { icon: typeof Flag; cls: string; label: string }> = {
  placement: { icon: Flag, cls: "bg-glow text-glow-foreground", label: "Placement" },
  exercise: { icon: Award, cls: "bg-info-soft text-info", label: "Exercise" },
  grade: { icon: Gavel, cls: "bg-claude-soft text-claude", label: "Grade" },
  skill: { icon: Sparkles, cls: "bg-pass-soft text-pass", label: "Skill" },
  measurement: { icon: Ruler, cls: "bg-secondary text-secondary-foreground", label: "Measurement" },
  escalation: { icon: Siren, cls: "bg-fail-soft text-fail", label: "Escalation" },
}

/** Journey timeline: newest first, grouped by month, each event typed and coloured by kind. */
export function JourneyTimeline({ events, className }: { events: JourneyEvent[]; className?: string }) {
  const sorted = [...events].sort((a, b) => b.at.localeCompare(a.at))
  if (sorted.length === 0) return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No events yet. The intake interview writes the first placement.</p>
  const monthOf = (e: JourneyEvent) => new Date(e.at).toLocaleDateString(undefined, { month: "long", year: "numeric" })
  const rows = sorted.map((e, i) => ({ e, month: monthOf(e), showMonth: i === 0 || monthOf(sorted[i - 1]) !== monthOf(e) }))
  return (
    <ol className={cn("relative ml-3 border-l pl-6", className)} data-testid="journey-timeline">
      {rows.map(({ e, month, showMonth }, i) => {
        const m = META[e.type] ?? META.exercise
        const Icon = m.icon
        return (
          <li key={i} className="relative pb-6 last:pb-0" data-testid="journey-event" data-type={e.type}>
            {showMonth && <p className="eyebrow -ml-6 mb-3 bg-background pr-2">{month}</p>}
            <span className={cn("absolute -left-[31px] grid size-5 place-items-center rounded-full ring-2 ring-background", m.cls)} style={{ top: showMonth ? "1.6rem" : 2 }}><Icon className="size-3" /></span>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-sm font-medium">{e.title}</p>
              <span className="text-xs text-muted-foreground">{fmt.date(e.at)}</span>
            </div>
            {e.detail && <p className="mt-0.5 text-sm text-muted-foreground">{e.detail}</p>}
          </li>
        )
      })}
    </ol>
  )
}
