import { test, expect } from "./helpers/fixtures"
import { resetSeed } from "./helpers/seed"

/**
 * Runs first (alphabetical order within the chromium project, workers=1) so every spec starts from
 * the same seeded Meridian demo org. The reset truncates every tenant, so only a LightCI lead may
 * call it. Skip with E2E_SKIP_RESET=1 when iterating on a single spec.
 */
test.describe("00 reset demo seed", () => {
  test.use({ role: "lead" })
  test.setTimeout(180_000)

  test("truncates and reseeds the demo org", async ({ request }) => {
    test.skip(Boolean(process.env.E2E_SKIP_RESET), "E2E_SKIP_RESET set")
    const result = await resetSeed(request)
    expect(result.ok).toBe(true)
    expect(result.truncated).toBeGreaterThan(10)
    expect(result.tables).toContain("people")
  })
})
