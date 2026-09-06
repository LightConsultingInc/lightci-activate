import { redirect } from "next/navigation"
import { getMe } from "@/lib/api"
import { LadderView } from "@/components/learner/ladder/ladder-view"

export const metadata = { title: "My Ladder" }

export default async function Page() {
  const me = await getMe().catch(() => null)
  // Only people who belong to a client org are onboarded; leads without a client stay on the ladder.
  if (me?.user && !me.user.consentAt && me.org) redirect("/onboarding")
  return <LadderView />
}
