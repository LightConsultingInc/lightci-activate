"use client"

import Link from "next/link"
import { LockIcon } from "lucide-react"
import { useMe, hasRole } from "@/hooks/use-me"
import type { Me } from "@/lib/api"
import { EmptyState } from "@/components/shell/empty-state"
import { Button } from "@/components/ui/button"

type Roles = NonNullable<Me["user"]>["roles"]

const NAMES: Record<string, string> = { lead: "LightCI's team", admin: "the people who run Activate at your company", sponsor: "the people who sponsor Activate", champion: "team champions", learner: "everyone" }
const ROLE_WORDS = (roles: Roles) => {
  const words = roles.map((r) => NAMES[r] ?? r)
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words[0]
}

/** Friendly notice instead of a blank page when a surface isn't for the caller's role. */
export function RoleGate({ roles, surface, children }: { roles: Roles; surface: string; children: React.ReactNode }) {
  const me = useMe()
  if (hasRole(me, ...roles)) return <>{children}</>
  return (
    <EmptyState
      icon={<LockIcon className="size-5" />}
      title={`${surface} isn't open to you`}
      description={`It's for ${ROLE_WORDS(roles)}. Your own practice, workflows and the skill library are all on the left. If you think you should see this, ask whoever runs Activate at your company.`}
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
