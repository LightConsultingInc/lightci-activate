import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { daysBetween, isoDay } from '../common/dates';
import type { Rung } from '../common/roles';
import { Person } from '../orgs/entities/person.entity';
import {
  COMPETENCY_CATALOG,
  RUNG_GATES,
  type CompetencyDefinition,
} from './competency-catalog';
import { CoachNote } from './entities/coach-note.entity';
import { Exercise } from './entities/exercise.entity';
import { Grade } from './entities/grade.entity';
import { MasterySnapshot } from './entities/mastery-snapshot.entity';
import { Placement } from './entities/placement.entity';
import { Revisit } from './entities/revisit.entity';
import { Submission } from './entities/submission.entity';
import type {
  CompetencyView,
  JudgementView,
  MasteryReport,
  ProgressView,
} from './learning.types';
import { gradeOfRecord } from './mappers';
import {
  DECAY_REASSESS_THRESHOLD,
  REVISIT_PASS_SCORE,
  brier,
  computeMastery,
  judgementScore,
  meanBrier,
  meetsGate,
  type Prediction,
  type ScoredArtifact,
} from './mastery-math';

/** One graded submission joined to its exercise: the unit of evidence for every competency it touches. */
export interface GradedArtifact {
  exercise: Exercise;
  submission: Submission;
  grade: Grade;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Computes LadderView.competencies, the (legacy, non-gating) judgement summary and the promotion gate
 * for a person from Grades, Submissions, Revisits and Exercises, following docs/mastery-model.md §6.
 * Pure arithmetic lives in mastery-math.ts; this service does the joins and the persistence.
 */
@Injectable()
export class MasteryService {
  private readonly logger = new Logger(MasteryService.name);

  constructor(
    @InjectRepository(Exercise)
    private readonly exercises: Repository<Exercise>,
    @InjectRepository(Submission)
    private readonly submissions: Repository<Submission>,
    @InjectRepository(Grade) private readonly grades: Repository<Grade>,
    @InjectRepository(Revisit) private readonly revisits: Repository<Revisit>,
    @InjectRepository(Placement)
    private readonly placements: Repository<Placement>,
    @InjectRepository(MasterySnapshot)
    private readonly snapshots: Repository<MasterySnapshot>,
    @InjectRepository(CoachNote) private readonly notes: Repository<CoachNote>,
    @InjectRepository(Person) private readonly people: Repository<Person>,
  ) {}

  // ───────────────────────── evidence loading ─────────────────────────

  async currentRung(personId: string): Promise<number> {
    const placement = await this.placements.findOne({
      where: { personId },
      order: { placedAt: 'DESC' },
    });
    return placement?.rung ?? 0;
  }

  /** Every graded submission for the person, with its exercise and the grade of record. */
  async gradedArtifacts(personId: string): Promise<GradedArtifact[]> {
    const grades = await this.grades.find({
      where: { personId, submissionId: Not(IsNull()) },
      order: { gradedAt: 'ASC' },
    });
    if (grades.length === 0) return [];
    const bySubmission = new Map<string, Grade[]>();
    for (const g of grades) {
      const list = bySubmission.get(g.submissionId as string) ?? [];
      list.push(g);
      bySubmission.set(g.submissionId as string, list);
    }
    const submissions = await this.submissions.find({
      where: { id: In([...bySubmission.keys()]) },
    });
    const exerciseIds = [...new Set(submissions.map((s) => s.exerciseId))];
    const exercises = await this.exercises.find({
      where: { id: In(exerciseIds) },
    });
    const exerciseById = new Map(exercises.map((e) => [e.id, e]));
    const out: GradedArtifact[] = [];
    for (const submission of submissions) {
      const exercise = exerciseById.get(submission.exerciseId);
      const grade = gradeOfRecord(bySubmission.get(submission.id) ?? []);
      if (exercise && grade) out.push({ exercise, submission, grade });
    }
    return out.sort(
      (a, b) => +new Date(a.grade.gradedAt) - +new Date(b.grade.gradedAt),
    );
  }

  // ───────────────────────── per-competency computation ─────────────────────────

  /**
   * Compute every competency for a person as of `asOf`. Uses the canonical catalog for
   * definitions; DB Competency rows are the same data seeded for reporting.
   */
  async computeCompetencies(
    personId: string,
    asOf: Date = new Date(),
  ): Promise<{
    competencies: CompetencyView[];
    judgement: JudgementView;
    rung: number;
  }> {
    const [rung, artifacts, doneRevisits, previousPeaks] = await Promise.all([
      this.currentRung(personId),
      this.gradedArtifacts(personId),
      this.revisits.find({
        where: { personId, doneAt: Not(IsNull()) },
        order: { doneAt: 'ASC' },
      }),
      this.peakSnapshots(personId),
    ]);
    const competencies = COMPETENCY_CATALOG.map((def) =>
      this.computeOne(
        def,
        rung,
        artifacts,
        doneRevisits,
        previousPeaks.get(def.code) ?? 0,
        asOf,
      ),
    );
    const judgement = this.judgementSummary(artifacts);
    return { competencies, judgement, rung };
  }

  /** Pure-ish: derive one CompetencyView from already-loaded evidence (exposed for tests and seeds). */
  computeOne(
    def: CompetencyDefinition,
    rung: number,
    artifacts: GradedArtifact[],
    doneRevisits: Revisit[],
    previousPeak: number,
    asOf: Date,
  ): CompetencyView {
    const mine = artifacts.filter(
      (a) =>
        a.exercise.competencyCodes.includes(def.code) &&
        new Date(a.grade.gradedAt) <= asOf,
    );
    const scored: ScoredArtifact[] = mine.map((a) => ({
      score: a.grade.score,
      daysAgo: daysBetween(new Date(a.grade.gradedAt), asOf),
      context: a.exercise.contextTag ?? `exercise:${a.exercise.id}`,
    }));
    const predictions: Prediction[] = mine.map((a) => ({
      confidence: clamp01(a.submission.expectationConfidence),
      outcome: a.grade.decision === 'pass' ? 1 : 0,
    }));
    const critiques = mine
      .map((a) => a.grade.critiqueQuality)
      .filter((c): c is number => typeof c === 'number');
    const critiqueQuality = critiques.length
      ? critiques.reduce((s, c) => s + c, 0) / critiques.length
      : mine.length
        ? 0.5
        : 0;
    const lastPass = [...doneRevisits]
      .filter(
        (r) =>
          r.competencyCode === def.code &&
          (r.score ?? 0) >= REVISIT_PASS_SCORE &&
          r.doneAt &&
          new Date(r.doneAt) <= asOf,
      )
      .pop();
    const { mastery, components } = computeMastery({
      artifacts: scored,
      lastRevisit: lastPass?.doneAt
        ? {
            score: lastPass.score ?? 0,
            daysAgo: daysBetween(new Date(lastPass.doneAt), asOf),
          }
        : null,
      predictions,
      critiqueQuality,
      requiredContexts: def.minContexts,
    });
    const status = this.statusFor(
      def,
      rung,
      mastery,
      components.contexts,
      scored.length,
      previousPeak,
    );
    return {
      code: def.code,
      name: def.name,
      rung: def.rung,
      mastery,
      components,
      threshold: def.masteryThreshold,
      minContexts: def.minContexts,
      status,
    };
  }

  private statusFor(
    def: CompetencyDefinition,
    rung: number,
    mastery: number,
    contexts: number,
    evidenceCount: number,
    previousPeak: number,
  ): CompetencyView['status'] {
    if (def.rung > rung) return 'locked';
    if (mastery >= def.masteryThreshold && contexts >= def.minContexts)
      return 'mastered';
    if (
      evidenceCount > 0 &&
      previousPeak >= def.masteryThreshold &&
      mastery < DECAY_REASSESS_THRESHOLD
    )
      return 'decayed';
    return 'in_progress';
  }

  /** Highest snapshot mastery ever recorded per competency (used for the decay flag). */
  private async peakSnapshots(personId: string): Promise<Map<string, number>> {
    const rows = await this.snapshots
      .createQueryBuilder('s')
      .select('s.competencyCode', 'code')
      .addSelect('MAX(s.mastery)', 'peak')
      .where('s.personId = :personId', { personId })
      .groupBy('s.competencyCode')
      .getRawMany<{ code: string; peak: string | number }>();
    return new Map(rows.map((r) => [r.code, Number(r.peak)]));
  }

  // ───────────────────────── judgement ─────────────────────────

  judgementSummary(artifacts: GradedArtifact[]): JudgementView {
    if (artifacts.length === 0)
      return {
        score: 0,
        calibration: 0,
        critiqueQuality: 0,
        trend: 'flat',
        overconfidentRate: 0,
      };
    const predictions = artifacts.map((a) => ({
      confidence: clamp01(a.submission.expectationConfidence),
      outcome: a.grade.decision === 'pass' ? 1 : 0,
    }));
    const critiques = artifacts
      .map((a) => a.grade.critiqueQuality)
      .filter((c): c is number => typeof c === 'number');
    const critiqueQuality = critiques.length
      ? critiques.reduce((s, c) => s + c, 0) / critiques.length
      : 0.5;
    const calibration = clamp01(1 - meanBrier(predictions));
    const score = judgementScore(predictions, critiqueQuality);
    const overconfident = predictions.filter(
      (p) => p.confidence - p.outcome > 0.25,
    ).length;
    const perArtifact = artifacts.map((a, i) =>
      judgementScore(
        [predictions[i]],
        a.grade.critiqueQuality ?? critiqueQuality,
      ),
    );
    const recent = perArtifact.slice(-4);
    const earlier = perArtifact.slice(-8, -4);
    let trend: JudgementView['trend'] = 'flat';
    if (earlier.length >= 2 && recent.length >= 2) {
      const delta = mean(recent) - mean(earlier);
      trend = delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat';
    }
    return {
      score: round3(score),
      calibration: round3(calibration),
      critiqueQuality: round3(critiqueQuality),
      trend,
      overconfidentRate: round3(overconfident / predictions.length),
    };
  }

  /** 1 − asymmetric Brier for a single prediction (used by the Grader to fill expectationAccuracy). */
  expectationAccuracy(confidence: number, passed: boolean): number {
    return round3(
      clamp01(
        1 - brier({ confidence: clamp01(confidence), outcome: passed ? 1 : 0 }),
      ),
    );
  }

  // ───────────────────────── gates & promotion ─────────────────────────

  async report(
    personId: string,
    asOf: Date = new Date(),
  ): Promise<MasteryReport> {
    const { competencies, judgement, rung } = await this.computeCompetencies(
      personId,
      asOf,
    );
    const completedL0 =
      rung === 0 ? await this.hasCompletedRealWork(personId) : true;
    const progress = this.gateCheck(rung, competencies, judgement, completedL0);
    const eligible = rung < 5 && Object.values(progress.met).every(Boolean);
    return {
      rung,
      nextRung: rung >= 5 ? null : rung + 1,
      competencies,
      judgement,
      progress,
      eligible,
    };
  }

  /** The gate to leave `rung` (RUNG_GATES[rung]) evaluated on that rung's competencies. */
  gateCheck(
    rung: number,
    competencies: CompetencyView[],
    judgement: JudgementView,
    completedL0 = true,
  ): ProgressView {
    const gate = RUNG_GATES[Math.min(5, Math.max(0, rung)) as Rung];
    const gateComps =
      rung >= 5 ? competencies : competencies.filter((c) => c.rung === rung);
    const view = {
      masteryThreshold: gate.masteryThreshold,
      minContexts: gate.minContexts,
      minJudgement: gate.minJudgement,
    };
    if (rung === 0) {
      return {
        toNextRung: completedL0
          ? 1
          : gateComps.length
            ? round3(
                mean(
                  gateComps.map((c) =>
                    Math.min(1, c.mastery / Math.max(0.01, c.threshold)),
                  ),
                ),
              )
            : 0,
        gate: view,
        met: {
          mastery: completedL0,
          contexts: completedL0,
          judgement: true,
          retention: true,
        },
      };
    }
    const masteryMet =
      gateComps.length > 0 &&
      gateComps.every((c) => c.mastery >= gate.masteryThreshold);
    const contextsMet =
      gateComps.length > 0 &&
      gateComps.every((c) => c.components.contexts >= gate.minContexts);
    // Judgement is retired (practice v2, 2026-09-06): reported for display, never gating.
    void judgement;
    const judgementMet = true;
    const retained = competencies.filter((c) =>
      gate.retainedRungs.includes(c.rung as Rung),
    );
    const retentionMet = retained.every(
      (c) => c.status !== 'decayed' && c.mastery >= DECAY_REASSESS_THRESHOLD,
    );
    const perComp = gateComps.map((c) => {
      const m = Math.min(1, c.mastery / gate.masteryThreshold);
      const k = Math.min(1, c.components.contexts / gate.minContexts);
      return 0.7 * m + 0.3 * k;
    });
    const toNextRung = gateComps.length
      ? round3(Math.min(1, mean(perComp)))
      : 0;
    return {
      toNextRung,
      gate: view,
      met: {
        mastery: masteryMet,
        contexts: contextsMet,
        judgement: judgementMet,
        retention: retentionMet,
      },
    };
  }

  /** Whether a competency view clears its own rung gate (mastery and contexts; judgement retired). */
  competencyMeetsGate(c: CompetencyView, _judgement?: number): boolean {
    const gate = RUNG_GATES[c.rung as Rung];
    return meetsGate(
      { mastery: c.mastery, contexts: c.components.contexts },
      gate,
    );
  }

  private async hasCompletedRealWork(personId: string): Promise<boolean> {
    const passed = await this.exercises.count({
      where: { personId, status: 'passed' },
    });
    return passed > 0;
  }

  /** Promote when every gate condition holds. Returns the new rung, or null. */
  async promoteIfEligible(
    personId: string,
  ): Promise<{ newRung: number; report: MasteryReport } | null> {
    const report = await this.report(personId);
    if (!report.eligible || report.nextRung === null) return null;
    const newRung = report.nextRung;
    await this.placements.save(
      this.placements.create({
        personId,
        rung: newRung,
        by: 'promotion',
        evidence: {
          fromRung: report.rung,
          gate: report.progress.gate,
          met: report.progress.met,
          judgement: report.judgement,
          competencies: report.competencies
            .filter((c) => c.rung === report.rung)
            .map((c) => ({
              code: c.code,
              mastery: c.mastery,
              contexts: c.components.contexts,
            })),
        },
      }),
    );
    await this.notes.save(
      this.notes.create({
        personId,
        note: `Promoted to L${newRung}: every L${report.rung} competency cleared the gate (mastery ≥ ${report.progress.gate.masteryThreshold}, ≥ ${report.progress.gate.minContexts} contexts).`,
        tags: ['progress'],
        author: 'coach',
      }),
    );
    this.logger.log(`Person ${personId} promoted to L${newRung}`);
    return {
      newRung,
      report: {
        ...report,
        rung: newRung,
        nextRung: newRung >= 5 ? null : newRung + 1,
      },
    };
  }

  // ───────────────────────── snapshots ─────────────────────────

  /** Upsert today's MasterySnapshot rows for one person; returns the computed views. */
  async snapshot(
    personId: string,
    day: string = isoDay(),
  ): Promise<CompetencyView[]> {
    const { competencies } = await this.computeCompetencies(
      personId,
      new Date(`${day}T23:59:59.000Z`),
    );
    const rows = competencies.map((c) => ({
      personId,
      competencyCode: c.code,
      day,
      mastery: c.mastery,
      components: c.components,
    }));
    if (rows.length)
      await this.snapshots.upsert(rows, ['personId', 'competencyCode', 'day']);
    return competencies;
  }

  async snapshots30d(
    personId: string,
  ): Promise<{ day: string; competencyCode: string; mastery: number }[]> {
    const rows = await this.snapshots
      .createQueryBuilder('s')
      .where('s.personId = :personId', { personId })
      .andWhere(`s.day >= (CURRENT_DATE - INTERVAL '30 days')`)
      .orderBy('s.day', 'ASC')
      .getMany();
    return rows.map((r) => ({
      day: String(r.day),
      competencyCode: r.competencyCode,
      mastery: r.mastery,
    }));
  }

  /** Nightly: recompute and store mastery for everyone with learning activity. */
  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'mastery-nightly-snapshot' })
  async nightlySnapshots(): Promise<{ people: number }> {
    const rows = await this.exercises
      .createQueryBuilder('e')
      .select('DISTINCT e.personId', 'personId')
      .getRawMany<{ personId: string }>();
    let people = 0;
    for (const { personId } of rows) {
      try {
        await this.snapshot(personId);
        people += 1;
      } catch (error) {
        this.logger.warn(
          `Snapshot failed for ${personId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    this.logger.log(`Nightly mastery snapshots written for ${people} people`);
    return { people };
  }

  async personInOrg(personId: string, orgId: string): Promise<Person | null> {
    const person = await this.people.findOne({ where: { id: personId } });
    return person && person.orgId === orgId ? person : null;
  }
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0;
}
