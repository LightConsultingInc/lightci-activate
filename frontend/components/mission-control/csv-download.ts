/** Client-side file download helpers. No API round-trip; the payload we already hold is the export. */

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function cell(v: unknown): string {
  if (v == null) return ""
  const s = typeof v === "object" ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return ""
  const cols = columns ?? Array.from(rows.reduce((set, r) => (Object.keys(r).forEach((k) => set.add(k)), set), new Set<string>()))
  const lines = [cols.map(cell).join(",")]
  for (const r of rows) lines.push(cols.map((c) => cell(r[c])).join(","))
  return lines.join("\r\n")
}

export function csvDownload(filename: string, rows: Record<string, unknown>[], columns?: string[]) {
  download(filename.endsWith(".csv") ? filename : `${filename}.csv`, new Blob(["﻿" + toCsv(rows, columns)], { type: "text/csv;charset=utf-8" }))
}

export function jsonDownload(filename: string, data: unknown) {
  download(filename.endsWith(".json") ? filename : `${filename}.json`, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
}

export function stamp(d = new Date()) {
  return d.toISOString().slice(0, 10)
}
