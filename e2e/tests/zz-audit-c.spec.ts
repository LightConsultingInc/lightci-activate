import { test, expect } from "./helpers/fixtures"
import { api } from "./helpers/api"
import { expectToast } from "./helpers/ui"
import { readFileSync, writeFileSync } from "node:fs"

type Promo = { id: string; decision: string; prNumber: number | null; prUrl: string | null; branch: string | null; requiredApproverRoles: string[]; highExposure: boolean; boundaryCheck: { ok: boolean; notes: string }; diffSummary: { summary: string }; version: number; skill: { slug: string; version: number; status: string } }
type Detail = { id: string; slug: string; version: number; status: string; versions: { version: number; tag: string | null; commitSha: string | null; approvers: { name: string }[]; gradeScore: number | null }[]; promotion: Promo | null; grades: { decision: string }[] }

const out: string[] = []
const log = (s: string) => { out.push(s); console.log(s) }
const slug = readFileSync("audit/b-slug.txt", "utf8")

test.describe("audit C1: request promotion (Priya)", () => {
  test.use({ role: "learner" })
  test.afterAll(() => writeFileSync("audit/c1-log.txt", out.join("\n")))

  test("Request promotion → PromotionRequest, branch commit", async ({ page }) => {
    await page.goto(`/library/${slug}`)
    await expect(page.getByTestId("skill-tabs")).toBeVisible()
    const req = page.getByTestId("skill-request-promotion")
    await expect(req).toBeEnabled()
    const t0 = Date.now()
    await req.click()
    await expectToast(page, /Promotion requested/, 180_000)
    log(`promotion packaged in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    const dlg = page.getByTestId("promotion-result")
    await expect(dlg).toBeVisible()
    await expect(dlg.getByTestId("promotion-card")).toBeVisible()
    await expect(dlg.getByTestId("decision-chip")).toHaveAttribute("data-decision", "pending")
    log(`result dialog: ${(await dlg.textContent())?.replace(/\s+/g, " ").slice(0, 400)}`)
    await page.screenshot({ path: "audit/shots/c1-promotion-result.png" })
    const d = await api<Detail>(page, "GET", `/api/skills/${slug}`)
    expect(d.promotion?.decision).toBe("pending")
    expect(d.status).toBe("in_review")
    log(`promotion id=${d.promotion?.id} pr#=${d.promotion?.prNumber} prUrl=${d.promotion?.prUrl} branch=${d.promotion?.branch} roles=${d.promotion?.requiredApproverRoles} highExposure=${d.promotion?.highExposure} boundary.ok=${d.promotion?.boundaryCheck.ok} notes=${d.promotion?.boundaryCheck.notes} diff=${d.promotion?.diffSummary.summary} version=${d.promotion?.version}`)
    writeFileSync("audit/c-promotion-id.txt", d.promotion!.id)
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("skill-request-promotion")).toBeDisabled()
    await expect(page.getByTestId("skill-open-promotion")).toBeVisible()
    await expect(page.getByTestId("status-chip").first()).toHaveAttribute("data-status", "in_review")
    await expect(page.getByTestId("health-pending_review")).toBeVisible()
  })
})

test.describe("audit C2: approve (Daniel)", () => {
  test.use({ role: "champion" })
  test.afterAll(() => writeFileSync("audit/c2-log.txt", out.join("\n")))

  test("/promotions lists it; approve → merged; versions + library reflect", async ({ page }) => {
    const id = readFileSync("audit/c-promotion-id.txt", "utf8")
    const pending = await api<Promo[]>(page, "GET", "/api/promotions?state=pending")
    log(`pending queue (api): ${pending.map((p) => `${p.skill.slug}#${p.prNumber}`).join(", ")}`)
    await page.goto("/promotions")
    await expect(page.getByTestId("promotions-list")).toBeVisible()
    await expect(page.getByTestId("promotion-card")).toHaveCount(pending.length)
    const card = page.locator(`a[href="/promotions/${id}"]`)
    await expect(card).toBeVisible()
    await expect(card.getByTestId("decision-chip")).toHaveAttribute("data-decision", "pending")
    await page.screenshot({ path: "audit/shots/c2-queue.png", fullPage: true })
    await card.click()
    await expect(page).toHaveURL(new RegExp(`/promotions/${id}`))
    const panel = page.getByTestId("approval-panel")
    await expect(panel).toBeVisible()
    await expect(panel.getByTestId("boundary-check")).toBeVisible()
    await expect(panel.getByTestId("grade-card")).toBeVisible()
    await expect(panel.getByTestId("diff-summary")).toBeVisible()
    await expect(panel.getByTestId("test-results")).toBeVisible()
    log(`approval screen: boundary=${(await panel.getByTestId("boundary-check").textContent())?.slice(0, 200)} | tests=${(await panel.getByTestId("test-results").textContent())?.slice(0, 200)}`)
    await page.screenshot({ path: "audit/shots/c2-approval.png", fullPage: true })
    const approve = page.getByTestId("promotion-approve")
    await expect(approve).toBeEnabled()
    await page.getByTestId("approval-note").fill("Audit approval: boundary and examples read well.")
    await approve.click()
    await expectToast(page, /Merged and published/, 60_000)
    await expect(panel).toHaveAttribute("data-decision", "merged")
    await expect(panel.getByTestId("merged-tag")).toContainText(`${slug}@v`)
    log(`merged tag shown: ${(await panel.getByTestId("merged-tag").textContent())?.trim()}`)
    await page.screenshot({ path: "audit/shots/c2-merged.png", fullPage: true })

    const d = await api<Detail>(page, "GET", `/api/skills/${slug}`)
    log(`after merge: status=${d.status} version=${d.version} versions=${JSON.stringify(d.versions.map((v) => [v.version, v.tag, v.commitSha?.slice(0, 7), v.approvers.map((a) => a.name), v.gradeScore]))} promotion=${d.promotion?.decision}`)
    expect(d.status).toBe("published")
    const tagged = d.versions.find((v) => v.tag === `${slug}@v${d.version}`)
    expect(tagged).toBeTruthy()
    // versions tab + library card
    await page.goto(`/library/${slug}?tab=versions`)
    await expect(page.getByTestId("versions-timeline")).toContainText(`${slug}@v${d.version}`)
    await expect(page.getByTestId("version-row").first()).toContainText("current")
    await expect(page.getByTestId("version-row").first()).toContainText("approved by")
    await page.screenshot({ path: "audit/shots/c2-versions.png", fullPage: true })
    await page.goto("/library?status=published")
    const libCard = page.locator(`[data-testid=skill-card][data-slug="${slug}"]`)
    await expect(libCard).toBeVisible()
    await expect(libCard).toHaveAttribute("data-status", "published")
    await expect(libCard.getByTestId("skill-version")).toContainText(`v${d.version}`)
    log(`library card: status published, v${d.version}`)
    // queue no longer lists it
    const after = await api<Promo[]>(page, "GET", "/api/promotions?state=pending")
    expect(after.some((p) => p.id === id)).toBe(false)
    const all = await api<Promo[]>(page, "GET", "/api/promotions?state=all")
    expect(all.find((p) => p.id === id)?.decision).toBe("merged")
  })
})
