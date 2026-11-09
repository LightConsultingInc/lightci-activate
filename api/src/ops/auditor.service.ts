/**
 * Auditor role: turns the org/team/person metrics into a footnoted readout. Every number
 * in the narrative must point at a footnote whose `baseline` names the record it is
 * measured against; metrics without a baseline are not reported as numbers at all, they
 * are named in the narrative as "not yet measurable" with the reason.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { z } from 'zod';
import { AiService } from '../ai/ai.service';
import { registerMockResponder } from '../ai/mock-responders';
import { DAY_MS, isoDay } from '../common/dates';
import { Readout } from './entities/readout.entity';
import { AuditLog } from './entities/audit-log.entity';
import {
  activeInWindow,
  hoursBack,
  mean,
  MetricsService,
  round,
  rungAt,
  rungDistribution,
  type OrgFacts,
} from './metrics.service';

export interface ReadoutMetric {
  key: string;
  label: string;
  value: number;
  unit: string;
  /** What the value is compared against. Required: metrics without one are moved to `skipped`. */
  baseline: { value: number | null; ref: string };
  source: string;
  detail?: string;
}

export interface ReadoutMetrics {
  scope: {
    type: Readout['scopeType'];
    id: string | null;
    name: string;
    people: number;
  };
  period: { start: string; end: string };
  metrics: ReadoutMetric[];
  skipped: { key: string; label: string; reason: string }[];
}

export const ReadoutDraftSchema = z.object({
  title: z.string(),
  narrative: z.array(z.string()),
  footnotes: z.array(
    z.object({ ref: z.string(), source: z.string(), baseline: z.string() }),
  ),
});
export type ReadoutDraft = z.infer<typeof ReadoutDraftSchema>;

const SYSTEM = `You are the Auditor for LightCI Activate, writing a short readout for a company sponsor.
Rules you never break:
- Report only the numbers given to you under "metrics". Each carries a baseline; cite it as a footnote [n] after the number, and list that footnote with its source and baseline.
- Never invent a figure. Metrics listed under "skipped" have no baseline: say plainly that they are not yet measurable and why, in one sentence each, without a number.
- Plain, concrete prose. No superlatives, no exclamation marks, no bullet lists. 2 to 4 short paragraphs.
- Hours back are always net of rework and always against a baseline record.
- Write for a busy executive who has never seen Activate's internals: say "level" (L0 to L5), never "rung"; never name APIs, tables, seed data or internal components. Someone placed at a level when they joined has not "advanced"; only count moving up after that.`;

registerMockResponder('auditor.readout', (call) => {
  const seed = (call.mockSeed ?? {}) as {
    scopeName?: string;
    period?: { start: string; end: string };
    metrics?: ReadoutMetric[];
    skipped?: { label: string; reason: string }[];
  };
  const metrics = seed.metrics ?? [];
  const footnotes = metrics.map((m, i) => ({
    ref: `${i + 1}`,
    source: m.source,
    baseline: m.baseline.ref,
  }));
  const sentences = metrics.map(
    (m, i) =>
      `${m.label}: ${m.value}${m.unit ? ` ${m.unit}` : ''}${m.baseline.value !== null ? ` against a baseline of ${m.baseline.value}${m.unit ? ` ${m.unit}` : ''}` : ''} [${i + 1}].`,
  );
  const skipped = (seed.skipped ?? []).map(
    (s) => `${s.label} is not yet measurable: ${s.reason}.`,
  );
  const narrative = [
    `Readout for ${seed.scopeName ?? 'the org'}, ${seed.period?.start ?? ''} to ${seed.period?.end ?? ''}.${sentences.length ? ' ' + sentences.join(' ') : ' No metric in this period has a baseline to report against.'}`,
  ];
  if (skipped.length) narrative.push(skipped.join(' '));
  return {
    title: `${seed.scopeName ?? 'Org'} readout ${seed.period?.start ?? ''} – ${seed.period?.end ?? ''}`,
    narrative,
    footnotes,
  } satisfies ReadoutDraft;
});

@Injectable()
export class AuditorService {
  constructor(
    private readonly ai: AiService,
    private readonly metrics: MetricsService,
    @InjectRepository(Readout) private readonly readouts: Repository<Readout>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
  ) {}

  list(orgId: string) {
    return this.readouts.find({
      where: { orgId },
      order: { generatedAt: 'DESC' },
    });
  }

  async get(orgId: string, id: string) {
    const r = await this.readouts.findOne({ where: { id, orgId } });
    if (!r) throw new NotFoundException('Readout not found');
    return r;
  }

  /** A readout generated today for the same scope and period, if any. */
  async cachedToday(
    orgId: string,
    scopeType: Readout['scopeType'],
    scopeId: string | null,
    periodStart: string,
    periodEnd: string,
  ) {
    const rows = await this.readouts.find({
      where: { orgId, scopeType, periodStart, periodEnd },
      order: { generatedAt: 'DESC' },
      take: 10,
    });
    const today = isoDay();
    return (
      rows.find(
        (r) =>
          (r.scopeId ?? null) === (scopeId ?? null) &&
          isoDay(r.generatedAt) === today,
      ) ?? null
    );
  }

  /** Collect metrics (pure over OrgFacts) — exported for tests via the class. */
  collect(
    f: OrgFacts,
    scopeType: Readout['scopeType'],
    scopeId: string | null,
    period: { start: string; end: string },
  ): ReadoutMetrics {
    const start = new Date(`${period.start}T00:00:00Z`);
    const end = new Date(`${period.end}T23:59:59Z`);
    const periodDays = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / DAY_MS),
    );
    const priorStart = new Date(start.getTime() - periodDays * DAY_MS);

    const people = f.people.filter((p) =>
      scopeType === 'team'
        ? p.teamId === scopeId
        : scopeType === 'person'
          ? p.id === scopeId
          : true,
    );
    const ids = new Set(people.map((p) => p.id));
    const name =
      scopeType === 'org'
        ? f.org.name
        : scopeType === 'team'
          ? (f.teamName.get(scopeId ?? '') ?? 'Team')
          : (people[0]?.name ?? 'Person');
    const metrics: ReadoutMetric[] = [];
    const skipped: ReadoutMetrics['skipped'] = [];

    // Hours back net of rework vs baseline.
    const hb = hoursBack(
      f.baselines.filter((b) => ids.has(b.personId)),
      f.measurements.filter(
        (m) => ids.has(m.personId) && m.periodEnd <= period.end,
      ),
    );
    if (hb.measuredTasks > 0) {
      metrics.push({
        key: 'hoursBack',
        label: 'Hours back per week, net of rework',
        value: round(hb.minutesBackPerWeek / 60, 1),
        unit: 'h/wk',
        baseline: {
          value: round(hb.baselineMinutesPerWeek / 60, 1),
          ref: `${hb.measuredTasks} baseline record(s): ${hb.refs
            .filter((r) => r.kind === 'baseline')
            .map((r) => r.id)
            .join(', ')}`,
        },
        source: `Baseline + Measurement rows (${hb.refs.filter((r) => r.kind === 'measurement').length} measurements)`,
        detail: `Current ${round(hb.currentMinutesPerWeek / 60, 1)} h/wk on measured tasks`,
      });
    } else {
      const hasBaselines = f.baselines.some((b) => ids.has(b.personId));
      skipped.push({
        key: 'hoursBack',
        label: 'Hours back',
        reason: hasBaselines
          ? 'baselines exist but no measurement has been recorded for them yet'
          : 'no baseline has been captured for this scope',
      });
    }

    // Active on real work: last 7 days of the period vs first 7 days of the period (baseline = period start).
    const scopedActive = f.activeDays.filter((a) => ids.has(a.personId));
    const seats = people.length;
    if (seats > 0 && scopedActive.length > 0) {
      const endWau = activeInWindow(scopedActive, period.end, 7).size;
      const startWau = activeInWindow(
        scopedActive,
        isoDay(new Date(start.getTime() + 6 * DAY_MS)),
        7,
      ).size;
      const source = new Set(
        f.usage.filter((u) => ids.has(u.personId)).map((u) => u.source),
      );
      metrics.push({
        key: 'activePct',
        label: 'Weekly active on real work',
        value: round((endWau / seats) * 100, 1),
        unit: '%',
        baseline: {
          value: round((startWau / seats) * 100, 1),
          ref: `first week of period (${period.start}), ${seats} people in scope`,
        },
        source: `UsageSnapshot (${[...source].join('+') || 'none'})`,
      });
    } else {
      skipped.push({
        key: 'activePct',
        label: 'Weekly active on real work',
        reason:
          seats === 0
            ? 'no people in scope'
            : "Claude's usage reports are not connected for this company yet",
      });
    }

    // Rung progression: distribution at period end vs start.
    if (people.length > 0) {
      // Someone first placed during the period starts where they were placed: a placement is a starting
      // point, not progress.
      const firstPlacement = (personId: string) =>
        f.placements
          .filter((x) => x.personId === personId)
          .sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime())[0];
      const startRungs = people.map((p) => {
        const first = firstPlacement(p.id);
        return first && first.placedAt > start
          ? first.rung
          : rungAt(f.placements, p.id, start);
      });
      const endRungs = people.map((p) => rungAt(f.placements, p.id, end));
      const startMean = mean(startRungs);
      const endMean = mean(endRungs);
      const moved = people.filter((_, i) => endRungs[i] > startRungs[i]).length;
      metrics.push({
        key: 'rungProgression',
        label: 'Average level',
        value: round(endMean, 2),
        unit: 'level',
        baseline: {
          value: round(startMean, 2),
          ref: `Levels on ${period.start} (or when first placed, if later); people per level ${JSON.stringify(rungDistribution(startRungs))} → ${JSON.stringify(rungDistribution(endRungs))}`,
        },
        source: 'Activate ladder',
        detail: `${moved} of ${people.length} people moved up at least one level after they were placed`,
      });
    }

    // Skills promoted in period vs prior period.
    const scopedSkillIds = new Set(
      f.skills
        .filter((s) =>
          scopeType === 'org'
            ? true
            : scopeType === 'team'
              ? s.teamId === scopeId
              : s.ownerPersonId === scopeId,
        )
        .map((s) => s.id),
    );
    const merged = f.promotions.filter(
      (p) =>
        p.decision === 'merged' && scopedSkillIds.has(p.skillId) && p.decidedAt,
    );
    const inPeriod = merged.filter(
      (p) => p.decidedAt! >= start && p.decidedAt! <= end,
    ).length;
    const inPrior = merged.filter(
      (p) => p.decidedAt! >= priorStart && p.decidedAt! < start,
    ).length;
    if (
      merged.length > 0 ||
      f.promotions.some((p) => scopedSkillIds.has(p.skillId))
    ) {
      metrics.push({
        key: 'skillsPromoted',
        label: 'Skills promoted',
        value: inPeriod,
        unit: 'skills',
        baseline: {
          value: inPrior,
          ref: `prior ${periodDays}-day period (${isoDay(priorStart)} to ${period.start})`,
        },
        source: 'PromotionRequest (decision=merged)',
      });
    } else {
      skipped.push({
        key: 'skillsPromoted',
        label: 'Skills promoted',
        reason: 'no promotion requests exist for this scope yet',
      });
    }

    // Judgement retention: expectation accuracy in period vs prior period.
    const acc = (from: Date, to: Date) =>
      f.grades
        .filter(
          (g) =>
            ids.has(g.personId) &&
            g.gradedAt >= from &&
            g.gradedAt <= to &&
            typeof g.expectationAccuracy === 'number',
        )
        .map((g) => g.expectationAccuracy as number);
    const accNow = acc(start, end);
    const accPrior = acc(priorStart, start);
    const revisitsNow = f.revisits.filter(
      (r) =>
        ids.has(r.personId) &&
        r.doneAt &&
        r.doneAt >= start &&
        r.doneAt <= end &&
        typeof r.score === 'number',
    );
    if (accNow.length > 0 && accPrior.length > 0) {
      metrics.push({
        key: 'judgementRetention',
        label: 'Expectation accuracy (judgement)',
        value: round(mean(accNow), 2),
        unit: '',
        baseline: {
          value: round(mean(accPrior), 2),
          ref: `${accPrior.length} graded submissions in the prior period`,
        },
        source: `Grade.expectationAccuracy (${accNow.length} grades)${revisitsNow.length ? `; ${revisitsNow.length} revisits scored, mean ${round(mean(revisitsNow.map((r) => r.score as number)), 2)}` : ''}`,
      });
    }
    // Practice no longer records an expectation (docs/practice-model.md), so a missing figure here is not
    // news worth a sentence in the readout.

    return {
      scope: { type: scopeType, id: scopeId, name, people: people.length },
      period,
      metrics,
      skipped,
    };
  }

  async readout(
    orgId: string,
    scopeType: Readout['scopeType'],
    scopeId: string | null,
    period: { start: string; end: string },
    actorPersonId: string | null = null,
  ): Promise<Readout> {
    const f = await this.metrics.load(orgId, {
      usageDays: Math.max(
        120,
        Math.round((Date.now() - Date.parse(period.start)) / DAY_MS) + 7,
      ),
    });
    if (scopeType === 'team' && !f.teams.some((t) => t.id === scopeId))
      throw new NotFoundException('Team not found in this org');
    if (scopeType === 'person' && !f.people.some((p) => p.id === scopeId))
      throw new NotFoundException('Person not found in this org');
    const collected = this.collect(f, scopeType, scopeId, period);
    const draft = await this.ai.structured<ReadoutDraft>(
      {
        agent: 'auditor',
        task: 'auditor.readout',
        orgId,
        personId: actorPersonId,
        system: SYSTEM,
        messages: [
          { role: 'user', content: JSON.stringify(collected, null, 2) },
        ],
        model: this.ai.fastModel,
        effort: 'medium',
        mockSeed: {
          scopeName: collected.scope.name,
          period,
          metrics: collected.metrics,
          skipped: collected.skipped,
        },
      },
      ReadoutDraftSchema,
    );
    const footnotes = draft.footnotes.length
      ? draft.footnotes
      : collected.metrics.map((m, i) => ({
          ref: `${i + 1}`,
          source: m.source,
          baseline: m.baseline.ref,
        }));
    const readout = await this.readouts.save(
      this.readouts.create({
        orgId,
        scopeType,
        scopeId,
        title: draft.title,
        periodStart: period.start,
        periodEnd: period.end,
        metrics: collected as unknown as Record<string, unknown>,
        narrative: draft.narrative.join('\n\n'),
        footnotes,
        exportedAt: null,
      }),
    );
    await this.audit.save(
      this.audit.create({
        orgId,
        actorPersonId,
        action: 'readout.generated',
        subjectType: 'readout',
        subjectId: readout.id,
        meta: {
          scopeType,
          scopeId,
          period,
          metrics: collected.metrics.map((m) => m.key),
          skipped: collected.skipped.map((s) => s.key),
        },
      }),
    );
    return readout;
  }
}
