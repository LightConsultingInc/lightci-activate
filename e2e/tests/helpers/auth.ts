import { expect, type Page } from "@playwright/test"
import { PASSWORD, USERS, type RoleKey } from "./users"

/**
 * Drives the real login page: email first, then the password step the API offers for demo
 * and password accounts (a company with single sign-on would be redirected instead).
 */
export async function signIn(page: Page, role: RoleKey) {
  const u = USERS[role]
  await page.goto("/login")
  await page.getByTestId("login-email").fill(u.email)
  await page.getByTestId("login-continue").click()
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByTestId("login-submit").click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 })
  await expect(page.getByTestId("app-sidebar")).toBeVisible({ timeout: 30_000 })
}
