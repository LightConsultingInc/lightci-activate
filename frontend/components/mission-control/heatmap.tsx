"use client"

import { RUNGS, rungColor } from "@/components/brand/rung"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { fmt } from "@/lib/format"

export type HeatRow = { id: string; label: string; counts: number[]; sublabel?: string }

/**
 * Rows × rungs heatmap. Each column is tinted with its rung colour; intensity is the share of the row
 * (a sequential scale per column), so a team that is 60% L2 reads as a strong L2 cell.
 */
export function Heatmap({ rows, mode = "pct", className, rowHref }: { rows: HeatRow[]; mode?: "pct" | "count"; className?: string; rowHref?: (row: HeatRow) => string | null }) {
  return (
    <div className={cn("overflow-x-auto", className)} data-testid="heatmap">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="w-44 px-2 pb-2 text-left text-xs font-medium text-muted-foreground">Team</th>
            {RUNGS.map((r) => (
              <th key={r.rung} className="px-1 pb-2 text-center text-xs font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="size-1.5 rounded-full" style={{ background: rungColor(r.rung) }} />
                  {r.code}
                </span>
              </th>
            ))}
            <th className="px-2 pb-2 text-right text-xs font-medium text-muted-foreground">People</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const total = row.counts.reduce((a, b) => a + b, 0) || 1
            const href = rowHref?.(row)
            return (
              <tr key={row.id} data-testid="heatmap-row">
                <td className="px-2 py-1">
                  {href ? (
                    <a href={href} className="font-medium hover:underline">
                      {row.label}
                    </a>
                  ) : (
                    <span className="font-medium">{row.label}</span>
                  )}
                  {row.sublabel && <div className="text-xs text-muted-foreground">{row.sublabel}</div>}
                </td>
                {RUNGS.map((r) => {
                  const c = row.counts[r.rung] ?? 0
                  const share = c / total
                  const alpha = c === 0 ? 0 : 0.18 + share * 0.82
                  return (
                    <td key={r.rung} className="p-0.5">
                      <Tooltip>
                        <TooltipTrigger
                          render={<div />}
                          className="grid h-10 w-full min-w-14 place-items-center rounded-md text-xs tabular"
                          style={{ background: c === 0 ? "var(--muted)" : `color-mix(in oklch, ${rungColor(r.rung)} ${Math.round(alpha * 100)}%, var(--card))`, color: c === 0 ? "var(--muted-foreground)" : "var(--foreground)" }}
                          data-testid="heatmap-cell"
                          data-count={c}
                        >
                          {c === 0 ? "·" : mode === "pct" ? fmt.pct(share) : c}
                        </TooltipTrigger>
                        <TooltipContent>
                          {row.label} · {r.code} {r.name}: {c} {c === 1 ? "person" : "people"} ({fmt.pct(share)})
                        </TooltipContent>
                      </Tooltip>
                    </td>
                  )
                })}
                <td className="px-2 py-1 text-right tabular text-muted-foreground">{row.counts.reduce((a, b) => a + b, 0)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Tiny stacked bar of rung mix (six segments, 2px surface gaps). */
export function RungMixBar({ counts, className }: { counts: number[]; className?: string }) {
  const total = counts.reduce((a, b) => a + b, 0) || 1
  return (
    <div className={cn("flex h-2.5 w-full gap-px overflow-hidden rounded-sm", className)} title={counts.map((c, i) => `L${i}: ${c}`).join(" · ")} data-testid="rung-mix">
      {counts.map((c, i) =>
        c > 0 ? <span key={i} style={{ width: `${(c / total) * 100}%`, background: rungColor(i) }} /> : null,
      )}
    </div>
  )
}
