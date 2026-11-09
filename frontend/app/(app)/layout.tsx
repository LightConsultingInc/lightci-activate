import { redirect } from "next/navigation"
import "@/lib/api.server"
import { ApiError, getMe } from "@/lib/api"
import { requireUser } from "@/lib/auth"
import { MeProvider } from "@/hooks/use-me"
import { AppSidebar } from "@/components/shell/app-sidebar"
import { Topbar } from "@/components/shell/topbar"
import { LicenseBanner } from "@/components/shell/license-banner"
import { SignInBanner } from "@/components/shell/sign-in-banner"
import { UpdateBanner } from "@/components/shell/update-banner"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  let me
  try {
    me = await getMe()
  } catch (error) {
    console.error("[app layout] getMe failed", error)
    // The API refused this session on purpose (company sign-in policy): say why on the login page.
    if (error instanceof ApiError && error.status === 401 && /single sign-on/i.test(error.detail ?? "")) redirect("/api/auth/sign-out?reason=sso")
    if (error instanceof ApiError && error.status === 403 && /setting up sign-in/i.test(error.detail ?? "")) redirect("/api/auth/sign-out?reason=setup")
    if (error instanceof ApiError && error.status === 403 && /access to Activate has been switched off/i.test(error.detail ?? "")) redirect("/api/auth/sign-out?reason=deactivated")
    redirect("/login?authError=1")
  }
  if (!me.user) redirect("/login")
  return (
    <MeProvider initial={me}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <Topbar />
          <SignInBanner />
          <LicenseBanner />
          <UpdateBanner />
          <main className="flex-1 px-4 py-6 md:px-8 md:py-8" data-testid="page-main">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </MeProvider>
  )
}
