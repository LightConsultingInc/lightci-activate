import { test, expect, type Page } from "./helpers/fixtures"
import { accessToken, api, API_URL } from "./helpers/api"
import { expectToast, intOf, nudgeSlider } from "./helpers/ui"

type ExerciseSummary = { id: string; title: string; mode: "in_app" | "in_claude"; status: string; workSurface: string; rung: number }

/**
 * The practice loop as Marcus Reid (seeded L1): Build → Check → Result. His next-up exercise is an
 * active, prompt-surface exercise; a second one is queued. The grade decision depends on the text
 * (and on the provider), so the flow tolerates pass or revise. State is
 * mutated, so this file is serial and self-contained (the seed is reset by 00-reset.spec.ts).
 */
test.describe("practice: build, check, result", () => {
  test.describe.configure({ mode: "serial" })
  test.use({ role: "learner2", viewport: { width: 1440, height: 1200 } })

  let exerciseId = ""
  let exerciseTitle = ""
  let decision: "pass" | "revise" | "" = ""

  const EXPECTATION = "A three-part email (discussed, agreed, need from you) under 200 words, but Claude may invent a performance figure I never quoted."
  const PROMPT = "You are helping me, a wealth advisor, write a follow-up email to the Hendersons after yesterday's meeting. Structure: what we discussed, what we agreed, what we need from you. Under 200 words, warm but plain. Do not mention investment performance or compare to other firms. Facts: inherited IRA distribution plan; moving to quarterly; they will send the updated beneficiary form; they asked about 529s for the grandchildren."
  const NOTE = "The closing action is vague; I would rewrite the ask for the beneficiary form as a single explicit sentence."

  async function openNextUp(page: Page) {
    await page.goto("/")
    const start = page.getByTestId("next-up-start")
    await expect(start).toBeVisible()
    exerciseTitle = (await page.getByTestId("next-up-title").last().textContent())?.trim() ?? ""
    await start.click()
    await expect(page).toHaveURL(/\/exercise\/[0-9a-f-]{36}/)
    exerciseId = page.url().match(/\/exercise\/([0-9a-f-]{36})/)![1]
    await expect(page.getByTestId("exercise-view")).toBeVisible()
    // In-Claude practice opens the pack first; close it to work in the app.
    if (await page.getByTestId("open-in-claude-dialog").isVisible().catch(() => false)) await page.keyboard.press("Escape")
  }

  test("Build opens with the work surface, Coach beside it, and a note-to-self before the first run", async ({ page }) => {
    await openNextUp(page)
    await expect(page.getByTestId("exercise-title")).toHaveText(exerciseTitle)
    await expect(page.getByTestId("work-surface")).toHaveAttribute("data-surface", "prompt")
    await expect(page.getByTestId("coach-panel")).toBeVisible()
    for (const b of ["build", "check", "result"]) await expect(page.getByTestId(`beat-${b}`)).toBeVisible()
    await expect(page.getByTestId("beat-build")).toHaveAttribute("data-state", "current")
    await expect(page.getByTestId("beat-check")).toHaveAttribute("data-state", "upcoming")
    await expect(page.getByTestId("beat-check")).toBeDisabled()
    await expect(page.getByTestId("beat-result")).toBeDisabled()
    await expect(page.getByTestId("expectation-input")).toBeVisible()
    await expect(page.getByTestId("run-button")).toBeDisabled()
    await expect(page.getByTestId("work-continue")).toBeDisabled()
    // No stepper, none of the old step labels.
    await expect(page.getByTestId("stepper")).toHaveCount(0)
    await expect(page.getByText(/State your expectation|Critique the output|Lock in my expectation|Submit for grading/)).toHaveCount(0)

    // The API refuses a run before an expectation is stored (409) regardless of the UI guard.
    if ((await page.getByTestId("expectation-input").inputValue()) === "") {
      const res = await page.request.fetch(`${API_URL}/api/exercises/${exerciseId}/run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await accessToken(page)}`, "Content-Type": "application/json" },
        data: JSON.stringify({ prompt: PROMPT }),
      })
      expect(res.status()).toBe(409)
    }
  })

  test("the note-to-self plus a prompt unlock Run; the run produces mock output", async ({ page }) => {
    await page.goto(`/exercise/${exerciseId}`)
    await expect(page.getByTestId("exercise-view")).toBeVisible()
    await page.getByTestId("prompt-input").fill(PROMPT)
    await expect(page.getByTestId("run-button")).toBeDisabled()
    await page.getByTestId("expectation-input").fill(EXPECTATION)
    await expect(page.getByTestId("run-button")).toBeEnabled()
    await page.getByTestId("run-button").click()
    const output = page.getByTestId("run-output")
    await expect(output).toBeVisible({ timeout: 30_000 })
    // Works with the mock provider and a real model alike: something substantial came back.
    expect(((await output.textContent()) ?? "").length).toBeGreaterThan(120)
    await expect(page.getByTestId("work-continue")).toBeEnabled()
    await expect(page.getByTestId("beat-check")).toBeEnabled()
  })

  test("Coach offers one nudge at a time", async ({ page }) => {
    await page.goto(`/exercise/${exerciseId}`)
    // The note-to-self was stored server-side, so it comes back on reload.
    await expect(page.getByTestId("expectation-input")).toHaveValue(EXPECTATION)
    const coach = page.getByTestId("coach-panel")
    await expect(coach).toContainText("Need a nudge?")
    const count = page.getByTestId("hints-count")
    await expect(count).toContainText(/\d+\/\d+ revealed/)
    const before = await intOf(count)
    const total = Number((await count.textContent())!.match(/\/(\d+)/)![1])
    expect(total).toBeGreaterThan(before)
    await page.getByTestId("hint-button").click()
    await expect(count).toContainText(`${before + 1}/${total} revealed`)
    await expect(page.getByTestId(`hint-${before + 1}`)).toBeVisible()
    // Coach collapses to a rail and comes back.
    await coach.getByTestId("coach-toggle").click()
    await expect(page.getByTestId("coach-panel")).toHaveAttribute("data-open", "false")
    await page.getByTestId("coach-toggle").click()
    await expect(page.getByTestId("coach-panel")).toHaveAttribute("data-open", "true")
  })

  test("Check: tick the self-check, set how likely it is to pass, send; Result shows the grade and your check vs the grader", async ({ page }) => {
    await page.goto(`/exercise/${exerciseId}`)
    await expect(page.getByTestId("beat-build")).toHaveAttribute("data-state", "current")
    // Output does not persist across a reload until submission; run again.
    await page.getByTestId("prompt-input").fill(PROMPT)
    await page.getByTestId("run-button").click()
    await expect(page.getByTestId("run-output")).toBeVisible({ timeout: 30_000 })

    await page.getByTestId("work-continue").click()
    await expect(page.getByTestId("beat-check")).toHaveAttribute("data-state", "current")
    await expect(page.getByTestId("beat-build")).toHaveAttribute("data-state", "done")
    const items = page.getByTestId("self-check-item")
    await expect(items.first()).toBeVisible()
    const n = await items.count()
    expect(n).toBeGreaterThan(0)
    await items.first().click()
    await expect(items.first()).toHaveAttribute("data-checked", "true")
    await expect(page.getByTestId("confidence-value")).toContainText("60%")
    await nudgeSlider(page.getByTestId("confidence-slider"), 2)
    await expect(page.getByTestId("confidence-value")).toContainText("70%")
    await page.getByTestId("check-note").fill(NOTE)
    await expect(page.getByTestId("work-surface")).toContainText("Read-only")
    await page.getByTestId("submit-button").click()

    const result = page.getByTestId("result-beat")
    await expect(result).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId("beat-result")).toHaveAttribute("data-state", "current")
    const card = result.getByTestId("grade-card")
    await expect(card.getByTestId("grade-score")).toContainText(/^\d{1,3}$/)
    await expect(card.getByTestId("rubric-bars")).toBeVisible()
    expect(await card.getByTestId("rubric-bars").locator("li").count()).toBeGreaterThan(0)
    const chip = card.getByTestId("decision-chip")
    decision = ((await chip.getAttribute("data-decision")) ?? "") as typeof decision
    expect(["pass", "revise"]).toContain(decision)
    await expect(card).toHaveAttribute("data-decision", decision)
    await expect(card.getByTestId("teaching-moment")).toBeVisible()
    // Self-check items map onto the grader's rubric criteria.
    const vs = page.getByTestId("check-vs-grader")
    await expect(vs).toBeVisible()
    await expect(page.getByTestId("check-vs-grader-summary")).toContainText(/Agreed on \d+ of \d+/)
    expect(await vs.getByTestId("check-vs-grader-row").count()).toBeGreaterThan(0)
    await expect(page.getByTestId("grade-back-to-module")).toHaveAttribute("href", /\/modules\/L[0-5]\?tab=feedback/)
    await expectToast(page, decision === "pass" ? /Passed/ : /Graded: revise/)
    await expect(page.getByTestId("work-surface")).toContainText("Submitted")
  })

  test("the submission shows in history, in the module's Feedback tab and in the attempt list", async ({ page }) => {
    await page.goto("/history")
    const view = page.getByTestId("history-view")
    await expect(view).toBeVisible()
    const row = page.getByTestId("history-row").filter({ hasText: exerciseTitle }).first()
    await expect(row).toBeVisible()
    await expect(row).toHaveAttribute("data-decision", decision)
    await row.getByTestId("history-row-toggle").click()
    await expect(row.getByTestId("history-row-detail")).toBeVisible()
    // The unticked self-check items and the note travel as the critique.
    await expect(row.getByTestId("history-row-detail")).toContainText(NOTE.slice(0, 40))
    await expect(row.getByTestId("history-row-detail").getByTestId("grade-card")).toBeVisible()

    // The module's Feedback tab lists the same grade.
    await page.goto("/modules/L1?tab=feedback")
    await expect(page.getByTestId("feedback-tab")).toBeVisible()
    const grade = page.getByTestId("module-grade").filter({ hasText: exerciseTitle }).first()
    await expect(grade).toBeVisible()
    await expect(grade).toHaveAttribute("data-decision", decision)

    await page.goto(`/exercise/${exerciseId}`)
    await expect(page.getByTestId("exercise-view")).toBeVisible()
    if (decision === "revise") {
      const history = page.getByTestId("attempt-history")
      await expect(history).toBeVisible()
      await history.locator("button").first().click()
      await expect(history.getByTestId("attempt").first()).toContainText("Attempt 1")
      await expect(history.getByTestId("attempt").first().getByTestId("decision-chip").first()).toHaveAttribute("data-decision", "revise")
    } else {
      await expect(page.getByTestId("exercise-view")).toHaveAttribute("data-status", "passed")
      await expect(page.getByTestId("beat-result")).toHaveAttribute("data-state", "current")
      await expect(page.getByTestId("result-beat").getByTestId("grade-card")).toBeVisible()
    }
  })

  test("in-Claude path: copy the pack, paste the artifact back", async ({ page }) => {
    const all = await api<ExerciseSummary[]>(page, "GET", "/api/exercises?status=queued,active,revise")
    const other = all.find((e) => e.id !== exerciseId && e.mode === "in_claude" && e.workSurface === "prompt")
    test.skip(!other, "no other queued in-Claude prompt exercise for Marcus")
    await page.goto(`/exercise/${other!.id}`)
    await expect(page.getByTestId("exercise-view")).toBeVisible()
    await expect(page.getByTestId("exercise-view")).toHaveAttribute("data-status", /active|revise/)
    await expect(page.getByTestId("mode-badge").first()).toContainText("In Claude")
    const openBtn = page.getByTestId("open-in-claude-button")
    await expect(openBtn).toBeEnabled()
    await openBtn.click()
    const dialog = page.getByTestId("open-in-claude-dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId("claude-pack-prompt")).toContainText(/Activate exercise/i)
    await expect(dialog.getByTestId("claude-pack-context")).not.toBeEmpty()
    await expect(dialog.getByTestId("open-claude-link")).toHaveAttribute("href", /claude\.ai/)
    await expect(dialog.getByTestId("paste-back-confirm")).toBeDisabled()
    const pasted = "Talking points (pasted back from Claude): 1. YTD allocation is within 2% of target per the Orion summary [source: Orion p.1]. 2. Cash position 4.1% [source: Orion p.2]. 3. No performance comparison to prior periods was requested."
    await dialog.getByTestId("paste-back-input").fill(pasted)
    await dialog.getByTestId("paste-back-confirm").click()
    await expect(dialog).toBeHidden()
    await expectToast(page, /pasted back/i)
    await expect(page.getByTestId("run-output")).toContainText("pasted back from Claude")
    await expect(page.getByTestId("work-continue")).toBeEnabled()
    // The Practice tab's secondary action opens the same dialog straight away.
    await page.goto(`/exercise/${other!.id}?claude=1`)
    await expect(page.getByTestId("open-in-claude-dialog")).toBeVisible()
  })

  test("skip with a reason", async ({ page }) => {
    const all = await api<ExerciseSummary[]>(page, "GET", "/api/exercises?status=queued,active,revise")
    const target = all.find((e) => e.id !== exerciseId) ?? all[0]
    test.skip(!target, "nothing left to skip")
    await page.goto(`/exercise/${target!.id}`)
    await expect(page.getByTestId("exercise-view")).toBeVisible()
    await page.getByTestId("skip-menu").click()
    await expect(page.getByTestId("skip-blocked")).toBeVisible()
    await page.getByTestId("skip-no_time").click()
    const dialog = page.getByTestId("skip-dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText("No time this week")
    await dialog.getByTestId("skip-note").fill("Quarter-end reviews this week; back to it next Monday.")
    await dialog.getByTestId("skip-confirm").click()
    await expectToast(page, /Skipped/)
    await expect(page).toHaveURL(/\/(exercise\/[0-9a-f-]{36})?$/)
    const after = await api<ExerciseSummary[]>(page, "GET", "/api/exercises?status=skipped")
    expect(after.map((e) => e.id)).toContain(target!.id)
  })

  test("skip via the API records the reason and hands back the next exercise", async ({ page }) => {
    const all = await api<ExerciseSummary[]>(page, "GET", "/api/exercises?status=queued,active,revise")
    const target = all.find((e) => e.id !== exerciseId) ?? all[0]
    test.skip(!target, "nothing left to skip")
    const res = await api<{ ok: boolean; nextUp: ExerciseSummary | null; escalated: boolean }>(page, "POST", `/api/exercises/${target!.id}/skip`, { reason: "no_time", note: "Quarter-end reviews this week; back to it next Monday." })
    expect(res.ok).toBe(true)
    expect(res.escalated).toBe(false)
    if (res.nextUp) expect(res.nextUp.id).not.toBe(target!.id)
    const after = await api<ExerciseSummary[]>(page, "GET", "/api/exercises?status=skipped")
    expect(after.map((e) => e.id)).toContain(target!.id)
    // The skipped exercise no longer surfaces as Up next on the home page.
    await page.goto("/")
    await expect(page.getByTestId("ladder-view")).toBeVisible()
    await expect(page.getByTestId("up-next")).toBeVisible()
    if (await page.getByTestId("next-up-title").count()) await expect(page.getByTestId("next-up-title").last()).not.toHaveText(target!.title)
  })
})

/** The Build beat's continue button stays reachable at the default desktop viewport once every nudge is out. */
test.describe("practice layout", () => {
  test.use({ role: "learner2", viewport: { width: 1280, height: 720 } })

  test("continue stays reachable after all nudges are revealed", async ({ page }) => {
    await page.goto("/")
    const start = page.getByTestId("next-up-start")
    test.skip(!(await start.count()), "nothing up next for Marcus")
    await start.click()
    await expect(page.getByTestId("coach-panel")).toBeVisible()
    const hint = page.getByTestId("hint-button")
    const count = page.getByTestId("hints-count")
    const parse = async () => ((await count.textContent()) ?? "0/0").match(/(\d+)\s*\/\s*(\d+)/)?.slice(1, 3).map(Number) ?? [0, 0]
    let [revealed, total] = await parse()
    while (revealed < total) {
      await hint.click()
      await expect(count).toContainText(`${revealed + 1}/`)
      ;[revealed, total] = await parse()
    }
    await expect(hint).toBeDisabled()
    await page.getByTestId("work-continue").scrollIntoViewIfNeeded()
    await expect(page.getByTestId("work-continue")).toBeInViewport()
  })
})
