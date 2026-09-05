import { redirect } from "next/navigation"
import "@/lib/api.server"
import { getMe } from "@/lib/api"
import { requireUser } from "@/lib/auth"
import { MeProvider } from "@/hooks/use-me"
import { AppSidebar } from "@/components/shell/app-sidebar"
import { Topbar } from "@/components/shell/topbar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  let me
  try {
    me = await getMe()
  } catch (error) {
    console.error("[app layout] getMe failed", error)
    redirect("/login?authError=1")
  }
  if (!me.user) redirect("/login")
  return (
    <MeProvider initial={me}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <Topbar />
          <main className="flex-1 px-4 py-6 md:px-8 md:py-8" data-testid="page-main">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </MeProvider>
  )
}
