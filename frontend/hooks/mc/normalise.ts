import type { Trend, WorkflowScore } from "./types"

/** `weekly`/`monthly` may arrive as a number or a series; take the latest. */
export function lastNum(v: number | { active: number }[] | null | undefined): number | null {
  if (typeof v === "number") return v
  if (Array.isArray(v) && v.length) return v[v.length - 1].active
  return null
}

/** Trend may be a signed fraction (0.12) or a direction word. */
export function trendOf(t: Trend): { direction: "up" | "flat" | "down"; label: string | null } {
  if (typeof t === "number" && Number.isFinite(t)) {
    const pct = Math.round(t * 100)
    return { direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat", label: `${pct > 0 ? "+" : ""}${pct}%` }
  }
  if (t === "up" || t === "down" || t === "flat") return { direction: t, label: t === "up" ? "Rising" : t === "down" ? "Falling" : "Flat" }
  return { direction: "flat", label: null }
}

export function composite(score: WorkflowScore): number | null {
  if (score == null) return null
  if (typeof score === "number") return score
  return typeof score.composite === "number" ? score.composite : null
}

export function scoreField(score: WorkflowScore, key: "readiness" | "exposure" | "hoursAtStake"): number | string | null {
  if (score == null || typeof score === "number") return null
  const v = score[key]
  return v == null ? null : v
}

export function personName(v: string | { name: string } | null | undefined): string {
  if (!v) return "—"
  return typeof v === "string" ? v : v.name
}

export function teamName(v: string | { name: string } | null | undefined): string {
  return personName(v)
}

export function teamIdOf(v: { team: string | { id: string }; teamId?: string }): string {
  if (v.teamId) return v.teamId
  return typeof v.team === "string" ? v.team : v.team.id
}

export function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

export function sum(ns: number[]) {
  return ns.reduce((a, b) => a + b, 0)
}
