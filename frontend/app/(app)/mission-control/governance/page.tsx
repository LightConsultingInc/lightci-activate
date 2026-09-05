import { Suspense } from "react"
import { GovernanceView } from "@/components/mission-control/governance-view"
import { DashboardSkeleton } from "@/components/mission-control/states"

export const metadata = { title: "Governance · Mission Control" }

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <GovernanceView />
    </Suspense>
  )
}
