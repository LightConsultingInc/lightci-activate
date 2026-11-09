// Production walkthrough helper (not part of CI): keeps one persona's browser open so a tester can
// walk a multi-step flow (onboarding, an exercise) step by step, exactly as the person would.
//
//   node e2e/prod/drive.mjs <persona> <port>        then POST Playwright code to http://127.0.0.1:<port>
//   curl -s localhost:<port> --data-binary 'await page.getByRole("button", { name: "Next" }).click(); return snap()'
//
// The body runs with `page`, `ctx`, `BASE` and `snap()` (visible text + a screenshot path) in scope.
// Sessions come from `persona.mjs login`, and are saved back after every step.
import { createServer } from "node:http"
import { join } from "node:path"
import { BASE, OUT, open, statePath } from "./persona.mjs"

const [persona, port = "4701"] = process.argv.slice(2)
const { ctx, page } = await open(persona)
let n = 0
const snap = async (full = false) => {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})
  const file = join(OUT, "shots", `${persona}-step${String(++n).padStart(3, "0")}.png`)
  await page.screenshot({ path: file, fullPage: full })
  const text = (await page.locator("body").innerText()).replace(/\n{3,}/g, "\n\n")
  return { url: page.url(), file, text }
}
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("response", (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`) })

createServer(async (req, res) => {
  let body = ""
  for await (const c of req) body += c
  try {
    const fn = new Function("page", "ctx", "BASE", "snap", `return (async () => { ${body} })()`)
    const out = await fn(page, ctx, BASE, snap)
    await ctx.storageState({ path: statePath(persona) })
    res.end(JSON.stringify({ out, errors: errors.splice(0) }, null, 1))
  } catch (e) {
    res.end(JSON.stringify({ error: String(e), url: page.url(), errors: errors.splice(0) }, null, 1))
  }
}).listen(Number(port), "127.0.0.1", () => console.log(`${persona} on ${port}`))
