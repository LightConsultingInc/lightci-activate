import { PromotionQueue } from "@/components/library/promotion-queue"
import { RoleGate } from "@/components/mission-control/role-gate"

export const metadata = { title: "Promotion Queue · LightCI Activate" }

export default function PromotionsPage() {
  return (
    <RoleGate roles={["champion", "sponsor"]} surface="The approval queue">
      <PromotionQueue />
    </RoleGate>
  )
}
