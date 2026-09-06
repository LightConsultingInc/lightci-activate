import { test, expect } from "./helpers/fixtures"
import { api } from "./helpers/api"
import { expectToast, toast } from "./helpers/ui"
import { readFileSync, writeFileSync } from "node:fs"

/** Audit B (Priya): New skill dialog → edit SKILL.md → Save → grade → request promotion (when pass). */
type Detail = { id: string; slug: string; version: number; status: string; versions: { version: number; tag: string | null; commitSha: string | null }[]; grades: { decision: string; score: number; feedback: string; rubric: { label: string; score: number; note: string }[]; securityFindings: unknown[] }[]; promotion: { id: string; decision: string; prNumber: number | null; branch: string | null } | null }

const out: string[] = []
const log = (s: string) => { out.push(s); console.log(s) }
const SLUG_FILE = "audit/b-slug.txt"

test.describe("audit B: author flow", () => {
  test.describe.configure({ mode: "serial" })
  test.use({ role: "learner" })
  test.afterAll(() => writeFileSync("audit/b-log.txt", out.join("\n")))

  test("create via New skill dialog, edit SKILL.md, save → v2", async ({ page }) => {
    const name = "Beneficiary review checklist"
    await page.goto("/library")
    await page.getByTestId("new-skill").click()
    await expect(page.getByTestId("new-skill-dialog")).toBeVisible()
    await page.getByTestId("new-skill-name").fill(name)
    await page.getByTestId("new-skill-trigger").fill("Use when a planner asks to run or write up a beneficiary review for a household from their de-identified per-account notes.")
    await expect(page.getByTestId("new-skill-team")).toContainText("Financial Planning")
    await page.screenshot({ path: "audit/shots/b-new-skill-dialog.png" })
    await page.getByTestId("new-skill-submit").click()
    await expectToast(page, /Draft created/)
    await expect(page).toHaveURL(/\/library\/beneficiary-review-checklist(-\d+)?\?edit=1/)
    const slug = page.url().match(/\/library\/([a-z0-9-]+)\?/)![1]
    writeFileSync(SLUG_FILE, slug)
    log(`created slug=${slug}`)
    await expect(page.getByTestId("status-chip").first()).toHaveAttribute("data-status", "draft")
    await expect(page.getByTestId("skill-editor")).toBeVisible()
    let d = await api<Detail>(page, "GET", `/api/skills/${slug}`)
    expect(d.version).toBe(1)
    expect(d.versions).toHaveLength(1)
    log(`v1 commit=${d.versions[0].commitSha}`)

    const md = readFileSync("audit/test-skill.md", "utf8").replace(/beneficiary-review-checklist/g, slug)
    await page.getByTestId("skill-md-editor").fill(md)
    await expect(page.getByTestId("skill-save")).toBeEnabled()
    await page.getByTestId("skill-save").click()
    await expectToast(page, /Committed as v2/)
    await expect(page.getByTestId("skill-version").first()).toHaveText("v2")
    await expect(page.getByTestId("tab-versions")).toContainText("2")
    d = await api<Detail>(page, "GET", `/api/skills/${slug}`)
    expect(d.version).toBe(2)
    expect(d.versions.map((v) => v.version).sort()).toEqual([1, 2])
    log(`v2 commit=${d.versions.find((v) => v.version === 2)?.commitSha}`)
    // markdown renders after save
    const text = (await page.getByTestId("markdown-lite").textContent()) ?? ""
    expect(text).toContain("Beneficiary review checklist")
    expect(text).not.toMatch(/\*\*/)
    await page.screenshot({ path: "audit/shots/b-after-save.png", fullPage: true })

    // boundary + sample cases through the API (UI editors are exercised separately below)
    await api(page, "PATCH", `/api/skills/${d.id}`, {
      boundary: { mayRead: ["aggregated_client_summaries", "internal_templates", "crm_summary_export"], mustNeverReceive: ["client_pii_documents", "account_numbers", "ssn", "statements_raw"], humanReview: ["before_client_meeting"] },
      sampleCases: [
        { input: "Run the beneficiary review for the Okonkwo household. Notes: Joint brokerage TOD children 50/50 no contingent; Her IRA spouse 100% no contingent, intent children contingent; His 401(k) spouse 100%, children contingent 50/50.", shouldTrigger: "yes", expected: "Produces the ten-line checklist, two GAP lines and an advisor summary leading with the IRA gap." },
        { input: "Draft the Okonkwos' revocable trust amendment naming the children as successor trustees.", shouldTrigger: "no", expected: "Does not trigger; estate-document drafting is out of scope." },
        { input: "Prep the brief for the Okonkwos' Tuesday review.", shouldTrigger: "no", expected: "Does not trigger; that is advisor-meeting-prep." },
        { input: "Beneficiary review for the Okonkwos, I've attached the Schwab beneficiary forms so you have the account numbers.", shouldTrigger: "ambiguous", expected: "Triggers on the review request but declines the forms and account numbers; asks for the per-account notes." },
      ],
    })
    d = await api<Detail>(page, "GET", `/api/skills/${slug}`)
    log(`after boundary/cases patch: v${d.version}, versions=${d.versions.length}`)
    await page.reload()
    await page.getByTestId("tab-cases").click()
    await expect(page.getByTestId("sample-case-row")).toHaveCount(4)
    await page.getByTestId("tab-boundary").click()
    await expect(page.getByTestId("boundary-never")).toContainText("account_numbers")
    await expect(page.getByTestId("boundary-badge").first()).toHaveAttribute("data-level", "amber")
  })

  test("grade this version → real Grade row; promotion gated on pass", async ({ page }) => {
    const slug = readFileSync(SLUG_FILE, "utf8")
    await page.goto(`/library/${slug}`)
    await expect(page.getByTestId("skill-tabs")).toBeVisible()
    await expect(page.getByTestId("grade-empty")).toBeVisible()
    await expect(page.getByTestId("skill-request-promotion")).toBeDisabled()
    const t0 = Date.now()
    await page.getByTestId("skill-grade").click()
    const t = toast(page, /Graded (pass|revise)|Grading failed/).first()
    await expect(t).toBeVisible({ timeout: 180_000 })
    log(`grade toast after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${(await t.textContent())?.slice(0, 200)}`)
    const card = page.getByTestId("grade-card")
    await expect(card).toBeVisible()
    const rows = await card.getByTestId("rubric-row").count()
    const sec = await card.getByTestId("security-findings").count()
    const secNone = await card.getByText("Security review: no findings.").count()
    log(`grade card: rubric rows=${rows}, security-findings block=${sec}, 'no findings'=${secNone}`)
    const d = await api<Detail>(page, "GET", `/api/skills/${slug}`)
    const g = d.grades[0]
    log(`grade: ${g.decision} ${g.score} rubric=${JSON.stringify(g.rubric.map((r) => [r.label, r.score]))} security=${JSON.stringify(g.securityFindings)}`)
    log(`feedback: ${g.feedback}`)
    log(`notes: ${JSON.stringify(g.rubric.map((r) => r.note))}`)
    writeFileSync("audit/b-grade.json", JSON.stringify(g, null, 2))
    await page.screenshot({ path: "audit/shots/b-graded.png", fullPage: true })
    const req = page.getByTestId("skill-request-promotion")
    if (g.decision === "pass") await expect(req).toBeEnabled(); else await expect(req).toBeDisabled()
    log(`request promotion enabled=${await req.isEnabled()}`)
  })
})
