import { ApprovalPanel } from "@/components/library/approval-panel"

export const metadata = { title: "Promotion · LightCI Activate" }

export default async function PromotionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ApprovalPanel id={id} />
}
