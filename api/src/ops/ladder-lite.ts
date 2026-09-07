/**
 * Reduced LadderView built straight from entities (latest MasterySnapshot per competency,
 * Grades for judgement, Baseline/Measurement for hours back, UsageSnapshot for streak).
 * Used by the Mission Control person page so ops does not depend on learning's
 * MasteryService (owned by another agent). See docs/api-contract.md → Deviations.
 */
import { DAY_MS, isoDay } from '../common/dates';
import type { Person } from '../orgs/entities/person.entity';
import { COMPETENCY_CATALOG, RUNG_GATES } from '../learning/competency-catalog';
import { DECAY_REASSESS_THRESHOLD } from '../learning/mastery-math';
import type { Rung } from '../common/roles';
import {
  activeDaysCount,
  addDaysIso,
  clamp01,
  mean,
  personHoursBack,
  round,
  type OrgFacts,
} from './metrics.service';
import { exerciseSummary, personRef } from './shape';
import type { LadderCompetency, LadderView } from './ops.types';

export function ladderLite(f: OrgFacts, person: Person): LadderView {
  const rung = f.rungs.get(person.id) ?? 0;
  const nextRung = rung >= 5 ? null : rung + 1;
  const today = isoDay(f.now);

  // Competencies: latest snapshot per code.
  const latest = new Map<string, OrgFacts['masterySnapshots'][number]>();
  for (const s of f.masterySnapshots) {
    if (s.personId !== person.id) continue;
    const cur = latest.get(s.competencyCode);
    if (!cur || s.day > cur.day) latest.set(s.competencyCode, s);
  }
  const competencies: LadderCompetency[] = COMPETENCY_CATALOG.map((c) => {
    const snap = latest.get(c.code);
    const mastery = snap?.mastery ?? 0;
    const components = snap?.components ?? {
      artifact: 0,
      consistency: 0,
      retention: 0,
      judgement: 0,
      contexts: 0,
    };
    let status: LadderCompetency['status'] = 'locked';
    if (c.rung <= rung || c.rung === nextRung) status = 'in_progress';
    if (mastery >= c.masteryThreshold && components.contexts >= c.minContexts)
      status = 'mastered';
    else if (
      c.rung < rung &&
      snap &&
      components.retention < DECAY_REASSESS_THRESHOLD
    )
      status = 'decayed';
    return {
      code: c.code,
      name: c.name,
      rung: c.rung,
      mastery,
      components,
      threshold: c.masteryThreshold,
      minContexts: c.minContexts,
      status,
    };
  });

  // Judgement from grades.
  const grades = f.grades
    .filter((g) => g.personId === person.id)
    .sort((a, b) => b.gradedAt.getTime() - a.gradedAt.getTime());
  const calib = grades
    .map((g) => g.expectationAccuracy)
    .filter((x): x is number => typeof x === 'number');
  const crit = grades
    .map((g) => g.critiqueQuality)
    .filter((x): x is number => typeof x === 'number');
  const calibration = calib.length ? round(mean(calib)) : 0;
  const critiqueQuality = crit.length ? round(mean(crit)) : 0;
  const judgementScore = round(0.5 * calibration + 0.5 * critiqueQuality);
  const recentJ = calib.slice(0, 5);
  const olderJ = calib.slice(5, 10);
  const trend: 'up' | 'flat' | 'down' =
    recentJ.length && olderJ.length
      ? mean(recentJ) - mean(olderJ) > 0.05
        ? 'up'
        : mean(recentJ) - mean(olderJ) < -0.05
          ? 'down'
          : 'flat'
      : 'flat';
  const subs = f.submissions.filter((s) => s.personId === person.id);
  let over = 0;
  let judged = 0;
  for (const s of subs) {
    const g = grades.find((x) => x.submissionId === s.id);
    if (!g) continue;
    judged++;
    if (s.expectationConfidence > 0.5 && g.decision === 'revise') over++;
  }
  const overconfidentRate = judged ? round(over / judged) : 0;

  // Gate for the next rung.
  const gateRung = (nextRung ?? 5) as Rung;
  const gate = RUNG_GATES[gateRung];
  const gateComps = competencies.filter((c) => c.rung === gateRung);
  const gateMastery = gateComps.length
    ? mean(gateComps.map((c) => c.mastery))
    : 0;
  const gateContexts = gateComps.length
    ? Math.min(...gateComps.map((c) => c.components.contexts))
    : 0;
  const retentionOk = !competencies.some(
    (c) =>
      gate.retainedRungs.includes(c.rung as Rung) && c.status === 'decayed',
  );
  const met = {
    mastery: gateMastery >= gate.masteryThreshold,
    contexts: gateContexts >= gate.minContexts,
    judgement: judgementScore >= gate.minJudgement,
    retention: retentionOk,
  };
  const toNextRung =
    nextRung === null
      ? 1
      : round(
          clamp01(
            mean([
              gate.masteryThreshold
                ? clamp01(gateMastery / gate.masteryThreshold)
                : 1,
              gate.minContexts ? clamp01(gateContexts / gate.minContexts) : 1,
              gate.minJudgement
                ? clamp01(judgementScore / gate.minJudgement)
                : 1,
            ]),
          ),
        );

  // Hours back.
  const hb = personHoursBack(f, person.id);
  const monthStartDay = `${today.slice(0, 7)}-01`;
  const weeksThisMonth = Math.max(
    1,
    Math.round((Date.parse(today) - Date.parse(monthStartDay)) / (7 * DAY_MS)),
  );
  const series: { week: string; minutesBack: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const week = addDaysIso(today, -7 * i);
    const measured = f.measurements.filter(
      (m) => m.personId === person.id && m.periodEnd <= week,
    );
    const partial = measured.length
      ? personHoursBackUntil(f, person.id, week)
      : 0;
    series.push({ week, minutesBack: round(partial, 1) });
  }
  const hoursBack = {
    thisMonthMinutes: hb.measuredTasks
      ? round(hb.minutesBackPerWeek * weeksThisMonth, 1)
      : 0,
    baselineMinutesPerWeek: hb.measuredTasks
      ? hb.baselineMinutesPerWeek
      : f.baselines
          .filter((b) => b.personId === person.id)
          .reduce((s, b) => s + b.minutesPerWeek + b.reworkMinutesPerWeek, 0),
    currentMinutesPerWeek: hb.measuredTasks ? hb.currentMinutesPerWeek : 0,
    netOfReworkMinutes: hb.measuredTasks ? hb.minutesBackPerWeek : 0,
    hasBaseline: f.baselines.some((b) => b.personId === person.id),
    hasMeasurement: hb.measuredTasks > 0,
    series,
  };

  // Streak.
  const last14 = Array.from({ length: 14 }, (_, i) =>
    addDaysIso(today, -(13 - i)),
  ).map((day) => ({
    day,
    active: f.activeDays.some(
      (a) => a.personId === person.id && a.day === day && a.active,
    ),
  }));
  const streak = {
    activeDays: activeDaysCount(
      f.activeDays,
      person.id,
      addDaysIso(today, -29),
      today,
    ),
    last14,
  };

  const exercises = f.exercises.filter((e) => e.personId === person.id);
  const nextUp =
    exercises.find((e) => e.status === 'active') ??
    exercises
      .filter((e) => e.status === 'queued')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ??
    null;
  const queued = exercises
    .filter((e) => e.status === 'queued' && e.id !== nextUp?.id)
    .map(exerciseSummary);
  const compName = new Map(COMPETENCY_CATALOG.map((c) => [c.code, c.name]));
  const revisitsDue = f.revisits
    .filter((r) => r.personId === person.id && !r.doneAt && r.dueAt <= f.now)
    .map((r) => ({
      id: r.id,
      competencyCode: r.competencyCode,
      competencyName: compName.get(r.competencyCode) ?? r.competencyCode,
      prompt: r.prompt,
      dueAt: r.dueAt,
      intervalStep: r.intervalStep,
      overdue: r.dueAt.getTime() < f.now.getTime() - DAY_MS,
    }));
  const recentGrades = grades.slice(0, 10).map((g) => {
    const sub = subs.find((s) => s.id === g.submissionId);
    const ex = sub ? exercises.find((e) => e.id === sub.exerciseId) : undefined;
    return {
      submissionId: g.submissionId ?? '',
      exerciseTitle: ex?.title ?? 'Skill grade',
      score: g.score,
      decision: g.decision,
      gradedAt: g.gradedAt,
    };
  });
  const coachNotes = f.notes
    .filter((n) => n.personId === person.id)
    .slice(0, 10)
    .map((n) => ({ note: n.note, tags: n.tags, createdAt: n.createdAt }));

  return {
    person: personRef(person, f),
    rung,
    nextRung,
    progress: {
      toNextRung,
      gate: {
        masteryThreshold: gate.masteryThreshold,
        minContexts: gate.minContexts,
        minJudgement: gate.minJudgement,
      },
      met,
    },
    competencies,
    judgement: {
      score: judgementScore,
      calibration,
      critiqueQuality,
      trend,
      overconfidentRate,
    },
    hoursBack,
    streak,
    nextUp: nextUp ? exerciseSummary(nextUp) : null,
    revisitsDue,
    queued,
    recentGrades,
    coachNotes,
  };
}

/** Hours back using only measurements whose period ended on or before `day`. */
function personHoursBackUntil(
  f: OrgFacts,
  personId: string,
  day: string,
): number {
  const scoped: OrgFacts = {
    ...f,
    measurements: f.measurements.filter(
      (m) => m.personId === personId && m.periodEnd <= day,
    ),
  };
  return personHoursBack(scoped, personId).minutesBackPerWeek;
}
