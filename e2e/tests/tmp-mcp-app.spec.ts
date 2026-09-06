import { test, expect, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"

const APP = "http://localhost:4399/app.html"

const EXPECT: Record<string, { card: string; texts: string[] }> = {
  my_ladder: { card: "card-ladder", texts: ["L2 Context", "68%", "Build a Project for annual review prep", "3.4h", "Predict-then-critique"] },
  library: { card: "card-library", texts: ["Advisor meeting prep", "RMD reminder letter", "Same-day follow-up email", "Onboarding packet QA", "Annual review deck outline"] },
  skill_detail: { card: "card-skill", texts: ["Advisor meeting prep", "v3", "Financial Planning", "84"] },
  submit_skill: { card: "card-grade", texts: ["6.1", "Minimal trigger", "Narrow to RMD context"] },
  submit_artifact: { card: "card-grade", texts: ["8.1", "Build a Project for annual review prep", "70%", "hallucinated date"] },
  map_workflow: { card: "card-scribe", texts: ["55%", "Client review meeting preparation", "Redtail", "Earlier you said", "account numbers, dates of birth, anything else"] },
  team: { card: "card-team", texts: ["Financial Planning", "75%", "RMD season letters", "88", "Marcus Reid"] },
  org: { card: "card-org", texts: ["63%", "$240", "268", "Wealth Advisors"] },
  promotion_queue: { card: "card-promotion-queue", texts: ["2 awaiting approval", "RMD reminder letter", "+38 −12 3 files", "Narrowed trigger"] },
}

function watch(page: Page) {
  const errors: string[] = []
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`) })
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
  return errors
}

for (const [tool, exp] of Object.entries(EXPECT)) {
  test(`mock card renders: ${tool}`, async ({ page }) => {
    const errors = watch(page)
    await page.goto(`${APP}?mock=${tool}`)
    const card = page.locator(`[data-testid^="${exp.card}"]`).first()
    await expect(card).toBeVisible()
    const body = await page.locator("body").innerText()
    for (const t of exp.texts) expect(body, `${tool} should show "${t}"`).toContain(t)
    expect(errors, errors.join("\n")).toEqual([])
  })
}

test("real my_ladder payload via simulated MCP Apps host", async ({ page }) => {
  const errors = watch(page)
  const real = JSON.parse(readFileSync("/tmp/mcp_ladder.json", "utf8")) as { text: string; structuredContent: Record<string, unknown> }
  const result = { content: [{ type: "text", text: real.text }], structuredContent: real.structuredContent }
  await page.setContent(`<!doctype html><html><body style="margin:0"><iframe id="f" style="width:880px;height:880px;border:0"></iframe></body></html>`)
  await page.evaluate(({ result }) => {
    const frame = document.getElementById("f") as HTMLIFrameElement
    const send = (msg: unknown) => frame.contentWindow!.postMessage(msg, "*")
    ;(window as unknown as { __log: unknown[] }).__log = []
    window.addEventListener("message", (ev) => {
      const m = ev.data as { jsonrpc?: string; id?: number; method?: string; params?: Record<string, unknown> }
      if (!m || m.jsonrpc !== "2.0") return
      ;(window as unknown as { __log: unknown[] }).__log.push(m.method ?? `response:${m.id}`)
      if (m.method === "ui/initialize") {
        send({ jsonrpc: "2.0", id: m.id, result: {
          protocolVersion: (m.params as { protocolVersion: string }).protocolVersion,
          hostInfo: { name: "audit-host", version: "0.0.1" },
          hostCapabilities: {},
          hostContext: { theme: "light", displayMode: "inline", availableDisplayModes: ["inline"], toolInfo: { tool: { name: "my_ladder" } } },
        } })
      } else if (m.method === "ui/notifications/initialized") {
        send({ jsonrpc: "2.0", method: "ui/notifications/tool-input", params: { arguments: {} } })
        send({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: result })
      } else if (m.id !== undefined && m.method) {
        // any other request from the app (e.g. size / display mode): acknowledge
        send({ jsonrpc: "2.0", id: m.id, result: {} })
      }
    })
    frame.src = "http://localhost:4399/app.html"
  }, { result })
  const f = page.frameLocator("#f")
  await expect(f.locator('[data-testid="card-ladder"]')).toBeVisible()
  const body = await f.locator("body").innerText()
  const data = real.structuredContent.data as { rung: number; progress: { toNextRung: number }; nextUp: { title: string }; revisitsDue: unknown[]; hoursBack: { thisMonthMinutes: number } }
  expect(data.rung).toBe(2)
  expect(body).toContain("L2 Context")
  expect(body).toContain(`${Math.round(data.progress.toNextRung * 100)}%`)
  expect(body).toContain(data.nextUp.title)
  expect(body).toContain(`${(data.hoursBack.thisMonthMinutes / 60).toFixed(1)}h`)
  expect(body).toContain("Priya Nair")
  const log = await page.evaluate(() => (window as unknown as { __log: unknown[] }).__log)
  console.log("host protocol log:", JSON.stringify(log))
  expect(errors, errors.join("\n")).toEqual([])
})
