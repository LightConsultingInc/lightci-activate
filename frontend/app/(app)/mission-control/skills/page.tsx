import { Suspense } from "react"
import { SkillsView } from "@/components/mission-control/skills-view"
import { DashboardSkeleton } from "@/components/mission-control/states"

export const metadata = { title: "Skills health · Mission Control" }

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <SkillsView />
    </Suspense>
  )
}
