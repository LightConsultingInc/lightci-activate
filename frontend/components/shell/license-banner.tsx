"use client"

import Link from "next/link"
import { useLicense } from "@/hooks/mc/use-mc"
import { hasRole, useMe } from "@/hooks/use-me"
import { cn } from "@/lib/utils"

/**
 * One line above the page for admins when the license needs attention (expiring, in grace,
 * expired, seats nearly full). Silent for everyone else and in the cloud edition.
 */
export function LicenseBanner() {
  const me = useMe()
  const isAdmin = hasRole(me, "admin")
  const q = useLicense(isAdmin)
  const s = q.data
  if (!isAdmin || !s || s.status === "n/a" || !s.message) return null
  const urgent = s.status === "expired" || s.status === "grace" || s.status === "invalid" || s.status === "missing"
  return (
    <div
      role="status"
      className={cn("flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm md:px-8", urgent ? "bg-fail-soft text-foreground" : "bg-revise-soft text-foreground")}
      data-testid="license-banner"
      data-status={s.status}
    >
      <span>{s.message}</span>
      <Link href="/admin/license" className="font-medium underline underline-offset-4" data-testid="license-banner-link">
        Manage license
      </Link>
    </div>
  )
}
