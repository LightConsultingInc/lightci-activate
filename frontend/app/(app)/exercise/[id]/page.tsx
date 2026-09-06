import { Suspense } from "react"
import { ExerciseView } from "@/components/learner/exercise/exercise-view"

export const metadata = { title: "Practice" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense>
      <ExerciseView id={id} />
    </Suspense>
  )
}
