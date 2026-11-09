import { test, expect, type Page } from "./helpers/fixtures"
import { api } from "./helpers/api"
import { expectToast, toast } from "./helpers/ui"

type LibraryResponse = {
  skills: { id: string; slug: string; name: string; status: string; adoptedByMe: boolean; team: { id: string; name: string } | null; rungRequired: number }[]
  facets: { teams: { id: string; name: string; count: number }[] }
}

/** Skill Library as Priya Nair. Adopt/fork/edit/grade/promotion mutate state, so those run serially at the end. */
test.describe("library", () => {
  test.describe.configure({ mode: "serial" })
  test.use({ role: "learner" })

  let lib: LibraryResponse
  let adoptSlug = ""
  let adoptName = ""
  let forkSlug = ""
  let forkGradeDecision: "pass" | "revise" | "" = ""

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: "playwright/.auth/learner.json" })
    const page = await ctx.newPage()
    lib = await api<LibraryResponse>(page, "GET", "/api/library")
    const candidate = lib.skills.find((s) => s.status === "published" && !s.adoptedByMe)
    adoptSlug = candidate?.slug ?? ""
    adoptName = candidate?.name ?? ""
    await ctx.close()
  })

  async function gotoLibrary(page: Page, qs = "") {
    await page.goto(`/library${qs}`)
    await expect(page.getByTestId("library-filters")).toBeVisible()
    await expect(page.getByTestId("library-count")).toBeVisible()
  }

  test("cards render owner, team, grade and boundary badge", async ({ page }) => {
    await gotoLibrary(page)
    const cards = page.getByTestId("skill-card")
    expect(await cards.count()).toBeGreaterThanOrEqual(5)
    await expect(page.getByTestId("library-count")).toContainText(`${await cards.count()} skills`)
    const card = cards.filter({ has: page.getByTestId("team-chip") }).first()
    await expect(card.getByTestId("person-chip")).toBeVisible()
    await expect(card.getByTestId("team-chip")).toBeVisible()
    await expect(card.getByTestId("grade-chip")).toBeVisible()
    await expect(card.getByTestId("boundary-badge")).toHaveAttribute("data-level", /green|amber|red/)
    await expect(card.getByTestId("rung-badge")).toBeVisible()
    await expect(card.getByTestId("skill-adopt")).toBeVisible()
    await expect(card.getByTestId("skill-fork")).toBeVisible()
    await expect(card.getByTestId("skill-open")).toHaveAttribute("href", /\/library\//)
  })

  test("filters by team and rung from the URL", async ({ page }) => {
    const team = lib.facets.teams[0]
    await gotoLibrary(page, `?team=${team.id}`)
    await expect(page.getByTestId("filter-team")).toContainText(team.name)
    const cards = page.getByTestId("skill-card")
    await expect(cards).toHaveCount(team.count)
    for (const c of await cards.all()) await expect(c.getByTestId("team-chip")).toHaveText(team.name)
    await expect(page.getByTestId("filters-clear")).toContainText("Clear 1")

    const rung = lib.skills.find((s) => s.team?.id === team.id)?.rungRequired ?? 3
    await gotoLibrary(page, `?team=${team.id}&rung=${rung}`)
    await expect(page.getByTestId("filters-clear")).toContainText("Clear 2")
    const expected = lib.skills.filter((s) => s.team?.id === team.id && s.rungRequired === rung).length
    await expect(page.getByTestId("skill-card")).toHaveCount(expected)
    await expect(page.getByTestId("filter-rung").locator("[aria-pressed=true], [data-pressed]").first()).toContainText(`L${rung}`)
    await page.getByTestId("filters-clear").click()
    await expect(page).toHaveURL(/\/library$/)
    await expect(page.getByTestId("skill-card")).toHaveCount(lib.skills.length)
  })

  test("search narrows the grid and lands in the URL", async ({ page }) => {
    await gotoLibrary(page)
    const total = await page.getByTestId("skill-card").count()
    await page.getByTestId("library-search").fill("meeting")
    await expect(page).toHaveURL(/q=meeting/)
    await expect.poll(async () => page.getByTestId("skill-card").count()).toBeLessThan(total)
    // Search covers name, trigger line and body, so assert the obvious hit is present and ranked first.
    await expect(page.getByTestId("skill-card").first()).toContainText(/meeting/i)
    await expect(page.locator('[data-testid=skill-card][data-slug="advisor-meeting-prep"]')).toBeVisible()
    await expect(page.getByTestId("library-count")).toContainText(`${await page.getByTestId("skill-card").count()} skills`)
    await page.getByTestId("library-search").fill("zzzz-no-such-skill")
    await expect(page).toHaveURL(/q=zzzz-no-such-skill/)
    await expect(page.getByText("Nothing matches those filters")).toBeVisible()
    await page.getByTestId("empty-clear-filters").click()
    await expect(page).toHaveURL(/\/library$/)
  })

  test("quick-look opens from a card and links to the full page with tabs", async ({ page }) => {
    await gotoLibrary(page)
    const card = page.getByTestId("skill-card").first()
    const name = (await card.locator("h3").textContent())?.trim() ?? ""
    const slug = (await card.getAttribute("data-slug")) ?? ""
    await card.click()
    const quick = page.getByTestId("skill-quick-look")
    await expect(quick).toBeVisible()
    await expect(quick).toContainText(name)
    await expect(quick).toContainText("SKILL.md")
    await quick.getByTestId("quick-look-open-full").click()
    await expect(page).toHaveURL(new RegExp(`/library/${slug}`))

    // skill-hero's testid is swallowed by <Paper> (BUGS.md #1); the h1 and hero chips are stable instead.
    await expect(page.locator("h1")).toContainText(name)
    await expect(page.getByTestId("skill-tabs")).toBeVisible()
    await expect(page.getByTestId("skill-version").first()).toContainText(/v\d+/)
    await page.getByTestId("tab-cases").click()
    await expect(page.getByTestId("sample-cases-table")).toBeVisible()
    await page.getByTestId("tab-boundary").click()
    await expect(page.getByTestId("boundary-may-read")).toBeVisible()
    await page.getByTestId("tab-versions").click()
    await expect(page.getByTestId("versions-timeline").getByTestId("version-row").first()).toBeVisible()
    await page.getByTestId("tab-usage").click()
    await expect(page.getByTestId("usage-chart")).toBeVisible()
    await page.getByTestId("tab-discussion").click()
    await expect(page.getByTestId("comments-thread")).toBeVisible()
    await expect(page.getByTestId("comment-submit")).toBeDisabled()
    await page.getByTestId("tab-skill").click()
    await expect(page.getByTestId("skill-grade")).toBeVisible()
    await expect(page.getByTestId("skill-action-bar")).toBeVisible()
  })

  test("adopting a published skill adds it to My skills", async ({ page }) => {
    test.skip(!adoptSlug, "every published skill is already adopted")
    await gotoLibrary(page)
    const card = page.locator(`[data-testid=skill-card][data-slug="${adoptSlug}"]`)
    await expect(card).toBeVisible()
    const adopt = card.getByTestId("skill-adopt")
    await expect(adopt).toHaveText(/Adopt$/)
    await adopt.click()
    await expectToast(page, `Adopted ${adoptName}`)
    await expect(adopt).toHaveText("Adopted")
    await expect(adopt).toBeDisabled()

    await page.goto("/")
    const panel = page.getByTestId("my-skills-panel")
    await expect(panel.getByTestId("adopted-skill").filter({ hasText: adoptName })).toBeVisible()
    // Adoption also queues an "on your own case" exercise.
    const mine = await api<{ adopted: { slug: string }[] }>(page, "GET", "/api/my-skills")
    expect(mine.adopted.map((s) => s.slug)).toContain(adoptSlug)
  })

  test("forking lands on a new draft in edit mode", async ({ page }) => {
    const source = adoptSlug || lib.skills.find((s) => s.status === "published")!.slug
    await page.goto(`/library/${source}`)
    await expect(page.getByTestId("skill-action-bar")).toBeVisible()
    await page.getByTestId("skill-action-bar").getByTestId("skill-fork").click()
    await expectToast(page, /Copied/)
    await expect(page).toHaveURL(/\/library\/[a-z0-9-]+\?edit=1/)
    forkSlug = page.url().match(/\/library\/([a-z0-9-]+)\?/)![1]
    expect(forkSlug).not.toBe(source)
    await expect(page.getByTestId("status-chip").first()).toHaveAttribute("data-status", "draft")
    await expect(page.getByTestId("skill-editor")).toBeVisible()
    await expect(page.getByTestId("skill-md-editor")).toBeVisible()
    await expect(page.getByTestId("person-chip").first()).toContainText("Priya")
  })

  test("saving an edited SKILL.md creates a new version", async ({ page }) => {
    await page.goto(`/library/${forkSlug}`)
    await expect(page.getByTestId("skill-tabs")).toBeVisible()
    const versionsTab = page.getByTestId("tab-versions")
    const before = Number((await versionsTab.textContent())!.match(/(\d+)/)![1])
    const heroVersion = page.getByTestId("skill-version").first()
    const versionBefore = Number((await heroVersion.textContent())!.match(/v(\d+)/)![1])

    await page.getByTestId("skill-edit").click()
    const editor = page.getByTestId("skill-md-editor")
    await expect(editor).toBeVisible()
    await expect(page.getByTestId("skill-save")).toBeDisabled()
    const md = await editor.inputValue()
    await editor.fill(`${md.trimEnd()}\n\n## E2E note\nAdded by the Playwright suite to verify versioning.\n`)
    await expect(page.getByTestId("skill-save")).toBeEnabled()
    await page.getByTestId("skill-save").click()
    await expectToast(page, /Saved as version \d+/)

    await expect(versionsTab).toContainText(String(before + 1))
    await expect(heroVersion).toContainText(`v${versionBefore + 1}`)
    await versionsTab.click()
    await expect(page.getByTestId("versions-timeline").getByTestId("version-row")).toHaveCount(before + 1)
    await expect(page.getByTestId("versions-timeline").getByTestId("version-row").first()).toContainText("current")
  })

  test("grading the draft renders a grade card and gates promotion", async ({ page }) => {
    await page.goto(`/library/${forkSlug}`)
    await expect(page.getByTestId("skill-tabs")).toBeVisible()
    const request = page.getByTestId("skill-request-promotion")
    // Fresh draft version: no grade yet, so promotion is blocked.
    await expect(page.getByTestId("grade-empty")).toBeVisible()
    await expect(request).toBeDisabled()

    await page.getByTestId("skill-grade").click()
    const t = toast(page, /Checked: (pass|needs changes)/).first()
    await expect(t).toBeVisible({ timeout: 60_000 })
    forkGradeDecision = /Checked: pass/.test((await t.textContent()) ?? "") ? "pass" : "revise"
    const card = page.getByTestId("grade-card")
    await expect(card).toBeVisible()
    await expect(card).toContainText(/\/10/)
    expect(await card.getByTestId("rubric-row").count()).toBeGreaterThan(0)
    await expect(page.getByTestId("grade-empty")).toHaveCount(0)

    if (forkGradeDecision === "pass") {
      await expect(request).toBeEnabled()
      await expect(request).toHaveAttribute("aria-disabled", "false")
    } else {
      await expect(request).toBeDisabled()
      await expect(request).toHaveAttribute("aria-disabled", "true")
    }
    const detail = await api<{ grades: { decision: string }[]; status: string }>(page, "GET", `/api/skills/${forkSlug}`)
    expect(detail.grades[0]?.decision).toBe(forkGradeDecision)
  })

  test("a comment posts to the discussion thread", async ({ page }) => {
    await page.goto(`/library/${forkSlug}?tab=discussion`)
    await expect(page.getByTestId("comments-thread")).toBeVisible()
    const before = await page.getByTestId("comment").count()
    const body = `E2E: ran this on the Nakamura case; it missed the exceptions section. ${Date.now()}`
    await page.getByTestId("comment-input").fill(body)
    await page.getByTestId("comment-submit").click()
    await expectToast(page, /Posted/)
    await expect(page.getByTestId("comment")).toHaveCount(before + 1)
    await expect(page.getByTestId("comment").filter({ hasText: body })).toBeVisible()
    await expect(page.getByTestId("tab-discussion")).toContainText(String(before + 1))
  })
})
