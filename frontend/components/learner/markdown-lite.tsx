import { Fragment, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Safe, minimal markdown → React. Supports headings (#..###), paragraphs, unordered and
 * ordered lists, pipe tables, fenced code blocks, inline code, **bold** and *italic*. Never injects HTML:
 * every piece of text is rendered as a React text node.
 */
export function MarkdownLite({ text, className }: { text: string; className?: string }) {
  return <div className={cn("space-y-3 text-sm leading-relaxed", className)}>{renderBlocks(text ?? "")}</div>
}

type Block =
  | { kind: "h"; level: number; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "code"; lang: string; code: string }
  | { kind: "quote"; text: string }
  | { kind: "table"; head: string[]; rows: string[][] }

const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l)
const isRule = (l: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l)
const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n")
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === "") {
      i++
      continue
    }
    const fence = line.match(/^```\s*(\w+)?\s*$/)
    if (fence) {
      const code: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++])
      i++
      blocks.push({ kind: "code", lang: fence[1] ?? "", code: code.join("\n") })
      continue
    }
    // A pipe table: header row, then a --- rule, then rows.
    if (isRow(line) && i + 1 < lines.length && isRule(lines[i + 1])) {
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && isRow(lines[i])) rows.push(cells(lines[i++]))
      blocks.push({ kind: "table", head, rows })
      continue
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      blocks.push({ kind: "h", level: h[1].length, text: h[2] })
      i++
      continue
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ""))
      blocks.push({ kind: "ul", items })
      continue
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""))
      blocks.push({ kind: "ol", items })
      continue
    }
    if (/^>\s?/.test(line)) {
      const q: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ""))
      blocks.push({ kind: "quote", text: q.join(" ") })
      continue
    }
    const p: string[] = []
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,3})\s|^```|^\s*[-*•]\s+|^\s*\d+[.)]\s+|^>/.test(lines[i]) && !(isRow(lines[i]) && isRule(lines[i + 1] ?? ""))) p.push(lines[i++])
    blocks.push({ kind: "p", text: p.join(" ") })
  }
  return blocks
}

/** Inline: `code`, **bold**, *italic*. Tokenised left to right; unmatched markers are literal. */
export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|((?<![A-Za-z0-9])_[^_\s][^_]*_(?![A-Za-z0-9]))/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith("`")) out.push(<code key={k++} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{tok.slice(1, -1)}</code>)
    else if (tok.startsWith("**")) out.push(<strong key={k++} className="font-semibold">{tok.slice(2, -2)}</strong>)
    else out.push(<em key={k++}>{tok.slice(1, -1)}</em>)
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function renderBlocks(src: string): ReactNode {
  return parseBlocks(src).map((b, i) => {
    switch (b.kind) {
      case "h": {
        const cls = b.level === 1 ? "font-display text-xl font-medium" : b.level === 2 ? "font-display text-lg font-medium" : "text-sm font-semibold"
        return b.level === 1 ? <h3 key={i} className={cls}>{renderInline(b.text)}</h3> : b.level === 2 ? <h4 key={i} className={cls}>{renderInline(b.text)}</h4> : <h5 key={i} className={cls}>{renderInline(b.text)}</h5>
      }
      case "p":
        return <p key={i}>{renderInline(b.text)}</p>
      case "ul":
        return (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}
          </ul>
        )
      case "ol":
        return (
          <ol key={i} className="list-decimal space-y-1 pl-5">
            {b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}
          </ol>
        )
      case "quote":
        return <blockquote key={i} className="border-l-2 border-glow pl-3 text-muted-foreground italic">{renderInline(b.text)}</blockquote>
      case "table":
        return (
          <div key={i} className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/60">
                <tr>{b.head.map((c, j) => <th key={j} className="px-2.5 py-1.5 font-medium">{renderInline(c)}</th>)}</tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j} className="border-t align-top">
                    {b.head.map((_, k) => <td key={k} className="px-2.5 py-1.5">{renderInline(r[k] ?? "")}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      case "code":
        return (
          <pre key={i} className="overflow-x-auto rounded-lg bg-ink p-3 font-mono text-xs leading-relaxed text-paper dark:bg-black/40">
            <code>{b.code}</code>
          </pre>
        )
      default:
        return <Fragment key={i} />
    }
  })
}
