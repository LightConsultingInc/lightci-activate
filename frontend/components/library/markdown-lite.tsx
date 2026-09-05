import { Fragment, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * MarkdownLite: a deliberately small, safe markdown renderer for SKILL.md.
 * Builds React elements (never innerHTML), so it cannot inject markup. Supports: YAML frontmatter block,
 * headings, paragraphs, bullet and numbered lists, fenced code, blockquotes, rules, simple pipe tables,
 * inline code, bold, italics and http(s) links.
 */

type Block =
  | { t: "frontmatter"; rows: [string, string][] }
  | { t: "h"; level: number; text: string }
  | { t: "p"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "ol"; items: string[] }
  | { t: "code"; lang: string; body: string }
  | { t: "quote"; text: string }
  | { t: "hr" }
  | { t: "table"; head: string[]; rows: string[][] }

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n")
  const out: Block[] = []
  let i = 0
  if (lines[0]?.trim() === "---") {
    const end = lines.indexOf("---", 1)
    if (end > 0) {
      const rows: [string, string][] = []
      for (const l of lines.slice(1, end)) {
        const m = l.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
        if (m) rows.push([m[1], m[2]])
        else if (rows.length && l.trim()) rows[rows.length - 1][1] += ` ${l.trim()}`
      }
      out.push({ t: "frontmatter", rows })
      i = end + 1
    }
  }
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    const fence = line.match(/^```\s*([\w-]*)/)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++])
      i++
      out.push({ t: "code", lang: fence[1], body: body.join("\n") })
      continue
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) { out.push({ t: "h", level: h[1].length, text: h[2] }); i++; continue }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push({ t: "hr" }); i++; continue }
    if (/^\s*>/.test(line)) {
      const q: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""))
      out.push({ t: "quote", text: q.join(" ") })
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? "")) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim())
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]))
      out.push({ t: "table", head, rows })
      continue
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        let item = lines[i++].replace(/^\s*[-*+]\s+/, "")
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*+]\s+/.test(lines[i])) item += ` ${lines[i++].trim()}`
        items.push(item)
      }
      out.push({ t: "ul", items })
      continue
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        let item = lines[i++].replace(/^\s*\d+[.)]\s+/, "")
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i])) item += ` ${lines[i++].trim()}`
        items.push(item)
      }
      out.push({ t: "ol", items })
      continue
    }
    const p: string[] = [line]
    i++
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+[.)]\s|\s*>|\s*\|)/.test(lines[i])) p.push(lines[i++])
    out.push({ t: "p", text: p.join(" ") })
  }
  return out
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)|(\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g

export function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = []
  let last = 0
  let k = 0
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0
    if (idx > last) parts.push(text.slice(last, idx))
    const s = m[0]
    if (m[1]) parts.push(<code key={k++} className="rounded bg-muted px-1 py-px font-mono text-[0.85em]">{s.slice(1, -1)}</code>)
    else if (m[2] || m[3]) parts.push(<strong key={k++} className="font-semibold">{s.slice(2, -2)}</strong>)
    else if (m[4] || m[5]) parts.push(<em key={k++}>{s.slice(1, -1)}</em>)
    else if (m[6]) {
      const label = s.slice(1, s.indexOf("]("))
      parts.push(<a key={k++} href={m[7]} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-4 hover:text-glow-foreground">{label}</a>)
    }
    last = idx + s.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length === 1 ? parts[0] : parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)
}

export function MarkdownLite({ source, className, hideFrontmatter = false }: { source: string; className?: string; hideFrontmatter?: boolean }) {
  const blocks = parseBlocks(source ?? "")
  return (
    <div className={cn("text-sm leading-relaxed [&>*+*]:mt-3", className)} data-testid="markdown-lite">
      {blocks.map((b, i) => {
        switch (b.t) {
          case "frontmatter":
            if (hideFrontmatter) return null
            return (
              <dl key={i} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-dashed bg-muted/40 px-3 py-2 font-mono text-xs">
                {b.rows.map(([key, v]) => (
                  <Fragment key={key}>
                    <dt className="text-muted-foreground">{key}</dt>
                    <dd className="truncate">{v}</dd>
                  </Fragment>
                ))}
              </dl>
            )
          case "h": {
            const Tag = (`h${Math.min(6, b.level + 1)}` as "h2" | "h3" | "h4" | "h5" | "h6")
            const sizes = ["", "font-display text-xl font-medium mt-6", "font-display text-lg font-medium mt-5", "text-sm font-semibold uppercase tracking-wide text-muted-foreground mt-4", "text-sm font-semibold", "text-sm font-medium", "text-sm font-medium"]
            return <Tag key={i} className={sizes[b.level]}>{renderInline(b.text)}</Tag>
          }
          case "p": return <p key={i}>{renderInline(b.text)}</p>
          case "ul": return <ul key={i} className="list-disc space-y-1 pl-5 marker:text-glow">{b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ul>
          case "ol": return <ol key={i} className="list-decimal space-y-1 pl-5 marker:text-muted-foreground">{b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ol>
          case "code": return (
            <pre key={i} className="overflow-x-auto rounded-lg border bg-ink px-3 py-2 font-mono text-xs leading-relaxed text-paper" data-lang={b.lang || undefined}><code>{b.body}</code></pre>
          )
          case "quote": return <blockquote key={i} className="border-l-2 border-glow pl-3 text-muted-foreground italic">{renderInline(b.text)}</blockquote>
          case "hr": return <hr key={i} className="border-border" />
          case "table": return (
            <div key={i} className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/60"><tr>{b.head.map((h, j) => <th key={j} className="px-2 py-1.5 text-left font-medium">{renderInline(h)}</th>)}</tr></thead>
                <tbody>{b.rows.map((r, j) => <tr key={j} className="border-t">{r.map((c, k) => <td key={k} className="px-2 py-1.5 align-top">{renderInline(c)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )
        }
      })}
    </div>
  )
}
