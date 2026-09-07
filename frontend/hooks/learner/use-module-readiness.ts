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

  useEffect(() => {
    if (!enabled || !prepare || !incomplete || fired.current === code) return
    fired.current = code
    void prepareModule(code).then((r) => {
      if (r) qc.setQueryData<ModuleReadiness | null>(keys.readiness(code), r)
    })
  }, [enabled, prepare, incomplete, code, qc])

  const data = q.data ?? null
  return {
    readiness: data,
    preparing: data?.status === "preparing",
    ready: data?.status === "ready",
    lessonsReady: data?.lessons.ready ?? 0,
    lessonsTotal: data?.lessons.total ?? 0,
  }
}
