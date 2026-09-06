import { test, expect } from "./helpers/fixtures"
import { intOf } from "./helpers/ui"

/** My Ladder as Priya Nair (seeded L2 learner with three revisits due and three adopted skills). */
test.describe("ladder", () => {
  test.use({ role: "learner" })

  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("ladder-view")).toBeVisible()
  })

  test("header shows the person, rung and hours back", async ({ page }) => {
    const header = page.getByTestId("ladder-header")
    await expect(header).toBeVisible()
    await expect(page.getByTestId("ladder-name")).toContainText("Priya Nair")
    await expect(header.getByTestId("rung-ring")).toBeVisible()
    await expect(header).toContainText(/L[0-5]\s/)
    await expect(page.getByTestId("hours-back")).toContainText(/\d/)
    await expect(page.getByTestId("hours-back")).toContainText("h")
    await expect(page.getByTestId("streak-days")).toContainText(/\d+/)
    await expect(page.getByTestId("gate-checklist").locator("li")).toHaveCount(4)
  })

  test("next-up card is present with a start action", async ({ page }) => {
    const title = page.getByTestId("next-up-title")
    await expect(title).toBeVisible()
    await expect(title).not.toBeEmpty()
    // The card's own testid is dropped by <Paper> (see BUGS.md #1); scope to the nearest section instead.
    const card = title.locator("xpath=ancestor::div[contains(@class,'paper-grid')][1]")
    await expect(card).toContainText("Next up")
    await expect(card.getByTestId("rung-badge")).toBeVisible()
    await expect(card.getByTestId("mode-badge")).toBeVisible()
    await expect(card).toContainText(/~\d+ min/)
    await expect(page.getByTestId("next-up-rationale")).not.toBeEmpty()
    await expect(page.getByTestId("next-up-start")).toBeVisible()
    await expect(page.getByTestId("next-up-start")).toHaveAttribute("href", /\/exercise\/[0-9a-f-]{36}/)
  })

  test("next-up card exposes its data-testid", async ({ page }) => {
    await expect(page.getByTestId("next-up-card")).toBeVisible()
  })

  test("competencies panel groups L0–L5 with mastery rows", async ({ page }) => {
    const panel = page.getByTestId("competencies-panel")
    await expect(panel).toBeVisible()
    for (const r of [0, 1, 2, 3, 4, 5]) {
      await expect(panel.getByTestId(`competency-group-${r}`), `competency group L${r}`).toBeVisible()
    }
    const rows = panel.getByTestId("competency-row")
    expect(await rows.count()).toBeGreaterThanOrEqual(6)
    await expect(rows.first().getByTestId("competency-status")).toBeVisible()
    await expect(rows.first().locator("[role=meter]")).toHaveAttribute("aria-valuenow", /\d+/)
    // The components popover explains the mastery formula.
    await rows.first().getByTestId("competency-components-trigger").click()
    await expect(page.getByText("Artifact score")).toBeVisible()
    await page.keyboard.press("Escape")
  })

  test("judgement panel shows a score with calibration and critique meters", async ({ page }) => {
    const panel = page.getByTestId("judgement-panel")
    await expect(panel).toBeVisible()
    await expect(page.getByTestId("judgement-score")).toContainText("%")
    await expect(panel.locator("[role=meter]")).toHaveCount(2)
    await expect(page.getByTestId("judgement-explanation")).not.toBeEmpty()
  })

  test("my skills panel lists adopted skills", async ({ page }) => {
    const panel = page.getByTestId("my-skills-panel")
    await expect(panel).toBeVisible()
    const adopted = panel.getByTestId("adopted-skill")
    await expect(adopted.first()).toBeVisible()
    expect(await adopted.count()).toBeGreaterThanOrEqual(1)
    await expect(adopted.first()).toContainText(/uses \/ 30d/)
    await expect(adopted.first().locator("a")).toHaveAttribute("href", /\/library\//)
  })

  test("answering a revisit grades it and removes it from the due list", async ({ page }) => {
    const due = page.getByTestId("revisits-due")
    await expect(due).toBeVisible()
    const rows = due.getByTestId("revisit-row")
    const before = await rows.count()
    expect(before, "seed should leave Priya with revisits due").toBeGreaterThan(0)
    const firstName = (await rows.first().locator("p").first().textContent())?.trim() ?? ""

    await rows.first().getByTestId("revisit-open").click()
    const sheet = page.getByTestId("revisit-sheet")
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText(firstName)
    await expect(sheet.getByTestId("revisit-submit")).toBeDisabled()
    await sheet.getByTestId("revisit-answer-input").fill("From memory: I would flag that the figures were not supplied, ask for the source, and refuse to let Claude assert a comparison it cannot ground. Every number needs a source line before it ships.")
    await expect(sheet.getByTestId("revisit-submit")).toBeEnabled()
    await sheet.getByTestId("revisit-submit").click()

    const result = sheet.getByTestId("revisit-result")
    await expect(result).toBeVisible({ timeout: 30_000 })
    await expect(result).toContainText(/\/ 100/)
    await expect(result).toContainText("Next revisit")
    await expect(result).toContainText("Feedback")
    await sheet.getByTestId("revisit-done").click()
    await expect(sheet).toBeHidden()
    await expect(rows).toHaveCount(before - 1)
  })
})
