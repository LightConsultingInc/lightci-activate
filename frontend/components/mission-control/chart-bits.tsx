"use client"

import { cn } from "@/lib/utils"

/** Chart hues from the design tokens. Assigned in fixed order; never cycled. */
export const CHART = {
  glow: "var(--chart-1)",
  ink: "var(--chart-2)",
  pass: "var(--chart-3)",
  info: "var(--chart-4)",
  claude: "var(--chart-5)",
  grid: "color-mix(in oklch, var(--foreground) 8%, transparent)",
  axis: "var(--muted-foreground)",
} as const

export const CATEGORICAL = [CHART.glow, CHART.ink, CHART.info, CHART.pass, CHART.claude]

/** Recharts custom tooltip body, styled like the app's tooltip. */
export function ChartTip({ active, label, payload, format }: { active?: boolean; label?: React.ReactNode; payload?: { name?: string; value?: number | string; color?: string; dataKey?: string | number }[]; format?: (v: number | string, key?: string) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md bg-foreground px-3 py-2 text-xs text-background shadow-md">
      {label != null && <p className="mb-1 font-medium">{String(label)}</p>}
      <ul className="space-y-0.5">
        {payload.map((p, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            <span className="text-background/70">{p.name}</span>
            <span className="ml-auto tabular font-medium">{format ? format(p.value ?? 0, String(p.dataKey)) : String(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Legend({ items, className }: { items: { label: string; color: string; dashed?: boolean }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)} data-testid="chart-legend">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          {it.dashed ? <span className="h-0 w-3 border-t-2 border-dashed" style={{ borderColor: it.color }} /> : <span className="size-2.5 rounded-sm" style={{ background: it.color }} />}
          {it.label}
        </li>
      ))}
    </ul>
  )
}
