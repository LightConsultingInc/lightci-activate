import { test, expect } from "./helpers/fixtures"
import { api } from "./helpers/api"
import { intOf } from "./helpers/ui"

/**
 * Intake interview as Marcus Reid. Consent is already recorded for every seeded user, so the flow
 * starts at the Interview stage. The interview id is captured from the create call and carried in the
 * URL (`/onboarding?interview=<id>`) so the serial tests share one interview. Fake media devices are
 * granted so the voice toggle can attempt a Realtime session in headless Chromium.
 */
// launchOptions must be file-level (it forces a dedicated worker/browser).
test.use({
  role: "learner2",
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["microphone"],
})

test.describe("onboarding intake", () => {
  test.describe.configure({ mode: "serial" })

  let interviewId = ""
  let completenessAfterTurns = 0

  const TURNS = [
    "I am a wealth advisor on the Wealth Advisors team. A normal week is client meetings, follow-up emails after each one, and quarterly review prep.",
    "Follow-up emails take me about 25 minutes each and I write five or six a week in Outlook and Salesforce. Quarterly talking points take 90 minutes per household, four a week in busy months.",
    "I use Claude mostly to tidy my notes; I would rate my comfort 3 out of 5. Account numbers and statements must never go in; performance claims need compliance review.",
  ]

  test("renders the interview stage and three turns raise scribe completeness", async ({ page }) => {
    const created = page.waitForResponse((r) => r.url().includes("/api/interviews") && r.request().method() === "POST" && r.ok())
    await page.goto("/onboarding")
    const flow = page.getByTestId("onboarding-flow")
    await expect(flow).toBeVisible()
    await expect(page.getByTestId("onboarding-stages")).toContainText("Consent")
    await expect(page.getByTestId("onboarding-stages")).toContainText("Interview")
    await expect(page.getByTestId("onboarding-stages")).toContainText("Placement")
    await expect(flow).toHaveAttribute("data-stage", "interview")
    await expect(page.getByTestId("consent-step")).toHaveCount(0)
    interviewId = ((await (await created).json()) as { id: string }).id
    expect(interviewId).toMatch(/[0-9a-f-]{36}/)

    const chat = page.getByTestId("intake-chat")
    await expect(chat).toBeVisible()
    await expect(page.getByTestId("chat-interviewer").first()).toBeVisible()
    await expect(page.getByTestId("scribe-card")).toBeVisible()
    const completeness = page.getByTestId("scribe-completeness")
    const start = await intOf(completeness)
    await expect(page.getByTestId("complete-button")).toBeDisabled()

    for (const [i, text] of TURNS.entries()) {
      const usersBefore = await page.getByTestId("chat-user").count()
      await page.getByTestId("intake-input").fill(text)
      await page.getByTestId("intake-send").click()
      await expect(page.getByTestId("chat-user")).toHaveCount(usersBefore + 1)
      await expect(page.getByTestId("intake-input")).toBeEnabled({ timeout: 30_000 })
      await expect(page.getByTestId("chat-interviewer")).toHaveCount(i + 2, { timeout: 30_000 })
      await expect(chat).toContainText(`${i + 1} turn`)
    }
    completenessAfterTurns = await intOf(completeness)
    expect(completenessAfterTurns).toBeGreaterThan(start)
    await expect(page.getByTestId("scribe-card").locator("[data-filled=true]").first()).toBeVisible()
    await expect(page.getByTestId("complete-button")).toBeEnabled()
  })

  test("voice toggle either connects or reports voice unavailable", async ({ page }) => {
    await page.goto(`/onboarding?interview=${interviewId}`)
    const chat = page.getByTestId("intake-chat")
    await expect(chat).toBeVisible()
    const toggle = page.getByTestId("voice-toggle")
    await expect(toggle).toBeVisible()
    await expect(toggle).toBeEnabled()
    const label = page.locator("label[for=voice-toggle]")
    await expect(label).toContainText("Voice mode")

    await toggle.click()
    await expect
      .poll(
        async () => {
          if (await page.getByTestId("voice-unavailable").isVisible()) return "unavailable"
          const l = (await label.textContent()) ?? ""
          if (/Connecting|Voice live/.test(l)) return "connecting-or-live"
          if (await chat.locator("p.text-fail").first().isVisible()) return "error"
          return "idle"
        },
        { timeout: 30_000, message: "voice toggle should reach a connecting, live, unavailable or error state" },
      )
      .not.toBe("idle")

    // Whatever happened, typing still works and the toggle can be switched back off.
    if (await toggle.isEnabled()) {
      if ((await toggle.getAttribute("aria-checked")) === "true" || (await toggle.getAttribute("data-checked")) != null) await toggle.click()
    }
    await expect(page.getByTestId("intake-input")).toBeEnabled()
  })

  test("finishing places the learner and offers a first exercise", async ({ page }) => {
    await page.goto(`/onboarding?interview=${interviewId}`)
    await expect(page.getByTestId("intake-chat")).toBeVisible()
    expect(await intOf(page.getByTestId("scribe-completeness"))).toBeGreaterThanOrEqual(completenessAfterTurns)
    const finish = page.getByTestId("complete-button")
    await expect(finish).toBeEnabled()
    await finish.click()

    const done = page.getByTestId("completion-step")
    await expect(done).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId("onboarding-flow")).toHaveAttribute("data-stage", "done")
    await expect(done).toContainText(/Placement|Your plan is ready/)
    await expect(done).toContainText(/You start at L[0-5]|Your plan is ready/)
    await expect(done.getByTestId("workflow-candidates")).toBeVisible()
    const first = done.getByTestId("first-exercise")
    await expect(first).toBeVisible()
    const cta = first.getByTestId("first-exercise-start")
    if (await cta.count()) {
      await expect(cta).toHaveAttribute("href", /\/exercise\/[0-9a-f-]{36}/)
    } else {
      await expect(first).toContainText("Coach is queueing it")
    }
    await expect(done.getByTestId("onboarding-go-ladder")).toHaveAttribute("href", "/")
  })

  test("completing via the API returns a placement, workflow candidates and a first exercise", async ({ page }) => {
    // Backend half of the finish step while the completion screen is broken (BUGS.md #7).
    type Complete = { interview: { status: string; completeness: number }; workflowMapIds: string[]; placement: { rung: number; evidence: unknown } | null; exercises: { id: string; title: string; rung: number }[] }
    const r = await api<Complete>(page, "POST", `/api/interviews/${interviewId}/complete`)
    expect(r.interview.status).toBe("complete")
    expect(r.interview.completeness).toBeGreaterThan(0)
    expect(r.workflowMapIds.length).toBeGreaterThanOrEqual(1)
    expect(r.placement).not.toBeNull()
    expect(r.placement!.rung).toBeGreaterThanOrEqual(0)
    expect(r.placement!.rung).toBeLessThanOrEqual(5)
    expect(r.exercises.length).toBeGreaterThanOrEqual(1)
    expect(r.exercises[0].rung).toBe(r.placement!.rung)
    // The person is marked onboarded and the ladder shows the placed rung.
    const me = await api<{ user: { onboardedAt: string | null; rung: number } }>(page, "GET", "/api/auth/me")
    expect(me.user.onboardedAt).toBeTruthy()
    expect(me.user.rung).toBe(r.placement!.rung)
    await page.goto("/")
    await expect(page.getByTestId("ladder-view")).toBeVisible()
    await expect(page.getByTestId("ladder-header")).toContainText(`L${r.placement!.rung} `)
  })
})
