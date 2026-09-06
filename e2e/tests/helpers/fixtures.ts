import { test as base, type Page } from "@playwright/test"
import { USERS, type RoleKey } from "./users"

/** `test.use({ role: 'champion' })` to run a spec as that seeded person. */
export const test = base.extend<{ role: RoleKey; page: Page }>({
  role: ["learner", { option: true }],
  storageState: async ({ role }, use) => {
    await use(USERS[role].state)
  },
})

export { expect } from "@playwright/test"
export type { Page, APIRequestContext, Locator } from "@playwright/test"
