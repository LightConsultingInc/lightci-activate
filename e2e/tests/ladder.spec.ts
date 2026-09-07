import { test, expect } from "./helpers/fixtures"

/**
 * Home ("Your path") and a module page as Priya Nair (seeded L2 learner with revisits due and
 * adopted skills). Home shows six module cards and one "Up next"; a module has Learn · Practice ·
 * Feedback tabs; a lesson opens with its title, promise and minutes and completes with a one-question check.
 */
test.describe("home: your path", () => {
  test.use({ role: "learner" })

  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("ladder-view")).toBeVisible()
  })

  test("slim header shows the person, current module and hours back", async ({ page }) => {
    const header = page.getByTestId("ladder-header")
    await expect(header).toBeVisible()
    await expect(page.getByTestId("ladder-name")).toContainText("Priya Nair")
    await expect(header).toContainText(/L[0-5]\s/)
    await expect(page.getByTestId("hours-back")).toContainText(/\d/)
    await expect(page.getByTestId("hours-back")).toContainText("h")
    // No competency wall, judgement panel or coach-notes wall on the home page any more.
    await expect(page.getByTestId("competencies-panel")).toHaveCount(0)
    await expect(page.getByTestId("judgement-panel")).toHaveCount(0)
    await expect(page.getByTestId("coach-notes")).toHaveCount(0)
  })

  test("six module cards L0–L5 with locked / current / done states", async ({ page }) => {
    const cards = page.getByTestId("module-card")
    await expect(cards).toHaveCount(6)
    for (const code of ["L0", "L1", "L2", "L3", "L4", "L5"]) {
      const card = page.locator(`[data-testid=module-card][data-code=${code}]`)
      await expect(card, `module card ${code}`).toBeVisible()
      await expect(card).toHaveAttribute("href", `/modules/${code}`)
      await expect(card).toHaveAttribute("data-state", /locked|current|done/)
      await expect(card.locator("[role=meter]")).toHaveAttribute("aria-valuenow", /\d+/)
      await expect(card).toContainText(/\d+\/\d+ lessons/)
      await expect(card).toContainText(/\d+\/\d+ practice/)
    }
    await expect(page.locator("[data-testid=module-card][data-state=current]")).toHaveCount(1)
    // Earlier modules are done, later ones locked.
    const current = Number((await page.locator("[data-testid=module-card][data-state=current]").getAttribute("data-code"))!.slice(1))
    for (let r = 0; r < current; r++) await expect(page.locator(`[data-testid=module-card][data-code=L${r}]`)).toHaveAttribute("data-state", "done")
    for (let r = current + 1; r <= 5; r++) await expect(page.locator(`[data-testid=module-card][data-code=L${r}]`)).toHaveAttribute("data-state", "locked")
  })

  test("up next says in plain words what to do now", async ({ page }) => {
    const card = page.getByTestId("up-next")
    await expect(card).toBeVisible()
    await expect(card).toContainText("Up next")
    await expect(card).toHaveAttribute("data-kind", /lesson|practice|empty/)
    const kind = await card.getAttribute("data-kind")
    if (kind === "lesson") {
      await expect(page.getByTestId("up-next-title")).toContainText(/^Watch ‘.+’ \(\d+ min\)/)
      await expect(page.getByTestId("up-next-lesson")).toHaveAttribute("href", /\/modules\/L[0-5]\/learn\//)
    } else if (kind === "practice") {
      await expect(page.getByTestId("up-next-title").first()).toContainText(/^Practice: .+\(\d+ min\)/)
    }
    if (await page.getByTestId("next-up-start").count()) {
      await expect(page.getByTestId("next-up-start")).toHaveAttribute("href", /\/exercise\/[0-9a-f-]{36}/)
    }
  })

  test("my skills strip still lists adopted skills", async ({ page }) => {
    const panel = page.getByTestId("my-skills-panel")
    await expect(panel).toBeVisible()
    const adopted = panel.getByTestId("adopted-skill")
    expect(await adopted.count()).toBeGreaterThanOrEqual(1)
    await expect(adopted.first().locator("a")).toHaveAttribute("href", /\/library\//)
  })

  test("answering a quick recap grades it and removes it from the due list", async ({ page }) => {
    test.setTimeout(180_000) // a real grader can take a minute
    const due = page.getByTestId("revisits-due")
    await expect(due).toBeVisible()
    await expect(due).toContainText("Quick recaps")
    const rows = due.getByTestId("revisit-row")
    const before = await rows.count()
    expect(before, "seed should leave Priya with recaps due").toBeGreaterThan(0)
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
    await expect(result).toBeVisible({ timeout: 120_000 })
    await expect(result).toContainText(/\/ 100/)
    await expect(result).toContainText("Next revisit")
    await sheet.getByTestId("revisit-done").click()
    await expect(sheet).toBeHidden()
    await expect(rows).toHaveCount(before - 1)
  })
})

test.describe("module page", () => {
  test.use({ role: "learner" })

  async function openCurrentModule(page: import("@playwright/test").Page) {
    await page.goto("/")
    const current = page.locator("[data-testid=module-card][data-state=current]")
    const code = (await current.getAttribute("data-code"))!
    await current.click()
    await expect(page).toHaveURL(new RegExp(`/modules/${code}$`))
    await expect(page.getByTestId("module-view")).toBeVisible()
    return code
  }

  test("header has the name, tagline and three outcomes; tabs are Learn · Practice · Feedback", async ({ page }) => {
    const code = await openCurrentModule(page)
    await expect(page.getByTestId("module-view")).toHaveAttribute("data-code", code)
    await expect(page.getByTestId("module-name")).not.toBeEmpty()
    await expect(page.getByTestId("module-outcomes").locator("li")).toHaveCount(3)
    const tabs = page.getByTestId("module-tabs")
    await expect(tabs).toBeVisible()
    await expect(tabs).toContainText("Learn")
    await expect(tabs).toContainText("Practice")
    await expect(tabs).toContainText("Feedback")
    // Old vocabulary is gone.
    await expect(page.getByText(/State your expectation|Critique the output|Judgement/)).toHaveCount(0)
  })

  test("Learn tab lists lessons and a lesson page reads through to its check", async ({ page }) => {
    const code = await openCurrentModule(page)
    const cards = page.getByTestId("lesson-card")
    expect(await cards.count()).toBeGreaterThanOrEqual(3)
    // A lesson still being tailored is a waiting card, not a link; wait for the first one that opens.
    const lessons = page.locator('a[data-testid="lesson-card"]')
    await expect(lessons.first()).toBeVisible({ timeout: 60_000 })
    await expect(lessons.first()).toContainText(/\d+ min/)
    const slug = (await lessons.first().getAttribute("data-slug"))!
    await expect(lessons.first()).toHaveAttribute("href", `/modules/${code}/learn/${slug}`)
    await lessons.first().click()

    await expect(page.getByTestId("lesson-view")).toBeVisible()
    await expect(page.getByTestId("lesson-title")).not.toBeEmpty()
    await expect(page.getByTestId("lesson-view")).toContainText(/Lesson \d+ of \d+/)
    await expect(page.getByTestId("lesson-view")).toContainText(/\d+ min/)
    // No animated explainer any more; the body leads.
    await expect(page.getByTestId("explainer")).toHaveCount(0)
    await expect(page.getByTestId("lesson-key-points").locator("li")).toHaveCount(3)
    // Example and check come from /lessons/:slug/personalised (static content while loading).
    const example = page.getByTestId("lesson-example")
    await expect(example).toBeVisible()
    await expect(example.locator(".eyebrow").first()).toHaveText(/Try this|For example/)
    await expect(example).toHaveAttribute("data-personalised", /true|false/)
    if ((await example.getAttribute("data-personalised")) === "true") await expect(page.getByTestId("lesson-tailored")).toContainText("Tailored to your work")

    const options = page.getByTestId("lesson-check-option")
    expect(await options.count()).toBeGreaterThanOrEqual(2)
    await expect(page.getByTestId("lesson-done")).toHaveCount(0)
    await options.first().click()
    await expect(page.getByTestId("lesson-check-explanation")).toBeVisible()
    await expect(page.locator("[data-testid=lesson-check-option][data-state=correct]")).toHaveCount(1)
    await expect(page.getByTestId("lesson-done")).toBeVisible()
    await expect(options.first()).toBeDisabled()

    // Back on the module the lesson is ticked and the count reflects it.
    await page.getByTestId("lesson-back-to-module").click()
    await expect(page.getByTestId("module-view")).toBeVisible()
    await expect(page.locator(`[data-testid=lesson-card][data-slug="${slug}"]`)).toHaveAttribute("data-done", "true")
    await expect(page.getByTestId("lessons-done-count")).toContainText(/[1-9]/)
  })

  test("Practice tab lists this module's exercises or explains what practice looks like", async ({ page }) => {
    await openCurrentModule(page)
    await page.getByTestId("module-tab-practice").click()
    await expect(page).toHaveURL(/tab=practice/)
    const tab = page.getByTestId("practice-tab")
    await expect(tab).toBeVisible()
    await expect(tab).toContainText("What practice looks like here")
    const cards = tab.getByTestId("practice-card")
    if (await cards.count()) {
      const first = cards.first()
      await expect(first.getByTestId("practice-title")).not.toBeEmpty()
      await expect(first).toContainText(/~?\d+ min/)
      await expect(first.getByTestId("practice-start")).toHaveAttribute("href", /\/exercise\/[0-9a-f-]{36}/)
      await expect(first.getByTestId("practice-start")).toHaveText(/Start|Continue|Try again|Review/)
    } else {
      await expect(tab).toContainText("No practice here yet")
    }
  })

  test("Feedback tab: plain-words progress, grades, coach notes and this module's competency rows", async ({ page }) => {
    await openCurrentModule(page)
    await page.getByTestId("module-tab-feedback").click()
    await expect(page).toHaveURL(/tab=feedback/)
    await expect(page.getByTestId("module-progress-words")).not.toBeEmpty()
    await expect(page.getByTestId("module-grades")).toBeVisible()
    await expect(page.getByTestId("coach-notes")).toBeVisible()
    const rows = page.getByTestId("module-competencies").getByTestId("competency-row")
    expect(await rows.count()).toBeGreaterThanOrEqual(1)
    await expect(rows.first().locator("[role=meter]")).toHaveAttribute("aria-valuenow", /\d+/)
    await expect(page.getByTestId("revisits-due")).toBeVisible()
  })
})
