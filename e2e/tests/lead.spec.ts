import { test, expect } from "./helpers/fixtures"
import { API_URL, api } from "./helpers/api"
import { expectToast, intOf } from "./helpers/ui"
import { USERS } from "./helpers/users"
import { readApiEnv, workosPasswordToken } from "./helpers/workos"
import { OIDC_MODE } from "./helpers/auth"

const COLUMNS = ["escalations", "approvals", "stalled", "waves"] as const

/** LightCI lead console as Zain Lakhani. Resolving an escalation and provisioning a client mutate state; serial. */
test.describe("lead console", () => {
  test.describe.configure({ mode: "serial" })
  test.use({ role: "lead" })

  let clientName = ""
  let clientDomain = ""
  let clientId = ""

  test("four queue columns render with counts", async ({ page }) => {
    await page.goto("/lead")
    await expect(page.getByTestId("lead-columns")).toBeVisible()
    for (const col of COLUMNS) {
      const column = page.getByTestId(`lead-col-${col}`)
      await expect(column, col).toBeVisible()
      await expect(column.getByTestId(`lead-col-${col}-count`)).toContainText(/^\d+$/)
      const count = await intOf(column.getByTestId(`lead-col-${col}-count`))
      await expect(column).toHaveAttribute("data-count", String(count))
    }
    expect(await intOf(page.getByTestId("lead-col-escalations-count"))).toBeGreaterThan(0)
    await expect(page.getByTestId("lead-escalation-card").first()).toBeVisible()
    await expect(page.getByTestId("lead-escalation-card").first().getByTestId("sla-timer")).toBeVisible()
    await expect(page.getByTestId("lead-wave-card").first()).toContainText(/week \d+ of \d+/)
    await expect(page.getByTestId("lead-stalled-card").first().getByTestId("stalled-open")).toBeVisible()
    if (await page.getByTestId("lead-approval-card").count()) await expect(page.getByTestId("lead-approval-card").first().getByTestId("approval-open")).toHaveAttribute("href", /\/promotions\//)
  })

  test("resolving an escalation without a selected client", async ({ page }) => {
    await page.goto("/lead")
    const count = page.getByTestId("lead-col-escalations-count")
    const before = await intOf(count)
    await page.getByTestId("lead-escalation-card").first().click()
    const drawer = page.getByTestId("escalation-drawer")
    await drawer.getByTestId("escalation-resolution").fill("E2E: resolved from the cross-client queue.")
    await drawer.getByTestId("escalation-resolve").click()
    await expectToast(page, /Escalation resolved/)
    await expect(count).toHaveText(String(before - 1))
  })

  test("resolving an escalation from the drawer decrements the column", async ({ page }) => {
    await page.goto("/lead")
    // Scope the lead to Meridian first (sets the activate_org cookie and reloads), as the org-scoped
    // resolve endpoint needs a client context; see BUGS.md #6 for the unscoped case.
    await page.getByTestId("client-switcher").click()
    await page.getByTestId("client-switcher-option").filter({ hasText: "Meridian Wealth Partners" }).click()
    await page.waitForLoadState("load")
    await expect(page.getByTestId("lead-columns")).toBeVisible()
    await expect(page.getByTestId("client-switcher")).toContainText("Meridian")
    const count = page.getByTestId("lead-col-escalations-count")
    const before = await intOf(count)
    const card = page.getByTestId("lead-escalation-card").first()
    const reason = (await card.locator("p.font-medium").textContent())?.trim() ?? ""
    await card.click()
    const drawer = page.getByTestId("escalation-drawer")
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText(reason)
    await expect(drawer.getByTestId("escalation-assignee")).toBeVisible()
    await expect(drawer.getByTestId("escalation-resolve")).toBeDisabled()
    await drawer.getByTestId("escalation-resolution").fill("E2E: reviewed with the champion; unblocked by re-running the champion interview for the missing decisions.")
    await expect(drawer.getByTestId("escalation-resolve")).toBeEnabled()
    await drawer.getByTestId("escalation-resolve").click()
    await expectToast(page, /Escalation resolved/)
    await expect(drawer).toBeHidden()
    await expect(count).toHaveText(String(before - 1))
    await expect(page.getByTestId("lead-col-escalations")).toHaveAttribute("data-count", String(before - 1))
    await expect(page.getByTestId("lead-escalation-card").filter({ hasText: reason })).toHaveCount(0)
  })

  test("client switcher lists Meridian", async ({ page }) => {
    await page.goto("/lead")
    const switcher = page.getByTestId("client-switcher")
    await expect(switcher).toBeVisible()
    await switcher.click()
    const options = page.getByTestId("client-switcher-option")
    await expect(options.filter({ hasText: "Meridian Wealth Partners" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(options.first()).toBeHidden()
  })

  test("clients table lists provisioned orgs", async ({ page }) => {
    await page.goto("/lead/clients")
    const table = page.getByTestId("clients-table")
    await expect(table).toBeVisible()
    const rows = table.getByTestId("client-row")
    expect(await rows.count()).toBeGreaterThanOrEqual(1)
    const meridian = rows.filter({ hasText: "Meridian Wealth Partners" })
    await expect(meridian).toBeVisible()
    await expect(meridian).toContainText("meridian")
    await expect(meridian.getByTestId("rung-mix")).toBeVisible()
    await expect(page.getByTestId("panel-clients")).toContainText(/Clients · \d+/)
  })

  test("provision dialog validates and creates a client", async ({ page }) => {
    await page.goto("/lead/clients")
    await page.getByTestId("provision-open").click()
    const dialog = page.getByTestId("provision-dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId("provision-submit")).toBeDisabled()
    clientName = `E2E Client ${Date.now()}`
    await dialog.getByTestId("provision-name").fill(clientName)
    await expect(dialog.getByTestId("provision-slug")).toHaveValue(/^e2e-client-\d+$/)
    await expect(dialog).toContainText(/e2e-client-\d+-claude-marketplace/)
    await dialog.getByTestId("provision-seats").fill("0")
    await expect(dialog.getByTestId("provision-submit")).toBeDisabled()
    await dialog.getByTestId("provision-seats").fill("12")
    await dialog.getByTestId("provision-industry").fill("Wealth management")
    await dialog.getByTestId("provision-sponsor").fill("E2E Sponsor, COO")
    // Creating the identity organisation needs at least one email domain.
    await expect(dialog.getByTestId("provision-create-identity")).toBeChecked()
    await expect(dialog.getByTestId("provision-submit")).toBeDisabled()
    clientDomain = `${await dialog.getByTestId("provision-slug").inputValue()}.example`
    await dialog.getByTestId("provision-domains").fill(`${clientDomain}, not a domain`)
    await expect(dialog.getByTestId("provision-submit")).toBeEnabled()
    await dialog.getByTestId("provision-submit").click()
    await expectToast(page, new RegExp(`${clientName} provisioned`))
    await expect(page).toHaveURL(/\/lead\/clients\/[0-9a-f-]{36}/)
    clientId = page.url().match(/\/lead\/clients\/([0-9a-f-]{36})/)?.[1] ?? ""
    await expect(page.getByTestId("client-detail")).toBeVisible()
    await expect(page.getByRole("heading", { level: 1 })).toContainText(clientName)
    await expect(page.getByTestId("client-detail")).toContainText("of 12 seats")
    await expect(page.getByTestId("setup-checklist")).toBeVisible()
    await expect(page.getByTestId("setup-checklist")).toHaveAttribute("data-total", "8")

    // WorkOS mode: the identity organisation was really created; the client has not connected SSO yet.
    // OIDC mode: identity lives with the customer's IdP, so no WorkOS organisation exists.
    const identity = page.getByTestId("client-identity")
    await expect(identity.getByTestId("client-sso-status")).toHaveText(OIDC_MODE ? "No identity organisation" : "Waiting for the client to connect")
    await expect(identity.getByTestId("client-domains")).toHaveText(clientDomain)
    await expect(page.getByTestId("setup-step-sso")).toHaveAttribute("data-done", "false")

    await page.goto("/lead/clients")
    await expect(page.getByTestId("clients-table").getByTestId("client-row").filter({ hasText: clientName })).toBeVisible()
    await page.getByTestId("client-switcher").click()
    await expect(page.getByTestId("client-switcher-option").filter({ hasText: clientName })).toBeVisible()
    await page.keyboard.press("Escape")
  })

  test("sign-in lookup routes a client still connecting sign-in to setup, and the demo org to a password", async ({ page, request }) => {
    test.skip(OIDC_MODE, "the lookup is a WorkOS-mode feature")
    expect(clientId, "provisioning test must run first").toBeTruthy()
    const detail = await api<{ org: { workosOrganizationId: string | null; emailDomains: string[] } }>(page, "GET", `/api/lead/clients/${clientId}`)
    expect(detail.org.workosOrganizationId).toMatch(/^org_/)
    expect(detail.org.emailDomains).toEqual([clientDomain])

    // No SSO connection yet: the company is setting up, so its invited admins use the hosted page.
    const setup = await (await request.get(`${API_URL}/api/auth/lookup?email=${encodeURIComponent(`someone@${clientDomain}`)}`)).json()
    expect(setup).toEqual({ mode: "setup", organizationId: detail.org.workosOrganizationId, passwordAllowed: false })
    const demo = await (await request.get(`${API_URL}/api/auth/lookup?email=priya.nair@meridianwealth.demo`)).json()
    expect(demo).toEqual({ mode: "password", passwordAllowed: true })
    const unknown = await (await request.get(`${API_URL}/api/auth/lookup?email=nobody@nowhere-at-all.example`)).json()
    expect(unknown).toEqual({ mode: "unknown", passwordAllowed: true })
    const malformed = await (await request.get(`${API_URL}/api/auth/lookup?email=garbage`)).json()
    expect(malformed).toEqual({ mode: "unknown", passwordAllowed: true })
  })

  test("the login page sends a company that is still setting up to the hosted sign-in page", async ({ browser }) => {
    test.skip(OIDC_MODE, "WorkOS-mode routing")
    expect(clientDomain, "provisioning test must run first").toBeTruthy()
    const ctx = await browser.newContext({ storageState: undefined })
    const page = await ctx.newPage()
    await page.goto("/login")
    await page.getByTestId("login-email").fill(`someone@${clientDomain}`)
    await page.getByTestId("login-continue").click()
    // /sign-in redirects to hosted AuthKit (no organisation forced, since there is no SSO yet); Activate's own password form never appears.
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 })
    expect(new URL(page.url()).hostname).toMatch(/authkit\.app|workos\.com/)
    await ctx.close()
  })

  test("a lead invites the client's admin; addresses off the client's domain are refused", async ({ page }) => {
    test.skip(OIDC_MODE, "WorkOS invitations are a WorkOS-mode feature")
    expect(clientId, "provisioning test must run first").toBeTruthy()
    await page.goto(`/lead/clients/${clientId}`)
    const identity = page.getByTestId("client-identity")
    const form = identity.getByTestId("client-invite-admin")
    await form.getByLabel("Admin email").fill("it.admin@not-their-domain.example")
    await form.getByTestId("client-invite-admin-submit").click()
    await expectToast(page, /Couldn't invite them/)
    await form.getByLabel("Admin email").fill(`it.admin@${clientDomain}`)
    await form.getByLabel("Admin name").fill("IT Admin")
    await form.getByTestId("client-invite-admin-submit").click()
    await expectToast(page, /Invitation sent/)
    await expect(identity.getByTestId("client-admins")).toContainText(`it.admin@${clientDomain} · invited`)
    const status = await api<{ phase: string; admins: { email: string; status: string }[] }>(page, "GET", `/api/lead/clients/${clientId}/sign-in`)
    expect(status.phase).toBe("setup")
    expect(status.admins).toEqual([expect.objectContaining({ email: `it.admin@${clientDomain}`, status: "invited" })])
  })

  test("the SSO setup button opens a one-time WorkOS Admin Portal link", async ({ page }) => {
    test.skip(OIDC_MODE, "Admin Portal links are a WorkOS-mode feature")
    expect(clientId, "provisioning test must run first").toBeTruthy()
    await page.goto(`/lead/clients/${clientId}`)
    const popup = page.waitForEvent("popup")
    await page.getByTestId("client-sso-link").click()
    const portal = await popup
    await portal.waitForLoadState("domcontentloaded")
    expect(portal.url()).toMatch(/workos\.com/)
    await portal.close()
    await expectToast(page, /Single sign-on setup opened/)
  })

  test("the sign-in lookup is rate limited", async ({ request }) => {
    const statuses: number[] = []
    for (let i = 0; i < 40; i++) {
      const res = await request.get(`${API_URL}/api/auth/lookup?email=probe${i}@ratelimit.example`, { headers: { "X-Forwarded-For": "203.0.113.77" } })
      statuses.push(res.status())
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0)
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true)
  })

  test.afterAll(async ({ request }) => {
    // Remove the identity organisation this run created in the shared WorkOS test environment.
    if (!clientId || OIDC_MODE) return
    const env = readApiEnv()
    const detail = await (await request.get(`${API_URL}/api/lead/clients/${clientId}`, { headers: { Authorization: `Bearer ${await workosPasswordToken(request, USERS.lead.email)}` } })).json()
    const workosOrgId = detail?.org?.workosOrganizationId as string | undefined
    if (workosOrgId && env.WORKOS_API_KEY) {
      const res = await request.delete(`https://api.workos.com/organizations/${workosOrgId}`, { headers: { Authorization: `Bearer ${env.WORKOS_API_KEY}` } })
      if (!res.ok() && res.status() !== 404) throw new Error(`WorkOS cleanup failed: ${res.status()} ${await res.text()}`)
    }
  })
})
