import { Suspense } from "react"
import { AdoptionView } from "@/components/mission-control/adoption-view"
import { DashboardSkeleton } from "@/components/mission-control/states"

export const metadata = { title: "Adoption · Mission Control" }

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <AdoptionView />
    </Suspense>
  )
}
