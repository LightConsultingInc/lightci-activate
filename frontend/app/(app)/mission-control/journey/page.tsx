import { Suspense } from "react"
import { JourneyView } from "@/components/mission-control/journey-view"
import { DashboardSkeleton } from "@/components/mission-control/states"

export const metadata = { title: "Journey · Mission Control" }

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <JourneyView />
    </Suspense>
  )
}
