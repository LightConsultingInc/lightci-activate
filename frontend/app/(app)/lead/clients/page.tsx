import { Suspense } from "react"
import { ClientsView } from "@/components/lead/clients-view"
import { DashboardSkeleton } from "@/components/mission-control/states"

export const metadata = { title: "Clients & Provisioning · LightCI" }

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <ClientsView />
    </Suspense>
  )
}
