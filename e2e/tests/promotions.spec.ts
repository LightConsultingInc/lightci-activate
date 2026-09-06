import { test, expect } from "./helpers/fixtures"
import { api } from "./helpers/api"
import { expectToast } from "./helpers/ui"

type PromotionView = {
  id: string
  decision: "pending" | "approved" | "merged" | "sent_back" | "withdrawn"
  highExposure: boolean
  requiredApproverRoles: string[]
  approvals: { role: string; decision: string }[]
  skill: { slug: string; name: string }
  requestedBy: { name: string }
}

/**
 * Promotion queue as Daniel Okafor (champion). The seed leaves two pending requests: a high-exposure
 * one already approved by the champion (waiting on compliance) and a champion-only one with no
 * approvals yet. Approving the latter merges it; the former's buttons are disabled for Daniel.
 */
test.describe("promotions (champion)", () => {
  test.describe.configure({ mode: "serial" })
  test.use({ role: "champion" })

  let pending: PromotionView[] = []
  let championOnly: PromotionView | undefined
  let highExposure: PromotionView | undefined

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: "playwright/.auth/champion.json" })
    const page = await ctx.newPage()
    pending = await api<PromotionView[]>(page, "GET", "/api/promotions?state=pending")
    highExposure = pending.find((p) => p.highExposure)
    championOnly = pending.find((p) => !p.highExposure && p.requiredApproverRoles.every((r) => r === "champion") && !p.approvals.some((a) => a.decision === "approve"))
    await ctx.close()
  })

  test("pending list flags compliance-required requests", async ({ page }) => {
    await page.goto("/promotions")
    await expect(page.getByTestId("promotions-state")).toBeVisible()
    await expect(page.getByTestId("promotions-state").getByRole("button", { name: "Pending" })).toHaveAttribute("aria-pressed", "true")
    const cards = page.getByTestId("promotion-card")
    await expect(cards).toHaveCount(pending.length)
    for (const c of await cards.all()) await expect(c).toHaveAttribute("data-decision", "pending")

    test.skip(!highExposure, "no high-exposure pending request in the seed")
    const high = page.getByTestId("promotions-high-exposure")
    await expect(high).toBeVisible()
    await expect(high).toContainText("Compliance approval required")
    const highCard = high.getByTestId("promotion-card").filter({ hasText: highExposure!.skill.name })
    await expect(highCard).toBeVisible()
    await expect(highCard).toContainText("Compliance required")
    await expect(highCard).toContainText("compliance")
    await expect(page.getByTestId("promotions-list").getByTestId("promotion-card").first()).toBeVisible()
  })

  test("approval panel shows diff, grade and boundary check; approving merges", async ({ page }) => {
    test.skip(!championOnly, "no champion-only pending request in the seed")
    await page.goto("/promotions")
    await page.getByTestId("promotions-list").getByTestId("promotion-card").filter({ hasText: championOnly!.skill.name }).click()
    await expect(page).toHaveURL(new RegExp(`/promotions/${championOnly!.id}`))

    const panel = page.getByTestId("approval-panel")
    await expect(panel).toBeVisible()
    await expect(panel).toHaveAttribute("data-decision", "pending")
    await expect(panel.getByTestId("compliance-banner")).toHaveCount(0)
    await expect(panel).toContainText(championOnly!.skill.name)
    await expect(panel).toContainText(`Requested by`)
    await expect(panel).toContainText(championOnly!.requestedBy.name)
    await expect(panel.getByTestId("boundary-check")).toBeVisible()
    await expect(panel.getByTestId("boundary-check")).toContainText(/OK: within the org boundary|Human review required|Restricted classes touched|Missing declarations/)
    await expect(panel.getByTestId("diff-summary")).toContainText(/\d+ files?/)
    await expect(panel.getByTestId("line-diff")).toBeVisible()
    await expect(panel.getByTestId("line-diff")).toContainText(/\+\d+/)
    await panel.getByTestId("line-diff").getByTestId("diff-mode").getByRole("button", { name: /Side-by-side/ }).click()
    await expect(panel.getByTestId("line-diff")).toContainText("Proposed")
    const grade = panel.getByTestId("grade-card")
    if (await grade.count()) await expect(grade).toContainText(/\/10/)
    else await expect(panel).toContainText("No grade attached")
    await expect(panel.getByTestId("approvals")).toContainText("champion")
    await expect(panel.getByTestId("approvals")).toContainText("waiting")
    await expect(panel.getByTestId("decision-timeline")).toContainText("Awaiting champion")
    await expect(panel.getByTestId("timeline-approval")).toHaveCount(0)

    await expect(panel.getByTestId("promotion-approve")).toBeEnabled()
    await panel.getByTestId("approval-note").fill("Read the SKILL.md and the sample cases; boundary matches the team's declared classes.")
    await panel.getByTestId("promotion-approve").click()
    await expectToast(page, /Merged and published|Approved/, 60_000)

    await expect(panel).toHaveAttribute("data-decision", "merged")
    await expect(panel.getByTestId("timeline-approval")).toHaveCount(1)
    await expect(panel.getByTestId("timeline-approval")).toContainText(/Champion approved/i)
    await expect(panel.getByTestId("decision-timeline")).toContainText("Merged and published")
    await expect(panel.getByTestId("merged-tag")).toBeVisible()
    await expect(panel.getByTestId("merged-tag")).toContainText(`${championOnly!.skill.slug}@v`)
    await expect(panel.getByTestId("approval-actions")).toHaveCount(0)
    const after = await api<PromotionView & { skill: { status: string } }>(page, "GET", `/api/promotions/${championOnly!.id}`)
    expect(after.decision).toBe("merged")
    expect(after.skill.status).toBe("published")
  })

  test("send-back is gated by approver role; the All toggle shows history", async ({ page }) => {
    test.skip(!highExposure, "no high-exposure pending request in the seed")
    await page.goto(`/promotions/${highExposure!.id}`)
    const panel = page.getByTestId("approval-panel")
    await expect(panel).toBeVisible()
    await expect(panel.getByTestId("compliance-banner")).toBeVisible()
    await expect(panel.getByTestId("compliance-banner")).toContainText("Compliance approval required")
    await expect(panel.getByTestId("approvals")).toContainText("compliance")
    const alreadyApprovedByChampion = highExposure!.approvals.some((a) => a.role === "champion" && a.decision === "approve")
    if (alreadyApprovedByChampion) {
      // Daniel's role has already signed; only a compliance approver may act now.
      await expect(panel.getByTestId("promotion-send-back")).toBeDisabled()
      await expect(panel.getByTestId("promotion-approve")).toBeDisabled()
      await expect(panel.getByTestId("approval-actions")).toContainText(/not one of the required approvers|someone else must approve/)
      await expect(panel.getByTestId("timeline-approval")).toHaveCount(1)
    } else {
      await panel.getByTestId("promotion-send-back").click()
      await expect(panel.getByTestId("send-back-confirm")).toBeDisabled()
      await page.getByTestId("send-back-note").fill("Declare account_numbers under must-never-receive and add a should-not case for statements.")
      await page.getByTestId("send-back-confirm").click()
      await expectToast(page, /Sent back/)
      await expect(panel).toHaveAttribute("data-decision", "sent_back")
    }

    await page.goto("/promotions")
    await page.getByTestId("promotions-state").getByRole("button", { name: "All" }).click()
    const all = page.getByTestId("promotion-card")
    await expect.poll(async () => all.count()).toBeGreaterThan(pending.length)
    await expect(all.filter({ has: page.locator("[data-testid=decision-chip][data-decision=merged]") }).first()).toBeVisible()
    await expect(all.filter({ has: page.locator("[data-testid=decision-chip][data-decision=sent_back]") }).first()).toBeVisible()
  })
})
