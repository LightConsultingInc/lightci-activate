import { redirect } from "next/navigation"
import { getMe } from "@/lib/api"
import { LadderView } from "@/components/learner/ladder/ladder-view"

export const metadata = { title: "My Ladder" }

export default async function Page() {
  const me = await getMe().catch(() => null)
  if (me?.user && !me.user.consentAt) redirect("/onboarding")
  return <LadderView />
}
