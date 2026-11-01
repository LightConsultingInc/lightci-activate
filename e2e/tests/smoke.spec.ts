import { test, expect } from "./helpers/fixtures"
import { OIDC_MODE } from "./helpers/auth"

test.describe("smoke: auth and shell", () => {
  test("signed-out visitors land on the in-app login page", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined })
    const page = await ctx.newPage()
    await page.goto("/")
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByTestId("login-form")).toBeVisible()
    await expect(page.getByTestId("login-sso")).toBeVisible()
    await ctx.close()
  })

  test("a wrong password shows a friendly error", async ({ browser }) => {
    test.skip(OIDC_MODE, "passwords live with the identity provider in OIDC mode")
    const ctx = await browser.newContext({ storageState: undefined })
    const page = await ctx.newPage()
    await page.goto("/login")
    await page.getByTestId("login-email").fill("priya.nair@meridianwealth.demo")
    await page.getByTestId("login-continue").click()
    await page.getByLabel("Password").fill("definitely-wrong")
    await page.getByTestId("login-submit").click()
    await expect(page.getByTestId("login-error")).toBeVisible({ timeout: 20_000 })
    await ctx.close()
  })

  test("OIDC mode: the login page offers only the company sign-in and a wrong IdP password stays at the IdP", async ({ browser }) => {
    test.skip(!OIDC_MODE, "only meaningful in OIDC mode")
    const ctx = await browser.newContext({ storageState: undefined })
    const page = await ctx.newPage()
    await page.goto("/login")
    await expect(page.getByTestId("login-sso")).toBeVisible()
    await expect(page.getByTestId("login-email")).toHaveCount(0)
    await page.getByTestId("login-sso").click()
    await page.waitForURL(/\/realms\/activate-test\//)
    await page.locator("#username").fill("priya.nair@meridianwealth.demo")
    await page.locator("#password").fill("definitely-wrong")
    await page.locator("#kc-login").click()
    await expect(page.locator("#input-error, .kc-feedback-text, #input-error-username, #input-error-password").first()).toBeVisible({ timeout: 20_000 })
    // Still at the identity provider, never back in the app.
    expect(new URL(page.url()).port).not.toBe("3000")
    await ctx.close()
  })

  test("learner sees the learner navigation and org", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("app-sidebar")).toBeVisible()
    await expect(page.getByTestId("nav-ladder")).toBeVisible()
    await expect(page.getByTestId("nav-library")).toBeVisible()
    await expect(page.getByTestId("nav-mc-adoption")).toHaveCount(0)
    await expect(page.getByTestId("topbar-org")).toContainText("Meridian")
  })

  test("the browser talks only to the web origin; /api is proxied to the API at runtime", async ({ page }) => {
    const offOrigin: string[] = []
    page.on("request", (req) => {
      const url = new URL(req.url())
      if (url.port === "4310" || url.hostname.includes("4310")) offOrigin.push(req.url())
    })
    await page.goto("/")
    await expect(page.getByTestId("app-sidebar")).toBeVisible()
    const me = await page.evaluate(async () => {
      const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${(await (await fetch("/auth/token")).json()).accessToken}` } })
      return { status: res.status, requestId: res.headers.get("x-request-id"), body: (await res.json()) as { user: { email: string } | null } }
    })
    expect(me.status).toBe(200)
    expect(me.requestId).toBeTruthy()
    expect(me.body.user?.email).toBe("priya.nair@meridianwealth.demo")
    expect(offOrigin).toEqual([])
  })

  test("a signed-out browser call to the proxied API gets a plain 401", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined })
    const res = await ctx.request.get("/api/people")
    expect(res.status()).toBe(401)
    expect(await res.json()).toMatchObject({ status: 401 })
    await ctx.close()
  })

  test("sign out returns to login", async ({ page }) => {
    await page.goto("/")
    await page.getByTestId("user-menu").click()
    await page.getByTestId("sign-out").click()
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 })
  })
})

test.describe("smoke: roles", () => {
  test.describe("champion", () => {
    test.use({ role: "champion" })
    test("sees team navigation", async ({ page }) => {
      await page.goto("/")
      await expect(page.getByTestId("nav-team")).toBeVisible()
      await expect(page.getByTestId("nav-promotions")).toBeVisible()
    })
  })
  test.describe("sponsor", () => {
    test.use({ role: "sponsor" })
    test("sees Mission Control and company admin", async ({ page }) => {
      await page.goto("/")
      await expect(page.getByTestId("nav-mc-adoption")).toBeVisible()
      await expect(page.getByTestId("nav-admin-integrations")).toBeVisible()
    })
  })
  test.describe("lead", () => {
    test.use({ role: "lead" })
    test("sees the LightCI console", async ({ page }) => {
      await page.goto("/")
      await expect(page.getByTestId("nav-lead")).toBeVisible()
    })
  })
})
