"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { PageHeader } from "@/components/shell/page-header"
import { useMe } from "@/hooks/use-me"
import { cn } from "@/lib/utils"

const ADMIN_TABS = [
  { href: "/admin/integrations", label: "Integrations & Keys", id: "integrations" },
  { href: "/admin/policy", label: "Policy & Boundary", id: "policy" },
  { href: "/admin/teams", label: "Teams & People", id: "teams" },
  { href: "/admin/marketplace", label: "Marketplace repo", id: "marketplace" },
]

export function AdminHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  const me = useMe()
  const pathname = usePathname()
  return (
    <>
      <PageHeader eyebrow={`Company admin · ${me.org?.name ?? "Your firm"}`} title={title} description={description} actions={actions} className="pb-4" />
      <nav aria-label="Company admin sections" className="-mx-1 mb-6 overflow-x-auto" data-testid="admin-tabs">
        <ul className="flex min-w-max items-center gap-1 border-b px-1">
          {ADMIN_TABS.map((t) => {
            const active = pathname.startsWith(t.href)
            return (
              <li key={t.href}>
                <Link href={t.href} data-testid={`admin-tab-${t.id}`} aria-current={active ? "page" : undefined} className={cn("relative inline-flex h-9 items-center px-3 text-sm font-medium whitespace-nowrap transition-colors after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-glow after:transition-opacity", active ? "text-foreground after:opacity-100" : "text-muted-foreground hover:text-foreground after:opacity-0")}>
                  {t.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
