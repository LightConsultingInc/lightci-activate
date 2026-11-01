import type { Me } from "@/lib/api"
import { hasRole } from "@/hooks/use-me"

export type NavItem = { href: string; label: string; icon: string; testId: string; match?: "exact" | "prefix" }
export type NavGroup = { label: string; items: NavItem[] }

/** Navigation by role. Icons are lucide names resolved in the sidebar. */
export function navFor(me: Me): NavGroup[] {
  const groups: NavGroup[] = []
  const isLearner = Boolean(me.user)
  if (isLearner) {
    groups.push({
      label: "Me",
      items: [
        { href: "/", label: "My Ladder", icon: "Ladder", testId: "nav-ladder", match: "exact" },
        { href: "/workflows", label: "My Workflows", icon: "Route", testId: "nav-workflows" },
        { href: "/history", label: "History", icon: "History", testId: "nav-history" },
      ],
    })
  }
  groups.push({
    label: "Library",
    items: [{ href: "/library", label: "Skill Library", icon: "Library", testId: "nav-library" }],
  })
  if (hasRole(me, "champion", "sponsor")) {
    groups.push({
      label: "Team",
      items: [
        { href: "/team", label: "Roster & Backlog", icon: "Users", testId: "nav-team", match: "exact" },
        { href: "/team/reviews", label: "Review Queue", icon: "ClipboardCheck", testId: "nav-reviews" },
        { href: "/promotions", label: "Promotion Queue", icon: "GitPullRequest", testId: "nav-promotions" },
      ],
    })
  }
  if (hasRole(me, "sponsor", "admin")) {
    groups.push({
      label: "Mission Control",
      items: [
        { href: "/mission-control", label: "Adoption", icon: "Activity", testId: "nav-mc-adoption", match: "exact" },
        { href: "/mission-control/people", label: "People", icon: "UserRound", testId: "nav-mc-people" },
        { href: "/mission-control/journey", label: "Journey", icon: "Footprints", testId: "nav-mc-journey" },
        { href: "/mission-control/groups", label: "Groups", icon: "Boxes", testId: "nav-mc-groups" },
        { href: "/mission-control/skills", label: "Skills Health", icon: "Sparkles", testId: "nav-mc-skills" },
        { href: "/mission-control/governance", label: "Governance", icon: "ShieldCheck", testId: "nav-mc-governance" },
        { href: "/mission-control/backlog", label: "Backlog", icon: "ListOrdered", testId: "nav-mc-backlog" },
        { href: "/mission-control/cost", label: "Cost & Return", icon: "Coins", testId: "nav-mc-cost" },
        { href: "/mission-control/readouts", label: "Readouts", icon: "FileText", testId: "nav-mc-readouts" },
      ],
    })
    groups.push({
      label: "Company admin",
      items: [
        { href: "/admin/integrations", label: "Integrations & Keys", icon: "KeyRound", testId: "nav-admin-integrations" },
        { href: "/admin/policy", label: "Policy & Boundary", icon: "Scale", testId: "nav-admin-policy" },
        { href: "/admin/teams", label: "Teams & People", icon: "Network", testId: "nav-admin-teams" },
        { href: "/admin/marketplace", label: "Marketplace Repo", icon: "GitBranch", testId: "nav-admin-marketplace" },
        { href: "/admin/license", label: "License", icon: "BadgeCheck", testId: "nav-admin-license" },
      ],
    })
  }
  if (hasRole(me, "lead")) {
    groups.push({
      label: "LightCI",
      items: [
        { href: "/lead", label: "Lead Console", icon: "Radar", testId: "nav-lead", match: "exact" },
        { href: "/lead/clients", label: "Clients & Provisioning", icon: "Building2", testId: "nav-lead-clients" },
      ],
    })
  }
  return groups
}
