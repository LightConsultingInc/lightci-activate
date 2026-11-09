import { TeamDashboard } from "@/components/team/team-dashboard"
import { RoleGate } from "@/components/mission-control/role-gate"

export const metadata = { title: "Team · LightCI Activate" }

export default function TeamPage() {
  return (
    <RoleGate roles={["champion", "sponsor"]} surface="The team page">
      <TeamDashboard />
    </RoleGate>
  )
}
