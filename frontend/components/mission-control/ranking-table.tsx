"use client"

import { useMemo, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export type Column<T> = {
  key: string
  header: React.ReactNode
  /** Value used for sorting; defaults to `render` text when omitted. */
  sortValue?: (row: T) => number | string | null | undefined
  render: (row: T) => React.ReactNode
  align?: "left" | "right" | "center"
  className?: string
  sortable?: boolean
  width?: string
}

/** Generic sortable table. Sorting is client-side; default sort is the first sortable column descending. */
export function RankingTable<T>({ rows, columns, rowKey, onRowClick, rowHref, defaultSort, testId = "ranking-table", emptyLabel = "Nothing to rank yet.", dense, rowTestId = "ranking-row" }: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  rowHref?: (row: T) => string | null
  defaultSort?: { key: string; dir: "asc" | "desc" }
  testId?: string
  emptyLabel?: string
  dense?: boolean
  rowTestId?: string
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(defaultSort ?? null)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return rows
    const sv = col.sortValue
    return [...rows].sort((a, b) => {
      const va = sv(a)
      const vb = sv(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))
      return sort.dir === "asc" ? c : -c
    })
  }, [rows, sort, columns])

  const toggle = (c: Column<T>) => {
    if (c.sortable === false || !c.sortValue) return
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === "desc" ? "asc" : "desc" } : { key: c.key, dir: "desc" }))
  }

  return (
    <Table data-testid={testId} data-sort={sort ? `${sort.key}:${sort.dir}` : undefined}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map((c) => {
            const sortable = c.sortable !== false && Boolean(c.sortValue)
            const active = sort?.key === c.key
            return (
              <TableHead key={c.key} className={cn("text-xs text-muted-foreground", c.align === "right" && "text-right", c.align === "center" && "text-center", c.className)} style={{ width: c.width }} aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}>
                {sortable ? (
                  <button type="button" onClick={() => toggle(c)} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")} data-testid={`sort-${c.key}`}>
                    {c.header}
                    {active ? sort!.dir === "asc" ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" /> : <ArrowUpDownIcon className="size-3 opacity-50" />}
                  </button>
                ) : (
                  c.header
                )}
              </TableHead>
            )
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.length === 0 && (
          <TableRow>
            <TableCell colSpan={columns.length} className="py-8 text-center text-sm text-muted-foreground">
              {emptyLabel}
            </TableCell>
          </TableRow>
        )}
        {sorted.map((row) => {
          const href = rowHref?.(row)
          const clickable = Boolean(onRowClick || href)
          return (
            <TableRow
              key={rowKey(row)}
              data-testid={rowTestId}
              className={cn(clickable && "cursor-pointer", dense && "[&>td]:py-1")}
              onClick={() => {
                if (onRowClick) onRowClick(row)
                else if (href) window.location.assign(href)
              }}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={(e) => {
                if (clickable && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault()
                  if (onRowClick) onRowClick(row)
                  else if (href) window.location.assign(href)
                }
              }}
            >
              {columns.map((c) => (
                <TableCell key={c.key} className={cn(c.align === "right" && "text-right tabular", c.align === "center" && "text-center", c.className)}>
                  {c.render(row)}
                </TableCell>
              ))}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
