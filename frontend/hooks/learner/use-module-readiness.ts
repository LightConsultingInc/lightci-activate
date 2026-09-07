"use client"

import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { keys, prepareModule, useModuleReadinessQuery } from "./queries"
import type { ModuleReadiness } from "./types"

/**
 * Readiness of a module's personalisation. With `prepare`, kicks off `POST /modules/:code/prepare`
 * once readiness is known to be incomplete (or unknown), then polls readiness every 3s until ready.
 * Everything degrades to "nothing to show" while the endpoints 404.
 */
export function useModuleReadiness(code: string, { prepare = false, enabled = true }: { prepare?: boolean; enabled?: boolean } = {}) {
  const qc = useQueryClient()
  const q = useModuleReadinessQuery(code, enabled)
  const fired = useRef<string | null>(null)
  const incomplete = q.isFetched && (q.data == null || q.data.status !== "ready")
  // Re-fire when Coach's memory moves on (personalisations are keyed by memory version).
  const fireKey = `${code}:${q.data?.memoryVersion ?? "?"}`

  useEffect(() => {
    if (!enabled || !prepare || !incomplete || fired.current === fireKey) return
    fired.current = fireKey
    void prepareModule(code).then((r) => {
      if (r) qc.setQueryData<ModuleReadiness | null>(keys.readiness(code), r)
    })
  }, [enabled, prepare, incomplete, code, fireKey, qc])

  // As tailored lessons land, refresh any lesson content already on screen so nobody has to reload.
  const seenReady = useRef<number>(-1)
  useEffect(() => {
    const n = q.data?.lessons.ready ?? -1
    if (n !== seenReady.current) {
      if (seenReady.current !== -1) void qc.invalidateQueries({ queryKey: ["lesson-personalised"] })
      seenReady.current = n
    }
  }, [q.data?.lessons.ready, qc])

  const data = q.data ?? null
  const inProgress = data?.inProgress === true
  const readySlugs = new Set(data?.lessons.readySlugs ?? [])
  return {
    readiness: data,
    preparing: data?.status === "preparing",
    ready: data?.status === "ready",
    /** The job is running right now. Only then do we hold lessons and practice back; a stalled job never locks anyone out. */
    inProgress,
    lessonsReady: data?.lessons.ready ?? 0,
    lessonsTotal: data?.lessons.total ?? 0,
    /** A lesson waits only while the job is running and its tailored version has not landed. */
    isLessonReady: (slug: string) => !inProgress || readySlugs.has(slug),
    practiceReady: !inProgress || data?.practice.ready === true,
  }
}
