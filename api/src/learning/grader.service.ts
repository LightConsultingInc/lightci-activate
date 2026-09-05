import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
import { Submission } from './entities/submission.entity';
import { MasteryService } from './mastery.service';
import { GRADER_SKILL_SYSTEM, GRADER_SYSTEM, boundaryText } from './prompts';
import './learning.mocks';

export const GRADER_VERSION = 'grader-v1';
export const SKILL_PASS_THRESHOLD = 0.85;

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
 * Grader role: rubric-based assessment of submissions and skills, honest pass/revise decisions,
 * critique quality, calibration accuracy, a just-in-time teaching moment and a security review
 * of skill text. Every Claude call goes through AiService (task grader.submission / grader.skill).
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
    exercise: Pick<Exercise, 'competencyCodes'>,
    artifactType: string,
  ): WeightedCriterion[] {
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
    exercise: Pick<Exercise, 'competencyCodes'>,
    artifactType: string,
  ): number {
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
  ): Promise<Grade> {
    const artifactType = submission.artifact?.type ?? 'text';
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
        system: GRADER_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              `# Exercise (L${exercise.rung}, ${exercise.workSurface})`,
              `Title: ${exercise.title}`,
              `Brief: ${exercise.brief}`,
              `Competencies: ${exercise.competencyCodes.map((c) => `${c} (${COMPETENCY_BY_CODE.get(c)?.name ?? c})`).join(', ')}`,
              `Pass threshold (weighted score): ${threshold}`,
              `Attempt: ${submission.attempt}; cold attempt (no worked example seen): ${submission.coldAttempt ? 'yes' : 'no'}`,
              '',
              '# Rubric (score each criterion 0..1; use the keys exactly)',
              ...rubric.map(
                (c) =>
                  `- ${c.criterion} | ${c.label} (weight ${c.weight.toFixed(2)}): ${c.description}`,
              ),
              '',
              '# Firm compliance boundary',
              boundaryText(boundary),
              '',
              `# Learner's pre-run expectation (confidence ${Math.round(submission.expectationConfidence * 100)}% of passing)`,
              submission.expectationText,
              '',
              '# Artifact',
              artifactText,
              '',
              "# Learner's post-run critique",
              submission.critiqueText ?? '(none)',
            ].join('\n'),
          },
        ],
        mockSeed: {
          criteria: rubric.map((c) => ({
            criterion: c.criterion,
            label: c.label,
          })),
          artifactText,
          critiqueText: submission.critiqueText ?? '',
          expectationText: submission.expectationText,
          isSkill: artifactType === 'skill',
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

    const grade = this.grades.create({
      submissionId: submission.id,
      skillVersionId: null,
      personId: person.id,
      rubric: rubricScores,
      score,
      feedback: out.feedback,
      decision,
      critiqueQuality: clamp01(out.critiqueQuality),
      expectationAccuracy: this.mastery.expectationAccuracy(
        submission.expectationConfidence,
        decision === 'pass',
      ),
      securityFindings,
      teachingMoment: out.teachingMoment,
      graderVersion: GRADER_VERSION,
      model: this.ai.provider === 'mock' ? 'mock' : this.ai.defaultModel,
      gradedByPersonId: null,
    });
    return this.grades.save(grade);
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
        expectationAccuracy: this.mastery.expectationAccuracy(
          submission.expectationConfidence,
          decision === 'pass',
        ),
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
    const parts = [`Type: ${a.type}`, a.content];
    if (a.output) parts.push(`\n--- Claude output ---\n${a.output}`);
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
