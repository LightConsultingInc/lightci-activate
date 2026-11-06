"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSignInPhase } from "@/hooks/mc/use-mc"
import { useMe } from "@/hooks/use-me"

/**
 * One line above the page for a company's own admins while its single sign-on is not connected
 * yet, pointing at the Sign-in tab. Silent for everyone else, for LightCI leads and once done.
 */
export function SignInBanner() {
  const me = useMe()
  const roles = me.user?.roles ?? []
  const isCompanyAdmin = roles.includes("admin") && !roles.includes("lead") && Boolean(me.org) && !me.org?.isDemo
  const pathname = usePathname()
  const q = useSignInPhase(isCompanyAdmin)
  if (!isCompanyAdmin || q.data?.phase !== "setup" || pathname.startsWith("/admin/sign-in")) return null
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b bg-glow-soft px-4 py-2 text-sm md:px-8" data-testid="sign-in-banner">
      <span>Your company&apos;s sign-in isn&apos;t connected yet. Until it is, only admins can get in.</span>
      <Link href="/admin/sign-in" className="font-medium underline underline-offset-4" data-testid="sign-in-banner-link">
        Connect sign-in
      </Link>
    </div>
  )
}
