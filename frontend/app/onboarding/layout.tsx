import Link from "next/link"
import { redirect } from "next/navigation"
import "@/lib/api.server"
import { getMe } from "@/lib/api"
import { requireUser } from "@/lib/auth"
import { MeProvider } from "@/hooks/use-me"
import { ActivateLockup } from "@/components/brand/logo"

/**
 * Onboarding lives outside the app shell: no sidebar, no topbar. A full-screen paper page with the
 * LightCI lockup top-left so the person's whole attention is on the interviewer.
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  let me
  try {
    me = await getMe()
  } catch (error) {
    console.error("[onboarding layout] getMe failed", error)
    redirect("/login?authError=1")
  }
  if (!me.user) redirect("/login")
  return (
    <MeProvider initial={me}>
      <div className="flex min-h-svh flex-col bg-background text-foreground">
        <header className="px-6 py-5 md:px-10">
          <Link href="/" aria-label="LightCI Activate" className="inline-flex">
            <ActivateLockup />
          </Link>
        </header>
        <main className="flex-1 px-6 pb-16 md:px-10" data-testid="page-main">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </MeProvider>
  )
}
