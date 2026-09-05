import { Suspense } from "react"
import { ClientDetail } from "@/components/lead/client-detail"
import { DashboardSkeleton } from "@/components/mission-control/states"

export const metadata = { title: "Client · LightCI" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <ClientDetail id={id} />
    </Suspense>
  )
}
