/** Seeded demo sign-ins (created by scripts/workos-demo.mjs). */
export const PASSWORD = process.env.E2E_PASSWORD ?? "Activate-demo-2026!"

export const USERS = {
  learner: { email: "priya.nair@meridianwealth.demo", name: "Priya Nair", state: "playwright/.auth/learner.json" },
  learner2: { email: "marcus.reid@meridianwealth.demo", name: "Marcus Reid", state: "playwright/.auth/learner2.json" },
  champion: { email: "daniel.okafor@meridianwealth.demo", name: "Daniel Okafor", state: "playwright/.auth/champion.json" },
  sponsor: { email: "elena.marsh@meridianwealth.demo", name: "Elena Marsh", state: "playwright/.auth/sponsor.json" },
  lead: { email: "zain+activate-lead@lightci.com", name: "Zain Lakhani", state: "playwright/.auth/lead.json" },
} as const

export type RoleKey = keyof typeof USERS
