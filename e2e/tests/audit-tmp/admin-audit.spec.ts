import { test, expect } from "../helpers/fixtures"
import { api } from "../helpers/api"
import { expectToast, selectOption, toast } from "../helpers/ui"

const KINDS = ["anthropic", "claude_compliance", "claude_analytics", "claude_admin", "github"] as const
const KEY_PREFIX = process.env.AUDIT_KEY_PREFIX ?? ""

test.describe("audit: company admin as Elena", () => {
  test.describe.configure({ mode: "serial" })
  test.use({ role: "sponsor" })

  test("1. integrations: cards, invalid anthropic key (pre-stored) -> remove -> add via dialog -> invalid -> remove; compliance verified; no secret leaks", async ({ page }) => {
    const leaks: string[] = []
    page.on("response", async (res) => {
      if (!KEY_PREFIX || !res.url().includes("/api/")) return
      try { const t = await res.text(); if (t.includes(KEY_PREFIX)) leaks.push(res.url()) } catch {}
    })
    await page.goto("/admin/integrations")
    await expect(page.getByTestId("key-cards").locator("[data-testid^=key-card-]")).toHaveCount(5)
    for (const k of KINDS) await expect(page.getByTestId(`key-card-${k}`)).toBeVisible()
    const a = page.getByTestId("key-card-anthropic")
    // stored via API earlier in the audit: rejected by Anthropic
    await expect(a).toHaveAttribute("data-state", "Invalid")
    await expect(a.getByTestId("key-detail")).toContainText(/401|invalid/i)
    await expect(a.getByTestId("key-last4")).toContainText("0000")
    const c = page.getByTestId("key-card-claude_compliance")
    await expect(c).toHaveAttribute("data-state", "Verified")
    await expect(c.getByTestId("key-detail")).toContainText(/compliance API reachable/)
    await expect(c.getByTestId("key-last4")).toContainText("••••••••")
    for (const k of ["claude_analytics", "claude_admin", "github"] as const) await expect(page.getByTestId(`key-card-${k}`)).toHaveAttribute("data-state", "Not configured")
    console.log("STATES", await Promise.all(KINDS.map(async (k) => `${k}=${await page.getByTestId(`key-card-${k}`).getAttribute("data-state")}`)))

    // remove -> platform key
    await a.getByTestId("key-remove").click()
    await page.getByTestId("key-remove-confirm").click()
    await expectToast(page, /Anthropic API key removed/)
    await expect(a).toHaveAttribute("data-state", "Using LightCI's key")
    await expect(a.getByTestId("key-last4")).toContainText("LightCI platform key")

    // add invalid via dialog -> verify -> Invalid with provider detail
    await a.getByTestId("key-add").click()
    const form = page.getByTestId("key-form")
    await form.getByTestId("key-secret-input").fill("sk-ant-api03-audit-ui-invalid-key-1111111111")
    await form.getByTestId("key-save").click()
    await expect(form).toBeHidden({ timeout: 60_000 })
    await expect(a).toHaveAttribute("data-state", "Invalid", { timeout: 60_000 })
    await expect(a.getByTestId("key-detail")).toContainText(/authentication_error|invalid/i)
    await expect(a.getByTestId("key-last4")).toContainText("1111")
    const rows = await api<{ kind: string; status: string | null; source: string }[]>(page, "GET", "/api/org/integrations")
    expect(rows.find((r) => r.kind === "anthropic")).toMatchObject({ source: "org", status: "invalid" })
    // explicit re-verify from the card
    await a.getByTestId("key-verify").click()
    await expect(toast(page, /Verification failed|verified/).first()).toBeVisible({ timeout: 60_000 })
    // remove again
    await a.getByTestId("key-remove").click()
    await page.getByTestId("key-remove-confirm").click()
    await expectToast(page, /Anthropic API key removed/)
    await expect(a).toHaveAttribute("data-state", "Using LightCI's key")
    expect(leaks, "secret prefix seen in API responses").toEqual([])
  })

  test("2. policy & boundary: edit policy, add forbidden class with audit note, persists, versions bump", async ({ page }) => {
    await page.goto("/admin/policy")
    const text = page.getByTestId("policy-text")
    await expect(text).toBeEnabled()
    const before = await api<{ settings: Record<string, unknown> }>(page, "GET", "/api/org")
    console.log("VERSIONS BEFORE", before.settings.policyVersion, before.settings.boundaryVersion)
    await expect(page.getByTestId("panel-usage-policy")).toContainText(`Version ${before.settings.policyVersion ?? 1}`)
    const original = await text.inputValue()
    const marker = `AUDIT ${Date.now()}: board decks that quote a client require a named reviewer.`
    await text.fill(`${original.trimEnd()}\n\n${marker}`)
    const forbidden = page.getByTestId("boundary-forbidden")
    await forbidden.getByTestId("chip-input").fill("audit_forbidden_class")
    await forbidden.getByTestId("chip-input").press("Enter")
    await expect(forbidden.getByTestId("chip").filter({ hasText: "audit_forbidden_class" })).toBeVisible()
    await page.getByTestId("policy-save").click()
    await expectToast(page, /Add an audit note/)
    await page.getByTestId("policy-audit-note").fill("Audit: reviewer clause + new forbidden class")
    await page.getByTestId("policy-save").click()
    await expectToast(page, /Policy & boundary saved/)
    await page.reload()
    await expect(page.getByTestId("policy-text")).toHaveValue(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    await expect(page.getByTestId("boundary-forbidden").getByTestId("chip").filter({ hasText: "audit_forbidden_class" })).toBeVisible()
    const after = await api<{ settings: Record<string, unknown> }>(page, "GET", "/api/org")
    console.log("VERSIONS AFTER", after.settings.policyVersion, after.settings.boundaryVersion)
    expect(Number(after.settings.policyVersion)).toBe(Number(before.settings.policyVersion ?? 1) + 1)
    expect(Number(after.settings.boundaryVersion)).toBe(Number(before.settings.boundaryVersion ?? 1) + 1)
    await expect(page.getByTestId("panel-usage-policy")).toContainText(`Version ${after.settings.policyVersion}`)
    await expect(page.getByTestId("panel-boundary-editor")).toContainText(`Version ${after.settings.boundaryVersion}`)
    const gov = await api<{ policy: { version: number; text: string }; boundary: { version: number } }>(page, "GET", "/api/mc/governance")
    expect(gov.policy.version).toBe(after.settings.policyVersion)
    expect(gov.boundary.version).toBe(after.settings.boundaryVersion)
    expect(gov.policy.text).toContain(marker)
    // Governance page shows the new version
    await page.goto("/mission-control/governance")
    await expect(page.getByTestId("panel-policy")).toContainText(`Version ${after.settings.policyVersion}`, { timeout: 30_000 })
  })

  test("3. teams & people: create team, champion, in-program, plugin/rbac, move person, roles, invite, import groups", async ({ page }) => {
    await page.goto("/admin/teams")
    await expect(page.getByTestId("teams-table").getByTestId("team-row").first()).toBeVisible()
    const teamName = `Audit Team ${Date.now() % 100000}`
    await page.getByTestId("new-team-open").click()
    await page.getByTestId("new-team-name").fill(teamName)
    await page.getByTestId("new-team-plugin").fill("audit-plugin")
    await page.getByTestId("new-team-save").click()
    await expectToast(page, new RegExp(`${teamName} created`))
    const row = page.getByTestId("team-row").filter({ hasText: teamName })
    await expect(row).toBeVisible()
    await expect(row).toContainText("0 people")
    // champion
    await selectOption(page, row.getByTestId("team-champion-select"), /Daniel Okafor/)
    await expectToast(page, /Champion updated/)
    await expect(row.getByTestId("team-champion-select")).toContainText("Daniel Okafor")
    // in-program toggle off
    await row.getByTestId("team-in-program").click()
    await expectToast(page, /paused/)
    // rbac group
    const rbac = row.getByTestId("team-rbac")
    await rbac.click(); await rbac.fill("grp_audit"); await rbac.press("Enter")
    await expectToast(page, /Group id saved/)
    // plugin
    const plugin = row.getByTestId("team-plugin")
    await plugin.click(); await plugin.fill("audit-plugin-2"); await plugin.press("Enter")
    await expectToast(page, /Plugin name saved/)
    // move Megan Tully to the new team + toggle champion role on/off
    await page.getByTestId("people-search").fill("Megan")
    const megan = page.getByTestId("people-table").getByTestId("person-row").filter({ hasText: "Megan Tully" })
    await selectOption(page, megan.getByTestId("person-team-select"), new RegExp(teamName))
    await expectToast(page, /Megan Tully moved/)
    await expect(megan.getByTestId("person-team-select")).toContainText(teamName)
    await megan.getByTestId("role-champion").click()
    await expectToast(page, /Megan Tully: added champion/)
    await expect(megan.getByTestId("role-champion")).toHaveAttribute("aria-pressed", "true")
    await megan.getByTestId("role-champion").click()
    await expectToast(page, /Megan Tully: removed champion/)
    await expect(megan.getByTestId("role-champion")).toHaveAttribute("aria-pressed", "false")
    // move Megan back to Client Service Ops
    await selectOption(page, megan.getByTestId("person-team-select"), /Client Service Ops/)
    await expectToast(page, /Megan Tully moved/)
    // invite
    const email = `audit-${Date.now()}@example.com`
    await page.getByTestId("invite-open").click()
    await page.getByTestId("invite-email").fill(email)
    await page.getByTestId("invite-send").click()
    const t = toast(page, new RegExp(`${email}|Couldn't send the invite`)).first()
    await expect(t).toBeVisible({ timeout: 30_000 })
    console.log("INVITE TOAST:", (await t.textContent())?.slice(0, 200))
    await page.getByTestId("people-search").fill(email)
    const inv = page.getByTestId("people-table").getByTestId("person-row")
    await expect(inv).toHaveCount(1)
    await expect(inv).toContainText("invited")
    // import groups -> not configured
    await page.getByTestId("import-groups").click()
    await expect(page.getByTestId("import-groups-501")).toBeVisible()
    await expect(page.getByTestId("import-groups-501")).toContainText(/Admin API key/)
    const teams = await api<{ id: string; name: string; championPersonId: string | null; inProgram: boolean; pluginName: string; rbacGroupId: string | null; members: number }[]>(page, "GET", "/api/teams")
    const t2 = teams.find((x) => x.name === teamName)!
    console.log("TEAM ROW", JSON.stringify(t2))
    expect(t2).toMatchObject({ inProgram: false, pluginName: "audit-plugin-2", rbacGroupId: "grp_audit" })
    expect(t2.championPersonId).toBeTruthy()
  })

  test("4. marketplace: status card, sync, assignment select, checklist", async ({ page }) => {
    await page.goto("/admin/marketplace")
    const status = page.getByTestId("repo-status")
    await expect(status).toContainText("local-nested")
    await expect(status).toContainText("b7605d78bf")
    await expect(status).toContainText("5 plugins · 11 skills")
    const checklist = page.getByTestId("setup-checklist")
    await expect(checklist).toHaveAttribute("data-total", "8")
    console.log("CHECKLIST done=", await checklist.getAttribute("data-done"))
    for (const k of ["keys", "sso", "groups", "context", "governance", "repo", "connector", "baseline"]) console.log("  step", k, await checklist.getByTestId(`setup-step-${k}`).getAttribute("data-done"))
    await page.getByTestId("marketplace-sync").click()
    await expectToast(page, /Repo synced|Sync failed/, 60_000)
    // assignment matrix: cso-operations x Client Service Ops currently intended=auto observed=available (drift)
    const sel = page.locator('[data-testid=assignment-select][data-plugin="cso-operations"]')
    await expect(sel).toContainText("Auto-installed")
    const cell = sel.locator("xpath=ancestor::td")
    await expect(cell.getByTestId("drift-badge")).toBeVisible()
    await selectOption(page, sel, /^Available$/)
    await expectToast(page, /cso-operations/)
    await expect(sel).toContainText("Available")
    await expect(cell.getByTestId("drift-badge")).toHaveCount(0)
    await expect(cell).toContainText("In sync")
    const rows = await api<{ plugin: string; team: { name: string }; intendedMode: string; drift: boolean }[]>(page, "GET", "/api/assignments")
    const r = rows.find((x) => x.plugin === "cso-operations")!
    console.log("ASSIGNMENT", JSON.stringify(r))
    expect(r.intendedMode).toBe("available"); expect(r.drift).toBe(false)
    // back to auto
    await selectOption(page, sel, /Auto-installed/)
    await expectToast(page, /cso-operations/)
    await expect(cell.getByTestId("drift-badge")).toBeVisible()
    const rows2 = await api<{ plugin: string; intendedMode: string; drift: boolean }[]>(page, "GET", "/api/assignments")
    expect(rows2.find((x) => x.plugin === "cso-operations")).toMatchObject({ intendedMode: "auto", drift: true })
  })
})
