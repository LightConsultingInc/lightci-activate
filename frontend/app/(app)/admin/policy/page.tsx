import { Suspense } from "react"
import { PolicyView } from "@/components/admin/policy-view"
import { DashboardSkeleton } from "@/components/mission-control/states"

export const metadata = { title: "Policy & Boundary · Company admin" }

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <PolicyView />
    </Suspense>
  )
}
