import { Suspense } from "react"
import { LibraryBrowser } from "@/components/library/library-browser"
import { PageHeader } from "@/components/shell/page-header"
import { SkillCardSkeleton } from "@/components/library/skill-card"

export const metadata = { title: "Skill Library · LightCI Activate" }

export default function LibraryPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader eyebrow="Library" title="Skill Library" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <SkillCardSkeleton key={i} />)}</div>
        </>
      }
    >
      <LibraryBrowser />
    </Suspense>
  )
}
