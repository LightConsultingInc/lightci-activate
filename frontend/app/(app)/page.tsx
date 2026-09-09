import { redirect } from "next/navigation"
import { getMe } from "@/lib/api"
import { HomeView } from "@/components/learner/home/home-view"

export const metadata = { title: "Your path" }

export default async function Page() {
  const me = await getMe().catch(() => null)
  // LightCI leads open the lead console; everyone else is a learner in a client org.
  if (me?.user?.roles?.includes("lead")) redirect("/lead")
  // Only people who belong to a client org are onboarded; leads without a client stay on the home page.
  if (me?.user && !me.user.consentAt && me.org) redirect("/onboarding")
  return <HomeView />
}
