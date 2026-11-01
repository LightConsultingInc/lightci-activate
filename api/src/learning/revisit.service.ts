import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { DAY_MS } from '../common/dates';
import { RevisitGradeSchema } from './ai-schemas';
import {
  COMPETENCY_BY_CODE,
  type CompetencyDefinition,
} from './competency-catalog';
import { Exercise } from './entities/exercise.entity';
import { Grade } from './entities/grade.entity';
import { Revisit } from './entities/revisit.entity';
import type { RevisitSummary } from './learning.types';
import { toRevisitSummary } from './mappers';
import {
  DECAY_REASSESS_THRESHOLD,
  REVISIT_INTERVALS_DAYS,
  REVISIT_PASS_SCORE,
  nextRevisitInterval,
} from './mastery-math';
import { MasteryService } from './mastery.service';
import { MemoryService } from './memory.service';
import { REVISIT_GRADER_SYSTEM } from './prompts';
import './learning.mocks';

export const REVISIT_INTERVALS = REVISIT_INTERVALS_DAYS;

/**
 * Leitner scheduler (docs/mastery-model.md §2, §6): intervals [2, 7, 21, 60, 120] days; a pass
 * (score ≥ 0.80) advances one step, a fail resets to step 0. Each revisit is a fresh retrieval
 * prompt in a varied wording, never a repeat of the original artifact. Also injects a
 * reassessment when a gating competency decays below 0.70.
 */
@Injectable()
export class RevisitService {
  private readonly logger = new Logger(RevisitService.name);

  constructor(
    @InjectRepository(Revisit) private readonly revisits: Repository<Revisit>,
    private readonly ai: AiService,
    private readonly mastery: MasteryService,
    private readonly memory: MemoryService,
  ) {}

  /** Pure scheduling rule, exposed for tests. */
  next(
    currentStep: number,
    score: number,
    from: Date = new Date(),
  ): { step: number; days: number; dueAt: Date } {
    const { step, days } = nextRevisitInterval(currentStep, score);
    return { step, days, dueAt: new Date(from.getTime() + days * DAY_MS) };
  }

  /** After a passing grade, seed a step-0 revisit for each competency the exercise evidenced (if none is pending). */
  async scheduleAfterGrade(
    exercise: Exercise,
    grade: Grade,
    now: Date = new Date(),
  ): Promise<Revisit[]> {
    if (grade.decision !== 'pass') return [];
    const created: Revisit[] = [];
    for (const code of exercise.competencyCodes) {
      const def = COMPETENCY_BY_CODE.get(code);
      if (!def) continue;
      const pending = await this.revisits.findOne({
        where: {
          personId: exercise.personId,
          competencyCode: code,
          doneAt: IsNull(),
        },
      });
      if (pending) continue;
      const step = 0;
      const revisit = this.revisits.create({
        personId: exercise.personId,
        competencyCode: code,
        exerciseId: exercise.id,
        prompt: this.retrievalPrompt(
          def,
          step,
          exercise.contextTag,
          exercise.title,
        ),
        answerKey: this.answerKey(def),
        intervalStep: step,
        dueAt: new Date(now.getTime() + REVISIT_INTERVALS_DAYS[step] * DAY_MS),
      });
      created.push(await this.revisits.save(revisit));
    }
    return created;
  }

  async dueFor(
    personId: string,
    scope: 'today' | 'all' = 'today',
    now: Date = new Date(),
  ): Promise<RevisitSummary[]> {
    const endOfDay = new Date(now);
    endOfDay.setUTCHours(23, 59, 59, 999);
    const rows = await this.revisits.find({
      where:
        scope === 'today'
          ? { personId, doneAt: IsNull(), dueAt: LessThanOrEqual(endOfDay) }
          : { personId, doneAt: IsNull() },
      order: { dueAt: 'ASC' },
    });
    return rows.map((r) => toRevisitSummary(r, now));
  }

  async findForPerson(id: string, personId: string): Promise<Revisit> {
    const revisit = await this.revisits.findOne({ where: { id, personId } });
    if (!revisit) throw new NotFoundException('Revisit not found');
    return revisit;
  }

  /** Grade the learner's answer (task grader.revisit), close this revisit and schedule the next one. */
  async answer(
    revisit: Revisit,
    response: string,
    orgId: string | null,
    now: Date = new Date(),
  ): Promise<{
    score: number;
    feedback: string;
    nextDueAt: string;
    intervalStep: number;
  }> {
    const def = COMPETENCY_BY_CODE.get(revisit.competencyCode);
    const graded = await this.ai.structured(
      {
        agent: 'grader',
        task: 'grader.revisit',
        orgId,
        personId: revisit.personId,
        effort: 'low',
        model: this.ai.fastModel,
        system: REVISIT_GRADER_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              `Competency: ${def?.name ?? revisit.competencyCode} (${revisit.competencyCode})`,
              `Retrieval prompt: ${revisit.prompt}`,
              `Answer key: ${revisit.answerKey ?? '(none)'}`,
              `Learner's answer:\n${response}`,
            ].join('\n\n'),
          },
        ],
        mockSeed: { response, competencyCode: revisit.competencyCode },
      },
      RevisitGradeSchema,
    );
    const score = Math.min(1, Math.max(0, graded.score));
    revisit.doneAt = now;
    revisit.score = score;
    revisit.response = response;
    revisit.feedback = graded.feedback;
    await this.revisits.save(revisit);

    const { step, dueAt } = this.next(revisit.intervalStep, score, now);
    const followUp = await this.revisits.save(
      this.revisits.create({
        personId: revisit.personId,
        competencyCode: revisit.competencyCode,
        exerciseId: revisit.exerciseId,
        prompt: def
          ? this.retrievalPrompt(def, step, null, null)
          : revisit.prompt,
        answerKey: revisit.answerKey,
        intervalStep: step,
        dueAt,
      }),
    );
    try {
      await this.mastery.snapshot(revisit.personId);
      await this.memory.record(revisit.personId, orgId, {
        kind: 'revisit_answered',
        note: `Recall check on ${def?.name ?? revisit.competencyCode}: ${score >= REVISIT_PASS_SCORE ? 'passed' : 'missed'} (${score}). ${graded.feedback.slice(0, 140)}`,
        data: { competencyCode: revisit.competencyCode, score },
      });
    } catch (error) {
      this.logger.warn(
        `Mastery snapshot after revisit failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return {
      score,
      feedback: graded.feedback,
      nextDueAt: followUp.dueAt.toISOString(),
      intervalStep: followUp.intervalStep,
    };
  }

  /** Decay-triggered reassessment: mastery < 0.70 on an unlocked competency with evidence → inject a revisit due now. */
  async injectDecayRevisits(
    personId: string,
    now: Date = new Date(),
  ): Promise<Revisit[]> {
    const { competencies } = await this.mastery.computeCompetencies(
      personId,
      now,
    );
    const injected: Revisit[] = [];
    for (const c of competencies) {
      if (c.status === 'locked' || c.status === 'in_progress') continue; // only mastered-then-decayed (or borderline mastered) competencies
      if (c.mastery >= DECAY_REASSESS_THRESHOLD) continue;
      const def = COMPETENCY_BY_CODE.get(c.code);
      if (!def) continue;
      const pending = await this.revisits.findOne({
        where: { personId, competencyCode: c.code, doneAt: IsNull() },
      });
      if (pending) {
        if (pending.dueAt.getTime() > now.getTime()) {
          pending.dueAt = now;
          injected.push(await this.revisits.save(pending));
        }
        continue;
      }
      injected.push(
        await this.revisits.save(
          this.revisits.create({
            personId,
            competencyCode: c.code,
            exerciseId: null,
            prompt: `Reassessment (your mastery here has faded): ${this.retrievalPrompt(def, 0, null, null)}`,
            answerKey: this.answerKey(def),
            intervalStep: 0,
            dueAt: now,
          }),
        ),
      );
    }
    return injected;
  }

  /** Nightly (job `nightly.revisits`, 03:00), after the mastery snapshot: inject reassessments for everyone with a decayed competency. */
  async nightlyDecayCheck(): Promise<{ injected: number }> {
    const rows = await this.revisits
      .createQueryBuilder('r')
      .select('DISTINCT r.personId', 'personId')
      .getRawMany<{ personId: string }>();
    let injected = 0;
    for (const { personId } of rows) {
      try {
        injected += (await this.injectDecayRevisits(personId)).length;
      } catch (error) {
        this.logger.warn(
          `Decay check failed for ${personId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return { injected };
  }

  // ───────────────────────── prompt templates ─────────────────────────

  /** Distinctly-worded 2–5 minute retrieval prompt; the wording varies by Leitner step so a revisit never repeats. */
  retrievalPrompt(
    def: CompetencyDefinition,
    step: number,
    contextTag: string | null,
    exerciseTitle: string | null,
  ): string {
    const criteria = def.rubric.map((r) => r.label.toLowerCase());
    const focus =
      criteria[step % Math.max(1, criteria.length)] ?? def.name.toLowerCase();
    const context = contextTag
      ? contextTag.replace(/-/g, ' ')
      : 'a task you ran this week';
    const variants = [
      `Without looking back at "${exerciseTitle ?? 'your earlier work'}": in 3–5 sentences, what does ${def.name.toLowerCase()} mean when you apply it to ${context}, and what would you check first?`,
      `A colleague is about to try ${context} with Claude for the first time. Tell them, in your own words, the one rule about ${focus} they must not skip, and why.`,
      `Recall the last time ${focus} went wrong for you (or nearly did). What was the signal, and what did you change? Keep it to 4 sentences.`,
      `Explain ${def.name.toLowerCase()} to someone outside your team in plain language, then give one concrete example from ${context} that shows ${focus}. No client details.`,
      `Two months on: what would a reviewer look for to know that ${focus} is still solid in your ${context}? List three checks.`,
    ];
    return variants[Math.min(step, variants.length - 1)];
  }

  answerKey(def: CompetencyDefinition): string {
    return `${def.name}: ${def.description}\nKey points: ${def.rubric.map((r) => `${r.label} — ${r.description}`).join(' | ')}`;
  }

  /** Pass rule shared with tests. */
  static passes(score: number): boolean {
    return score >= REVISIT_PASS_SCORE;
  }
}
