import { Suspense } from "react"
import { MarketplaceView } from "@/components/admin/marketplace-view"
import { DashboardSkeleton } from "@/components/mission-control/states"

export const metadata = { title: "Marketplace repo · Company admin" }

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <MarketplaceView />
    </Suspense>
  )
}
