import { expect, type Page } from "@playwright/test"
import { PASSWORD, USERS, type RoleKey } from "./users"

/** `E2E_AUTH=oidc` runs the suite against a stack in OIDC mode (Keycloak behind Activate's OAuth server). */
export const OIDC_MODE = process.env.E2E_AUTH === "oidc"

/**
 * Drives the real login page.
 * WorkOS mode: email first, then the password step the API offers for demo and password accounts.
 * OIDC mode: the single company sign-in button, then Keycloak's login form, then back into the app.
 */
export async function signIn(page: Page, role: RoleKey) {
  const u = USERS[role]
  await page.goto("/login")
  if (OIDC_MODE) {
    await page.getByTestId("login-sso").click()
    await page.waitForURL(/\/realms\/activate-test\//, { timeout: 30_000 })
    await page.locator("#username").fill(u.email)
    await page.locator("#password").fill(PASSWORD)
    await page.locator("#kc-login").click()
  } else {
    await page.getByTestId("login-email").fill(u.email)
    await page.getByTestId("login-continue").click()
    await page.getByLabel("Password").fill(PASSWORD)
    await page.getByTestId("login-submit").click()
  }
  await expect(page).not.toHaveURL(/\/login|\/realms\//, { timeout: 30_000 })
  await expect(page.getByTestId("app-sidebar")).toBeVisible({ timeout: 30_000 })
}
