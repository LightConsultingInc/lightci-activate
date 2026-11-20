import { test, expect } from "../helpers/fixtures"
import { signIn } from "../helpers/auth"
import { API_URL as API } from "../helpers/api"
import { USERS } from "../helpers/users"

/**
 * Requirement "PRISM Local setup" (eb2ea081): proves the stack brought up by following PRISM.md
 * is really serving — API liveness/readiness/Swagger on :4310, the web app on :3000 with its
 * /api proxy, and a real sign-in as one seeded demo user from the login page (WorkOS or OIDC,
 * whichever mode the stack runs in — `signIn` branches on E2E_AUTH).
 */

// Signed out: the sign-in itself is the proof, so no saved session for the `page` fixture.
test.use({ storageState: { cookies: [], origins: [] } })

test("API health, readiness and Swagger answer as PRISM.md documents", async ({ request }) => {
  const health = await request.get(`${API}/api/health`)
  expect(health.status()).toBe(200)
  expect(await health.json()).toEqual({ status: "ok" })

  const ready = await request.get(`${API}/api/ready`)
  expect(ready.status()).toBe(200)
  expect(await ready.json()).toMatchObject({ status: "ok", db: "ok", migrations: "current" })

  const docs = await request.get(`${API}/docs`)
  expect(docs.status()).toBe(200)
})

test("web app on :3000 — /sign-in readiness code, /api proxy, and sign-in as a seeded demo user", async ({ page, request }) => {
  const signInProbe = await request.get("/sign-in", { maxRedirects: 0 })
  expect([200, 302, 307]).toContain(signInProbe.status())

  const proxied = await request.get("/api/health")
  expect(proxied.status()).toBe(200)
  expect(await proxied.json()).toEqual({ status: "ok" })

  // Visual proof, as a signed-out user: the API's own docs, then the login page and a real sign-in.
  await page.goto(`${API}/api/ready`)
  await expect(page.locator("body")).toContainText('"migrations":"current"')
  await page.goto(`${API}/docs`)
  await expect(page.locator("#swagger-ui")).toBeVisible()

  await page.goto("/")
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByTestId("login-form")).toBeVisible()
  await signIn(page, "learner") // Priya Nair — first demo user in PRISM.md's table
  await expect(page.getByText(USERS.learner.name).first()).toBeVisible()
  await page.waitForTimeout(1500)
})
