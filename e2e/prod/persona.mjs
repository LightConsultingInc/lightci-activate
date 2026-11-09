// Production walkthrough helper (not part of CI). Signs a QA persona in to the live EU cell through
// single sign-on (WorkOS -> the QA identity provider on this machine) and keeps one browser session
// per persona, so each scenario runs as the right person with nobody typing a production password.
//
//   node e2e/prod/persona.mjs login <persona>          sign in, save the session
//   node e2e/prod/persona.mjs shot <persona> <path> [name]   open a page as them, save a screenshot + text
//
// Personas and their identity-provider passwords come from QA_PERSONAS (a JSON file outside the repo).
import { chromium } from "@playwright/test"
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"

export const BASE = process.env.QA_BASE ?? "https://eu.activate.lciventure.com"
const PERSONAS = JSON.parse(readFileSync(process.env.QA_PERSONAS, "utf8"))
export const OUT = process.env.QA_OUT ?? "./qa-out"
mkdirSync(join(OUT, "state"), { recursive: true })
mkdirSync(join(OUT, "shots"), { recursive: true })
export const statePath = (p) => join(OUT, "state", `${p}.json`)

export async function open(persona, { headless = true } = {}) {
  const browser = await chromium.launch({ headless })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: existsSync(statePath(persona)) ? statePath(persona) : undefined,
  })
  const page = await ctx.newPage()
  return { browser, ctx, page }
}

export async function login(persona) {
  const who = PERSONAS[persona]
  if (!who) throw new Error(`unknown persona ${persona}`)
  const { browser, ctx, page } = await open(persona)
  await page.goto(`${BASE}/login`)
  await page.getByTestId("login-email").fill(who.email)
  await page.getByTestId("login-continue").click()
  await page.waitForURL((u) => u.port === "8089" || u.hostname === new URL(BASE).hostname && !u.pathname.startsWith("/login"), { timeout: 60_000 })
  if (new URL(page.url()).port === "8089") {
    await page.locator("#username").fill(persona)
    await page.locator("#password").fill(who.password)
    await page.locator("#kc-login").click()
    await page.waitForURL((u) => u.port !== "8089", { timeout: 60_000 })
  }
  if (page.url().includes("/sso/signin-consent")) {
    await page.getByRole("button").filter({ hasText: /approve|continue|confirm|allow/i }).first().click()
  }
  await page.waitForURL((u) => u.hostname === new URL(BASE).hostname && !u.pathname.startsWith("/callback"), { timeout: 60_000 })
  await ctx.storageState({ path: statePath(persona) })
  const url = page.url()
  await browser.close()
  return url
}

/** Open a page as a persona, wait for it to settle, save a full-page screenshot and its visible text. */
export async function shot(persona, path, name = path.replace(/[^a-z0-9]+/gi, "_")) {
  const { browser, ctx, page } = await open(persona)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  page.on("response", (r) => { if (r.status() >= 500 && r.url().includes(new URL(BASE).hostname)) errors.push(`${r.status()} ${r.url()}`) })
  await page.goto(`${BASE}${path}`)
  await page.waitForLoadState("networkidle").catch(() => {})
  await page.waitForTimeout(1500)
  const file = join(OUT, "shots", `${persona}-${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  const text = (await page.locator("body").innerText()).replace(/\n{3,}/g, "\n\n")
  writeFileSync(join(OUT, "shots", `${persona}-${name}.txt`), text)
  await ctx.storageState({ path: statePath(persona) })
  const final = page.url()
  await browser.close()
  return { file, final, errors, text }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, persona, path, name] = process.argv.slice(2)
  if (cmd === "login") console.log("landed on", await login(persona))
  else if (cmd === "shot") {
    const r = await shot(persona, path, name)
    console.log(JSON.stringify({ final: r.final, file: r.file, errors: r.errors }, null, 1))
    console.log(r.text.slice(0, 2500))
  } else console.error("usage: persona.mjs login|shot <persona> [path] [name]")
}
