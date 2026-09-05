import { PersonPageView } from "@/components/team/person-page"

export const metadata = { title: "Person · LightCI Activate" }

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PersonPageView id={id} />
}
