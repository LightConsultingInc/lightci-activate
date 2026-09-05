import { Suspense } from "react"
import { SkillDetailView } from "@/components/library/skill-detail/skill-detail"
import { Skeleton } from "@/components/ui/skeleton"

export default async function SkillPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <SkillDetailView slug={slug} />
    </Suspense>
  )
}
