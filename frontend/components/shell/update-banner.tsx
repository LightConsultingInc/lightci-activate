"use client"

import { useUpdates } from "@/hooks/mc/use-mc"
import { hasRole, useMe } from "@/hooks/use-me"
import { cn } from "@/lib/utils"

/**
 * One line for admins of a self-hosted install when a newer Activate release is published. Red when
 * the release carries a security advisory. Silent in the cloud edition, for everyone else, and when
 * the daily check is switched off.
 */
export function UpdateBanner() {
  const me = useMe()
  const isAdmin = hasRole(me, "admin")
  const q = useUpdates(isAdmin)
  const u = q.data
  if (!isAdmin || !u || !u.enabled || !u.updateAvailable || !u.message) return null
  return (
    <div
      role="status"
      className={cn("flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm md:px-8", u.advisory ? "bg-fail-soft text-foreground" : "bg-revise-soft text-foreground")}
      data-testid="update-banner"
      data-advisory={u.advisory ? "true" : "false"}
    >
      <span>{u.message}</span>
      {u.notesUrl ? (
        <a href={u.notesUrl} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4" data-testid="update-banner-link">
          What changed
        </a>
      ) : null}
    </div>
  )
}
