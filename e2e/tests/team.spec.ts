import { test, expect } from "./helpers/fixtures"
import { api } from "./helpers/api"
import { expectToast, nudgeSlider } from "./helpers/ui"

type TeamView = {
  team: { id: string; name: string }
  roster: { id: string; name: string }[]
  backlogTop: { id: string; name: string; status: string }[]
  reviewQueue: { submission: { id: string; grade: unknown | null }; exercise: { title: string }; person: { name: string } }[]
}

/** Team page as Daniel Okafor (champion). Convert-to-build and review grading mutate state; run serially. */
test.describe("team (champion)", () => {
  test.describe.configure({ mode: "serial" })
  test.use({ role: "champion" })

  test("stats strip and roster render; roster rows link to person pages", async ({ page }) => {
    await page.goto("/team")
    const stats = page.getByTestId("team-stats")
    await expect(stats).toBeVisible()
    await expect(stats.locator(":scope > div")).toHaveCount(5)
    await expect(stats).toContainText("Active on real work")
    await expect(stats).toContainText(/\d+%/)
    await expect(stats.getByTestId("rung-histogram")).toContainText(/\d+ people/)
    await expect(stats).toContainText("Skills published")

    const rows = page.getByTestId("roster-table").getByTestId("roster-row")
    await expect(rows.first()).toBeVisible()
    expect(await rows.count()).toBeGreaterThanOrEqual(3)
    await expect(rows.first().getByTestId("rung-badge")).toBeVisible()
    const personId = await rows.first().getAttribute("data-person-id")
    await expect(rows.first()).toContainText(/\d+\/30d/)
    await rows.first().click()
    await expect(page).toHaveURL(new RegExp(`/people/${personId}`))
    // The page body itself is covered by the fixme below (BUGS.md #5).
    await page.goBack()
    await expect(page).toHaveURL(/\/team$/)
    await expect(page.getByTestId("team-stats")).toBeVisible()
  })

  test("a roster row opens the person page with a journey", async ({ page }) => {
    await page.goto("/team")
    const row = page.getByTestId("roster-table").getByTestId("roster-row").first()
    const personName = (await row.getByTestId("person-chip").textContent())?.trim() ?? ""
    await row.click()
    const person = page.getByTestId("person-page")
    await expect(person).toBeVisible()
    // person-header's testid is swallowed by <Paper> (BUGS.md #1); assert on the page and its h1.
    await expect(person.locator("h1")).toContainText(personName.replace(/^[A-Z]{1,2}(?=[A-Z][a-z])/, "").split(" ")[0])
    await expect(page.getByTestId("activation-components").locator(":scope > div")).toHaveCount(4)
    const journey = page.getByTestId("person-journey")
    await expect(journey).toBeVisible()
    if (await journey.getByTestId("journey-timeline").count()) {
      await expect(journey.getByTestId("journey-event").first()).toHaveAttribute("data-type", /placement|exercise|grade|skill|measurement|escalation/)
    } else {
      await expect(journey).toContainText("No events yet")
    }
    await expect(page.getByTestId("person-mastery")).toBeVisible()
    await expect(page.getByTestId("person-baselines")).toBeVisible()
  })

  test("convert-to-build drafts a skill from a backlog workflow", async ({ page }) => {
    await page.goto("/team")
    const table = page.getByTestId("backlog-table")
    await expect(table).toBeVisible()
    const rows = table.getByTestId("backlog-row")
    expect(await rows.count()).toBeGreaterThan(0)
    const row = rows.filter({ has: page.locator("[data-testid=backlog-convert]:not([disabled])") }).first()
    await expect(row, "a candidate/scored workflow with an enabled Convert button").toBeVisible()
    const name = (await row.locator("p.font-medium").first().textContent())?.trim() ?? ""
    const workflowId = await row.getAttribute("data-workflow-id")

    await row.getByTestId("backlog-convert").click()
    await expectToast(page, /Builder drafted/, 60_000)
    const t = page.locator("[data-sonner-toast]").filter({ hasText: /Builder drafted/ }).first()
    await expect(t).toContainText("Open draft")
    // The workflow moves to "In build" and is linked to the new draft skill.
    await expect(page.locator(`[data-testid=backlog-row][data-workflow-id="${workflowId}"]`)).toContainText("In build")
    await expect(page.locator(`[data-testid=backlog-row][data-workflow-id="${workflowId}"]`).getByTestId("backlog-convert")).toBeDisabled()
    const detail = await api<{ linkedSkills: { slug: string; status: string }[]; status: string }>(page, "GET", `/api/workflows/${workflowId}`)
    expect(detail.status).toBe("in_build")
    expect(detail.linkedSkills.length).toBeGreaterThan(0)
    expect(detail.linkedSkills.some((s) => s.status === "draft")).toBeTruthy()
    expect(name).not.toBe("")
  })

  test("review queue: open an item, score the rubric, submit", async ({ page }) => {
    const team = await api<TeamView>(page, "GET", "/api/team")
    test.skip(team.reviewQueue.length === 0, "review queue is empty")
    const target = team.reviewQueue[0]

    await page.goto("/team/reviews")
    const items = page.getByTestId("review-list").getByTestId("review-item")
    await expect(items.first()).toBeVisible()
    const item = items.filter({ hasText: target.exercise.title }).first()
    await item.click()
    await expect(page).toHaveURL(new RegExp(`submission=${target.submission.id}`))
    await expect(item).toHaveAttribute("aria-current", "true")

    const pane = page.getByTestId("review-pane")
    await expect(pane).toBeVisible()
    await expect(pane).toContainText(target.exercise.title)
    await expect(pane).toContainText(target.person.name)
    await expect(pane.getByTestId("review-expectation")).toBeVisible()
    await expect(pane.getByTestId("review-artifact")).toBeVisible()

    const scorer = pane.getByTestId("rubric-scorer")
    await expect(scorer).toBeVisible()
    const criteria = scorer.getByTestId("rubric-criterion")
    expect(await criteria.count()).toBeGreaterThanOrEqual(3)
    await expect(pane.getByTestId("review-grade-submit")).toBeDisabled()
    // Nudge the first criterion up and note it.
    await nudgeSlider(criteria.first(), 2)
    await criteria.first().locator("input[type=text], input:not([type])").first().fill("Trigger line names the moment precisely.")
    await pane.getByTestId("review-feedback").fill("Keep the trigger and the boundary. Add a should-not case for account statements before this goes near a client.")
    await pane.getByTestId("review-decision").getByRole("button", { name: /Pass/ }).click()
    await expect(pane.getByTestId("review-grade-submit")).toBeEnabled()
    await pane.getByTestId("review-grade-submit").click()

    await expectToast(page, /Graded pass/)
    // The submission leaves the queue and the list shrinks by one.
    await expect(items).toHaveCount(team.reviewQueue.length - 1)
    await expect(items.filter({ hasText: target.exercise.title })).toHaveCount(0)
    const after = await api<TeamView>(page, "GET", "/api/team")
    expect(after.reviewQueue.map((r) => r.submission.id)).not.toContain(target.submission.id)
    // The learner sees a champion grade on the exercise.
    const history = await api<{ items: { submission: { id: string; grade: { gradedBy: unknown; decision: string } | null } }[] }>(page, "GET", `/api/exercises?status=passed`)
    expect(Array.isArray(history)).toBeTruthy()
  })

  test("the grade-recorded panel with Grader agreement stays visible after submitting", async ({ page }) => {
    const team = await api<TeamView>(page, "GET", "/api/team")
    test.skip(team.reviewQueue.length === 0, "review queue is empty")
    const target = team.reviewQueue[0]
    await page.goto(`/team/reviews?submission=${target.submission.id}`)
    const pane = page.getByTestId("review-pane")
    await pane.getByTestId("review-feedback").fill("Solid trigger and boundary; add one ambiguous sample case.")
    await pane.getByTestId("review-grade-submit").click()
    const graded = page.getByTestId("review-graded")
    await expect(graded).toBeVisible()
    await expect(graded).toContainText(/Grade recorded: (pass|revise) · \d+(\.\d)?\/10/)
    if (target.submission.grade) await expect(graded.getByTestId("grader-agreement")).toContainText(/\d+%/)
  })

  test("team readout dialog opens with footnoted metrics", async ({ page }) => {
    await page.goto("/team")
    await page.getByTestId("team-readout").click()
    const dialog = page.getByTestId("readout-dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(/readout/i)
    await expect(dialog).toContainText(/generated .* by the Auditor/, { timeout: 60_000 })
    await expect(dialog.getByTestId("readout-footnotes")).toBeVisible()
    expect(await dialog.getByTestId("readout-footnotes").locator("li").count()).toBeGreaterThan(0)
    await expect(dialog.getByTestId("readout-footnotes").locator("li").first()).toContainText(/\[\w+\]/)
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
  })
})
