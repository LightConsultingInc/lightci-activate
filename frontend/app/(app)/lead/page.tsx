import { Suspense } from "react"
import { LeadConsole } from "@/components/lead/lead-console"
import { DashboardSkeleton } from "@/components/mission-control/states"

export const metadata = { title: "Lead Console · LightCI" }

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <LeadConsole />
    </Suspense>
  )
}
