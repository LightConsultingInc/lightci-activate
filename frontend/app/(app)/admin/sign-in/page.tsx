import { Suspense } from "react"
import { SignInView } from "@/components/admin/sign-in-view"
import { DashboardSkeleton } from "@/components/mission-control/states"

export const metadata = { title: "Sign-in · Company admin" }

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <SignInView />
    </Suspense>
  )
}
