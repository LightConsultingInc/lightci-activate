"use client"

import Link from "next/link"
import { LockIcon } from "lucide-react"
import { useMe, hasRole } from "@/hooks/use-me"
import type { Me } from "@/lib/api"
import { EmptyState } from "@/components/shell/empty-state"
import { Button } from "@/components/ui/button"

type Roles = NonNullable<Me["user"]>["roles"]

/** Friendly notice instead of a blank page when a surface isn't for the caller's role. */
export function RoleGate({ roles, surface, children }: { roles: Roles; surface: string; children: React.ReactNode }) {
  const me = useMe()
  if (hasRole(me, ...roles)) return <>{children}</>
  return (
    <EmptyState
      icon={<LockIcon className="size-5" />}
      title={`${surface} isn't part of your role`}
      description={`This surface is for ${roles.join(" and ")} roles. Your ladder, workflows and the skill library are where your work lives; ask your sponsor if you think you should see this.`}
      action={<Button render={<Link href="/" />}>Back to My Ladder</Button>}
      className="mt-4"
    />
  )
}

/** True when the caller may write admin settings (sponsors get a read-only view). */
export function useCanAdmin() {
  const me = useMe()
  const roles = me.user?.roles ?? []
  return roles.includes("admin") || roles.includes("lead")
}
