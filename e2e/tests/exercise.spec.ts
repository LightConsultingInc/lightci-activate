import { test, expect, type Page } from "./helpers/fixtures"
import { accessToken, api, API_URL } from "./helpers/api"
import { expectToast, intOf, nudgeSlider } from "./helpers/ui"

type ExerciseSummary = { id: string; title: string; mode: "in_app" | "in_claude"; status: string; workSurface: string; rung: number }

/**
 * The exercise loop as Marcus Reid (seeded L1). His next-up exercise is an active, prompt-surface
 * exercise; a second one is queued. Grading with the mock Grader is deterministic but the decision
 * depends on the text, so the flow tolerates pass or revise. State is mutated, so this file is serial
 * and self-contained (the seed is reset at the start of the run by 00-reset.spec.ts).
 */
test.describe("exercise loop", () => {
  test.describe.configure({ mode: "serial" })
  // Taller viewport: the sticky Coach panel does not scroll internally, so with hints revealed its
  // step buttons fall below a 900px-tall window (BUGS.md #2). The repro is pinned in the describe below.
  test.use({ role: "learner2", viewport: { width: 1440, height: 1200 } })

  let exerciseId = ""
  let exerciseTitle = ""
  let decision: "pass" | "revise" | "" = ""

  const EXPECTATION = "I expect a three-part email (discussed, agreed, need from you) under 200 words, but Claude may invent a performance figure I never quoted."
  const PROMPT = "You are helping me, a wealth advisor, write a follow-up email to the Hendersons after yesterday's meeting. Structure: what we discussed, what we agreed, what we need from you. Under 200 words, warm but plain. Do not mention investment performance or compare to other firms. Facts: inherited IRA distribution plan; moving to quarterly; they will send the updated beneficiary form; they asked about 529s for the grandchildren."
  const CRITIQUE = "The draft uses placeholders where I gave concrete facts, so it did not use the inputs. It also does not state the 200-word limit was met and the closing action is vague; I would rewrite the ask for the beneficiary form as a single explicit sentence."

  async function openNextUp(page: Page) {
    await page.goto("/")
    const start = page.getByTestId("next-up-start")
    await expect(start).toBeVisible()
    exerciseTitle = (await page.getByTestId("next-up-title").textContent())?.trim() ?? ""
    await start.click()
    await expect(page).toHaveURL(/\/exercise\/[0-9a-f-]{36}/)
    exerciseId = page.url().match(/\/exercise\/([0-9a-f-]{36})/)![1]
    await expect(page.getByTestId("exercise-view")).toBeVisible()
  }

  test("stepper enforces predict-before-run", async ({ page }) => {
    await openNextUp(page)
    await expect(page.getByTestId("exercise-title")).toHaveText(exerciseTitle)
    await expect(page.getByTestId("work-surface")).toHaveAttribute("data-surface", "prompt")
    await expect(page.getByTestId("coach-panel")).toBeVisible()
    await expect(page.getByTestId("stepper")).toBeVisible()
    for (const s of [1, 2, 3, 4, 5]) await expect(page.getByTestId(`step-${s}`)).toBeVisible()
    await expect(page.getByTestId("step-1")).toHaveAttribute("data-state", "current")
    await expect(page.getByTestId("step-2")).toHaveAttribute("data-state", "upcoming")
    await expect(page.getByTestId("surface-locked")).toBeVisible()
    await expect(page.getByTestId("run-button")).toBeDisabled()
    await expect(page.getByTestId("expectation-confirm")).toBeDisabled()
    // Steps ahead of the current one are not reachable by clicking.
    await expect(page.getByTestId("step-3")).toBeDisabled()

    // The API refuses a run before an expectation is stored (409) regardless of the UI guard.
    const res = await page.request.fetch(`${API_URL}/api/exercises/${exerciseId}/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await accessToken(page)}`, "Content-Type": "application/json" },
      data: JSON.stringify({ prompt: PROMPT }),
    })
    expect(res.status()).toBe(409)
    expect(((await res.json()) as { detail: string }).detail).toMatch(/expectation/i)
  })

  test("expectation + confidence unlock the work surface; run produces mock output", async ({ page }) => {
    await page.goto(`/exercise/${exerciseId}`)
    await expect(page.getByTestId("exercise-view")).toBeVisible()
    await page.getByTestId("expectation-input").fill(EXPECTATION)
    await expect(page.getByTestId("confidence-value")).toContainText("60%")
    await nudgeSlider(page.getByTestId("confidence-slider"), 2)
    await expect(page.getByTestId("confidence-value")).toContainText("70%")
    await page.getByTestId("expectation-confirm").click()

    await expect(page.getByTestId("step-2")).toHaveAttribute("data-state", "current")
    await expect(page.getByTestId("step-1")).toHaveAttribute("data-state", "done")
    await expect(page.getByTestId("surface-locked")).toBeHidden()
    await expect(page.getByTestId("work-continue")).toBeDisabled()

    await page.getByTestId("prompt-input").fill(PROMPT)
    await expect(page.getByTestId("run-button")).toBeEnabled()
    await page.getByTestId("run-button").click()
    const output = page.getByTestId("run-output")
    await expect(output).toBeVisible({ timeout: 30_000 })
    await expect(output).toContainText(/Mock Claude run|Purpose|draft/i)
    await expect(output).toContainText("mock")
    await expect(page.getByTestId("work-continue")).toBeEnabled()
  })

  test("revealing a hint increments the count", async ({ page }) => {
    await page.goto(`/exercise/${exerciseId}`)
    // The draft expectation is persisted server-side, so the page resumes at step 2.
    await expect(page.getByTestId("step-2")).toHaveAttribute("data-state", "current")
    const count = page.getByTestId("hints-count")
    await expect(count).toContainText(/\d+\/\d+ revealed/)
    const before = await intOf(count)
    const total = Number((await count.textContent())!.match(/\/(\d+)/)![1])
    expect(total).toBeGreaterThan(before)
    await page.getByTestId("hint-button").click()
    await expect(count).toContainText(`${before + 1}/${total} revealed`)
    await expect(page.getByTestId(`hint-${before + 1}`)).toBeVisible()
  })

  test("critique, submit and read the grade card", async ({ page }) => {
    await page.goto(`/exercise/${exerciseId}`)
    await expect(page.getByTestId("step-2")).toHaveAttribute("data-state", "current")
    // Output does not persist across a reload until submission; run again.
    await page.getByTestId("prompt-input").fill(PROMPT)
    await page.getByTestId("run-button").click()
    await expect(page.getByTestId("run-output")).toBeVisible({ timeout: 30_000 })

    await page.getByTestId("work-continue").click()
    await expect(page.getByTestId("step-3")).toHaveAttribute("data-state", "current")
    await expect(page.getByTestId("critique-continue")).toBeDisabled()
    await page.getByTestId("critique-input").fill(CRITIQUE)
    await page.getByTestId("critique-continue").click()
    await expect(page.getByTestId("step-4")).toHaveAttribute("data-state", "current")
    await page.getByTestId("submit-button").click()

    const card = page.getByTestId("coach-panel").getByTestId("grade-card")
    await expect(card).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId("step-5")).toHaveAttribute("data-state", "current")
    await expect(card.getByTestId("grade-score")).toContainText(/^\d{1,3}$/)
    await expect(card.getByTestId("rubric-bars")).toBeVisible()
    expect(await card.getByTestId("rubric-bars").locator("li").count()).toBeGreaterThan(0)
    const chip = card.getByTestId("decision-chip")
    await expect(chip).toBeVisible()
    decision = ((await chip.getAttribute("data-decision")) ?? "") as typeof decision
    expect(["pass", "revise"]).toContain(decision)
    await expect(card).toHaveAttribute("data-decision", decision)
    await expect(card.getByTestId("teaching-moment")).toBeVisible()
    await expect(card.getByTestId("grade-expectation-accuracy")).toContainText("%")
    await expect(card.getByTestId("grade-critique-quality")).toContainText("%")
    await expectToast(page, decision === "pass" ? /Passed/ : /Graded: revise/)
    await expect(page.getByTestId("work-surface")).toContainText("Submitted")
  })

  test("the submission shows in history and the attempt list", async ({ page }) => {
    await page.goto("/history")
    const view = page.getByTestId("history-view")
    await expect(view).toBeVisible()
    const row = page.getByTestId("history-row").filter({ hasText: exerciseTitle }).first()
    await expect(row).toBeVisible()
    await expect(row).toHaveAttribute("data-decision", decision)
    await row.getByTestId("history-row-toggle").click()
    await expect(row.getByTestId("history-row-detail")).toBeVisible()
    await expect(row.getByTestId("history-row-detail")).toContainText(CRITIQUE.slice(0, 40))
    await expect(row.getByTestId("history-row-detail").getByTestId("grade-card")).toBeVisible()

    // Filter by outcome narrows the list to matching rows only.
    await page.getByTestId("history-filter-decision").click()
    await page.getByRole("option", { name: decision === "pass" ? "Pass" : "Revise" }).click()
    const rows = page.getByTestId("history-row")
    expect(await rows.count()).toBeGreaterThan(0)
    for (const r of await rows.all()) await expect(r).toHaveAttribute("data-decision", decision)

    // On the exercise itself the attempt history lists prior submissions while a revise is open.
    await page.goto(`/exercise/${exerciseId}`)
    await expect(page.getByTestId("exercise-view")).toBeVisible()
    if (decision === "revise") {
      const history = page.getByTestId("attempt-history")
      await expect(history).toBeVisible()
      await history.locator("button").first().click()
      await expect(history.getByTestId("attempt").first()).toContainText("Attempt 1")
      await expect(history.getByTestId("attempt").first().getByTestId("decision-chip")).toHaveAttribute("data-decision", "revise")
    } else {
      await expect(page.getByTestId("exercise-view")).toHaveAttribute("data-status", "passed")
      await expect(page.getByTestId("coach-panel").getByTestId("grade-card")).toBeVisible()
    }
  })

  test("in-Claude path: copy the pack, paste the artifact back", async ({ page }) => {
    const all = await api<ExerciseSummary[]>(page, "GET", "/api/exercises?status=queued,active,revise")
    const other = all.find((e) => e.id !== exerciseId && e.mode === "in_claude" && e.workSurface === "prompt")
    test.skip(!other, "no other queued in-Claude prompt exercise for Marcus")
    await page.goto(`/exercise/${other!.id}`)
    await expect(page.getByTestId("exercise-view")).toBeVisible()
    // Queued exercises start on open.
    await expect(page.getByTestId("exercise-view")).toHaveAttribute("data-status", /active|revise/)
    await expect(page.getByTestId("mode-badge").first()).toContainText("In Claude")
    const openBtn = page.getByTestId("open-in-claude-button")
    await expect(openBtn).toBeVisible()
    await expect(openBtn).toBeDisabled()

    await page.getByTestId("expectation-input").fill("I expect the talking points to be structured but to invent a comparison period I did not give it.")
    await page.getByTestId("expectation-confirm").click()
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
    // Backend half of the skip flow while the menu is broken (BUGS.md #3).
    const all = await api<ExerciseSummary[]>(page, "GET", "/api/exercises?status=queued,active,revise")
    const target = all.find((e) => e.id !== exerciseId) ?? all[0]
    test.skip(!target, "nothing left to skip")
    const res = await api<{ ok: boolean; nextUp: ExerciseSummary | null; escalated: boolean }>(page, "POST", `/api/exercises/${target!.id}/skip`, { reason: "no_time", note: "Quarter-end reviews this week; back to it next Monday." })
    expect(res.ok).toBe(true)
    expect(res.escalated).toBe(false)
    if (res.nextUp) expect(res.nextUp.id).not.toBe(target!.id)
    const after = await api<ExerciseSummary[]>(page, "GET", "/api/exercises?status=skipped")
    expect(after.map((e) => e.id)).toContain(target!.id)
    // The skipped exercise no longer surfaces as Next up on the ladder.
    await page.goto("/")
    await expect(page.getByTestId("ladder-view")).toBeVisible()
    if (await page.getByTestId("next-up-title").count()) await expect(page.getByTestId("next-up-title")).not.toHaveText(target!.title)
    await expect(page.getByTestId("coach-notes")).toBeVisible()
  })
})

/** Pins BUGS.md #2 at the default desktop viewport; unskip once the Coach panel scrolls internally. */
test.describe("exercise coach panel layout", () => {
  test.use({ role: "learner2", viewport: { width: 1280, height: 720 } })

  test("step buttons stay reachable after hints are revealed", async ({ page }) => {
    await page.goto("/")
    await page.getByTestId("next-up-start").click()
    await expect(page.getByTestId("coach-panel")).toBeVisible()
    if ((await page.getByTestId("step-1").getAttribute("data-state")) === "current") {
      await page.getByTestId("expectation-input").fill("I expect a structured draft with placeholders where I gave no data.")
      await page.getByTestId("expectation-confirm").click()
    }
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
