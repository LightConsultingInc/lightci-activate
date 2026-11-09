import { PageHeader } from "@/components/shell/page-header"
import { HistoryView } from "@/components/learner/history/history-view"

export const metadata = { title: "History" }

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Learner" title="History" description="Everything you have practised: what you sent in, what Claude made of it, and the feedback you got." />
      <HistoryView />
    </>
  )
}
