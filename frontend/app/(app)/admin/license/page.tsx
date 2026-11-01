import { Suspense } from "react"
import { LicenseView } from "@/components/admin/license-view"
import { DashboardSkeleton } from "@/components/mission-control/states"

export const metadata = { title: "License · Company admin" }

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <LicenseView />
    </Suspense>
  )
}
