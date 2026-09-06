import { test, expect } from "./helpers/fixtures"
import { api } from "./helpers/api"
import { expectToast } from "./helpers/ui"
import { mkdirSync, writeFileSync } from "node:fs"

type Card = { id: string; slug: string; name: string; status: string; version: number; team: { id: string; name: string } | null; owner: { name: string } | null; grade: { score: number; decision: string } | null; boundaryBadge: string; activeUsers30d: number; runs30d: number; health: string[]; updatedAt: string; adoptedByMe: boolean }
type Lib = { skills: Card[]; facets: { teams: { id: string; name: string; count: number }[]; rungs: { rung: number; count: number }[]; statuses: { status: string; count: number }[] } }
type Detail = Card & { skillMd: string; sampleCases: unknown[]; versions: { version: number; tag: string | null }[]; comments: { id: string; body: string }[]; usageSeries: { activations: number }[]; boundary: { mayRead: string[]; mustNeverReceive: string[]; humanReview: string[] } }

const out: string[] = []
const log = (s: string) => { out.push(s); console.log(s) }
mkdirSync("audit/shots", { recursive: true })

test.describe("audit A: library + detail (read-only + comment)", () => {
  test.describe.configure({ mode: "serial" })
  test.use({ role: "learner" })
  test.afterAll(() => writeFileSync("audit/a-log.txt", out.join("\n")))

  test("library grid matches API card for card; facets match", async ({ page }) => {
    const lib = await api<Lib>(page, "GET", "/api/library")
    await page.goto("/library")
    await expect(page.getByTestId("library-count")).toBeVisible()
    const cards = page.getByTestId("skill-card")
    await expect(cards).toHaveCount(lib.skills.length)
    log(`cards=${await cards.count()} api=${lib.skills.length}`)
    await expect(page.getByTestId("library-count")).toHaveText(`${lib.skills.length} skills`)
    // order on the page vs API default sort
    const slugs = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-slug")))
    expect(slugs).toEqual(lib.skills.map((s) => s.slug))
    for (const s of lib.skills) {
      const c = page.locator(`[data-testid=skill-card][data-slug="${s.slug}"]`)
      await expect(c.locator("h3")).toHaveText(s.name)
      await expect(c).toHaveAttribute("data-status", s.status)
      if (s.owner) await expect(c.getByTestId("person-chip")).toContainText(s.owner.name)
      if (s.team) await expect(c.getByTestId("team-chip")).toHaveText(s.team.name)
      await expect(c.getByTestId("boundary-badge")).toHaveAttribute("data-level", s.boundaryBadge)
      const gc = c.getByTestId("grade-chip")
      if (s.grade) { await expect(gc).toHaveAttribute("data-decision", s.grade.decision); await expect(gc).toContainText((s.grade.score * 10).toFixed(1)) } else await expect(gc).toHaveAttribute("data-decision", "none")
      const foot = await c.locator("footer").textContent()
      expect(foot, `${s.slug} users`).toContain(String(s.activeUsers30d))
      expect(foot, `${s.slug} runs`).toContain(String(s.runs30d))
      for (const h of s.health.slice(0, 2)) await expect(c.getByTestId(`health-${h}`)).toBeVisible()
      await expect(c.getByTestId("skill-version")).toContainText(`v${s.version}`)
      await expect(c.getByTestId("skill-adopt")).toHaveText(s.adoptedByMe ? "Adopted" : "Adopt")
    }
    // facets: rung + status counts rendered
    for (const r of lib.facets.rungs) await expect(page.getByTestId("filter-rung").getByRole("button", { name: new RegExp(`^L${r.rung} `) })).toContainText(String(r.count))
    const STATUS_LABEL: Record<string, string> = { draft: "Draft", in_review: "In review", published: "Published", deprecated: "Deprecated" }
    for (const st of lib.facets.statuses) await expect(page.getByTestId("filter-status").getByRole("button", { name: new RegExp(`^${STATUS_LABEL[st.status]}`) })).toContainText(String(st.count))
    log(`facets ok: rungs=${JSON.stringify(lib.facets.rungs)} statuses=${JSON.stringify(lib.facets.statuses)} teams=${JSON.stringify(lib.facets.teams.map((t) => [t.name, t.count]))}`)
    await page.getByTestId("filter-team").click()
    for (const t of lib.facets.teams) await expect(page.getByRole("option", { name: new RegExp(`${t.name}.*\\(${t.count}\\)`) })).toBeVisible()
    await page.keyboard.press("Escape")
    await page.screenshot({ path: "audit/shots/a-library.png", fullPage: true })
  })

  test("filters change results (team, rung, status, search, sort)", async ({ page }) => {
    const lib = await api<Lib>(page, "GET", "/api/library")
    const fp = lib.facets.teams.find((t) => t.name === "Financial Planning")!
    await page.goto("/library")
    await expect(page.getByTestId("library-count")).toBeVisible()
    await page.getByTestId("filter-team").click()
    await page.getByRole("option", { name: /Financial Planning/ }).click()
    await expect(page).toHaveURL(new RegExp(`team=${fp.id}`))
    await expect(page.getByTestId("skill-card")).toHaveCount(fp.count)
    // rung L2 within FP
    await page.getByTestId("filter-rung").getByRole("button", { name: /^L2 / }).click()
    await expect(page).toHaveURL(/rung=2/)
    const exp = lib.skills.filter((s) => s.team?.id === fp.id && (s as unknown as { rungRequired: number }).rungRequired === 2).length
    await expect(page.getByTestId("skill-card")).toHaveCount(exp)
    log(`team=FP rung=2 -> ${exp} cards`)
    await page.getByTestId("filters-clear").click()
    await expect(page).toHaveURL(/\/library$/)
    await expect(page.getByTestId("skill-card")).toHaveCount(lib.skills.length)
    // status draft
    await page.getByTestId("filter-status").getByRole("button", { name: /^Draft/ }).click()
    await expect(page).toHaveURL(/status=draft/)
    await expect(page.getByTestId("skill-card")).toHaveCount(lib.skills.filter((s) => s.status === "draft").length)
    for (const c of await page.getByTestId("skill-card").all()) await expect(c).toHaveAttribute("data-status", "draft")
    await page.getByTestId("filters-clear").click()
    await expect(page).toHaveURL(/\/library$/)
    // search
    await page.getByTestId("library-search").fill("meeting")
    await expect(page).toHaveURL(/q=meeting/)
    const apiQ = await api<Lib>(page, "GET", "/api/library?q=meeting")
    await expect(page.getByTestId("skill-card")).toHaveCount(apiQ.skills.length)
    log(`q=meeting -> ${apiQ.skills.length}`)
    await page.getByTestId("filters-clear").click()
    await expect(page).toHaveURL(/\/library$/)
    await expect(page.getByTestId("skill-card")).toHaveCount(lib.skills.length)
    // sort: Newest
    await page.getByTestId("filter-sort").click()
    await page.getByRole("option", { name: "Newest" }).click()
    await expect(page).toHaveURL(/sort=newest/)
    await page.waitForTimeout(800)
    const uiOrder = await page.getByTestId("skill-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-slug")))
    const byUpdated = [...lib.skills].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((s) => s.slug)
    const byUsage = lib.skills.map((s) => s.slug)
    log(`sort=newest UI order: ${uiOrder.slice(0, 4).join(",")} | expected(updated): ${byUpdated.slice(0, 4).join(",")} | usage: ${byUsage.slice(0, 4).join(",")}`)
    log(`sort=newest matches updated? ${JSON.stringify(uiOrder) === JSON.stringify(byUpdated)} ; matches usage? ${JSON.stringify(uiOrder) === JSON.stringify(byUsage)}`)
    await page.screenshot({ path: "audit/shots/a-sort-newest.png" })
  })

  test("detail renders SKILL.md cleanly and tabs match API/DB; comment posts", async ({ page }) => {
    for (const slug of ["advisor-meeting-prep", "meeting-recap-email", "crm-note-cleanup"]) {
      const d = await api<Detail>(page, "GET", `/api/skills/${slug}`)
      await page.goto(`/library/${slug}`)
      await expect(page.locator("h1")).toHaveText(d.name)
      await expect(page.getByTestId("skill-version").first()).toHaveText(`v${d.version}`)
      const md = page.getByTestId("markdown-lite")
      await expect(md).toBeVisible()
      const text = (await md.textContent()) ?? ""
      const artefacts = [/\*\*/, /(^|\s)##? /, /```/, /(^|\s)>\s/, /\]\(http/].filter((r) => r.test(text)).map(String)
      const underscores = (d.skillMd.match(/[a-z]+_[a-z_]+/g) ?? []).filter((w) => !text.includes(w))
      const h2 = await md.locator("h2, h3").count()
      log(`${slug}: md text=${text.length} chars, headings=${h2}, artefacts=${JSON.stringify(artefacts)}, missing underscore tokens=${JSON.stringify([...new Set(underscores)].slice(0, 8))}`)
      expect(artefacts, `${slug} raw markdown artefacts`).toEqual([])
      // tabs counts
      await expect(page.getByTestId("tab-cases")).toContainText(String(d.sampleCases.length))
      await expect(page.getByTestId("tab-versions")).toContainText(String(d.versions.length))
      await expect(page.getByTestId("tab-discussion")).toContainText(String(d.comments.length))
      await page.getByTestId("tab-cases").click()
      await expect(page.getByTestId("sample-case-row")).toHaveCount(d.sampleCases.length)
      await page.getByTestId("tab-boundary").click()
      for (const c of d.boundary.mayRead) await expect(page.getByTestId("boundary-may-read")).toContainText(c)
      for (const c of d.boundary.mustNeverReceive) await expect(page.getByTestId("boundary-never")).toContainText(c)
      for (const c of d.boundary.humanReview) await expect(page.getByTestId("boundary-review")).toContainText(c)
      log(`${slug}: boundary conflicts panel present=${await page.getByTestId("boundary-conflicts").count()} ; org boundary ref present=${await page.getByText("Org boundary (for reference)").count()}`)
      await page.getByTestId("tab-versions").click()
      await expect(page.getByTestId("version-row")).toHaveCount(d.versions.length)
      for (const v of d.versions) if (v.tag) await expect(page.getByTestId("versions-timeline")).toContainText(v.tag)
      await page.getByTestId("tab-usage").click()
      const total = d.usageSeries.reduce((s, x) => s + x.activations, 0)
      await expect(page.getByTestId("usage-chart")).toContainText(String(total))
      log(`${slug}: usage90 total=${total} shown`)
      if (slug === "meeting-recap-email") {
        await expect(page.getByTestId("status-chip").first()).toHaveAttribute("data-status", "deprecated")
        await expect(page.getByTestId("successor-link")).toHaveAttribute("href", /client-followup-summary/)
        log("meeting-recap-email: successor link ok")
      }
      await page.screenshot({ path: `audit/shots/a-detail-${slug}.png`, fullPage: true })
    }
    // comment
    const slug = "advisor-meeting-prep"
    const d = await api<Detail>(page, "GET", `/api/skills/${slug}`)
    await page.goto(`/library/${slug}?tab=discussion`)
    await expect(page.getByTestId("comments-thread")).toBeVisible()
    await expect(page.getByTestId("comment")).toHaveCount(d.comments.length)
    const body = `Audit ${Date.now()}: ran on the Okonkwo prep, action items section was thin.`
    await page.getByTestId("comment-input").fill(body)
    await page.getByTestId("comment-submit").click()
    await expectToast(page, /Posted/)
    await expect(page.getByTestId("comment").filter({ hasText: body })).toBeVisible()
    await expect(page.getByTestId("comment")).toHaveCount(d.comments.length + 1)
    const after = await api<Detail>(page, "GET", `/api/skills/${slug}`)
    expect(after.comments.some((c) => c.body === body)).toBe(true)
    log(`comment posted; api comments ${d.comments.length} -> ${after.comments.length}; body=${body}`)
    await page.screenshot({ path: "audit/shots/a-comment.png" })
  })
})
