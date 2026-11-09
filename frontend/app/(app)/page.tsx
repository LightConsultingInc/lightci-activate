import { redirect } from "next/navigation"
import { api, getMe } from "@/lib/api"
import type { SignInStatus } from "@/hooks/mc/types"
import { HomeView } from "@/components/learner/home/home-view"

export const metadata = { title: "Your path" }

export default async function Page() {
  const me = await getMe().catch(() => null)
  // LightCI leads open the lead console; everyone else is a learner in a client org.
  if (me?.user?.roles?.includes("lead")) redirect("/lead")
  // A company admin whose company is still connecting its sign-in (usually the IT admin LightCI
  // invited for exactly that) goes straight to it; onboarding as a learner can wait.
  if (me?.user?.roles?.includes("admin") && me.org && !me.org.isDemo) {
    const signIn = await api.get<{ phase: SignInStatus["phase"] }>("/api/org/sign-in/phase").catch(() => null)
    if (signIn?.phase === "setup") redirect("/admin/sign-in")
  }
  // Only people who belong to a client org are onboarded; leads without a client stay on the home page.
  if (me?.user && !me.user.consentAt && me.org) redirect("/onboarding")
  return <HomeView />
}
