import { Suspense } from "react"
import { CostView } from "@/components/mission-control/cost-view"
import { DashboardSkeleton } from "@/components/mission-control/states"

export const metadata = { title: "Cost & Return · Mission Control" }

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <CostView />
    </Suspense>
  )
}
