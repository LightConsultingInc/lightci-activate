"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Hammer, Waves } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PersonChip } from "@/components/library/person-chip"
import { MicroBar } from "@/components/library/micro-bar"
import { describeError } from "@/components/library/skill-actions"
import { useBuildWorkflow, useMarkNextWave } from "@/hooks/library/queries"
import { cn } from "@/lib/utils"
import type { WorkflowStatus, WorkflowSummary } from "@/hooks/library/types"

const STATUS: Record<WorkflowStatus, { label: string; cls: string }> = {
  candidate: { label: "Idea", cls: "bg-muted text-muted-foreground" },
  scored: { label: "Ranked", cls: "bg-info-soft text-info" },
  in_build: { label: "In build", cls: "bg-glow-soft text-glow-foreground" },
  shipped: { label: "Shipped", cls: "bg-pass-soft text-pass" },
  measured: { label: "Measured", cls: "bg-pass text-paper" },
}

/** Backlog ranked by time saved, readiness and risk. Value / hours / readiness / exposure as micro-bars so the composite is never opaque. */
export function BacklogTable({ items, className }: { items: WorkflowSummary[]; className?: string }) {
  const router = useRouter()
  const build = useBuildWorkflow()
  const wave = useMarkNextWave()
  const maxHours = Math.max(1, ...items.map((w) => w.score?.hours ?? 0))

  const onBuild = (w: WorkflowSummary) =>
    build.mutate(w.id, {
      onSuccess: (d) => toast.success(`Claude drafted “${d.skill.name}”`, { description: "Example requests and limits are filled in from what we know about this task.", action: { label: "Open draft", onClick: () => router.push(`/library/${d.skill.slug}?edit=1`) } }),
      onError: (e) => toast.error("Couldn't start the build", { description: describeError(e) }),
    })
  const onWave = (w: WorkflowSummary) =>
    wave.mutate({ id: w.id, nextWave: !w.nextWave }, { onSuccess: () => toast.success(w.nextWave ? `Removed ${w.name} from the next wave` : `${w.name} marked for the next wave`), onError: (e) => toast.error("Couldn't update", { description: describeError(e) }) })

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <Table data-testid="backlog-table">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Task</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead>Why it ranks here</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 && <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">No tasks ranked yet. Tell us which tasks take up your team’s week (meeting prep, follow-up emails and weekly reports are common first picks) and they’ll be ranked here.</TableCell></TableRow>}
          {items.map((w, i) => {
            const s = w.score
            const st = STATUS[w.status] ?? STATUS.candidate
            const building = build.isPending && build.variables === w.id
            const waving = wave.isPending && wave.variables?.id === w.id
            return (
              <TableRow key={w.id} data-testid="backlog-row" data-workflow-id={w.id} className={cn(w.nextWave && "bg-glow-soft/30")}>
                <TableCell className="text-muted-foreground tabular">{i + 1}</TableCell>
                <TableCell>
                  <p className="font-medium">{w.name}</p>
                  <p className="text-xs text-muted-foreground">{w.teamName}{w.championVerified ? " · confirmed by you" : " · not confirmed yet"}{w.nextWave && <span className="ml-1 rounded-full bg-glow px-1.5 text-[10px] font-semibold text-glow-foreground">next wave</span>}</p>
                </TableCell>
                <TableCell className="text-right"><span className="font-display text-xl tabular">{s ? Math.round(s.composite) : "—"}</span></TableCell>
                <TableCell>
                  {s ? (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5" title={s.rationale}>
                      <MicroBar label="value" value={s.value} color="var(--pass)" width={40} />
                      <MicroBar label="hours" value={s.hours / maxHours} color="var(--glow)" width={40} showValue={false} />
                      <MicroBar label="ready" value={s.readiness} color="var(--info)" width={40} />
                      <MicroBar label="risk" value={s.exposure} color="var(--fail)" width={40} />
                    </div>
                  ) : <span className="text-xs text-muted-foreground">Not ranked yet</span>}
                </TableCell>
                <TableCell><PersonChip person={w.owner} size="xs" /></TableCell>
                <TableCell><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", st.cls)}>{st.label}</span></TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1">
                    <Button size="xs" variant={w.nextWave ? "secondary" : "ghost"} onClick={() => onWave(w)} disabled={waving} data-testid="backlog-next-wave" title="Add to or remove from the next group to roll out">{waving ? <Spinner className="size-3" /> : <Waves data-icon="inline-start" />}{w.nextWave ? "In wave" : "Next wave"}</Button>
                    <Button size="xs" variant="outline" onClick={() => onBuild(w)} disabled={building || w.status === "in_build" || w.status === "shipped" || w.status === "measured"} data-testid="backlog-convert" title={w.linkedSkills.length ? `Linked: ${w.linkedSkills.map((k) => k.name).join(", ")}` : "Claude drafts a skill from this task"}>{building ? <Spinner className="size-3" /> : <Hammer data-icon="inline-start" />}Turn into a skill</Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
