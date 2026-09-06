import { lessonBySlug } from "@/content/lessons"
import { LessonView } from "@/components/learner/modules/lesson-view"

export async function generateMetadata({ params }: { params: Promise<{ code: string; slug: string }> }) {
  const { slug } = await params
  return { title: lessonBySlug(slug)?.title ?? "Lesson" }
}

export default async function Page({ params }: { params: Promise<{ code: string; slug: string }> }) {
  const { code, slug } = await params
  return <LessonView code={code.toUpperCase()} slug={slug} />
}
