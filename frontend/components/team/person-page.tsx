"use client"

import Link from "next/link"
import { ChevronLeft, Lock, Mail } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Paper } from "@/components/brand/grain"
import { RungBadge, RungRing, rungColor } from "@/components/brand/rung"
import { PageHeader, SectionHeader } from "@/components/shell/page-header"
import { EmptyState, ErrorState } from "@/components/shell/empty-state"
import { PersonChip } from "@/components/library/person-chip"
import { MicroBar } from "@/components/library/micro-bar"
import { describeError } from "@/components/library/skill-actions"
import { useMe, hasRole } from "@/hooks/use-me"
import { usePersonPage } from "@/hooks/library/queries"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { JourneyTimeline } from "./journey-timeline"
import type { PersonPage as PersonPageT } from "@/hooks/library/types"

export function PersonPageView({ id }: { id: string }) {
  const me = useMe()
  const allowed = hasRole(me, "champion", "sponsor", "admin", "lead")
  const q = usePersonPage(id, allowed)
  if (!allowed) {
    return (
      <>
        <PageHeader eyebrow="Person" title="Not yours to see" />
        <EmptyState icon={<Lock className="size-5" />} title="This page is for team champions and managers" description="It shows a colleague's progress, time saved and coaching notes. Your own progress is on the home page; ask your champion if you need to see a colleague's." action={<Button render={<Link href="/" />}>Go to My Ladder</Button>} />
      </>
    )
  }
  if (q.isPending) return <div className="space-y-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-40" /><div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div></div>
  if (q.isError) return <ErrorState title="Couldn't load this person" detail={describeError(q.error)} retry={() => q.refetch()} />
  return <Body d={q.data} />
}

function Body({ d }: { d: PersonPageT }) {
  const { person: p, ladder: l } = d
  const met = l.progress.met
  const components: { label: string; ok: boolean; hint: string }[] = [
    { label: "Practice", ok: met.mastery, hint: `scoring ${fmt.pct(l.progress.gate.masteryThreshold)} or more at this level` },
    { label: "Variety", ok: met.contexts, hint: `used on ${l.progress.gate.minContexts}+ different kinds of task` },
    { label: "Recall", ok: met.retention, hint: "quick recaps done on time" },
  ]
  const baselineH = l.hoursBack.baselineMinutesPerWeek / 60
  const currentH = l.hoursBack.currentMinutesPerWeek / 60
  const openEsc = d.escalations.filter((e) => e.state !== "resolved")
  // With no "before" times, or nothing measured since, time saved is 0 only because it's unknown: hide the tile.
  const hasTimeSaved = baselineH > 0 && d.measurements.length > 0

  return (
    <div className="animate-rise" data-testid="person-page">
      <Link href="/team" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="back-to-team"><ChevronLeft className="size-4" /> Team</Link>
      <Paper className="rounded-2xl border bg-card p-6 md:p-8" data-testid="person-header">
        <div className="flex flex-wrap items-center gap-6">
          <RungRing rung={l.rung} progress={l.progress.toNextRung} size={104} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><RungBadge rung={p.rung} />{p.teamName && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{p.teamName}</span>}{p.roles.filter((r) => r !== "learner").map((r) => <span key={r} className="rounded-full bg-glow-soft px-2 py-0.5 text-xs capitalize text-glow-foreground">{r}</span>)}</div>
            <h1 className="font-display mt-2 text-3xl font-medium leading-tight">{p.name}</h1>
            <p className="text-muted-foreground">{p.title ?? "—"} · <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 hover:underline"><Mail className="size-3.5" />{p.email}</a></p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="activation-components">
              {components.map((c) => (
                <div key={c.label} className={cn("rounded-lg border px-3 py-2", c.ok ? "border-pass/30 bg-pass-soft/60" : "bg-muted/30")}>
                  <p className="text-xs font-medium">{c.ok ? "✓" : "○"} {c.label}</p>
                  <p className="text-[11px] text-muted-foreground">{c.hint}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-1">
            {hasTimeSaved && <Stat label="Time saved / wk" value={`${Math.max(0, baselineH - currentH).toFixed(1)}h`} hint={`was ${baselineH.toFixed(1)}h a week`} />}
          </div>
        </div>
      </Paper>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          <section data-testid="person-journey">
            <SectionHeader title="Journey" description="Starting level, practice, scores, skills, time checks and flags, newest first." />
            <div className="rounded-xl border bg-card p-5"><JourneyTimeline events={d.journey} /></div>
          </section>

          <section data-testid="person-baselines">
            <SectionHeader title="Time saved" description="How long each task took before versus now, counting time spent fixing Claude's work." />
            <div className="overflow-hidden rounded-xl border bg-card">
              <Table>
                <TableHeader><TableRow><TableHead>Task</TableHead><TableHead>How we know</TableHead><TableHead className="text-right">Before / wk</TableHead><TableHead className="text-right">Now / wk</TableHead><TableHead className="text-right">Saved</TableHead></TableRow></TableHeader>
                <TableBody>
                  {d.baselines.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No times recorded yet. Their first chat estimates how long their regular tasks take (meeting prep, follow-up emails…) so there’s something to compare against.</TableCell></TableRow>}
                  {d.baselines.map((b) => {
                    const m = d.measurements.filter((x) => x.baselineId === b.id || (x.task === b.task && !x.baselineId)).sort((a, c) => c.periodEnd.localeCompare(a.periodEnd))[0]
                    const baseNet = b.minutesPerWeek + b.reworkMinutesPerWeek
                    const measNet = m ? m.minutesPerWeek + m.reworkMinutesPerWeek : null
                    const back = measNet != null ? (baseNet - measNet) / 60 : null
                    return (
                      <TableRow key={b.id} data-testid="baseline-row">
                        <TableCell className="font-medium">{b.task}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{b.method.replace("_", " ")} · {fmt.dateShort(b.capturedAt)}</TableCell>
                        <TableCell className="text-right tabular">{fmt.hours(b.minutesPerWeek)}{b.reworkMinutesPerWeek > 0 && <span className="text-xs text-muted-foreground"> +{fmt.hours(b.reworkMinutesPerWeek)} fixing</span>}</TableCell>
                        <TableCell className="text-right tabular">{m ? <>{fmt.hours(m.minutesPerWeek)}{m.reworkMinutesPerWeek > 0 && <span className="text-xs text-muted-foreground"> +{fmt.hours(m.reworkMinutesPerWeek)} fixing</span>}</> : <span className="text-xs text-muted-foreground">not checked yet</span>}</TableCell>
                        <TableCell className={cn("text-right tabular font-medium", back != null && back > 0 ? "text-pass" : back != null && back < 0 ? "text-fail" : "text-muted-foreground")}>{back != null ? `${back > 0 ? "+" : ""}${back.toFixed(1)}h` : "—"}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </section>

          <section data-testid="person-usage">
            <SectionHeader title="Usage · last 90 days" description="Bars are messages sent; dots mark days they used Claude for real work." />
            <UsageSparkline series={d.usageSeries} />
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl border bg-card p-4" data-testid="person-mastery">
            <p className="eyebrow mb-3">How each skill area is going</p>
            <ul className="space-y-2">
              {l.competencies.filter((c) => c.status !== "locked").map((c) => (
                <li key={c.code} className="text-sm">
                  <div className="flex items-baseline justify-between gap-2"><span className="truncate">{c.name}</span><span className={cn("text-xs capitalize", c.status === "mastered" ? "text-pass" : c.status === "decayed" ? "text-fail" : "text-muted-foreground")}>{STATUS_LABEL[c.status] ?? c.status.replace("_", " ")}</span></div>
                  <MicroBar value={c.mastery} color={rungColor(c.rung)} fluid className="mt-1" />
                </li>
              ))}
              {l.competencies.filter((c) => c.status !== "locked").length === 0 && <li className="text-sm text-muted-foreground">Nothing started yet.</li>}
            </ul>
          </section>
          <section className="rounded-xl border bg-card p-4" data-testid="person-coach-notes">
            <p className="eyebrow mb-3">Coaching notes</p>
            {d.coachNotes.length === 0 ? <p className="text-sm text-muted-foreground">No notes yet.</p> : (
              <ul className="space-y-3">{[...d.coachNotes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8).map((n, i) => (
                <li key={i} className="text-sm"><p>{n.note}</p><p className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-muted-foreground">{n.tags.map((t) => <span key={t} className="rounded bg-muted px-1">{t}</span>)}<span>{fmt.ago(n.createdAt)}</span></p></li>
              ))}</ul>
            )}
          </section>
          <section className="rounded-xl border bg-card p-4" data-testid="person-escalations">
            <p className="eyebrow mb-3">Flags {openEsc.length > 0 && <span className="ml-1 rounded-full bg-fail-soft px-1.5 text-fail">{openEsc.length} open</span>}</p>
            {d.escalations.length === 0 ? <p className="text-sm text-muted-foreground">None. If they skip something twice because they’re stuck, it shows up here.</p> : (
              <ul className="space-y-2">{d.escalations.map((e) => (
                <li key={e.id} className={cn("rounded-lg border p-2 text-sm", e.state !== "resolved" && "border-fail/30 bg-fail-soft/40")}>
                  <p className="flex items-center justify-between gap-2"><span className="font-medium capitalize">{e.kind.replace("_", " ")}</span><span className="text-[11px] text-muted-foreground">{e.state.replace("_", " ")} · {fmt.ago(e.createdAt)}</span></p>
                  <p className="text-xs text-muted-foreground">{e.reason}</p>
                  {e.resolution && <p className="mt-1 text-xs">↳ {e.resolution}</p>}
                </li>
              ))}</ul>
            )}
          </section>
          <p className="text-xs text-muted-foreground">You’re seeing the manager’s view. <PersonChip person={p} size="xs" muted className="align-middle" /> sees the same progress, without the notes and flags.</p>
        </aside>
      </div>
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = { in_progress: "in progress", mastered: "got it", decayed: "needs a refresher" }

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="rounded-xl border bg-background/60 px-4 py-3"><p className="eyebrow !text-[10px]">{label}</p><p className="font-display text-2xl tabular">{value}</p>{hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}</div>
}

function UsageSparkline({ series }: { series: PersonPageT["usageSeries"] }) {
  const s = [...series].sort((a, b) => a.day.localeCompare(b.day)).slice(-90)
  const max = Math.max(1, ...s.map((d) => d.messages))
  const activeDays = s.filter((d) => d.activeOnRealWork).length
  if (s.length === 0) return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No usage recorded yet.</p>
  return (
    <div className="rounded-xl border bg-card p-4" data-testid="usage-sparkline">
      <div className="flex items-baseline justify-between text-sm"><span className="text-muted-foreground">Used Claude for work on {activeDays} of {s.length} days</span><span className="tabular text-muted-foreground">{fmt.num(s.reduce((a, d) => a + d.messages, 0))} messages</span></div>
      <div className="mt-3 flex h-16 items-end gap-px" role="img" aria-label="Daily messages, 90 days">
        {s.map((d) => <span key={d.day} title={`${fmt.dateShort(d.day)}: ${d.messages} messages${d.activeOnRealWork ? ", used for work" : ""}`} className="flex-1 rounded-t-[2px] bg-foreground/70" style={{ height: `${Math.max(2, (d.messages / max) * 100)}%`, opacity: d.messages ? 1 : 0.15 }} />)}
      </div>
      <div className="mt-1.5 flex gap-px">
        {s.map((d) => <span key={d.day} className={cn("h-1.5 flex-1 rounded-full", d.activeOnRealWork ? "bg-glow" : "bg-muted")} />)}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{fmt.dateShort(s[0].day)}</span><span>{fmt.dateShort(s[s.length - 1].day)}</span></div>
    </div>
  )
}
