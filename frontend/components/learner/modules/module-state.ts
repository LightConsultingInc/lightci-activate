import type { Rung } from "@/content/lessons/types"
import type { Competency, LadderView } from "@/hooks/learner/types"

export type ModuleState = "locked" | "current" | "done"

/** "L1" → 1. Anything else → null. */
export function parseModuleCode(code: string): Rung | null {
  const m = /^L([0-5])$/i.exec(code)
  return m ? (Number(m[1]) as Rung) : null
}

export function competenciesForRung(ladder: LadderView | undefined, rung: number): Competency[] {
  return (ladder?.competencies ?? []).filter((c) => c.rung === rung)
}

/** A module is done once you are past it (or every competency in it is mastered), current at your rung, otherwise locked. */
export function moduleState(ladder: LadderView | undefined, rung: number): ModuleState {
  if (!ladder) return rung === 0 ? "current" : "locked"
  if (rung < ladder.rung) return "done"
  const cs = competenciesForRung(ladder, rung)
  if (cs.length > 0 && cs.every((c) => c.status === "mastered")) return "done"
  if (rung === ladder.rung) return "current"
  return "locked"
}

/** 0..1 for the progress ring: mean mastery against threshold for the module's competencies. */
export function moduleProgress(ladder: LadderView | undefined, rung: number): number {
  const state = moduleState(ladder, rung)
  if (state === "done") return 1
  if (state === "locked") return 0
  const cs = competenciesForRung(ladder, rung)
  if (cs.length === 0) return Math.max(0, Math.min(1, ladder?.progress.toNextRung ?? 0))
  const v = cs.reduce((s, c) => s + Math.min(1, c.mastery / (c.threshold || 1)), 0) / cs.length
  return Math.max(0, Math.min(1, v))
}

/** Plain-words progress toward the next module, from the competency data for this rung. */
export function progressWords(ladder: LadderView, rung: number, nextCode: string | null): string {
  const cs = competenciesForRung(ladder, rung)
  if (rung < ladder.rung) return `You finished this module. Everything here is kept fresh with quick recaps.`
  if (rung > ladder.rung) return `This module opens when you finish L${ladder.rung}. You can read the lessons any time.`
  if (cs.length === 0) return `Finish the practice here and your grades will show what's ready.`
  const mastered = cs.filter((c) => c.status === "mastered")
  const remaining = cs.filter((c) => c.status !== "mastered")
  const parts: string[] = []
  if (mastered.length === cs.length) {
    parts.push(`You've shown all ${cs.length} skills in this module.`)
  } else {
    parts.push(`You've shown ${mastered.length} of ${cs.length} skills in this module.`)
    const next = remaining.slice().sort((a, b) => b.mastery - a.mastery)[0]
    if (next) {
      const ctx = next.components?.contexts ?? 0
      const need = Math.max(0, next.minContexts - ctx)
      if (next.mastery >= next.threshold && need > 0) parts.push(`${next.name}: shown on ${ctx} of ${next.minContexts} different tasks; ${need === 1 ? "one more" : `${need} more`} and it counts.`)
      else parts.push(`Closest to done: ${next.name}, at ${Math.round(next.mastery * 100)}% of the ${Math.round(next.threshold * 100)}% needed.`)
    }
  }
  if (!ladder.progress.met.judgement) parts.push(`Your self-checks also need to line up with the grader a little more often.`)
  if (nextCode) parts.push(mastered.length === cs.length && ladder.progress.met.judgement ? `You're ready for ${nextCode}.` : `Then you move to ${nextCode}.`)
  return parts.join(" ")
}
