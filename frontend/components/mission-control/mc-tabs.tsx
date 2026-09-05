"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"

export const MC_TABS = [
  { href: "/mission-control", label: "Adoption", id: "adoption", exact: true },
  { href: "/mission-control/people", label: "People", id: "people", exact: false },
  { href: "/mission-control/journey", label: "Journey", id: "journey", exact: false },
  { href: "/mission-control/groups", label: "Groups", id: "groups", exact: false },
  { href: "/mission-control/skills", label: "Skills", id: "skills", exact: false },
  { href: "/mission-control/governance", label: "Governance", id: "governance", exact: false },
  { href: "/mission-control/backlog", label: "Backlog", id: "backlog", exact: false },
  { href: "/mission-control/cost", label: "Cost & Return", id: "cost", exact: false },
  { href: "/mission-control/readouts", label: "Readouts", id: "readouts", exact: false },
] as const

/** Shared sub-nav across the nine Mission Control tabs. Preserves the team/range filters in the URL. */
export function McTabs({ className }: { className?: string }) {
  const pathname = usePathname()
  const sp = useSearchParams()
  const keep = new URLSearchParams()
  for (const k of ["team", "range"]) {
    const v = sp.get(k)
    if (v) keep.set(k, v)
  }
  const suffix = keep.toString() ? `?${keep}` : ""
  return (
    <nav aria-label="Mission Control sections" className={cn("-mx-1 mb-6 overflow-x-auto", className)} data-testid="mc-tabs">
      <ul className="flex min-w-max items-center gap-1 border-b px-1">
        {MC_TABS.map((t) => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href)
          return (
            <li key={t.href}>
              <Link
                href={`${t.href}${suffix}`}
                data-testid={`mc-tab-${t.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-9 items-center px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-glow after:transition-opacity",
                  active ? "after:opacity-100" : "after:opacity-0",
                )}
              >
                {t.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
