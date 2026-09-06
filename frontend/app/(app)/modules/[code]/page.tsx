import { Suspense } from "react"
import { ModuleView } from "@/components/learner/modules/module-view"

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return { title: `Module ${code.toUpperCase()}` }
}

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return (
    <Suspense>
      <ModuleView code={code.toUpperCase()} />
    </Suspense>
  )
}
