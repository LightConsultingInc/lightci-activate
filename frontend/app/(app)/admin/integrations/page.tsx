import { Suspense } from "react"
import { IntegrationsView } from "@/components/admin/integrations-view"
import { DashboardSkeleton } from "@/components/mission-control/states"

export const metadata = { title: "Integrations & Keys · Company admin" }

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <IntegrationsView />
    </Suspense>
  )
}
