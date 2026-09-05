import { Suspense } from "react"
import { PeopleView } from "@/components/mission-control/people-view"
import { DashboardSkeleton } from "@/components/mission-control/states"

export const metadata = { title: "People · Mission Control" }

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <PeopleView />
    </Suspense>
  )
}
