import { Suspense } from "react"
import { ReviewQueue } from "@/components/team/review-queue"
import { PageHeader } from "@/components/shell/page-header"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata = { title: "Review Queue · LightCI Activate" }

export default function ReviewsPage() {
  return (
    <Suspense fallback={<><PageHeader eyebrow="Champion" title="Review Queue" /><Skeleton className="h-64" /></>}>
      <ReviewQueue />
    </Suspense>
  )
}
