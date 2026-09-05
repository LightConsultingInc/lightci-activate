import { format } from "date-fns"
import { cn } from "@/lib/utils"

/** Fourteen dots, oldest → newest; filled when the person was active on real work that day. */
export function StreakDots({ last14, activeDays, className }: { last14: { day: string; active: boolean }[]; activeDays: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)} data-testid="streak-dots">
      <div className="flex items-center gap-1" aria-label={`${activeDays} active days in the last 14`}>
        {last14.map((d, i) => (
          <span
            key={d.day ?? i}
            title={`${format(new Date(d.day), "EEE MMM d")} · ${d.active ? "active on real work" : "no real work"}`}
            className={cn("size-2.5 rounded-full transition-colors", d.active ? "bg-glow" : "bg-border", i === last14.length - 1 && "ring-2 ring-glow/40 ring-offset-1 ring-offset-background")}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="tabular font-medium text-foreground">{activeDays}</span> of 14 days on real work
      </p>
    </div>
  )
}
