import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import type { ComplianceBoundary } from '../orgs/entities/org.entity';
import { Org } from '../orgs/entities/org.entity';
import { Person } from '../orgs/entities/person.entity';
import type {
  BoundaryDeclaration,
  SampleCase,
} from '../skills/entities/skill.entity';
import { SkillGradeSchema, SubmissionGradeSchema } from './ai-schemas';
import { COMPETENCY_BY_CODE, GRADER_RUBRIC_SKILL } from './competency-catalog';
import { CoachNote } from './entities/coach-note.entity';
import type { RubricCriterion } from './entities/competency.entity';
import { Exercise } from './entities/exercise.entity';
import { Grade, type RubricScore } from './entities/grade.entity';
import {
  encodeFeedback,
  gradeOfRecord,
  practiceOf,
  score10Of,
} from './mappers';
import type { PracticeFeedback } from './learning.types';
import { Submission } from './entities/submission.entity';
import { MasteryService } from './mastery.service';
import {
  GRADER_FIRST_TASK_SYSTEM,
  GRADER_SKILL_SYSTEM,
  GRADER_SYSTEM,
  boundaryText,
  dataStanceText,
} from './prompts';
import './learning.mocks';

export const GRADER_VERSION = 'grader-v2';
export const SKILL_PASS_THRESHOLD = 0.85;
export const FIRST_TASK_PASS_THRESHOLD = 0.7;

/** Rung 0: one real task. Pass when it is finished and usable and uses only what the learner supplied. */
export const FIRST_TASK_RUBRIC: readonly RubricCriterion[] = [
  {
    key: 'finished',
    label: 'Finished and usable',
    description:
      "A complete piece of the learner's real work they could use as it is (or with a light edit), not a fragment or a plan.",
    weight: 0.6,
  },
  {
    key: 'own_facts',
    label: 'Only uses facts the learner gave it',
    description:
      'No invented names, figures or details; placeholders where something was missing.',
    weight: 0.4,
  },
];

export interface SecurityFinding {
  severity: 'low' | 'medium' | 'high';
  finding: string;
}

/** A Grade-shaped object not yet persisted (the skills module saves it with its skillVersionId). */
export type GradeDraft = Omit<Grade, 'id' | 'gradedAt'>;

interface WeightedCriterion extends RubricCriterion {
  criterion: string;
  competencyCode: string | null;
}

/**
 * Grader role: rubric-based assessment of submissions and skills, honest pass/revise decisions, the
 * three learner-facing lines (what worked, what to change, one thing to try) and a security review of
 * skill text. Every Claude call goes through AiService (task grader.submission / grader.skill).
 * The three lines are persisted in grade.feedback (encodeFeedback) with tryNext also in teachingMoment.
 */
@Injectable()
export class GraderService {
  private readonly logger = new Logger(GraderService.name);

  constructor(
    @InjectRepository(Grade) private readonly grades: Repository<Grade>,
    @InjectRepository(Submission)
    private readonly submissions: Repository<Submission>,
    @InjectRepository(Exercise)
    private readonly exercises: Repository<Exercise>,
    @InjectRepository(CoachNote) private readonly notes: Repository<CoachNote>,
    @InjectRepository(Org) private readonly orgs: Repository<Org>,
    private readonly ai: AiService,
    private readonly mastery: MasteryService,
  ) {}

  // ───────────────────────── rubric assembly ─────────────────────────

  /** Union of the exercise's competency rubrics (+ the skill rubric for skill artifacts), weights normalised to 1. */
  rubricFor(
    exercise: Pick<Exercise, 'competencyCodes'> & { rung?: number },
    artifactType: string,
  ): WeightedCriterion[] {
    if (exercise.rung === 0)
      return FIRST_TASK_RUBRIC.map((r) => ({
        ...r,
        criterion: `first.${r.key}`,
        competencyCode: 'L0.surfaces',
      }));
    const out: WeightedCriterion[] = [];
    for (const code of exercise.competencyCodes) {
      const def = COMPETENCY_BY_CODE.get(code);
      if (!def) continue;
      for (const r of def.rubric)
        out.push({ ...r, criterion: `${code}.${r.key}`, competencyCode: code });
    }
    if (artifactType === 'skill') {
      for (const r of GRADER_RUBRIC_SKILL)
        if (!out.some((o) => o.criterion === `skill.${r.key}`))
          out.push({ ...r, criterion: `skill.${r.key}`, competencyCode: null });
    }
    if (out.length === 0)
      out.push({
        key: 'quality',
        label: 'Quality of the artifact',
        description:
          'Does the artifact do the job the brief asked for, to a standard a colleague would accept?',
        weight: 1,
        criterion: 'general.quality',
        competencyCode: null,
      });
    const total = out.reduce((s, c) => s + c.weight, 0) || 1;
    return out.map((c) => ({ ...c, weight: c.weight / total }));
  }

  /** Pass threshold for an exercise: the strictest of its competencies (skill artifacts at least 0.85). */
  thresholdFor(
    exercise: Pick<Exercise, 'competencyCodes'> & { rung?: number },
    artifactType: string,
  ): number {
    if (exercise.rung === 0) return FIRST_TASK_PASS_THRESHOLD;
    const thresholds = exercise.competencyCodes.map(
      (c) => COMPETENCY_BY_CODE.get(c)?.masteryThreshold ?? 0.8,
    );
    const base = thresholds.length ? Math.max(...thresholds) : 0.8;
    return artifactType === 'skill'
      ? Math.max(base, SKILL_PASS_THRESHOLD)
      : base;
  }

  weightedScore(
    rubric: WeightedCriterion[],
    scores: { criterion: string; score: number }[],
  ): number {
    const byKey = new Map(scores.map((s) => [s.criterion, clamp01(s.score)]));
    let total = 0;
    for (const c of rubric) total += c.weight * (byKey.get(c.criterion) ?? 0);
    return Math.round(clamp01(total) * 1000) / 1000;
  }

  // ───────────────────────── submissions ─────────────────────────

  async gradeSubmission(
    exercise: Exercise,
    submission: Submission,
    person: Person,
    orgId: string | null,
  ): Promise<Grade & { toolsNamed?: string[] }> {
    const artifactType = submission.artifact?.type ?? 'text';
    const practice = practiceOf(exercise);
    const rubric = this.rubricFor(exercise, artifactType);
    const threshold = this.thresholdFor(exercise, artifactType);
    const boundary = await this.orgBoundary(orgId);
    const artifactText = this.artifactText(submission);

    const out = await this.ai.structured(
      {
        agent: 'grader',
        task: 'grader.submission',
        orgId,
        personId: person.id,
        effort: 'medium',
        system: exercise.rung === 0 ? GRADER_FIRST_TASK_SYSTEM : GRADER_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              `# Practice (${practice.kind}; the learner's workflow: ${practice.workflowName})`,
              `Title: ${exercise.title}`,
              `The ask: ${practice.ask}`,
              `Competencies (internal): ${exercise.competencyCodes.map((c) => `${c} (${COMPETENCY_BY_CODE.get(c)?.name ?? c})`).join(', ')}`,
              `Pass threshold (weighted score): ${threshold}`,
              `Attempt: ${submission.attempt}`,
              '',
              '# Rubric (score each criterion 0..1; use the keys exactly)',
              ...rubric.map(
                (c) =>
                  `- ${c.criterion} | ${c.label} (weight ${c.weight.toFixed(2)}): ${c.description}`,
              ),
              '',
              '# Firm compliance boundary',
              boundaryText(boundary),
              dataStanceText(boundary),
              '',
              "# The learner's work (what they typed, then what Claude produced on Run)",
              artifactText,
            ].join('\n'),
          },
        ],
        mockSeed: {
          criteria: rubric.map((c) => ({
            criterion: c.criterion,
            label: c.label,
          })),
          artifactText,
          kind: practice.kind,
          workflowName: practice.workflowName,
          isSkill: artifactType === 'skill',
          firstTask: exercise.rung === 0,
        },
      },
      SubmissionGradeSchema,
    );

    const rubricScores: RubricScore[] = rubric.map((c) => {
      const s = out.rubric.find((r) => r.criterion === c.criterion);
      return {
        criterion: c.criterion,
        label: c.label,
        score: clamp01(s?.score ?? 0),
        note: s?.note ?? 'Not addressed by the grader.',
      };
    });
    const score = this.weightedScore(rubric, rubricScores);
    const decision: Grade['decision'] = score >= threshold ? 'pass' : 'revise';
    const securityFindings =
      artifactType === 'skill'
        ? mergeFindings(
            out.securityFindings,
            this.securityScan(
              artifactText,
              boundary,
              submission.artifact.boundary,
            ),
          )
        : [];
    const feedback: PracticeFeedback = {
      worked:
        oneLine(out.worked) || 'You made a real attempt on your own work.',
      change:
        oneLine(out.change) ||
        `Look again at ${(rubricScores.sort((a, b) => a.score - b.score)[0]?.label ?? 'the weakest part').toLowerCase()}.`,
      tryNext:
        oneLine(out.tryNext) ||
        'Next run, say who reads this and what they will do with it.',
    };

    const grade = this.grades.create({
      submissionId: submission.id,
      skillVersionId: null,
      personId: person.id,
      rubric: rubricScores,
      score,
      feedback: encodeFeedback(feedback),
      decision,
      critiqueQuality: null,
      expectationAccuracy: null,
      securityFindings,
      teachingMoment: feedback.tryNext,
      graderVersion: GRADER_VERSION,
      model: this.ai.provider === 'mock' ? 'mock' : this.ai.defaultModel,
      gradedByPersonId: null,
    });
    // Not persisted on the grade: the controller folds these into the person's memory (their tools → connectors).
    const toolsNamed = [
      ...new Set(
        (out.toolsNamed ?? [])
          .map((t) => t.trim())
          .filter((t) => t.length > 1 && t.length <= 40),
      ),
    ].slice(0, 8);
    return Object.assign(await this.grades.save(grade), { toolsNamed });
  }

  // ───────────────────────── review practice (L5) ─────────────────────────

  /**
   * Grade a review-kind submission: the learner scored a teammate's work out of 10 and wrote notes.
   * Evidence is agreement with the Grader's score on that work (graded now if it was still pending).
   * Deterministic; no Claude call. Returns the saved grade and the agreement the response exposes.
   */
  async gradeReview(
    exercise: Exercise,
    submission: Submission,
    person: Person,
    orgId: string | null,
  ): Promise<{
    grade: Grade;
    agreement: { learner: number; grader: number; note: string };
  }> {
    const practice = practiceOf(exercise);
    const targetId =
      practice.kind === 'review' ? practice.prefill.submissionId : '';
    const target = targetId
      ? await this.submissions.findOne({ where: { id: targetId } })
      : null;
    if (!target)
      throw new ConflictException(
        'The work to review is no longer available; skip this one and Coach will queue another.',
      );
    let graderGrade = gradeOfRecord(
      await this.grades.find({ where: { submissionId: target.id } }),
    );
    if (!graderGrade) {
      const targetExercise = await this.exercises.findOne({
        where: { id: target.exerciseId },
      });
      const author = targetExercise
        ? ({ id: target.personId } as Person)
        : null;
      if (!targetExercise || !author)
        throw new ConflictException(
          'The work to review has no grade yet and its exercise is missing.',
        );
      graderGrade = await this.gradeSubmission(
        targetExercise,
        target,
        author,
        orgId,
      );
    }
    const learner10 =
      Math.round(
        Math.min(10, Math.max(0, Number(submission.artifact.score10 ?? 0))) *
          10,
      ) / 10;
    const grader10 = score10Of(graderGrade.score);
    const delta = Math.abs(learner10 - grader10);
    const agreementScore = clamp01(1 - delta / 10);
    const decisionMatch = learner10 >= 7 === (graderGrade.decision === 'pass');
    const notes = (
      submission.artifact.notes ??
      submission.artifact.content ??
      ''
    ).trim();
    const notesQuality = clamp01(
      0.4 +
        (notes.length > 80 ? 0.3 : notes.length > 30 ? 0.15 : 0) +
        (/\b(change|instead|try|because|missing|add|cut|remove)\b/i.test(notes)
          ? 0.3
          : 0),
    );
    const rubric = this.rubricFor(exercise, 'review');
    const rubricScores: RubricScore[] = rubric.map((c) => {
      const key = c.criterion.split('.').pop();
      let score = agreementScore;
      let note = `You gave ${learner10}/10; the Grader gave ${grader10}/10.`;
      if (key === 'decision') {
        score = decisionMatch ? 1 : 0.3;
        note = decisionMatch
          ? 'Your pass / try-again call matched the Grader.'
          : 'Your pass / try-again call differed from the Grader.';
      } else if (
        c.competencyCode === 'L5.feedback' ||
        key === 'specific' ||
        key === 'smallest' ||
        key === 'principle'
      ) {
        score = notesQuality;
        note =
          notes.length > 80
            ? 'Your notes name specific things to change.'
            : 'Your notes are short; name the one change that would fix the weakest part.';
      } else if (key === 'consistency') {
        score = clamp01((agreementScore + (decisionMatch ? 1 : 0.5)) / 2);
        note = 'Consistency is judged across your reviews over time.';
      }
      return {
        criterion: c.criterion,
        label: c.label,
        score: clamp01(score),
        note,
      };
    });
    const score = this.weightedScore(rubric, rubricScores);
    const threshold = this.thresholdFor(exercise, 'review');
    const decision: Grade['decision'] = score >= threshold ? 'pass' : 'revise';
    const agreementNote =
      delta <= 1
        ? `Close: you and the Grader landed within a point (${learner10} vs ${grader10}).`
        : learner10 > grader10
          ? `You were ${delta.toFixed(1)} points kinder than the Grader (${learner10} vs ${grader10}).`
          : `You were ${delta.toFixed(1)} points harsher than the Grader (${learner10} vs ${grader10}).`;
    const feedback: PracticeFeedback = {
      worked:
        delta <= 1
          ? "Your score landed close to the Grader's."
          : notes.length > 80
            ? 'Your notes point at specific things the author can change.'
            : 'You read the work and made a call.',
      change:
        delta <= 1
          ? notes.length > 80
            ? 'Nothing major; keep tying each note to one part of the work.'
            : 'Write notes the author can act on: name the part and the smallest change.'
          : `Re-read the rubric notes before scoring: ${agreementNote}`,
      tryNext:
        "Next review, write down your score before you read anyone else's, then compare.",
    };
    const grade = await this.grades.save(
      this.grades.create({
        submissionId: submission.id,
        skillVersionId: null,
        personId: person.id,
        rubric: rubricScores,
        score,
        feedback: encodeFeedback(feedback),
        decision,
        critiqueQuality: null,
        expectationAccuracy: null,
        securityFindings: [],
        teachingMoment: feedback.tryNext,
        graderVersion: GRADER_VERSION,
        model: null,
        gradedByPersonId: null,
      }),
    );
    return {
      grade,
      agreement: { learner: learner10, grader: grader10, note: agreementNote },
    };
  }

  // ───────────────────────── skills ─────────────────────────

  /**
   * Grade a skill's text against GRADER_RUBRIC_SKILL plus a security review. Returns a Grade-shaped
   * object WITHOUT saving; the skills module persists it with skillVersionId.
   */
  async gradeSkillText(
    orgId: string | null,
    personId: string,
    skillMd: string,
    sampleCases: SampleCase[],
    boundary: Partial<BoundaryDeclaration> | null | undefined,
    orgBoundary: ComplianceBoundary | null | undefined,
  ): Promise<GradeDraft> {
    const rubric: WeightedCriterion[] = GRADER_RUBRIC_SKILL.map((r) => ({
      ...r,
      criterion: `skill.${r.key}`,
      competencyCode: null,
    }));
    const out = await this.ai.structured(
      {
        agent: 'grader',
        task: 'grader.skill',
        orgId,
        personId,
        effort: 'medium',
        system: GRADER_SKILL_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              '# Rubric (score each criterion 0..1; use the keys exactly)',
              ...rubric.map(
                (c) =>
                  `- ${c.criterion} | ${c.label} (weight ${c.weight.toFixed(2)}): ${c.description}`,
              ),
              `Pass threshold: ${SKILL_PASS_THRESHOLD}`,
              '',
              '# Firm compliance boundary',
              boundaryText(orgBoundary),
              dataStanceText(orgBoundary),
              '',
              '# Skill boundary declaration',
              JSON.stringify(boundary ?? {}, null, 2),
              '',
              '# Sample cases',
              sampleCases.length
                ? sampleCases
                    .map(
                      (c, i) =>
                        `${i + 1}. input: ${c.input}\n   shouldTrigger: ${c.shouldTrigger}\n   expected: ${c.expected}`,
                    )
                    .join('\n')
                : '(none supplied)',
              '',
              '# SKILL.md',
              skillMd,
            ].join('\n'),
          },
        ],
        mockSeed: {
          criteria: rubric.map((c) => ({
            criterion: c.criterion,
            label: c.label,
          })),
          skillMd,
          sampleCases,
        },
      },
      SkillGradeSchema,
    );
    const rubricScores: RubricScore[] = rubric.map((c) => {
      const s = out.rubric.find((r) => r.criterion === c.criterion);
      return {
        criterion: c.criterion,
        label: c.label,
        score: clamp01(s?.score ?? 0),
        note: s?.note ?? 'Not addressed by the grader.',
      };
    });
    const score = this.weightedScore(rubric, rubricScores);
    const securityFindings = mergeFindings(
      out.securityFindings,
      this.securityScan(skillMd, orgBoundary, boundary),
    );
    const blocked = securityFindings.some((f) => f.severity === 'high');
    const verdicts = out.sampleCaseVerdicts.length
      ? `\n\nSample cases: ${out.sampleCaseVerdicts.filter((v) => v.behavesAsExpected).length}/${out.sampleCaseVerdicts.length} behave as expected.`
      : '';
    return {
      submissionId: null,
      skillVersionId: null,
      personId,
      rubric: rubricScores,
      score,
      feedback:
        out.feedback +
        verdicts +
        (blocked
          ? '\n\nSecurity review found a high-severity issue; the skill cannot pass until it is removed.'
          : ''),
      decision: score >= SKILL_PASS_THRESHOLD && !blocked ? 'pass' : 'revise',
      critiqueQuality: null,
      expectationAccuracy: null,
      securityFindings,
      teachingMoment: out.teachingMoment,
      graderVersion: GRADER_VERSION,
      model: this.ai.provider === 'mock' ? 'mock' : this.ai.defaultModel,
      gradedByPersonId: null,
    };
  }

  /**
   * Deterministic security scan of skill text (runs alongside Claude's review, so mock mode still
   * catches the obvious): prompt-injection phrases, hidden instructions, exfiltration, restricted classes.
   */
  securityScan(
    text: string,
    orgBoundary: ComplianceBoundary | null | undefined,
    declared: Partial<BoundaryDeclaration> | null | undefined,
  ): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const t = text ?? '';
    const injection = [
      /ignore (all |any )?(previous|prior|above) (instructions|rules)/i,
      /disregard (the |your )?(system|previous)/i,
      /you are now (a|an|in) /i,
      /do not (tell|reveal|mention) (the )?user/i,
      /jailbreak|DAN mode/i,
    ];
    if (injection.some((re) => re.test(t)))
      findings.push({
        severity: 'high',
        finding:
          'Prompt-injection pattern: instructions that override prior or system rules.',
      });
    if (/<!--[\s\S]*?-->/.test(t))
      findings.push({
        severity: 'medium',
        finding:
          'Hidden HTML comment in skill text; Claude reads comments as instructions while reviewers may not.',
      });
    if (/[\u200B-\u200F\u2060\uFEFF]/.test(t))
      findings.push({
        severity: 'high',
        finding:
          'Zero-width or invisible characters present (hidden instruction vector).',
      });
    if (/[A-Za-z0-9+/]{120,}={0,2}/.test(t))
      findings.push({
        severity: 'medium',
        finding: 'Long base64-like blob; opaque payloads are not reviewable.',
      });
    if (
      /(curl|wget|fetch\(|POST\s+https?:|webhook|https?:\/\/hooks\.|send (it|this|the (file|data|output)) to|email (it|this|the (file|data|output)) to|mailto:)/i.test(
        t,
      )
    )
      findings.push({
        severity: 'high',
        finding:
          'Possible data exfiltration: instructions to send content to an external endpoint or address.',
      });
    if (/(api[_-]?key|secret|password|token)\s*[:=]\s*\S{8,}/i.test(t))
      findings.push({
        severity: 'high',
        finding: 'Embedded credential-like string.',
      });
    const forbidden = orgBoundary?.forbiddenDataClasses ?? [];
    for (const cls of forbidden) {
      const re = new RegExp(escapeRegExp(cls), 'i');
      if (declared?.mayRead?.some((m) => re.test(m)))
        findings.push({
          severity: 'high',
          finding: `Boundary conflict: "${cls}" is forbidden by the firm but listed under may_read.`,
        });
      else if (
        re.test(t) &&
        !(declared?.mustNeverReceive ?? []).some((m) => re.test(m))
      )
        findings.push({
          severity: 'medium',
          finding: `Restricted data class "${cls}" is mentioned in the skill text but not declared under must_never_receive.`,
        });
    }
    if (
      declared &&
      (!declared.mayRead?.length || !declared.mustNeverReceive?.length)
    )
      findings.push({
        severity: 'low',
        finding:
          'Boundary declaration incomplete: may_read and must_never_receive should both be filled.',
      });
    return findings;
  }

  // ───────────────────────── champion grading ─────────────────────────

  /**
   * A champion's grade of a submission (the L5 exercise). Also computes agreement with the Grader's
   * own draft and records it as a CoachNote on the champion (feeds L5.grading evidence).
   */
  async recordChampionGrade(
    submissionId: string,
    rubric: RubricScore[],
    feedback: string,
    decision: 'pass' | 'revise',
    championId: string,
  ): Promise<{
    grade: Grade;
    agreement: {
      scoreDelta: number;
      decisionMatch: boolean;
      agreement: number;
      graderGradeId: string | null;
    };
  }> {
    const submission = await this.submissions.findOne({
      where: { id: submissionId },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    const exercise = await this.exercises.findOne({
      where: { id: submission.exerciseId },
    });
    const draft = await this.grades.findOne({
      where: { submissionId, gradedByPersonId: IsNull() },
      order: { gradedAt: 'DESC' },
    });
    const weights = exercise
      ? this.rubricFor(exercise, submission.artifact?.type ?? 'text')
      : [];
    const score =
      weights.length &&
      rubric.every((r) => weights.some((w) => w.criterion === r.criterion))
        ? this.weightedScore(weights, rubric)
        : Math.round(
            clamp01(
              rubric.length
                ? rubric.reduce((s, r) => s + clamp01(r.score), 0) /
                    rubric.length
                : 0,
            ) * 1000,
          ) / 1000;

    const grade = await this.grades.save(
      this.grades.create({
        submissionId,
        skillVersionId: null,
        personId: submission.personId,
        rubric: rubric.map((r) => ({ ...r, score: clamp01(r.score) })),
        score,
        feedback,
        decision,
        critiqueQuality: draft?.critiqueQuality ?? null,
        expectationAccuracy: null,
        securityFindings: draft?.securityFindings ?? [],
        teachingMoment: draft?.teachingMoment ?? null,
        graderVersion: 'champion-v1',
        model: null,
        gradedByPersonId: championId,
      }),
    );

    const scoreDelta = draft
      ? Math.round(Math.abs(draft.score - score) * 1000) / 1000
      : 1;
    const decisionMatch = draft ? draft.decision === decision : false;
    const agreement = draft
      ? Math.round(
          clamp01(0.6 * (1 - scoreDelta) + 0.4 * (decisionMatch ? 1 : 0)) *
            1000,
        ) / 1000
      : 0;
    await this.notes.save(
      this.notes.create({
        personId: championId,
        note: `Champion grade on submission ${submissionId}: ${decision} at ${score}. Grader agreement ${agreement}${draft ? ` (Grader: ${draft.decision} at ${draft.score})` : ' (no Grader draft)'}.`,
        tags: ['progress'],
        author: 'grader',
      }),
    );
    if (exercise) {
      exercise.status = decision === 'pass' ? 'passed' : 'revise';
      exercise.completedAt =
        decision === 'pass' ? new Date() : exercise.completedAt;
      await this.exercises.save(exercise);
    }
    try {
      await this.mastery.snapshot(submission.personId);
    } catch (error) {
      this.logger.warn(
        `Mastery snapshot after champion grade failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return {
      grade,
      agreement: {
        scoreDelta,
        decisionMatch,
        agreement,
        graderGradeId: draft?.id ?? null,
      },
    };
  }

  // ───────────────────────── helpers ─────────────────────────

  artifactText(submission: Submission): string {
    const a = submission.artifact;
    if (!a) return '';
    const parts = [`Type: ${a.type}`];
    if (a.name) parts.push(`Project name: ${a.name}`);
    if (a.connectors?.length)
      parts.push(`Connectors switched on: ${a.connectors.join(', ')}`);
    parts.push(a.content);
    if (a.material)
      parts.push(`\n--- material the learner pasted ---\n${a.material}`);
    if (a.testTask) parts.push(`\n--- test task ---\n${a.testTask}`);
    if (a.schema)
      parts.push(
        `\n--- workflow map ---\n${JSON.stringify(a.schema, null, 2)}`,
      );
    if (a.output) parts.push(`\n--- Claude output ---\n${a.output}`);
    if (a.sampleRequests?.length && !a.results?.length)
      parts.push(`\n--- sample requests ---\n${a.sampleRequests.join('\n')}`);
    if (a.results?.length)
      parts.push(
        `\n--- sample requests run against the skill ---\n${a.results.map((r) => `request: ${r.request}\nfired: ${r.fired ? 'yes' : 'no'}\noutput: ${r.output}`).join('\n\n')}`,
      );
    if (a.rationale)
      parts.push(`\n--- Include/exclude rationale ---\n${a.rationale}`);
    if (a.files?.length)
      parts.push(
        ...a.files.map((f) => `\n--- file: ${f.name} ---\n${f.content}`),
      );
    if (a.sampleCases?.length)
      parts.push(
        `\n--- sample cases ---\n${a.sampleCases.map((c) => `input: ${c.input} | shouldTrigger: ${c.shouldTrigger} | expected: ${c.expected}`).join('\n')}`,
      );
    if (a.boundary)
      parts.push(`\n--- boundary ---\n${JSON.stringify(a.boundary)}`);
    return parts.join('\n');
  }

  async orgBoundary(
    orgId: string | null,
  ): Promise<ComplianceBoundary | undefined> {
    if (!orgId) return undefined;
    const org = await this.orgs.findOne({ where: { id: orgId } });
    return org?.settings?.boundary;
  }
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
}

function oneLine(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mergeFindings(
  a: SecurityFinding[],
  b: SecurityFinding[],
): SecurityFinding[] {
  const seen = new Set<string>();
  const out: SecurityFinding[] = [];
  for (const f of [...b, ...a]) {
    const key = f.finding.trim().toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ severity: f.severity, finding: f.finding });
  }
  return out;
}
