import { Suspense } from "react"
import { GroupsView } from "@/components/mission-control/groups-view"
import { DashboardSkeleton } from "@/components/mission-control/states"

export const metadata = { title: "Groups · Mission Control" }

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <GroupsView />
    </Suspense>
  )
}
