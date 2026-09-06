import { test, expect } from "./helpers/fixtures"
import { expectToast, intOf } from "./helpers/ui"

const COLUMNS = ["escalations", "approvals", "stalled", "waves"] as const

/** LightCI lead console as Zain Lakhani. Resolving an escalation and provisioning a client mutate state; serial. */
test.describe("lead console", () => {
  test.describe.configure({ mode: "serial" })
  test.use({ role: "lead" })

  let clientName = ""

  test("four queue columns render with counts", async ({ page }) => {
    await page.goto("/lead")
    await expect(page.getByTestId("lead-columns")).toBeVisible()
    for (const col of COLUMNS) {
      const column = page.getByTestId(`lead-col-${col}`)
      await expect(column, col).toBeVisible()
      await expect(column.getByTestId(`lead-col-${col}-count`)).toContainText(/^\d+$/)
      const count = await intOf(column.getByTestId(`lead-col-${col}-count`))
      await expect(column).toHaveAttribute("data-count", String(count))
    }
    expect(await intOf(page.getByTestId("lead-col-escalations-count"))).toBeGreaterThan(0)
    await expect(page.getByTestId("lead-escalation-card").first()).toBeVisible()
    await expect(page.getByTestId("lead-escalation-card").first().getByTestId("sla-timer")).toBeVisible()
    await expect(page.getByTestId("lead-wave-card").first()).toContainText(/week \d+ of \d+/)
    await expect(page.getByTestId("lead-stalled-card").first().getByTestId("stalled-open")).toBeVisible()
    if (await page.getByTestId("lead-approval-card").count()) await expect(page.getByTestId("lead-approval-card").first().getByTestId("approval-open")).toHaveAttribute("href", /\/promotions\//)
  })

  test("resolving an escalation without a selected client", async ({ page }) => {
    await page.goto("/lead")
    const count = page.getByTestId("lead-col-escalations-count")
    const before = await intOf(count)
    await page.getByTestId("lead-escalation-card").first().click()
    const drawer = page.getByTestId("escalation-drawer")
    await drawer.getByTestId("escalation-resolution").fill("E2E: resolved from the cross-client queue.")
    await drawer.getByTestId("escalation-resolve").click()
    await expectToast(page, /Escalation resolved/)
    await expect(count).toHaveText(String(before - 1))
  })

  test("resolving an escalation from the drawer decrements the column", async ({ page }) => {
    await page.goto("/lead")
    // Scope the lead to Meridian first (sets the activate_org cookie and reloads), as the org-scoped
    // resolve endpoint needs a client context; see BUGS.md #6 for the unscoped case.
    await page.getByTestId("client-switcher").click()
    await page.getByTestId("client-switcher-option").filter({ hasText: "Meridian Wealth Partners" }).click()
    await page.waitForLoadState("load")
    await expect(page.getByTestId("lead-columns")).toBeVisible()
    await expect(page.getByTestId("client-switcher")).toContainText("Meridian")
    const count = page.getByTestId("lead-col-escalations-count")
    const before = await intOf(count)
    const card = page.getByTestId("lead-escalation-card").first()
    const reason = (await card.locator("p.font-medium").textContent())?.trim() ?? ""
    await card.click()
    const drawer = page.getByTestId("escalation-drawer")
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText(reason)
    await expect(drawer.getByTestId("escalation-assignee")).toBeVisible()
    await expect(drawer.getByTestId("escalation-resolve")).toBeDisabled()
    await drawer.getByTestId("escalation-resolution").fill("E2E: reviewed with the champion; unblocked by re-running the champion interview for the missing decisions.")
    await expect(drawer.getByTestId("escalation-resolve")).toBeEnabled()
    await drawer.getByTestId("escalation-resolve").click()
    await expectToast(page, /Escalation resolved/)
    await expect(drawer).toBeHidden()
    await expect(count).toHaveText(String(before - 1))
    await expect(page.getByTestId("lead-col-escalations")).toHaveAttribute("data-count", String(before - 1))
    await expect(page.getByTestId("lead-escalation-card").filter({ hasText: reason })).toHaveCount(0)
  })

  test("client switcher lists Meridian", async ({ page }) => {
    await page.goto("/lead")
    const switcher = page.getByTestId("client-switcher")
    await expect(switcher).toBeVisible()
    await switcher.click()
    const options = page.getByTestId("client-switcher-option")
    await expect(options.filter({ hasText: "Meridian Wealth Partners" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(options.first()).toBeHidden()
  })

  test("clients table lists provisioned orgs", async ({ page }) => {
    await page.goto("/lead/clients")
    const table = page.getByTestId("clients-table")
    await expect(table).toBeVisible()
    const rows = table.getByTestId("client-row")
    expect(await rows.count()).toBeGreaterThanOrEqual(1)
    const meridian = rows.filter({ hasText: "Meridian Wealth Partners" })
    await expect(meridian).toBeVisible()
    await expect(meridian).toContainText("meridian")
    await expect(meridian.getByTestId("rung-mix")).toBeVisible()
    await expect(page.getByTestId("panel-clients")).toContainText(/Clients · \d+/)
  })

  test("provision dialog validates and creates a client", async ({ page }) => {
    await page.goto("/lead/clients")
    await page.getByTestId("provision-open").click()
    const dialog = page.getByTestId("provision-dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId("provision-submit")).toBeDisabled()
    clientName = `E2E Client ${Date.now()}`
    await dialog.getByTestId("provision-name").fill(clientName)
    await expect(dialog.getByTestId("provision-slug")).toHaveValue(/^e2e-client-\d+$/)
    await expect(dialog).toContainText(/e2e-client-\d+-claude-marketplace/)
    await dialog.getByTestId("provision-seats").fill("0")
    await expect(dialog.getByTestId("provision-submit")).toBeDisabled()
    await dialog.getByTestId("provision-seats").fill("12")
    await dialog.getByTestId("provision-industry").fill("Wealth management")
    await dialog.getByTestId("provision-sponsor").fill("E2E Sponsor, COO")
    await expect(dialog.getByTestId("provision-submit")).toBeEnabled()
    await dialog.getByTestId("provision-submit").click()
    await expectToast(page, new RegExp(`${clientName} provisioned`))
    await expect(page).toHaveURL(/\/lead\/clients\/[0-9a-f-]{36}/)
    await expect(page.getByTestId("client-detail")).toBeVisible()
    await expect(page.getByRole("heading", { level: 1 })).toContainText(clientName)
    await expect(page.getByTestId("client-detail")).toContainText("of 12 seats")
    await expect(page.getByTestId("setup-checklist")).toBeVisible()
    await expect(page.getByTestId("setup-checklist")).toHaveAttribute("data-total", "8")

    await page.goto("/lead/clients")
    await expect(page.getByTestId("clients-table").getByTestId("client-row").filter({ hasText: clientName })).toBeVisible()
    await page.getByTestId("client-switcher").click()
    await expect(page.getByTestId("client-switcher-option").filter({ hasText: clientName })).toBeVisible()
    await page.keyboard.press("Escape")
  })
})
