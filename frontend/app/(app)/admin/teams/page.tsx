import { Suspense } from "react"
import { TeamsView } from "@/components/admin/teams-view"
import { DashboardSkeleton } from "@/components/mission-control/states"

export const metadata = { title: "Teams & People · Company admin" }

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <TeamsView />
    </Suspense>
  )
}
