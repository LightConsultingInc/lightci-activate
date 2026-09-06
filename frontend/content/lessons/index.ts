import type { Lesson, Module, Rung } from "./types"
import { MODULE_L0 } from "./l0"
import { MODULE_L1 } from "./l1"
import { MODULE_L2 } from "./l2"
import { MODULE_L3 } from "./l3"
import { MODULE_L4 } from "./l4"
import { MODULE_L5 } from "./l5"

export type { Lesson, LessonCheck, Module, Rung, SceneKind } from "./types"
export { MODULE_L0, MODULE_L1, MODULE_L2, MODULE_L3, MODULE_L4, MODULE_L5 }

/** All modules in rung order (L0 … L5). */
export const MODULES: Module[] = [MODULE_L0, MODULE_L1, MODULE_L2, MODULE_L3, MODULE_L4, MODULE_L5]

/** The module for a rung. */
export function moduleFor(rung: Rung): Module {
  return MODULES[rung]
}

const LESSONS_BY_SLUG: ReadonlyMap<string, Lesson> = new Map(
  MODULES.flatMap((m) => m.lessons).map((l) => [l.slug, l] as const),
)

/** A lesson by its slug, or undefined if none matches. */
export function lessonBySlug(slug: string): Lesson | undefined {
  return LESSONS_BY_SLUG.get(slug)
}
