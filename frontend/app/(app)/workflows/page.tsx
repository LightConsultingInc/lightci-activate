import { PageHeader } from "@/components/shell/page-header"
import { WorkflowsList } from "@/components/learner/workflows/workflows-list"

export const metadata = { title: "My Workflows" }

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Learner" title="My Workflows" description="The work you repeat each week, with the pieces most worth handing to Claude at the top." />
      <WorkflowsList />
    </>
  )
}
