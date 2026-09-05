"use client"

import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

type Point = { week: string; minutesBack: number }

/** Single-series sparkline of minutes returned per week. Glow ink on paper; no axes by design. */
export function HoursBackSparkline({ series, className, height = 44 }: { series: Point[]; className?: string; height?: number }) {
  const data = (series ?? []).map((p) => ({ ...p, hours: Math.round((p.minutesBack / 60) * 10) / 10 }))
  if (data.length < 2) {
    return <div className={cn("grid place-items-center text-xs text-muted-foreground", className)} style={{ height }}>Not enough weeks yet</div>
  }
  return (
    <div className={cn("w-full", className)} style={{ height }} data-testid="hours-back-sparkline">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
          <defs>
            <linearGradient id="hb-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--glow)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--glow)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as Point & { hours: number }
              return (
                <div className="rounded-md bg-foreground px-2 py-1 text-xs text-background shadow">
                  <span className="tabular font-medium">{p.hours}h</span> back · week of {format(new Date(p.week), "MMM d")}
                </div>
              )
            }}
          />
          <Area type="monotone" dataKey="hours" stroke="var(--glow)" strokeWidth={2} fill="url(#hb-fill)" dot={false} activeDot={{ r: 4, fill: "var(--glow)", stroke: "var(--background)", strokeWidth: 2 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
