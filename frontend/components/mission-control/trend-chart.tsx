"use client"

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { format } from "date-fns"
import { CHART, ChartTip, Legend } from "./chart-bits"

export type TrendPoint = { day: string; active: number; seats?: number }

/** Active-on-real-work daily area with a seats ceiling line. One axis; the wash is the series hue at ~10%. */
export function TrendChart({ data, height = 220, activeLabel = "Active on real work", seatsLabel = "Seats" }: { data: TrendPoint[]; height?: number; activeLabel?: string; seatsLabel?: string }) {
  const hasSeats = data.some((d) => typeof d.seats === "number")
  return (
    <div data-testid="trend-chart">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="trend-wash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.glow} stopOpacity={0.35} />
                <stop offset="100%" stopColor={CHART.glow} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="day" tickFormatter={(d: string) => format(new Date(d), "MMM d")} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} minTickGap={28} />
            <YAxis tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<ChartTip format={(v) => String(v)} />} cursor={{ stroke: CHART.axis, strokeWidth: 1 }} labelFormatter={(d) => format(new Date(String(d)), "EEE, MMM d")} />
            <Area type="monotone" dataKey="active" name={activeLabel} stroke={CHART.glow} strokeWidth={2} fill="url(#trend-wash)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} isAnimationActive={false} />
            {hasSeats && <Line type="stepAfter" dataKey="seats" name={seatsLabel} stroke={CHART.ink} strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legend className="mt-2" items={[{ label: activeLabel, color: CHART.glow }, ...(hasSeats ? [{ label: seatsLabel, color: CHART.ink, dashed: true }] : [])]} />
    </div>
  )
}
