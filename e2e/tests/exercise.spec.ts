import { test, expect, type Page } from "./helpers/fixtures"
import { api } from "./helpers/api"
import { expectToast } from "./helpers/ui"

type ExerciseSummary = { id: string; title: string; status: string; workSurface: string; rung: number }

/**
 * Practice as Marcus Reid (seeded L1): one screen with the ask, the input, Run, the output, Submit,
 * and the feedback card. His next-up item is a prompt-kind exercise. The decision depends on the
 * text (and the provider), so the flow tolerates pass or try_again. State is mutated, so this file
 * is serial and self-contained (the seed is reset by 00-reset.spec.ts).
 */
test.describe("practice: ask, run, submit, feedback", () => {
  test.describe.configure({ mode: "serial" })
  test.use({ role: "learner2", viewport: { width: 1440, height: 1200 } })

  let exerciseId = ""
  let decision: "pass" | "try_again" | "" = ""

  const PROMPT = "You are helping me, a wealth advisor, write a follow-up email after yesterday's client meeting. Structure: what we discussed, what we agreed, what we need from you. Under 200 words, warm but plain. Do not mention investment performance or compare to other firms. Facts: inherited IRA distribution plan; moving to quarterly; they will send the updated beneficiary form; they asked about 529s for the grandchildren."

  async function openNextUp(page: Page) {
    await page.goto("/")
    const start = page.getByTestId("next-up-start")
    await expect(start).toBeVisible()
    await start.click()
    await expect(page).toHaveURL(/\/exercise\/[0-9a-f-]{36}/)
    exerciseId = page.url().match(/\/exercise\/([0-9a-f-]{36})/)![1]
    await expect(page.getByTestId("exercise-view")).toBeVisible()
  }

  test("one screen: the ask, the input, one Run that also brings feedback; none of the old beats", async ({ page }) => {
    await openNextUp(page)
    await expect(page.getByTestId("exercise-ask")).not.toBeEmpty()
    await expect(page.getByTestId("exercise-minutes")).toContainText(/\d+ min/)
    const surface = page.getByTestId("work-surface")
    await expect(surface).toHaveAttribute("data-surface", /^(prompt|project|skill|workflow|review)$/)
    if ((await surface.getAttribute("data-surface")) === "review") {
      await expect(page.getByTestId("submit-button")).toBeDisabled()
    } else {
      await expect(page.getByTestId("run-button")).toBeVisible()
      // Run and feedback are one action: there is no separate submit step.
      await expect(page.getByTestId("submit-button")).toHaveCount(0)
    }

    // Nothing from the expectation → check → result design survives.
    for (const id of ["beats", "beat-build", "coach-panel", "expectation-input", "confidence-slider", "self-check", "open-in-claude-button", "mode-badge", "stepper", "work-continue"]) {
      await expect(page.getByTestId(id)).toHaveCount(0)
    }
    await expect(page.getByText(/expectation|critique|calibration|competency|rung|mastery/i)).toHaveCount(0)
  })

  test("Need a nudge? reveals one hint at a time under the ask", async ({ page }) => {
    await page.goto(`/exercise/${exerciseId}`)
    await expect(page.getByTestId("exercise-view")).toBeVisible()
    const button = page.getByTestId("hint-button")
    test.skip(!(await button.count()), "this exercise has no hints")
    const count = page.getByTestId("hints-count")
    await expect(count).toContainText(/\d+\/\d+ revealed/)
    const [revealed, total] = ((await count.textContent()) ?? "0/0").match(/(\d+)\s*\/\s*(\d+)/)!.slice(1, 3).map(Number)
    test.skip(revealed >= total, "every nudge already revealed")
    await expect(button).toContainText(/nudge/i)
    await button.click()
    await expect(count).toContainText(`${revealed + 1}/${total} revealed`)
    await expect(page.getByTestId(`hint-${revealed + 1}`)).toBeVisible()
    // The hint is stored server-side, so it comes back on reload.
    await page.reload()
    await expect(page.getByTestId("hints-count")).toContainText(`${revealed + 1}/${total} revealed`)
  })

  test("edit the prompt, Run shows the output and then the feedback card; Try again keeps the draft", async ({ page }) => {
    await page.goto(`/exercise/${exerciseId}`)
    await expect(page.getByTestId("exercise-view")).toBeVisible()
    test.skip((await page.getByTestId("work-surface").getAttribute("data-surface")) !== "prompt", "Marcus's next practice is not a prompt")

    const input = page.getByTestId("prompt-input")
    await expect(input).toBeVisible()
    await expect(input).toHaveValue("") // never pre-written: that would give the answer away
    await input.fill(PROMPT)
    await expect(page.getByTestId("run-output")).toHaveCount(0)

    await page.getByTestId("run-button").click()
    const output = page.getByTestId("run-output")
    await expect(output).toBeVisible({ timeout: 30_000 })
    await expect(output).toHaveAttribute("data-kind", "prompt")
    // Works with the mock provider and a real model alike: something substantial came back.
    expect(((await output.textContent()) ?? "").length).toBeGreaterThan(60)

    // No second press: the feedback follows the output on its own.
    const card = page.getByTestId("feedback-card")
    await expect(card).toBeVisible({ timeout: 60_000 })
    await expect(card.getByTestId("feedback-score")).toHaveText(/^(10|\d(\.\d)?)$/)
    const chip = card.getByTestId("decision-chip")
    decision = ((await chip.getAttribute("data-decision")) ?? "") as typeof decision
    expect(["pass", "try_again"]).toContain(decision)
    await expect(card).toHaveAttribute("data-decision", decision)
    await expect(chip).toHaveText(decision === "pass" ? "Pass" : "Try again")
    for (const id of ["feedback-worked", "feedback-change", "feedback-next"]) await expect(card.getByTestId(id)).not.toBeEmpty()
    await expect(card.getByTestId("back-to-module-button")).toHaveAttribute("href", /\/modules\/L[0-5]\?tab=practice/)
    // The input is read-only while the feedback shows.
    await expect(input).toBeDisabled()

    if (decision === "try_again") {
      await card.getByTestId("try-again-button").click()
      await expect(page.getByTestId("feedback-card")).toHaveCount(0)
      await expect(page.getByTestId("run-output")).toHaveCount(0)
      await expect(input).toBeEnabled()
      await expect(input).toHaveValue(PROMPT)
      await expect(page.getByTestId("run-button")).toBeEnabled()
    } else {
      await expect(page.getByTestId("exercise-view")).toHaveAttribute("data-status", "passed")
      await expect(card.getByTestId("try-again-button")).toHaveCount(0)
      // Next practice in this module, the next module's lessons when the practice is a module up, or back to the module.
      await expect(card.getByTestId("next-practice-button").or(card.getByTestId("next-module-button")).or(card.getByTestId("back-to-module-button")).first()).toBeVisible()
      await expect(card.getByTestId("next-practice-button").or(card.getByTestId("next-module-button"))).toHaveCount(1)
    }
  })

  test("after a reload the try shows as an earlier try (score only) or as the passed feedback", async ({ page }) => {
    test.skip(!decision, "nothing was submitted")
    await page.goto(`/exercise/${exerciseId}`)
    await expect(page.getByTestId("exercise-view")).toBeVisible()
    if (decision === "try_again") {
      const tries = page.getByTestId("earlier-tries")
      await expect(tries).toBeVisible()
      await tries.getByTestId("earlier-tries-toggle").click()
      await expect(tries.getByTestId("earlier-try").first()).toBeVisible()
      await expect(tries.getByTestId("earlier-try-score").first()).toContainText(/\d+ \/ 10/)
      // Nothing beyond the score is shown for an earlier try.
      await expect(tries.getByTestId("feedback-worked")).toHaveCount(0)
      // The draft is still editable.
      await expect(page.getByTestId("prompt-input")).toBeEnabled()
      await expect(page.getByTestId("prompt-input")).toHaveValue(PROMPT)
    } else {
      await expect(page.getByTestId("exercise-view")).toHaveAttribute("data-status", "passed")
      await expect(page.getByTestId("feedback-card")).toBeVisible()
      await expect(page.getByTestId("feedback-card").getByTestId("decision-chip")).toHaveAttribute("data-decision", "pass")
      await expect(page.getByTestId("prompt-input")).toBeDisabled()
    }

    // The module's Practice tab shows the same item with one action.
    await page.goto("/modules/L1?tab=practice")
    await expect(page.getByTestId("practice-tab")).toBeVisible()
    const cards = page.getByTestId("practice-card")
    if (await cards.count()) {
      const first = cards.first()
      await expect(first.getByTestId("practice-title")).not.toBeEmpty()
      await expect(first.getByTestId("practice-start")).toHaveText(/^(Start|Continue|Try again|Review feedback)/)
      await expect(first.getByTestId("practice-start")).toHaveCount(1)
      await expect(page.getByTestId("practice-in-claude")).toHaveCount(0)
      await expect(page.getByTestId("mode-badge")).toHaveCount(0)
    }
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
    const res = await api<{ ok: boolean; nextUp: ExerciseSummary | null }>(page, "POST", `/api/exercises/${target!.id}/skip`, { reason: "no_time", note: "Quarter-end reviews this week; back to it next Monday." })
    expect(res.ok).toBe(true)
    if (res.nextUp) expect(res.nextUp.id).not.toBe(target!.id)
    const after = await api<ExerciseSummary[]>(page, "GET", "/api/exercises?status=skipped")
    expect(after.map((e) => e.id)).toContain(target!.id)
    // The skipped exercise no longer surfaces as Up next on the home page.
    await page.goto("/")
    await expect(page.getByTestId("up-next")).toBeVisible()
    if (await page.getByTestId("next-up-title").count()) await expect(page.getByTestId("next-up-title").last()).not.toHaveText(target!.title)
  })
})

/** Submit stays reachable at the default desktop viewport once every nudge is out and the output is showing. */
test.describe("practice layout", () => {
  test.use({ role: "learner2", viewport: { width: 1280, height: 720 } })

  test("Run and Submit stay reachable after all nudges are revealed", async ({ page }) => {
    await page.goto("/")
    const start = page.getByTestId("next-up-start")
    test.skip(!(await start.count()), "nothing up next for Marcus")
    await start.click()
    await expect(page.getByTestId("exercise-view")).toBeVisible()
    const hint = page.getByTestId("hint-button")
    if (await hint.count()) {
      const count = page.getByTestId("hints-count")
      const parse = async () => ((await count.textContent()) ?? "0/0").match(/(\d+)\s*\/\s*(\d+)/)?.slice(1, 3).map(Number) ?? [0, 0]
      let [revealed, total] = await parse()
      while (revealed < total) {
        await hint.click()
        await expect(count).toContainText(`${revealed + 1}/`)
        ;[revealed, total] = await parse()
      }
      await expect(hint).toBeDisabled()
    }
    const action = page.getByTestId("run-button").or(page.getByTestId("submit-button")).first()
    await action.scrollIntoViewIfNeeded()
    await expect(action).toBeInViewport()
  })
})
