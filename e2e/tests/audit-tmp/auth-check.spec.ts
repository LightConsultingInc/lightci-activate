import { test, expect } from "@playwright/test"
for (const role of ["sponsor","lead"] as const) {
  test(`auth state ${role}`, async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: `playwright/.auth/${role}.json` })
    const page = await ctx.newPage()
    const res = await page.request.get("/auth/token")
    const body = await res.json().catch(() => null)
    console.log(role, res.status(), body?.accessToken ? "token ok" : JSON.stringify(body).slice(0,200))
    await ctx.close()
  })
}
