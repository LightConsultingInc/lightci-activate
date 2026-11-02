#!/usr/bin/env node
// Record a shell command's terminal output as a video — evidence for backend-only work (API
// boot, migrations, curl calls against Swagger/REST endpoints, setup walkthroughs) where there
// is no screen to drive. The command runs in a pty; its output streams into a terminal-styled
// page in headless Chromium, which Playwright records at 1280x720. ffmpeg turns the recording
// into an .mp4. See PRISM.md "Recording terminal evidence".
//
//   node .prism/scripts/record-terminal.mjs '<shell command>' [/path/to/out.mp4]
//
// Default output: /tmp/evidence/terminal-<UTC timestamp>.mp4 (the path is printed last).
// Exit code is the command's own, so a failing walkthrough still fails the caller.
// Needs: e2e/node_modules (Playwright + Chromium installed), ffmpeg, util-linux `script`.
import { spawn, spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { mkdirSync, renameSync, unlinkSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const [command, outArg] = process.argv.slice(2)
if (!command) {
  console.error("usage: record-terminal.mjs '<shell command>' [/path/to/out.mp4]")
  process.exit(2)
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19)
const out = path.resolve(outArg ?? `/tmp/evidence/terminal-${stamp}.mp4`)
mkdirSync(path.dirname(out), { recursive: true })

const { chromium } = createRequire(path.join(ROOT, "e2e/package.json"))("playwright")

const COLS = 132
const ROWS = 36
const SIZE = { width: 1280, height: 720 }

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#0f1419;color:#d6dde6;font:14px/19px ui-monospace,Menlo,Consolas,"DejaVu Sans Mono",monospace;overflow:hidden}
  #bar{height:32px;line-height:32px;padding:0 14px;background:#1b2229;color:#8b98a5;border-bottom:1px solid #2b343d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #bar b{color:#e6edf3;font-weight:600}
  #screen{padding:8px 14px;white-space:pre;height:${SIZE.height - 32 - 16}px}
  .b{font-weight:700;color:#fff}.d{opacity:.55}
  .c30{color:#4d5966}.c31{color:#ff6b6b}.c32{color:#5fd787}.c33{color:#ffd166}.c34{color:#6cb6ff}.c35{color:#d2a8ff}.c36{color:#56d4dd}.c37{color:#e6edf3}
  .c90{color:#6e7681}.c91{color:#ff7b72}.c92{color:#7ee787}.c93{color:#f2cc60}.c94{color:#79c0ff}.c95{color:#d2a8ff}.c96{color:#76e3ea}.c97{color:#fff}
  #cursor{display:inline-block;width:8px;height:16px;background:#d6dde6;vertical-align:-3px}
</style></head><body><div id="bar"><b id="title"></b> <span id="meta"></span></div><pre id="screen"></pre>
<script>
(() => {
  const rows = ${ROWS}, cols = ${COLS}
  let lines = [[]], row = 0, col = 0, cls = ""
  const screen = document.getElementById("screen")
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))
  function put(ch) {
    if (col >= cols) { row++; col = 0 }
    while (lines.length <= row) lines.push([])
    lines[row][col++] = [ch, cls]
  }
  function sgr(params) {
    for (const p of (params || "0").split(";").map(Number)) {
      if (p === 0) cls = ""
      else if (p === 1) cls = cls.replace(/\\bb\\b ?/, "") + " b"
      else if (p === 2) cls = cls.replace(/\\bd\\b ?/, "") + " d"
      else if (p === 22) cls = cls.replace(/\\b[bd]\\b ?/g, "")
      else if (p === 39) cls = cls.replace(/\\bc\\d+\\b ?/g, "")
      else if ((p >= 30 && p <= 37) || (p >= 90 && p <= 97)) cls = cls.replace(/\\bc\\d+\\b ?/g, "") + " c" + p
    }
  }
  function write(text) {
    let i = 0
    while (i < text.length) {
      const ch = text[i]
      if (ch === "\\x1b") {
        const m = /^\\x1b(?:\\[([0-9;?]*)([A-Za-z])|\\][^\\x07]*\\x07|[()][A-Za-z0-9]|[=>78])/.exec(text.slice(i))
        if (!m) { i++; continue }
        if (m[2] === "m") sgr(m[1])
        else if (m[2] === "K") lines[row].length = col
        else if (m[2] === "J") lines[row].length = col
        else if (m[2] === "G") col = Math.max(0, (parseInt(m[1] || "1", 10) || 1) - 1)
        else if (m[2] === "A") row = Math.max(0, row - (parseInt(m[1] || "1", 10) || 1))
        i += m[0].length
        continue
      }
      if (ch === "\\n") { row++; col = 0; while (lines.length <= row) lines.push([]) }
      else if (ch === "\\r") col = 0
      else if (ch === "\\b") col = Math.max(0, col - 1)
      else if (ch === "\\t") { do put(" "); while (col % 8) }
      else if (ch >= " ") put(ch)
      i++
    }
    if (lines.length > 5000) { const drop = lines.length - 5000; lines.splice(0, drop); row -= drop }
    render()
  }
  function render() {
    const first = Math.max(0, Math.min(row, lines.length - 1) - rows + 1)
    let html = ""
    for (let r = first; r < Math.min(lines.length, first + rows); r++) {
      let cur = null, buf = ""
      for (const cell of lines[r]) {
        const [c, k] = cell || [" ", ""]
        if (k !== cur) { if (cur !== null) html += cur ? "<span class=\\"" + cur.trim() + "\\">" + esc(buf) + "</span>" : esc(buf); cur = k; buf = "" }
        buf += c
      }
      if (cur !== null) html += cur ? "<span class=\\"" + cur.trim() + "\\">" + esc(buf) + "</span>" : esc(buf)
      if (r === row) html += "<span id=\\"cursor\\"></span>"
      html += "\\n"
    }
    screen.innerHTML = html
  }
  window.__term = {
    write,
    title: (t, meta) => { document.getElementById("title").textContent = t; document.getElementById("meta").textContent = meta },
    meta: (m) => { document.getElementById("meta").textContent = m },
  }
  render()
})()
</script></body></html>`

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: path.dirname(out), size: SIZE } })
const page = await context.newPage()
await page.setContent(PAGE)
const started = Date.now()
await page.evaluate(([t, m]) => window.__term.title(t, m), [`$ ${command}`, `· ${new Date().toISOString()} · ${ROOT}`])
await page.waitForTimeout(800)

// A pty (util-linux `script`) so the command sees a terminal: colours, progress output, prompts. Fall back to a plain pipe.
const havePty = spawnSync("script", ["--version"], { stdio: "ignore" }).status === 0
const env = { ...process.env, TERM: "xterm-256color", COLUMNS: String(COLS), LINES: String(ROWS), FORCE_COLOR: "1", CI: process.env.CI ?? "1", PAGER: "cat" }
const child = havePty
  ? spawn("script", ["-qfec", `stty cols ${COLS} rows ${ROWS} 2>/dev/null; ${command}`, "/dev/null"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] })
  : spawn("bash", ["-c", command], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] })

let pending = ""
let flushing = Promise.resolve()
const flush = () => {
  if (!pending) return flushing
  const chunk = pending
  pending = ""
  flushing = flushing.then(() => page.evaluate((c) => window.__term.write(c), chunk)).catch(() => {})
  return flushing
}
const timer = setInterval(flush, 60)
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding("utf8")
  stream.on("data", (d) => { pending += d; process.stdout.write(d) })
}
const code = await new Promise((resolve) => child.on("close", (c, signal) => resolve(c ?? (signal ? 128 : 1))))
clearInterval(timer)
await flush()
const elapsed = ((Date.now() - started) / 1000).toFixed(1)
await page.evaluate(([c, e]) => { window.__term.write(`\n\x1b[2m[exit ${c} · ${e}s]\x1b[0m`); window.__term.meta(`· exit ${c} · ${e}s`) }, [code, elapsed])
await page.waitForTimeout(2500)
await context.close()
const webm = await page.video().path()
await browser.close()

const ff = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-vf", `scale=${SIZE.width}:${SIZE.height}`, "-movflags", "+faststart", out], { stdio: "inherit" })
if (ff.status === 0) unlinkSync(webm)
else renameSync(webm, out.replace(/\.mp4$/, ".webm"))
console.log(`\nrecording: ${ff.status === 0 ? out : out.replace(/\.mp4$/, ".webm")}`)
process.exit(code)
