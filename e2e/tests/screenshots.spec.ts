import { test } from "./helpers/fixtures"

/** Visual sweep: full-page screenshots of every surface per role, for design review. Run with `yarn playwright test tests/screenshots.spec.ts`. */
const ROUTES: Record<string, string[]> = {
  learner: ["/", "/history", "/workflows", "/library", "/library/advisor-meeting-prep", "/onboarding"],
  champion: ["/team", "/team/reviews", "/promotions", "/exercise-placeholder"],
  sponsor: ["/mission-control", "/mission-control/people", "/mission-control/journey", "/mission-control/groups", "/mission-control/skills", "/mission-control/governance", "/mission-control/backlog", "/mission-control/cost", "/mission-control/readouts", "/admin/integrations", "/admin/policy", "/admin/teams", "/admin/marketplace"],
  lead: ["/lead", "/lead/clients"],
}

for (const [role, routes] of Object.entries(ROUTES)) {
  test.describe(`shots ${role}`, () => {
    test.use({ role: role as "learner" })
    for (const route of routes) {
      test(`${role} ${route}`, async ({ page }) => {
        if (route === "/exercise-placeholder") {
          await page.goto("/")
          const start = page.getByTestId("next-up-start")
          if (await start.count()) await start.first().click()
          else return
          await page.waitForLoadState("networkidle")
          await page.screenshot({ path: `shots/${role}-exercise.png`, fullPage: true })
          return
        }
        await page.goto(route)
        await page.waitForLoadState("networkidle")
        await page.waitForTimeout(800)
        await page.screenshot({ path: `shots/${role}${route.replace(/\//g, "_") || "_home"}.png`, fullPage: true })
      })
    }
  })
}
