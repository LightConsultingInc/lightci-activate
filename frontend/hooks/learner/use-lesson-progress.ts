"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"
import { useMe } from "@/hooks/use-me"

/**
 * Lesson completion, kept in localStorage per user until the API grows a lesson-progress endpoint.
 * Key: `activate:lessons:<userId>` → JSON array of completed lesson slugs.
 */
const storageKey = (userId: string) => `activate:lessons:${userId}`

const listeners = new Set<() => void>()
function emit() {
  for (const l of listeners) l()
}
function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener("storage", cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", cb)
  }
}

function readRaw(userId: string): string {
  try {
    return window.localStorage.getItem(storageKey(userId)) ?? "[]"
  } catch {
    return "[]"
  }
}

function parse(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

export function useLessonProgress() {
  const me = useMe()
  const userId = me.user?.id ?? "anon"
  const raw = useSyncExternalStore(subscribe, () => readRaw(userId), () => "[]")
  const done = useMemo(() => parse(raw), [raw])

  const markDone = useCallback(
    (slug: string) => {
      const current = parse(readRaw(userId))
      if (current.includes(slug)) return
      try {
        window.localStorage.setItem(storageKey(userId), JSON.stringify([...current, slug]))
      } catch {
        /* storage unavailable: nothing to persist */
      }
      emit()
    },
    [userId],
  )

  const isDone = useCallback((slug: string) => done.includes(slug), [done])
  return { done, isDone, markDone }
}
