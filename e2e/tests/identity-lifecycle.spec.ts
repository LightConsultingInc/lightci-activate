import { expect, type Page } from "@playwright/test"
import { test } from "./helpers/fixtures"
import { API_URL, api } from "./helpers/api"
import { expectToast } from "./helpers/ui"
import { OIDC_MODE } from "./helpers/auth"
import {
  claimInvitedUser,
  SAML_ISSUER,
  SAML_SSO_URL,
  createKeycloakUser,
  createSamlClient,
  createWorkosUser,
  deleteKeycloakUser,
  deleteWorkosUsersOnDomain,
  deleteSamlClient,
  keycloakReachable,
  latestSessionMethod,
  markDomainVerified,
  passwordSession,
  realmCertificateFile,
  testPassword,
  workos,
} from "./helpers/identity"

/**
 * The whole self-serve sign-in setup for a new client, with nobody clicking anything by hand:
 * a LightCI lead creates the client and invites its admin; the admin accepts the invitation and
 * signs in before single sign-on exists; someone nobody invited is kept out; the client's IT team
 * verifies the domain and connects their identity provider (the local Keycloak realm) through the
 * real WorkOS setup pages; then the old password session stops working and SSO lets the admin in.
 */
test.describe("identity lifecycle: invite, set up, switch to single sign-on", () => {
  // WorkOS mode only: an OIDC install signs in through its own identity provider, with no WorkOS at all.
  test.skip(OIDC_MODE, "WorkOS-mode lifecycle")
  test.describe.configure({ mode: "serial", timeout: 300_000 })
  test.use({ role: "lead" })

  const stamp = Date.now()
  const domain = `lc-${stamp}.example`
  const adminEmail = `it.admin@${domain}`
  const adminPassword = testPassword()
  const idpPassword = testPassword()
  let clientId = ""
  let workosOrgId = ""
  let adminToken = ""
  let adminUserId = ""
  /** The admin's browser while signed in with a password during setup, kept for the switch-over check. */
  let setupBrowserState: Awaited<ReturnType<import("@playwright/test").BrowserContext["storageState"]>> | null = null
  const cleanup: (() => Promise<unknown>)[] = []

  test.beforeAll(async () => {
    expect(await keycloakReachable(), "Keycloak must be running (api/test/keycloak/start.sh)").toBe(true)
  })

  test.afterAll(async () => {
    if (OIDC_MODE) return
    for (const fn of cleanup.reverse()) await fn().catch(() => {})
    // Whatever step a run stopped at, no WorkOS user on this run's domain survives it.
    await deleteWorkosUsersOnDomain(domain)
  })

  test("a lead creates the client and invites its admin", async ({ page }) => {
    const org = await api<{ id: string; workosOrganizationId: string }>(page, "POST", "/api/lead/clients", {
      name: `Lifecycle ${stamp}`,
      slug: `lifecycle-${stamp}`,
      emailDomains: [domain],
      seats: 5,
    })
    clientId = org.id
    workosOrgId = org.workosOrganizationId
    expect(workosOrgId).toMatch(/^org_/)
    cleanup.push(() => workos("DELETE", `/organizations/${workosOrgId}`))

    await page.goto(`/lead/clients/${clientId}`)
    const identity = page.getByTestId("client-identity")
    await expect(identity.getByTestId("client-sso-status")).toHaveText("Waiting for the client to connect")
    const form = identity.getByTestId("client-invite-admin")
    await form.getByLabel("Admin email").fill(adminEmail)
    await form.getByLabel("Admin name").fill("IT Admin")
    await form.getByTestId("client-invite-admin-submit").click()
    await expectToast(page, /Invitation sent/)
    await expect(identity.getByTestId("client-admins")).toContainText(`${adminEmail} · invited`)
  })

  test("the admin accepts the invitation and gets in before single sign-on exists", async ({ request }) => {
    const invitations = await workos<{ data: { id: string; token: string; state: string; organization_id: string }[] }>("GET", `/user_management/invitations?email=${encodeURIComponent(adminEmail)}`)
    const invitation = invitations.data.find((i) => i.organization_id === workosOrgId && i.state === "pending")
    expect(invitation, "WorkOS sent an invitation into the client's organisation").toBeTruthy()

    adminUserId = await claimInvitedUser(adminEmail, adminPassword)
    cleanup.push(() => workos("DELETE", `/user_management/users/${adminUserId}`))
    const session = await passwordSession(adminEmail, adminPassword, invitation!.token)
    adminToken = session.accessToken

    const memberships = await workos<{ data: { role: { slug: string } }[] }>("GET", `/user_management/organization_memberships?user_id=${adminUserId}&organization_id=${workosOrgId}`)
    expect(memberships.data[0]?.role.slug).toBe("admin")

    const me = await request.get(`${API_URL}/api/auth/me`, { headers: { authorization: `Bearer ${adminToken}` } })
    expect(me.status()).toBe(200)
    const body = (await me.json()) as { user: { roles: string[]; orgId: string } }
    expect(body.user.orgId).toBe(clientId)
    expect(body.user.roles).toContain("admin")

    const status = await request.get(`${API_URL}/api/org/sign-in`, { headers: { authorization: `Bearer ${adminToken}` } })
    expect(((await status.json()) as { phase: string }).phase).toBe("setup")
  })

  test("someone nobody invited is kept out while the company is setting up", async ({ request }) => {
    const email = `walk.in@${domain}`
    const password = testPassword()
    const userId = await createWorkosUser(email, password)
    cleanup.push(() => workos("DELETE", `/user_management/users/${userId}`))
    await workos("POST", "/user_management/organization_memberships", { user_id: userId, organization_id: workosOrgId })
    const { accessToken } = await passwordSession(email, password)
    const res = await request.get(`${API_URL}/api/auth/me`, { headers: { authorization: `Bearer ${accessToken}` } })
    expect(res.status()).toBe(403)
    expect(((await res.json()) as { detail: string }).detail).toMatch(/still setting up sign-in/)

    // An account off the company's domains, even inside its WorkOS organisation, never gets in.
    const outsiderEmail = `outsider-${stamp}@elsewhere-${stamp}.example`
    const outsiderId = await createWorkosUser(outsiderEmail, password)
    cleanup.push(() => workos("DELETE", `/user_management/users/${outsiderId}`))
    await workos("POST", "/user_management/organization_memberships", { user_id: outsiderId, organization_id: workosOrgId })
    const outsider = await passwordSession(outsiderEmail, password)
    const off = await request.get(`${API_URL}/api/auth/me`, { headers: { authorization: `Bearer ${outsider.accessToken}` } })
    expect(off.status()).toBe(403)
    expect(((await off.json()) as { detail: string }).detail).toMatch(/isn't on your company's email domain/)
  })

  test("the admin verifies the domain and connects their identity provider, all from Activate", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined })
    const page = await ctx.newPage()
    await hostedPasswordSignIn(page, adminEmail, adminPassword)

    // An invited admin lands straight on Sign-in, not on learner onboarding.
    await expect(page).toHaveURL(/\/admin\/sign-in$/, { timeout: 30_000 })
    await expect(page.getByTestId("sign-in-view")).toHaveAttribute("data-phase", "setup")
    // Elsewhere in the app a banner keeps pointing them back to it.
    await page.goto("/library")
    await expect(page.getByTestId("sign-in-banner")).toBeVisible()
    await page.getByTestId("sign-in-banner-link").click()
    await expect(page.getByTestId("sign-in-view")).toHaveAttribute("data-phase", "setup")
    await expect(page.getByTestId("sign-in-needs-domain")).toBeVisible()
    await expect(page.getByTestId("sign-in-connect-sso")).toBeDisabled()

    // Step 1 opens WorkOS's domain verification. DNS is not under test: WorkOS is told the record was found.
    // The WorkOS pages open in a new tab (they have no way back), and Activate stays open behind them.
    const [domainTab] = await Promise.all([page.context().waitForEvent("page"), page.getByTestId("sign-in-verify-domain").click()])
    await domainTab.waitForURL((u) => u.hostname.endsWith("workos.com"), { timeout: 30_000 })
    await expect(page.getByTestId("sign-in-view")).toBeVisible()
    await markDomainVerified(workosOrgId, domain)
    await domainTab.close()
    await page.goto("/admin/sign-in?returned=domain_verification")
    await expect(page.getByTestId("sign-in-step-domain")).toContainText("Done")
    await expect(page.getByTestId("sign-in-connect-sso")).toBeEnabled()

    // Step 2: WorkOS's guided setup for Keycloak, followed exactly as the client's IT admin would.
    const keycloakPeople = await createKeycloakUser(adminEmail, idpPassword)
    cleanup.push(() => deleteKeycloakUser(keycloakPeople))
    const [setup] = await Promise.all([page.context().waitForEvent("page"), page.getByTestId("sign-in-connect-sso").click()])
    await setup.waitForURL((u) => u.hostname === "setup.workos.com", { timeout: 30_000 })
    await setup.getByText("Keycloak SAML", { exact: true }).click()
    await expect(setup.getByText(/Step 1/)).toBeVisible({ timeout: 45_000 })
    const spEntityId = await valueAfter(setup, "Client ID")
    const acsUrl = await valueAfter(setup, "Master SAML Processing URL")
    const keycloakClient = await createSamlClient(spEntityId, acsUrl)
    cleanup.push(() => deleteSamlClient(keycloakClient))
    for (const step of [/Step 2/, /Step 3/, /Step 4/]) {
      await setup.getByRole("button", { name: "Continue" }).click()
      await expect(setup.getByText(step)).toBeVisible({ timeout: 30_000 })
    }
    await setup.getByText("Manual configuration", { exact: true }).click()
    await setup.locator('input[name="idpUrl"]').fill(SAML_SSO_URL)
    await setup.locator('input[name="idpEntityId"]').fill(SAML_ISSUER)
    await setup.locator('input[type="file"]').setInputFiles(await realmCertificateFile())
    await setup.getByRole("button", { name: "Continue" }).click()
    await expect(setup.getByText(/Step 5/)).toBeVisible({ timeout: 30_000 })
    const contact = setup.locator('input[type="email"]').first()
    if (await contact.isVisible().catch(() => false)) await contact.fill(adminEmail)
    await setup.getByRole("button", { name: "Continue" }).click()
    await expect(setup.getByText(/Step 6/)).toBeVisible({ timeout: 30_000 })
    await setup.screenshot({ path: `test-results/lifecycle-step6-${stamp}.png`, fullPage: true })
    await finishWorkosSsoTest(setup, adminEmail, idpPassword)

    setupBrowserState = await ctx.storageState()
    await ctx.close()
  })

  test("single sign-on is on: the old password session is refused and SSO lets the admin in", async ({ browser, request }) => {
    await expect
      .poll(async () => ((await workos<{ data: { state: string }[] }>("GET", `/connections?organization_id=${workosOrgId}`)).data.map((c) => c.state)), { timeout: 60_000 })
      .toContain("active")
    // The API re-reads the phase within a minute; a webhook would do it at once (none reach localhost).
    await expect
      .poll(async () => (await request.get(`${API_URL}/api/auth/me`, { headers: { authorization: `Bearer ${adminToken}` } })).status(), { timeout: 90_000, intervals: [5_000] })
      .toBe(401)
    const refused = await request.get(`${API_URL}/api/auth/me`, { headers: { authorization: `Bearer ${adminToken}` } })
    expect(((await refused.json()) as { detail: string }).detail).toMatch(/single sign-on/)
    // The Claude connector refuses it too, with the OAuth discovery header so Claude signs in again (now through SSO).
    const mcp = await request.post(`${API_URL}/mcp`, {
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      data: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "lifecycle", version: "1" } } },
    })
    expect(mcp.status()).toBe(401)
    expect(mcp.headers()["www-authenticate"]).toMatch(/resource_metadata=/)

    // The browser still holding the setup-time password session is signed out and told why.
    expect(setupBrowserState).toBeTruthy()
    const stale = await browser.newContext({ storageState: setupBrowserState! })
    const stalePage = await stale.newPage()
    await stalePage.goto("/admin/sign-in")
    await expect(stalePage).toHaveURL(/\/login\?authError=sso/, { timeout: 30_000 })
    await expect(stalePage.getByTestId("login-error")).toContainText("now signs in with its own single sign-on")
    // Signing in again from that same browser goes to their identity provider and gets in. (Through the
    // hosted AuthKit page WorkOS reused the old password session, and the policy refused it in a loop.)
    await stalePage.getByTestId("login-email").fill(adminEmail)
    await stalePage.getByTestId("login-continue").click()
    // This browser may still hold the identity provider's own session from the setup test, in which case
    // Keycloak lets them straight through without its form.
    await stalePage.waitForURL((u) => u.port === "8089" || u.pathname.includes("/sso/signin-consent") || (u.port === "3000" && !u.pathname.startsWith("/login")), { timeout: 45_000 })
    if (new URL(stalePage.url()).port === "8089" && (await stalePage.locator("#username").isVisible().catch(() => false))) await keycloakSignIn(stalePage, adminEmail, idpPassword)
    // WorkOS may ask the person to approve the sign-in it received; answer it until we are back in Activate.
    for (let i = 0; i < 4; i++) {
      const here = new URL(stalePage.url())
      if (here.port === "3000" && !here.pathname.startsWith("/callback") && !here.pathname.startsWith("/login")) break
      if (here.pathname.includes("/sso/signin-consent")) {
        const approve = stalePage.getByRole("button").filter({ hasNotText: /cancel|deny|back|not you/i }).first()
        await approve.waitFor({ timeout: 15_000 })
        console.log("[lifecycle] WorkOS consent screen:", (await stalePage.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300))
        await approve.click()
      }
      await stalePage.waitForURL((u) => u.href !== here.href, { timeout: 20_000 }).catch(() => {})
    }
    await stalePage.waitForURL((u) => u.port === "3000" && !u.pathname.startsWith("/callback") && !u.pathname.startsWith("/login"), { timeout: 45_000 })
    expect(await latestSessionMethod(adminUserId)).toBe("sso")
    await stale.close()

    const ctx = await browser.newContext({ storageState: undefined })
    const page = await ctx.newPage()
    await page.goto("/login")
    await page.getByTestId("login-email").fill(adminEmail)
    await page.getByTestId("login-continue").click()
    await keycloakSignIn(page, adminEmail, idpPassword)
    // Signed in through their own identity provider. With sign-in done, they are onboarded like everyone else.
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 45_000 })
    expect(await latestSessionMethod(adminUserId)).toBe("sso")
    const me = await api<{ user: { roles: string[]; orgId: string } }>(page, "GET", "/api/auth/me")
    expect(me.user.orgId).toBe(clientId)
    expect(me.user.roles).toContain("admin")
    await page.goto("/admin/sign-in")
    await expect(page.getByTestId("sign-in-phase")).toHaveText("Single sign-on is on")
    await expect(page.getByTestId("sign-in-banner")).toHaveCount(0)
    await ctx.close()
  })
})

/** The value WorkOS shows under a label in its setup guide (client id, ACS URL). */
async function valueAfter(page: Page, label: string): Promise<string> {
  const text = await page.locator("main, body").first().innerText()
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)
  const i = lines.indexOf(label)
  if (i < 0 || !lines[i + 1]) throw new Error(`"${label}" not found on the WorkOS setup page`)
  return lines[i + 1]
}

/** Activate's login sends a company that is setting up to WorkOS's hosted page; sign in there with a password. */
async function hostedPasswordSignIn(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.getByTestId("login-email").fill(email)
  await page.getByTestId("login-continue").click()
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 })
  const emailField = page.locator('input[type="email"], input[name="email"]').first()
  if (await emailField.isVisible().catch(() => false)) {
    if (!(await emailField.inputValue())) await emailField.fill(email)
    await page.getByRole("button", { name: /^continue/i }).first().click()
  }
  await page.locator('input[type="password"]').fill(password, { timeout: 30_000 })
  await page.getByRole("button", { name: /continue|sign in/i }).first().click()
  await page.waitForURL((u) => u.port === "3000" && !u.pathname.startsWith("/callback"), { timeout: 45_000 })
}

/** Keycloak's login form (the client's identity provider, on localhost). */
async function keycloakSignIn(page: Page, email: string, password: string) {
  await page.waitForURL((u) => u.port === "8089", { timeout: 45_000 })
  await page.locator("#username").fill(email.split("@")[0])
  await page.locator("#password").fill(password)
  await page.locator("#kc-login").click()
  // WorkOS may ask the person to confirm the sign-in it received from their identity provider.
  await page.waitForURL((u) => u.port !== "8089", { timeout: 45_000 })
  if (page.url().includes("/sso/signin-consent")) {
    console.log("[lifecycle] WorkOS consent screen:", (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300))
    await page.getByRole("button").filter({ hasText: /approve|continue|confirm|allow/i }).first().click()
  }
}

/** WorkOS's last step: a test sign-in through the identity provider, then back to Activate. */
async function finishWorkosSsoTest(page: Page, email: string, password: string) {
  const test = page.getByRole("button", { name: /test|sign.?in|log.?in/i }).first()
  const link = page.getByRole("link", { name: /test|sign.?in|log.?in/i }).first()
  const target = (await test.isVisible().catch(() => false)) ? test : link
  const popupPromise = page.context().waitForEvent("page", { timeout: 10_000 }).catch(() => null)
  await target.click()
  const popup = await popupPromise
  const idpPage = popup ?? page
  await keycloakSignIn(idpPage, email, password)
  await idpPage.waitForURL((u) => u.hostname.endsWith("workos.com") || u.port === "3000", { timeout: 45_000 })
  if (popup) await popup.close().catch(() => {})
}
