import { test as setup } from "@playwright/test"
import { signIn } from "./helpers/auth"
import { USERS, type RoleKey } from "./helpers/users"

for (const role of Object.keys(USERS) as RoleKey[]) {
  setup(`authenticate ${role}`, async ({ page }) => {
    await signIn(page, role)
    await page.context().storageState({ path: USERS[role].state })
  })
}
