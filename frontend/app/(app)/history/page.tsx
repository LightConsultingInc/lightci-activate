import { PageHeader } from "@/components/shell/page-header"
import { HistoryView } from "@/components/learner/history/history-view"

export const metadata = { title: "History" }

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Learner" title="History" description="Every submission with your expectation, the artifact, your critique and the grade. This is your evidence trail." />
      <HistoryView />
    </>
  )
}
