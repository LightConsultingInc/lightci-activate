"use client"

import { Check, X } from "lucide-react"
import { Grain } from "@/components/brand/grain"
import { RungRing, rungMeta } from "@/components/brand/rung"
import { HoursBackSparkline } from "../hours-back-sparkline"
import { StreakDots } from "../streak-dots"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { LadderView } from "@/hooks/learner/types"

/** Name, team, rung ring, hours back vs baseline with sparkline, streak dots, and the gate checklist. */
export function LadderHeader({ ladder }: { ladder: LadderView }) {
  const { person, rung, nextRung, progress, hoursBack, streak } = ladder
  const next = nextRung != null ? rungMeta(nextRung) : null
  const hoursThisMonth = hoursBack.thisMonthMinutes / 60
  const weeklyDelta = hoursBack.baselineMinutesPerWeek - hoursBack.currentMinutesPerWeek
  return (
    <section className="relative overflow-hidden rounded-2xl bg-ink text-paper" data-testid="ladder-header">
      <Grain opacity={0.1} />
      <div className="relative grid gap-8 p-6 md:grid-cols-[auto_1fr] md:p-8">
        <div className="flex items-center gap-5">
          <RungRing rung={rung} progress={progress.toNextRung} size={112} />
          <div>
            <p className="eyebrow text-paper/60">{person.teamName ?? "No team yet"}{person.title ? ` · ${person.title}` : ""}</p>
            <h1 className="mt-1 font-display text-3xl font-medium leading-tight md:text-4xl" data-testid="ladder-name">{person.name}</h1>
            <p className="mt-1 text-sm text-paper/70">
              <span className="text-glow">{rungMeta(rung).code} {rungMeta(rung).name}</span>
              {next ? <> · {fmt.pct(progress.toNextRung)} of the way to {next.code} {next.name}</> : <> · top of the ladder</>}
            </p>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <p className="eyebrow text-paper/60">Hours back this month</p>
            <p className="mt-1 font-display text-3xl tabular" data-testid="hours-back">{hoursThisMonth.toFixed(hoursThisMonth >= 10 ? 0 : 1)}<span className="text-base text-paper/60">h</span></p>
            <p className="mt-0.5 text-xs text-paper/60">
              {weeklyDelta >= 0 ? `${fmt.hours(weeklyDelta)}/wk under` : `${fmt.hours(-weeklyDelta)}/wk over`} your {fmt.hours(hoursBack.baselineMinutesPerWeek)}/wk baseline
              {hoursBack.netOfReworkMinutes ? ` · ${fmt.hours(hoursBack.netOfReworkMinutes)} net of rework` : ""}
            </p>
            <HoursBackSparkline series={hoursBack.series} className="mt-2" height={40} />
          </div>
          <div>
            <p className="eyebrow text-paper/60">Streak</p>
            <p className="mt-1 font-display text-3xl tabular" data-testid="streak-days">{streak.activeDays}<span className="text-base text-paper/60"> days</span></p>
            <StreakDots last14={streak.last14} activeDays={streak.activeDays} className="mt-2 [&_p]:text-paper/60 [&_p_span]:text-paper" />
          </div>
          <div>
            <p className="eyebrow text-paper/60">Gate to {next ? next.code : "stay current"}</p>
            <ul className="mt-2 space-y-1.5 text-sm" data-testid="gate-checklist">
              <GateItem ok={progress.met.mastery} label={`Mastery ≥ ${fmt.pct(progress.gate.masteryThreshold)}`} />
              <GateItem ok={progress.met.contexts} label={`${progress.gate.minContexts}+ distinct contexts`} />
              <GateItem ok={progress.met.judgement} label={`Judgement ≥ ${fmt.pct(progress.gate.minJudgement)}`} />
              <GateItem ok={progress.met.retention} label="Earlier rungs retained" />
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

function GateItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2" data-met={ok}>
      <span className={cn("grid size-4 place-items-center rounded-full", ok ? "bg-pass text-ink" : "bg-paper/15 text-paper/60")}>{ok ? <Check className="size-3" /> : <X className="size-3" />}</span>
      <span className={cn(!ok && "text-paper/70")}>{label}</span>
    </li>
  )
}
