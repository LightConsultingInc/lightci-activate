"use client"

import { useCallback, useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { LibraryFilters, LibrarySort } from "./types"

const KEYS = ["team", "family", "rung", "status", "q", "sort"] as const
const SORTS: LibrarySort[] = ["most_used", "newest", "grade"]

/** Library filters live in the URL so a filtered view is shareable and survives refresh. */
export function useLibraryFilters() {
  const sp = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const filters = useMemo<LibraryFilters>(() => {
    const f: LibraryFilters = {}
    for (const k of KEYS) {
      const v = sp.get(k)
      if (!v) continue
      if (k === "sort") { if (SORTS.includes(v as LibrarySort)) f.sort = v as LibrarySort }
      else f[k] = v
    }
    return f
  }, [sp])

  const set = useCallback(
    (patch: Partial<Record<(typeof KEYS)[number], string | undefined>>) => {
      const next = new URLSearchParams(sp.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "" || v === "all") next.delete(k)
        else next.set(k, v)
      }
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [sp, router, pathname],
  )

  const clear = useCallback(() => router.replace(pathname, { scroll: false }), [router, pathname])
  const activeCount = KEYS.filter((k) => k !== "sort" && filters[k]).length
  return { filters, set, clear, activeCount }
}
