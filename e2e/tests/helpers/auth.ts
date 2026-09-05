import { expect, type Page } from "@playwright/test"
import { PASSWORD, USERS, type RoleKey } from "./users"

export async function signIn(page: Page, role: RoleKey) {
  const u = USERS[role]
  await page.goto("/login")
  await page.getByLabel("Email").fill(u.email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByTestId("login-submit").click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 })
  await expect(page.getByTestId("app-sidebar")).toBeVisible({ timeout: 30_000 })
}
