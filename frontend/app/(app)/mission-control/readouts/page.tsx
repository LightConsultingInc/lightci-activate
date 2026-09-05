import { Suspense } from "react"
import { ReadoutsView } from "@/components/mission-control/readouts-view"
import { DashboardSkeleton } from "@/components/mission-control/states"

export const metadata = { title: "Readouts · Mission Control" }

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <ReadoutsView />
    </Suspense>
  )
}
