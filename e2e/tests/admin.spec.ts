import { test, expect } from "./helpers/fixtures"
import { api } from "./helpers/api"
import { expectToast, toast } from "./helpers/ui"

const KEY_KINDS = ["anthropic", "claude_compliance", "claude_analytics", "claude_admin", "github"] as const

/** Company admin as Elena Marsh (sponsor + admin). Key add/remove and policy save mutate state; serial. */
test.describe("company admin", () => {
  test.describe.configure({ mode: "serial" })
  test.use({ role: "sponsor" })

  test("integrations: five key cards; Anthropic falls back to LightCI's platform key", async ({ page }) => {
    await page.goto("/admin/integrations")
    await expect(page.getByTestId("admin-tabs")).toBeVisible()
    await expect(page.getByTestId("integrations-note")).toBeVisible()
    const cards = page.getByTestId("key-cards")
    await expect(cards).toBeVisible()
    for (const kind of KEY_KINDS) await expect(page.getByTestId(`key-card-${kind}`), kind).toBeVisible()
    await expect(cards.locator("[data-testid^=key-card-]")).toHaveCount(5)

    const anthropic = page.getByTestId("key-card-anthropic")
    await expect(anthropic).toHaveAttribute("data-state", "Using LightCI's key")
    await expect(anthropic.getByTestId("key-status")).toContainText("Using LightCI's key")
    await expect(anthropic.getByTestId("key-last4")).toContainText("LightCI platform key")
    await expect(anthropic.getByTestId("key-add")).toContainText("Add key")
    await expect(anthropic.getByTestId("key-remove")).toHaveCount(0)
    for (const kind of KEY_KINDS.slice(1)) {
      await expect(page.getByTestId(`key-card-${kind}`)).toHaveAttribute("data-state", "Not configured")
    }
  })

  test("an invalid Anthropic key is stored, verified against the provider and reported with detail", async ({ page }) => {
    await page.goto("/admin/integrations")
    const card = page.getByTestId("key-card-anthropic")
    await expect(card).toBeVisible()
    await card.getByTestId("key-add").click()
    const form = page.getByTestId("key-form")
    await expect(form).toBeVisible()
    await expect(form.getByTestId("key-save")).toBeDisabled()
    await form.getByTestId("key-secret-input").fill("sk-ant-api03-e2e-obviously-invalid-key-0000000000")
    await form.getByTestId("key-save").click()
    // The save waits for provider verification; either way the dialog closes and the card reflects the result.
    await expect(toast(page, /Anthropic API key saved|Couldn't save the key/).first()).toBeVisible({ timeout: 60_000 })
    await expect(form).toBeHidden({ timeout: 60_000 })
    // The stored key is rejected by Anthropic: the card keeps the last4, shows the provider's detail and flags the ring red.
    await expect(card.getByTestId("key-last4")).toContainText("••••••••0000", { timeout: 60_000 })
    await expect(card.getByTestId("key-detail")).toBeVisible()
    await expect(card.getByTestId("key-detail")).toContainText(/401|invalid/i)
    await expect(card.getByTestId("key-verify")).toBeVisible()
    await expect(card.getByTestId("key-add")).toContainText("Replace key")
    const rows = await api<{ kind: string; source: string; status: string | null }[]>(page, "GET", "/api/org/integrations")
    expect(rows.find((r) => r.kind === "anthropic")).toMatchObject({ source: "org", status: "invalid" })
  })

  test("an invalid stored key is labelled Invalid, not Not configured", async ({ page }) => {
    await page.goto("/admin/integrations")
    const card = page.getByTestId("key-card-anthropic")
    await expect(card).toHaveAttribute("data-state", "Invalid")
    await expect(card.getByTestId("key-status")).toContainText("Invalid")
  })

  test("removing the invalid key restores LightCI's platform key", async ({ page }) => {
    await page.goto("/admin/integrations")
    const card = page.getByTestId("key-card-anthropic")
    await expect(card.getByTestId("key-remove")).toBeVisible()
    await card.getByTestId("key-remove").click()
    await page.getByTestId("key-remove-confirm").click()
    await expectToast(page, /Anthropic API key removed/)
    await expect(card).toHaveAttribute("data-state", "Using LightCI's key")
    await expect(card.getByTestId("key-remove")).toHaveCount(0)
  })

  test("policy save with an audit note persists across reload", async ({ page }) => {
    await page.goto("/admin/policy")
    const form = page.getByTestId("policy-form")
    await expect(form).toBeVisible()
    const text = page.getByTestId("policy-text")
    await expect(text).toBeEnabled()
    const original = await text.inputValue()
    const marker = `E2E policy clause ${Date.now()}: outputs that name a client require a named reviewer.`
    await expect(page.getByTestId("policy-save")).toBeDisabled()
    await text.fill(`${original.trimEnd()}\n\n${marker}`)
    await expect(page.getByTestId("policy-save")).toBeEnabled()

    // The audit note is required: saving without one is refused.
    await page.getByTestId("policy-save").click()
    await expectToast(page, /Add an audit note/)
    await page.getByTestId("policy-audit-note").fill("E2E: added reviewer clause after Compliance review")
    await page.getByTestId("policy-save").click()
    await expectToast(page, /Policy & boundary saved/)
    await expect(page.getByTestId("policy-audit-note")).toHaveValue("")

    await page.reload()
    await expect(page.getByTestId("policy-form")).toBeVisible()
    await expect(page.getByTestId("policy-text")).toHaveValue(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    await expect(page.getByTestId("panel-usage-policy")).toContainText(/Version \d+/)
    const gov = await api<{ policy: { text: string; version: number }; events: { type: string }[] }>(page, "GET", "/api/mc/governance")
    expect(gov.policy.text).toContain(marker)
    expect(gov.events.some((e) => e.type === "policy.updated")).toBeTruthy()
  })

  test("teams: invite validates the email, import-groups reports not configured, champion select renders", async ({ page }) => {
    await page.goto("/admin/teams")
    await expect(page.getByTestId("teams-table").getByTestId("team-row").first()).toBeVisible()
    expect(await page.getByTestId("team-champion-select").count()).toBeGreaterThanOrEqual(3)
    await expect(page.getByTestId("team-champion-select").first()).not.toContainText("No champion")
    await expect(page.getByTestId("people-table").getByTestId("person-row").first()).toBeVisible()

    await page.getByTestId("invite-open").click()
    const form = page.getByTestId("invite-form")
    await expect(form).toBeVisible()
    await expect(form.getByTestId("invite-send")).toBeDisabled()
    await form.getByTestId("invite-email").fill("not-an-email")
    await form.getByTestId("invite-send").click()
    // Native email validation keeps the dialog open and nothing is sent.
    await expect(form).toBeVisible()
    expect(await form.getByTestId("invite-email").evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false)
    await expect(toast(page)).toHaveCount(0)

    const email = `e2e-${Date.now()}@example.com`
    await form.getByTestId("invite-email").fill(email)
    await form.getByTestId("invite-send").click()
    // WorkOS mode emails the invitation ("Invited …"); OIDC mode has no email step ("… added as invited").
    await expect(toast(page, new RegExp(`Invited ${email}|${email} added as invited|Couldn't send the invite`)).first()).toBeVisible({ timeout: 30_000 })
    if (await toast(page, /Invited|added as invited/).count()) {
      await expect(form).toBeHidden()
      await page.getByTestId("people-search").fill(email)
      await expect(page.getByTestId("people-table").getByTestId("person-row")).toHaveCount(1)
      await expect(page.getByTestId("people-table").getByTestId("person-row")).toContainText("invited")
    } else {
      await page.keyboard.press("Escape")
    }

    await page.getByTestId("import-groups").click()
    const notConfigured = page.getByTestId("import-groups-501")
    await expect(notConfigured).toBeVisible()
    await expect(notConfigured.getByTestId("not-configured-claude_admin")).toContainText("Not configured")
    await expect(notConfigured).toContainText(/Admin API key/)
    await expect(notConfigured.getByTestId("not-configured-link")).toHaveAttribute("href", "/admin/integrations")
  })

  test("marketplace: status card, setup checklist with 8 steps, and sync", async ({ page }) => {
    await page.goto("/admin/marketplace")
    const status = page.getByTestId("repo-status")
    await expect(status).toBeVisible()
    await expect(status).toContainText("Repo")
    await expect(status).toContainText(/\d+ plugins · \d+ skills/)
    await expect(status).toContainText(/local|github/)
    await expect(page.getByTestId("panel-assignments")).toBeVisible()

    const checklist = page.getByTestId("setup-checklist")
    await expect(checklist).toBeVisible()
    await expect(checklist).toHaveAttribute("data-total", "8")
    await expect(checklist.locator("[data-testid^=setup-step-]:not([data-testid=setup-step-link])")).toHaveCount(8)
    for (const key of ["keys", "sso", "groups", "context", "governance", "repo", "connector", "baseline"]) {
      await expect(checklist.getByTestId(`setup-step-${key}`)).toBeVisible()
    }
    await expect(checklist).toContainText(/\d of 8 steps complete/)

    // The sync button round-trips to the API and reports the outcome in a toast either way.
    const sync = page.getByTestId("marketplace-sync")
    await expect(sync).toBeEnabled()
    await sync.click()
    await expect(toast(page, /Repo synced|Sync failed/).first()).toBeVisible({ timeout: 60_000 })
    await expect(sync).toBeEnabled()
  })

  test("marketplace sync re-reads the local repo", async ({ page }) => {
    await page.goto("/admin/marketplace")
    await page.getByTestId("marketplace-sync").click()
    await expectToast(page, /Repo synced/, 60_000)
    await expect(page.getByTestId("repo-status")).toContainText(/[1-9]\d* plugins/)
  })
})

/** Company admin > Sign-in as Elena Marsh: the company connects its own sign-in from here. */
test.describe("company sign-in setup", () => {
  test.use({ role: "sponsor" })

  test("shows the company is setting up, lists its admins, and sends the admin straight to WorkOS to verify the domain", async ({ page }) => {
    await page.goto("/admin/sign-in")
    await expect(page.getByTestId("admin-tab-sign-in")).toHaveAttribute("aria-current", "page")
    if (process.env.E2E_AUTH === "oidc") {
      await expect(page.getByTestId("sign-in-self-hosted")).toBeVisible()
      return
    }
    const view = page.getByTestId("sign-in-view")
    await expect(view).toHaveAttribute("data-phase", "setup")
    await expect(page.getByTestId("sign-in-phase")).toHaveText("Setting up")
    await expect(page.getByTestId("sign-in-admins")).toContainText("elena.marsh@meridianwealth.demo")
    await expect(page.getByTestId("sign-in-domains")).toContainText("meridianwealth.demo")
    // WorkOS only switches on single sign-on for a verified domain: until then the SSO step waits.
    await expect(page.getByTestId("sign-in-needs-domain")).toBeVisible()
    await expect(page.getByTestId("sign-in-connect-sso")).toBeDisabled()
    // The link is made at click time and the browser goes straight to it, so it cannot expire on the way.
    await Promise.all([
      page.waitForURL((u) => /workos\.com$/.test(u.hostname), { timeout: 30_000 }),
      page.getByTestId("sign-in-verify-domain").click(),
    ])
  })

  test("the setup checklist points at the Sign-in tab", async ({ page }) => {
    const status = await api<{ steps: { key: string; done: boolean }[] }>(page, "GET", "/api/org/setup")
    expect(status.steps.map((s) => s.key)).toContain("sso")
    await page.goto("/admin/sign-in")
    await expect(page.getByTestId("sign-in-step-roles")).toContainText("activate-champion")
  })
})
