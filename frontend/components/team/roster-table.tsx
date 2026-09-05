"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, ArrowUpDown } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RungBadge } from "@/components/brand/rung"
import { PersonChip } from "@/components/library/person-chip"
import { MicroBar } from "@/components/library/micro-bar"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { RosterRow } from "@/hooks/library/types"

type SortKey = "name" | "rung" | "lastActive" | "hoursBack" | "stalled" | "revisits" | "mastery"

function SortHead({ k, children, className, active, onToggle }: { k: SortKey; children: React.ReactNode; className?: string; active: boolean; onToggle: (k: SortKey) => void }) {
  return (
    <TableHead className={className}>
      <button type="button" onClick={() => onToggle(k)} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}>{children}<ArrowUpDown className="size-3 opacity-50" /></button>
    </TableHead>
  )
}

export function RosterTable({ roster, className }: { roster: RosterRow[]; className?: string }) {
  const router = useRouter()
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "rung", dir: -1 })
  const rows = useMemo(() => {
    const v = (r: RosterRow): number | string => {
      switch (sort.key) {
        case "name": return r.name
        case "rung": return r.rung
        case "lastActive": return r.lastActiveOnRealWork ? new Date(r.lastActiveOnRealWork).getTime() : 0
        case "hoursBack": return r.hoursBackPerWeek
        case "stalled": return r.stalled ? r.stalledDays : -1
        case "revisits": return r.revisitsOverdue
        case "mastery": return r.masteryAvg
      }
    }
    return [...roster].sort((a, b) => { const x = v(a), y = v(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir })
  }, [roster, sort])
  const [now] = useState(() => Date.now())
  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" ? 1 : -1 }))

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <Table data-testid="roster-table">
        <TableHeader>
          <TableRow>
            <SortHead k="name" active={sort.key === "name"} onToggle={toggle}>Name</SortHead>
            <SortHead k="rung" active={sort.key === "rung"} onToggle={toggle}>Rung</SortHead>
            <SortHead k="lastActive" active={sort.key === "lastActive"} onToggle={toggle}>Last active on real work</SortHead>
            <SortHead k="hoursBack" active={sort.key === "hoursBack"} onToggle={toggle}>Hours back vs baseline</SortHead>
            <SortHead k="stalled" active={sort.key === "stalled"} onToggle={toggle}>Stalled</SortHead>
            <SortHead k="revisits" className="text-right" active={sort.key === "revisits"} onToggle={toggle}>Revisits overdue</SortHead>
            <SortHead k="mastery" className="text-right" active={sort.key === "mastery"} onToggle={toggle}>Mastery avg</SortHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">Nobody on the roster yet. Invite advisors from Company admin; their intake interview places them on the ladder.</TableCell></TableRow>}
          {rows.map((r) => {
            const baselineH = (r.baselineMinutesPerWeek ?? 0) / 60
            const hoursBack = r.hoursBackPerWeek ?? 0
            const ratio = baselineH > 0 ? hoursBack / baselineH : 0
            return (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => router.push(`/people/${r.id}`)} onKeyDown={(e) => { if (e.key === "Enter") router.push(`/people/${r.id}`) }} tabIndex={0} data-testid="roster-row" data-person-id={r.id}>
                <TableCell><PersonChip person={r} size="sm" showTitle /></TableCell>
                <TableCell><RungBadge rung={r.rung} /></TableCell>
                <TableCell className="text-sm">
                  {r.lastActiveOnRealWork ? <span className={cn(now - new Date(r.lastActiveOnRealWork).getTime() > 7 * 86400e3 && "text-muted-foreground")}>{fmt.ago(r.lastActiveOnRealWork)}</span> : <span className="text-muted-foreground italic">never</span>}
                  <span className="ml-2 text-xs text-muted-foreground tabular">{r.activeDays30}/30d</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <MicroBar value={ratio} color="var(--glow)" showValue={false} width={64} />
                    <span className="text-sm tabular">{hoursBack.toFixed(1)}h</span>
                    <span className="text-xs text-muted-foreground tabular">/ {baselineH.toFixed(1)}h</span>
                  </div>
                </TableCell>
                <TableCell>
                  {r.stalled ? <span className="inline-flex items-center gap-1 rounded-full bg-revise-soft px-2 py-0.5 text-xs font-medium text-glow-foreground" data-testid="stalled-flag"><AlertTriangle className="size-3" /> {r.stalledDays}d</span> : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className={cn("text-right tabular", r.revisitsOverdue > 0 ? "text-fail" : "text-muted-foreground")}>{r.revisitsOverdue || "—"}</TableCell>
                <TableCell className="text-right tabular">{fmt.pct(r.masteryAvg)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
