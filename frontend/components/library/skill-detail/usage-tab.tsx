"use client"

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { fmt } from "@/lib/format"
import { PersonChip } from "../person-chip"
import type { SkillDetail } from "@/hooks/library/types"

const tick = { fontSize: 11, fill: "var(--muted-foreground)" }

function ChartTip({ active, payload, label, unit }: { active?: boolean; payload?: { value: number }[]; label?: string; unit: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium tabular">{fmt.num(payload[0].value)} {unit}</p>
    </div>
  )
}

export function UsageTab({ skill }: { skill: SkillDetail }) {
  const series = skill.usageSeries.map((d) => ({ ...d, label: fmt.dateShort(d.day) }))
  const total90 = series.reduce((s, d) => s + d.activations, 0)
  const byTeam = [...skill.usageByTeam].sort((a, b) => b.activations30d - a.activations30d)
  const maxTeam = Math.max(1, ...byTeam.map((t) => t.activations30d))
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="rounded-xl border bg-card p-4" data-testid="usage-chart">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">Activations · 90 days</p>
          <p className="font-display text-2xl tabular">{fmt.num(total90)}</p>
        </div>
        <p className="text-xs text-muted-foreground">From the Claude Analytics API, joined on skill name. Active users 30d: {fmt.num(skill.activeUsers30d)} · runs 30d: {fmt.num(skill.runs30d)}.</p>
        <div className="mt-4 h-56">
          {series.length === 0 ? (
            <p className="grid h-full place-items-center text-sm text-muted-foreground">No activations recorded yet. Usage appears once the skill is published and someone runs it on real work.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="usage-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--glow)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--glow)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
                <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
                <YAxis tick={tick} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
                <Tooltip content={<ChartTip unit="activations" />} cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} />
                <Area type="monotone" dataKey="activations" stroke="var(--glow-foreground)" strokeWidth={2} fill="url(#usage-fill)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-4" data-testid="usage-by-team">
          <p className="eyebrow">By team · 30 days</p>
          {byTeam.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No team activity yet.</p> : (
            <div className="mt-3 h-[calc(1.75rem*var(--n))]" style={{ "--n": byTeam.length } as React.CSSProperties}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byTeam} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 0 }} barCategoryGap={6}>
                  <XAxis type="number" hide domain={[0, maxTeam]} />
                  <YAxis type="category" dataKey="teamName" tick={tick} tickLine={false} axisLine={false} width={110} />
                  <Tooltip content={<ChartTip unit="activations" />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                  <Bar dataKey="activations30d" fill="var(--foreground)" radius={[0, 4, 4, 0]} barSize={12} isAnimationActive={false} label={{ position: "right", fontSize: 11, fill: "var(--muted-foreground)" }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="rounded-xl border bg-card p-4" data-testid="usage-adopters">
          <p className="eyebrow">Who else uses this</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Opt-in visibility. Ask them how they adapted it.</p>
          {skill.adopters.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nobody has opted in yet.</p> : (
            <ul className="mt-3 space-y-2">{skill.adopters.map((p) => <li key={p.id}><PersonChip person={p} size="sm" showTitle /></li>)}</ul>
          )}
        </div>
      </div>
    </div>
  )
}
