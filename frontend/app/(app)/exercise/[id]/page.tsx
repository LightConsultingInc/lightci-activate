import { ExerciseView } from "@/components/learner/exercise/exercise-view"

export const metadata = { title: "Exercise" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ExerciseView id={id} />
}
