import { WorkflowDetail } from "@/components/learner/workflows/workflow-detail"

export const metadata = { title: "Workflow" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <WorkflowDetail id={id} />
}
