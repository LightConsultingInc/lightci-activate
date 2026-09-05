import { PageHeader } from "@/components/shell/page-header"
import { WorkflowsList } from "@/components/learner/workflows/workflows-list"

export const metadata = { title: "My Workflows" }

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Learner" title="My Workflows" description="The repeated work you have mapped, ranked by Scorer. Candidate → in build → shipped → measured." />
      <WorkflowsList />
    </>
  )
}
