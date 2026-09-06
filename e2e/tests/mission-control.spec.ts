import { test, expect, type Page } from "./helpers/fixtures"
import { api } from "./helpers/api"
import { expectToast } from "./helpers/ui"

/** Mission Control as Elena Marsh (sponsor + admin). One test per tab; cost inputs and readouts mutate state. */
test.describe("mission control (sponsor)", () => {
  test.use({ role: "sponsor" })

  async function open(page: Page, path: string, tabId: string) {
    await page.goto(path)
    await expect(page.getByTestId("mc-tabs")).toBeVisible()
    await expect(page.getByTestId(`mc-tab-${tabId}`)).toHaveAttribute("aria-current", "page")
    await expect(page.getByTestId("mc-skeleton")).toHaveCount(0, { timeout: 30_000 })
  }

  test("adoption: metric tiles carry source lines, funnel and team ranking render", async ({ page }) => {
    await open(page, "/mission-control", "adoption")
    const tiles = page.getByTestId("adoption-tiles").locator("[data-testid^=tile-]")
    await expect(tiles).toHaveCount(4)
    for (const t of await tiles.all()) {
      await expect(t.getByTestId("metric-value")).not.toBeEmpty()
      await expect(t.getByTestId("source-line")).toBeVisible()
      await expect(t).toHaveAttribute("data-baseline", /present|none/)
    }
    await expect(page.getByTestId("tile-active-pct")).toContainText("%")
    await expect(page.getByTestId("funnel-chart")).toBeVisible()
    expect(await page.getByTestId("funnel-step").count()).toBeGreaterThanOrEqual(3)
    await expect(page.getByTestId("adoption-by-team").getByTestId("ranking-row").first()).toBeVisible()
    await expect(page.getByTestId("panel-inactive")).toBeVisible()
    // Range toggle survives in the URL and is carried across tabs.
    await page.getByTestId("mc-range-90d").click()
    await expect(page).toHaveURL(/range=90d/)
    await expect(page.getByTestId("mc-tab-people")).toHaveAttribute("href", /range=90d/)
  })

  test("people: ranking sorts by column and rows open the person page", async ({ page }) => {
    await open(page, "/mission-control/people", "people")
    const table = page.getByTestId("people-ranking")
    await expect(table).toBeVisible()
    await expect(table).toHaveAttribute("data-sort", "rung:desc")
    const rows = table.getByTestId("people-row")
    expect(await rows.count()).toBeGreaterThanOrEqual(5)
    await expect(rows.first().getByTestId("rung-badge")).toBeVisible()
    await expect(page.getByTestId("panel-people-ranking").getByTestId("source-line")).toBeVisible()

    await table.getByTestId("sort-hoursBack").click()
    await expect(table).toHaveAttribute("data-sort", "hoursBack:desc")
    // People without hours-back data render "0.0h" and sort last in both directions; compare the measured prefix.
    const measured = async () => {
      const vals = (await rows.locator("td:nth-child(3)").allTextContents()).map((t) => parseFloat(t))
      while (vals.length && vals[vals.length - 1] === 0) vals.pop()
      return vals
    }
    const desc = await measured()
    expect(desc.length).toBeGreaterThan(1)
    expect(desc).toEqual([...desc].sort((a, b) => b - a))
    await table.getByTestId("sort-hoursBack").click()
    await expect(table).toHaveAttribute("data-sort", "hoursBack:asc")
    const asc = await measured()
    expect(asc).toEqual([...asc].sort((a, b) => a - b))
    expect(asc[0]).toBe(desc[desc.length - 1])

    await expect(page.getByTestId("people-rising")).toBeVisible()
    await expect(page.getByTestId("people-stalled")).toBeVisible()
    await expect(page.getByTestId("people-champions")).toBeVisible()
    const name = (await rows.first().locator("td").first().textContent())?.trim() ?? ""
    await rows.first().click()
    await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}/)
    await expect(page.getByTestId("person-page")).toBeVisible()
    if (name) await expect(page.getByTestId("person-page").locator("h1")).toContainText(name.replace(/^[A-Z]{1,2}(?=[A-Z][a-z])/, "").split(" ")[0])
  })

  test("journey: heatmap cells, cohorts, revisit compliance and time in rung", async ({ page }) => {
    await open(page, "/mission-control/journey", "journey")
    const heat = page.getByTestId("panel-heatmap").getByTestId("heatmap")
    await expect(heat).toBeVisible()
    expect(await heat.getByTestId("heatmap-row").count()).toBeGreaterThanOrEqual(2)
    const cells = heat.getByTestId("heatmap-cell")
    expect(await cells.count()).toBeGreaterThanOrEqual(12)
    const filled = cells.filter({ hasText: /%/ })
    expect(await filled.count()).toBeGreaterThan(0)
    await page.getByTestId("heatmap-mode").getByRole("button", { name: "Counts" }).click()
    await expect(heat.getByTestId("heatmap-cell").filter({ hasText: /%/ })).toHaveCount(0)
    await expect(heat.getByTestId("heatmap-cell").filter({ hasText: /^\d+$/ }).first()).toBeVisible()
    await expect(page.getByTestId("panel-cohorts")).toBeVisible()
    await expect(page.getByTestId("revisit-compliance").getByTestId("ranking-row").first()).toBeVisible()
    expect(await page.getByTestId("time-in-rung").count()).toBeGreaterThanOrEqual(3)
  })

  test("journey payload: one heatmap row per team with six rung buckets, revisit compliance per team", async ({ page }) => {
    // API-level stand-in for the Journey tab while BUGS.md #9 is open.
    type Journey = { heatmap: { teamId: string; teamName: string; counts: number[] }[]; cohorts: { cohortWeek: string; counts: number[] }[]; timeInRung: { rung: number; medianDays: number; p90Days: number; stuck: unknown[] }[]; revisitCompliance: { teamId: string; teamName?: string; due: number; done: number }[] }
    const j = await api<Journey>(page, "GET", "/api/mc/journey")
    expect(j.heatmap.length).toBeGreaterThanOrEqual(2)
    for (const row of j.heatmap) {
      expect(row.counts).toHaveLength(6)
      expect(row.counts.reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
    }
    expect(j.timeInRung.map((t) => t.rung)).toEqual([0, 1, 2, 3, 4, 5])
    for (const t of j.timeInRung) expect(t.p90Days).toBeGreaterThanOrEqual(t.medianDays)
    expect(j.revisitCompliance.length).toBeGreaterThan(0)
    for (const r of j.revisitCompliance) expect(r.done).toBeLessThanOrEqual(r.due)
    expect(j.cohorts.length).toBeGreaterThan(0)
  })

  test("groups: compare toggle shows a normalised two-team card; leaderboards are off", async ({ page }) => {
    await open(page, "/mission-control/groups", "groups")
    const table = page.getByTestId("groups-table")
    await expect(table.getByTestId("group-row").first()).toBeVisible()
    expect(await table.getByTestId("group-row").count()).toBeGreaterThanOrEqual(2)
    await expect(table.getByTestId("rung-mix").first()).toBeVisible()
    await expect(page.getByTestId("leaderboard-off-note")).toBeVisible()
    await expect(page.getByTestId("leaderboard-toggle")).toHaveCount(0)

    const toggle = page.getByTestId("compare-toggle")
    await expect(toggle).toHaveAttribute("aria-pressed", "false")
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByTestId("compare-a")).toBeVisible()
    await expect(page.getByTestId("compare-b")).toBeVisible()
    const card = page.getByTestId("compare-card")
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card.getByTestId("compare-a-name")).not.toBeEmpty()
    await expect(card.getByTestId("compare-b-name")).not.toBeEmpty()
    expect(await card.getByTestId("compare-a-name").textContent()).not.toBe(await card.getByTestId("compare-b-name").textContent())
    expect(await card.getByTestId("compare-row-a").count()).toBeGreaterThanOrEqual(5)
    await expect(card.getByTestId("compare-row-a").first()).toContainText(/%|h|\d/)
    await toggle.click()
    await expect(card).toHaveCount(0)
  })

  test("skills health: tiles, flag rollup and usage tables", async ({ page }) => {
    await open(page, "/mission-control/skills", "skills")
    await expect(page.getByTestId("skills-tiles")).toBeVisible()
    await expect(page.getByTestId("tile-skills-total").getByTestId("metric-value")).toContainText(/^\d+$/)
    await expect(page.getByTestId("tile-skills-total")).toContainText("healthy")
    expect(await page.getByTestId("skills-tiles").locator("[data-testid^=tile-]").count()).toBeGreaterThanOrEqual(2)
    for (const flag of ["unused_30d", "grade_below_threshold", "boundary_gap", "owner_left", "overlapping_trigger", "pending_review"]) {
      await expect(page.getByTestId(`flag-count-${flag}`)).toContainText(/\d+/)
    }
    await expect(page.getByTestId("skills-health-table")).toBeVisible()
    await expect(page.getByTestId("skills-most-used").getByTestId("ranking-row").first()).toBeVisible()
    await expect(page.getByTestId("skills-least-used")).toBeVisible()
    await expect(page.getByTestId("skills-by-team").getByTestId("ranking-row").first()).toBeVisible()
    await expect(page.getByTestId("panel-unowned")).toBeVisible()
    await expect(page.getByTestId("panel-regrade")).toBeVisible()
    await expect(page.getByTestId("skills-most-used").getByTestId("ranking-row").first().locator("a")).toHaveAttribute("href", /\/library\//)
  })

  test("governance: policy, boundary, promotion log, drift table and JSON audit export", async ({ page }) => {
    await open(page, "/mission-control/governance", "governance")
    await expect(page.getByTestId("panel-policy")).toContainText(/Version \d+/)
    await expect(page.getByTestId("panel-boundary")).toContainText("Forbidden data classes")
    await expect(page.getByTestId("promotion-log").getByTestId("ranking-row").first()).toBeVisible()
    const drift = page.getByTestId("drift-table")
    await expect(drift).toBeVisible()
    expect(await drift.getByTestId("ranking-row").count()).toBeGreaterThan(0)
    await expect(drift).toContainText(/In sync|Drift/)
    await expect(page.getByTestId("panel-events")).toBeVisible()
    // No Compliance key in the seed: the feed states that instead of guessing.
    await expect(page.getByTestId("not-configured-claude_compliance")).toBeVisible()
    expect(await page.getByTestId("gov-event").count()).toBeGreaterThan(0)

    const download = page.waitForEvent("download")
    await page.getByTestId("audit-export").click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^activate-audit-.*\.json$/)
    const body = JSON.parse(await streamToString(await file.createReadStream()))
    expect(body).toHaveProperty("exportedAt")
    expect(body).toHaveProperty("policy")
    expect(body).toHaveProperty("promotionLog")
    expect(Array.isArray(body.drift)).toBeTruthy()
  })

  test("backlog: tiles, ranked inventory, next-wave filter and CSV SOW export", async ({ page }) => {
    await open(page, "/mission-control/backlog", "backlog")
    const tiles = page.getByTestId("backlog-tiles").locator("[data-testid^=tile-]")
    await expect(tiles).toHaveCount(5)
    await expect(page.getByTestId("tile-hours-at-stake").getByTestId("metric-value")).toContainText(/\d+h/)
    const rows = page.getByTestId("backlog-table").getByTestId("backlog-row")
    const total = await rows.count()
    expect(total).toBeGreaterThan(0)
    await expect(rows.first()).toContainText(/\d/)
    await page.getByTestId("next-wave-filter").click()
    await expect.poll(async () => rows.count()).toBeLessThanOrEqual(total)
    for (const r of await rows.all()) await expect(r).toContainText("Next wave")
    await page.getByTestId("next-wave-filter").click()
    await expect(rows).toHaveCount(total)

    const download = page.waitForEvent("download")
    await page.getByTestId("export-sow").click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^sow-.*\.csv$/)
    const csv = await streamToString(await file.createReadStream())
    const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines[0]).toContain(",")
    expect(lines[0].split(",").length).toBe(lines[1].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).length)
  })

  test("cost: saving a changed seat price round-trips", async ({ page }) => {
    await open(page, "/mission-control/cost", "cost")
    await expect(page.getByTestId("cost-tiles").locator("[data-testid^=tile-]")).toHaveCount(4)
    await expect(page.getByTestId("tile-cost").getByTestId("metric-value")).toContainText("$")
    await expect(page.getByTestId("cost-bars")).toBeVisible()
    expect(await page.getByTestId("waste-signal").count()).toBeGreaterThan(0)

    const seat = page.getByTestId("cost-input-seatPriceMonthly")
    const before = Number(await seat.inputValue())
    const next = before === 61 ? 62 : 61
    await expect(page.getByTestId("cost-inputs-save")).toBeDisabled()
    await seat.fill(String(next))
    await expect(page.getByTestId("cost-inputs-save")).toBeEnabled()
    await page.getByTestId("cost-inputs-save").click()
    await expectToast(page, /Cost inputs saved/)

    await page.reload()
    await expect(page.getByTestId("mc-skeleton")).toHaveCount(0, { timeout: 30_000 })
    await expect(page.getByTestId("cost-input-seatPriceMonthly")).toHaveValue(String(next))
    const cost = await api<{ inputs: { seatPriceMonthly: number } }>(page, "GET", "/api/mc/cost")
    expect(cost.inputs.seatPriceMonthly).toBe(next)
    // Put it back so the tile figures match the seed for later readers.
    await page.getByTestId("cost-input-seatPriceMonthly").fill(String(before))
    await page.getByTestId("cost-inputs-save").click()
    await expectToast(page, /Cost inputs saved/)
  })

  test("readouts: generate an org readout and read it with footnotes", async ({ page }) => {
    await open(page, "/mission-control/readouts", "readouts")
    await expect(page.getByTestId("readouts-list")).toBeVisible()
    const before = await page.getByTestId("readout-item").count()
    await page.getByTestId("readout-generate-open").click()
    await expect(page.getByTestId("readout-scope")).toContainText("Whole organisation")
    await expect(page.getByTestId("readout-period-start")).toHaveValue(/\d{4}-\d{2}-\d{2}/)
    await page.getByTestId("readout-generate").click()
    await expectToast(page, /Readout generated/, 90_000)

    const view = page.getByTestId("readout-view")
    await expect(view).toBeVisible()
    await expect(view).toContainText("Organisation")
    await expect(view.getByTestId("readout-narrative")).not.toBeEmpty()
    await expect(view.getByTestId("readout-footnotes")).toBeVisible()
    expect(await view.getByTestId("readout-footnotes").locator("li").count()).toBeGreaterThan(0)
    await expect(view.getByTestId("readout-footnotes")).toContainText(/Source:/)
    await expect(page.getByTestId("readout-item")).toHaveCount(before + 1)
    await expect(view.getByTestId("readout-export")).toBeVisible()
  })
})

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString("utf8")
}
