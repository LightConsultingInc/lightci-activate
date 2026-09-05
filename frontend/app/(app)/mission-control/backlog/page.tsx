import { Suspense } from "react"
import { BacklogView } from "@/components/mission-control/backlog-view"
import { DashboardSkeleton } from "@/components/mission-control/states"

export const metadata = { title: "Backlog · Mission Control" }

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <BacklogView />
    </Suspense>
  )
}
