"use client"

import { useEffect, useState } from "react"
import { TimerIcon } from "lucide-react"
import { cn } from "@/lib/utils"

function fmtDuration(ms: number) {
  const abs = Math.abs(ms)
  const m = Math.floor(abs / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d >= 1) return `${d}d ${h % 24}h`
  if (h >= 1) return `${h}h ${m % 60}m`
  return `${m}m`
}

/** Time until (or since) an SLA deadline. Re-renders every minute; colour shifts as the deadline nears. */
export function SlaTimer({ dueAt, className }: { dueAt: string | null | undefined; className?: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  if (!dueAt) return <span className={cn("text-[11px] text-muted-foreground", className)} data-testid="sla-timer" data-state="none">no SLA</span>
  const diff = new Date(dueAt).getTime() - now
  const overdue = diff < 0
  const soon = !overdue && diff < 4 * 3600_000
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] tabular", overdue ? "border-fail/40 bg-fail-soft text-fail" : soon ? "border-revise/40 bg-revise-soft text-foreground" : "text-muted-foreground", className)} data-testid="sla-timer" data-state={overdue ? "overdue" : soon ? "soon" : "ok"} title={new Date(dueAt).toLocaleString()}>
      <TimerIcon className="size-3" />
      {overdue ? `${fmtDuration(diff)} over` : `${fmtDuration(diff)} left`}
    </span>
  )
}
