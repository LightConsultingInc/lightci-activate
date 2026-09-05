"use client"

import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

export type Range = "30d" | "90d"

/** Team + range filters live in the URL so a Mission Control view can be shared as a link. */
export function useMcFilters() {
  const sp = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const teamId = sp.get("team") || null
  const range: Range = sp.get("range") === "90d" ? "90d" : "30d"
  const set = useCallback(
    (next: { teamId?: string | null; range?: Range }) => {
      const params = new URLSearchParams(sp.toString())
      if ("teamId" in next) {
        if (next.teamId) params.set("team", next.teamId)
        else params.delete("team")
      }
      if (next.range) {
        if (next.range === "30d") params.delete("range")
        else params.set("range", next.range)
      }
      const s = params.toString()
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false })
    },
    [sp, router, pathname],
  )
  return { teamId, range, set }
}
