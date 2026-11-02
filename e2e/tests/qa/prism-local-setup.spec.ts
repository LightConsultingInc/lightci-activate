import { test, expect } from "@playwright/test"
import { PASSWORD, USERS } from "../helpers/users"

/**
 * Requirement "PRISM Local setup" (eb2ea081): proves the stack brought up by following PRISM.md
 * is really serving — API liveness/readiness/Swagger on :4310, the web app on :3000 with its
 * /api proxy, and a real WorkOS sign-in as one seeded demo user from the login page.
 */
const API = process.env.API_URL ?? "http://localhost:4310"

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

  // Visual proof, as a user: the API's own docs, then the login page and a real WorkOS sign-in.
  await page.goto(`${API}/api/ready`)
  await expect(page.locator("body")).toContainText('"migrations":"current"')
  await page.goto(`${API}/docs`)
  await expect(page.locator("#swagger-ui")).toBeVisible()

  await page.goto("/")
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByTestId("login-form")).toBeVisible()
  const u = USERS.learner // Priya Nair — first demo user in PRISM.md's table
  await page.getByTestId("login-email").fill(u.email)
  await page.getByTestId("login-continue").click()
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByTestId("login-submit").click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 })
  await expect(page.getByTestId("app-sidebar")).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(u.name).first()).toBeVisible()
  await page.waitForTimeout(1500)
})
