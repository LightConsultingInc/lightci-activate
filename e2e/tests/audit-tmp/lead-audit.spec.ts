import { test, expect } from "../helpers/fixtures"
import { api } from "../helpers/api"
import { expectToast, intOf, selectOption, toast } from "../helpers/ui"

const NG = "274339fc-fabf-48c1-a497-842c5394c24a"
const MW = "f6c0e4cd-8845-40b6-b9e2-abeb2e9796d5"

test.describe("audit: lead console as Zain", () => {
  test.describe.configure({ mode: "serial" })
  test.use({ role: "lead" })

  test("5a. four columns populated; resolve from drawer; assign to Daniel", async ({ page }) => {
    await page.context().clearCookies({ name: "activate_org" })
    await page.goto("/lead")
    await expect(page.getByTestId("lead-columns")).toBeVisible()
    for (const c of ["escalations", "approvals", "stalled", "waves"]) console.log("COL", c, await intOf(page.getByTestId(`lead-col-${c}-count`)))
    expect(await intOf(page.getByTestId("lead-col-escalations-count"))).toBeGreaterThan(0)
    expect(await intOf(page.getByTestId("lead-col-stalled-count"))).toBeGreaterThan(0)
    expect(await intOf(page.getByTestId("lead-col-waves-count"))).toBeGreaterThan(0)
    const firstCard = page.getByTestId("lead-escalation-card").first()
    console.log("FIRST CARD META:", (await firstCard.textContent())?.slice(0, 200))

    // assign the Laura Chen (stalled) escalation to Daniel via the drawer
    const laura = page.getByTestId("lead-escalation-card").filter({ hasText: "Laura Chen" })
    await laura.click()
    const drawer = page.getByTestId("escalation-drawer")
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText("Laura Chen")
    await selectOption(page, drawer.getByTestId("escalation-assignee"), /Daniel Okafor/)
    await drawer.getByTestId("escalation-assign").click()
    const t = toast(page, /Assigned|Couldn't assign/).first()
    await expect(t).toBeVisible()
    console.log("ASSIGN TOAST:", await t.textContent())
    await page.keyboard.press("Escape")
    await expect(drawer).toBeHidden()

    // resolve the Rajesh Menon escalation
    const before = await intOf(page.getByTestId("lead-col-escalations-count"))
    await page.getByTestId("lead-escalation-card").filter({ hasText: "Rajesh Menon" }).click()
    await expect(drawer).toBeVisible()
    await drawer.getByTestId("escalation-resolution").fill("Audit: manager conversation held; plan-season workload reduced for two weeks.")
    await drawer.getByTestId("escalation-resolve").click()
    const t2 = toast(page, /Escalation resolved|Couldn't resolve/).first()
    await expect(t2).toBeVisible()
    console.log("RESOLVE TOAST:", await t2.textContent())
    if ((await t2.textContent())?.includes("resolved")) {
      await expect(drawer).toBeHidden()
      await expect(page.getByTestId("lead-col-escalations-count")).toHaveText(String(before - 1))
    }
  })

  test("5b. client switcher scopes the app; Northgate pages are empty-but-valid", async ({ page }) => {
    await page.goto("/lead")
    await page.getByTestId("client-switcher").click()
    const opts = page.getByTestId("client-switcher-option")
    await expect(opts.filter({ hasText: "Meridian Wealth Partners" })).toBeVisible()
    await expect(opts.filter({ hasText: "Northgate Advisory" })).toBeVisible()
    await opts.filter({ hasText: "Northgate Advisory" }).click()
    await page.waitForLoadState("load")
    await expect(page.getByTestId("topbar-org")).toContainText("Northgate Advisory")
    await expect(page.getByTestId("client-switcher")).toContainText("Northgate")
    // Mission Control for Northgate
    const errs: string[] = []
    page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400) errs.push(`${r.status()} ${new URL(r.url()).pathname}`) })
    for (const path of ["/mission-control", "/mission-control/groups", "/mission-control/governance", "/library", "/team", "/admin/marketplace", "/admin/teams"]) {
      await page.goto(path)
      await page.waitForLoadState("networkidle")
      const body = (await page.getByTestId("page-main").textContent()) ?? ""
      console.log("PAGE", path, "| org:", await page.getByTestId("topbar-org").textContent().catch(() => "?"), "| crashed:", /Application error|Unhandled|Something went wrong/i.test(body), "| snippet:", body.replace(/\s+/g, " ").slice(0, 140))
    }
    console.log("API ERRORS while scoped to Northgate:", JSON.stringify(errs))
    // switch back to Meridian
    await page.goto("/lead")
    await page.getByTestId("client-switcher").click()
    await page.getByTestId("client-switcher-option").filter({ hasText: "Meridian Wealth Partners" }).click()
    await page.waitForLoadState("load")
    await expect(page.getByTestId("topbar-org")).toContainText("Meridian")
  })

  test("5c. clients table; provision Audit Co; client detail", async ({ page }) => {
    await page.goto("/lead/clients")
    const rows = page.getByTestId("clients-table").getByTestId("client-row")
    await expect(rows.filter({ hasText: "Meridian Wealth Partners" })).toBeVisible()
    await expect(rows.filter({ hasText: "Northgate Advisory" })).toBeVisible()
    console.log("CLIENT ROWS", await rows.count())
    await page.getByTestId("provision-open").click()
    const d = page.getByTestId("provision-dialog")
    await d.getByTestId("provision-name").fill("Audit Co")
    await expect(d.getByTestId("provision-slug")).toHaveValue("audit-co")
    await d.getByTestId("provision-seats").fill("15")
    await d.getByTestId("provision-industry").fill("Audit")
    await d.getByTestId("provision-sponsor").fill("A. Uditor, CFO")
    await d.getByTestId("provision-submit").click()
    await expectToast(page, /Audit Co provisioned/)
    await expect(page).toHaveURL(/\/lead\/clients\/[0-9a-f-]{36}/)
    const id = page.url().split("/").pop()!
    console.log("AUDIT CO ID", id)
    await expect(page.getByTestId("client-detail")).toBeVisible()
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Audit Co")
    await expect(page.getByTestId("setup-checklist")).toHaveAttribute("data-total", "8")
    console.log("AUDIT CO checklist done", await page.getByTestId("setup-checklist").getAttribute("data-done"))
    for (const k of ["anthropic", "claude_compliance", "claude_analytics", "claude_admin", "github"]) await expect(page.getByTestId(`client-integration-${k}`)).toBeVisible()
    console.log("AUDIT CO integrations:", (await page.getByTestId("client-integrations").textContent())?.replace(/\s+/g, " ").slice(0, 300))
    // Meridian detail
    await page.goto(`/lead/clients/${MW}`)
    await expect(page.getByTestId("client-detail")).toBeVisible()
    await expect(page.getByTestId("client-integration-claude_compliance")).toContainText("Verified")
    await expect(page.getByTestId("client-integration-anthropic")).toContainText("Using LightCI's key")
    console.log("MERIDIAN checklist done", await page.getByTestId("setup-checklist").getAttribute("data-done"))
    await expect(page.getByTestId("client-teams")).toContainText("Financial Planning")
  })
})
