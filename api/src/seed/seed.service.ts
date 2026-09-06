import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
} from 'typeorm';
import { DAY_MS, isoDay } from '../common/dates';
import type { Rung } from '../common/roles';
import { ContextLayer } from '../context/entities/context-layer.entity';
import { ContextSource } from '../context/entities/context-source.entity';
import { InterviewSession } from '../interviews/entities/interview-session.entity';
import {
  COMPETENCY_BY_CODE,
  COMPETENCY_CATALOG,
  GRADER_RUBRIC_SKILL,
} from '../learning/competency-catalog';
import { CoachNote } from '../learning/entities/coach-note.entity';
import {
  Competency,
  RubricCriterion,
} from '../learning/entities/competency.entity';
import { Exercise } from '../learning/entities/exercise.entity';
import { Grade, RubricScore } from '../learning/entities/grade.entity';
import { MasterySnapshot } from '../learning/entities/mastery-snapshot.entity';
import { Placement } from '../learning/entities/placement.entity';
import { Revisit } from '../learning/entities/revisit.entity';
import { Submission } from '../learning/entities/submission.entity';
import { practiceOf } from '../learning/mappers';
import {
  brier,
  computeMastery,
  Prediction,
  ScoredArtifact,
} from '../learning/mastery-math';
import { AgentRun } from '../ops/entities/agent-run.entity';
import { AuditLog } from '../ops/entities/audit-log.entity';
import { CostInput } from '../ops/entities/cost-input.entity';
import { Escalation } from '../ops/entities/escalation.entity';
import { Readout } from '../ops/entities/readout.entity';
import {
  UsageMetrics,
  UsageSnapshot,
} from '../ops/entities/usage-snapshot.entity';
import { Wave } from '../ops/entities/wave.entity';
import { Org } from '../orgs/entities/org.entity';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { PromotionRequest } from '../skills/entities/promotion-request.entity';
import { SkillAdoption } from '../skills/entities/skill-adoption.entity';
import { SkillAssignment } from '../skills/entities/skill-assignment.entity';
import { SkillComment } from '../skills/entities/skill-comment.entity';
import { SkillUsage } from '../skills/entities/skill-usage.entity';
import { SkillVersion } from '../skills/entities/skill-version.entity';
import { ActivateManifest, Skill } from '../skills/entities/skill.entity';
import { Baseline } from '../workflows/entities/baseline.entity';
import { Measurement } from '../workflows/entities/measurement.entity';
import {
  WorkflowMap,
  WorkflowScore,
} from '../workflows/entities/workflow-map.entity';
import {
  DEMO_ADOPTIONS,
  DEMO_AGENT_RUNS,
  DEMO_ASSIGNMENTS,
  DEMO_AUDIT,
  DEMO_BASELINES,
  DEMO_COACH_NOTES,
  DEMO_COMMENTS,
  DEMO_CONTEXT_LAYERS,
  DEMO_CONTEXT_SOURCES,
  DEMO_COST,
  DEMO_ESCALATIONS,
  DEMO_EXERCISES,
  DEMO_INTERVIEWS,
  DEMO_ORG,
  DEMO_PEOPLE,
  DEMO_PROMOTIONS,
  DEMO_READOUTS,
  DEMO_REVISITS,
  DEMO_SKILLS,
  DEMO_TEAMS,
  DEMO_WAVES,
  DEMO_WORKFLOWS,
  DemoExercise,
  DemoPerson,
  DemoSkill,
  DemoSubmission,
  FILLER_EXERCISES,
  REVISIT_PROMPTS,
  UsageProfile,
  WORKOS_PERSON_KEYS,
} from './demo-data';
import { Rng } from './rng';

export const SEED_VERSION = 'meridian-demo-v1';
const GRADER_VERSION = 'grader-v1.3';
const DEFAULT_MODEL = 'claude-opus-5';
/** A perfectly valuable, fully ready, zero-exposure workflow worth this many hours/week scores 100. */
export const SCORE_HOURS_REFERENCE = 6;

/** Plain entity partials; cast to TypeORM's insert type only at the insert call (its deep type rejects `Record<string, unknown>` jsonb columns). */
type Row<T> = Partial<T>;

// ───────────────────────────────────────── pure helpers (unit-tested) ─────────────────────────────────────────

/** composite = value × hours × readiness ÷ (1 + exposure), normalised so SCORE_HOURS_REFERENCE h/week at value 1, readiness 1, exposure 0 = 100. */
export function scoreWorkflow(s: {
  value: number;
  hours: number;
  readiness: number;
  exposure: number;
  rationale: string;
}): WorkflowScore {
  const raw = (s.value * s.hours * s.readiness) / (1 + s.exposure);
  const composite = Math.round(
    Math.min(100, Math.max(0, (raw / SCORE_HOURS_REFERENCE) * 100)),
  );
  return {
    value: s.value,
    hours: s.hours,
    readiness: s.readiness,
    exposure: s.exposure,
    composite,
    rationale: s.rationale,
  };
}

/** Weighted rubric score over the criteria (weights normalised to 1). */
export function weightedScore(
  criteria: readonly RubricCriterion[],
  scores: Record<string, number>,
): number {
  let num = 0;
  let den = 0;
  for (const c of criteria) {
    const s = scores[c.key];
    if (s === undefined) continue;
    num += c.weight * s;
    den += c.weight;
  }
  return den === 0 ? 0 : Math.round((num / den) * 1000) / 1000;
}

/** Build RubricScore rows, filling criteria the author did not score with values near the given mean (deterministic). */
export function buildRubric(
  criteria: readonly RubricCriterion[],
  scores: Record<string, number>,
  rng: Rng,
): RubricScore[] {
  const given = Object.values(scores);
  const mean = given.length
    ? given.reduce((a, b) => a + b, 0) / given.length
    : 0.8;
  return criteria.map((c) => {
    const score =
      scores[c.key] ??
      Math.round(
        Math.min(1, Math.max(0, mean + rng.float(-0.05, 0.05))) * 100,
      ) / 100;
    return { criterion: c.key, label: c.label, score, note: rubricNote(score) };
  });
}

function rubricNote(score: number): string {
  if (score >= 0.9) return 'Meets the bar clearly.';
  if (score >= 0.8) return 'Meets the bar.';
  if (score >= 0.7) return 'Adequate; see feedback.';
  if (score >= 0.5) return 'Below the bar; the feedback names the change.';
  return 'Not met.';
}

export function isWeekend(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

/** Anthropic's definition: a chat message, or a Code/Cowork session with tool use. */
export function activeOnRealWork(
  m: Pick<UsageMetrics, 'messages' | 'codeSessions' | 'coworkSessions'>,
): boolean {
  return m.messages > 0 || m.codeSessions > 0 || m.coworkSessions > 0;
}

/**
 * Deterministic daily usage for one person over `days` days ending today. Weekday-heavy,
 * shaped by the profile trend; inactive people go quiet after `quietAfterDaysAgo`.
 */
export function generateUsageSeries(
  profile: UsageProfile,
  rng: Rng,
  today: Date,
  days = 90,
): { day: string; metrics: UsageMetrics }[] {
  const out: { day: string; metrics: UsageMetrics }[] = [];
  for (let daysAgo = days - 1; daysAgo >= 0; daysAgo--) {
    const date = new Date(today.getTime() - daysAgo * DAY_MS);
    const day = isoDay(date);
    const zero: UsageMetrics = {
      messages: 0,
      codeSessions: 0,
      coworkSessions: 0,
      projectsUsed: 0,
      filesUploaded: 0,
      skillActivations: 0,
      connectorsUsed: 0,
      activeOnRealWork: false,
    };
    const quiet =
      profile.intensity <= 0 ||
      daysAgo > profile.startDaysAgo ||
      (profile.quietAfterDaysAgo !== undefined &&
        daysAgo < profile.quietAfterDaysAgo);
    if (quiet) {
      out.push({ day, metrics: zero });
      continue;
    }
    const weekday = isWeekend(date)
      ? date.getUTCDay() === 6
        ? 0.12
        : 0.05
      : 1;
    const progress =
      profile.startDaysAgo > 0 ? 1 - daysAgo / profile.startDaysAgo : 1; // 0 at start, 1 today
    let trend = 1;
    if (profile.trend === 'growing') trend = 0.45 + 0.75 * progress;
    if (profile.trend === 'drop_last_month') trend = daysAgo < 30 ? 0.4 : 1.05;
    const expected = profile.intensity * weekday * trend;
    const messages = Math.max(
      0,
      Math.round(rng.normal(expected, Math.max(0.6, expected * 0.35))),
    );
    const dayActive = messages > 0 || rng.chance(weekday * 0.15 * trend);
    const codeSessions =
      profile.code && dayActive && !isWeekend(date)
        ? rng.chance(0.55 * trend)
          ? rng.int(1, 3)
          : 0
        : 0;
    const coworkSessions =
      profile.cowork && dayActive && !isWeekend(date)
        ? rng.chance(0.4 * trend)
          ? rng.int(1, 2)
          : 0
        : 0;
    const projectsUsed =
      messages > 0
        ? Math.min(3, Math.round(messages / 4 + (rng.chance(0.3) ? 1 : 0)))
        : 0;
    const filesUploaded = messages > 0 && rng.chance(0.35) ? rng.int(1, 3) : 0;
    const skillActivations =
      messages > 0
        ? Math.max(0, Math.round(rng.normal(messages * 0.3 * progress, 1)))
        : 0;
    const connectorsUsed = messages > 0 && rng.chance(0.25) ? 1 : 0;
    const metrics: UsageMetrics = {
      messages,
      codeSessions,
      coworkSessions,
      projectsUsed,
      filesUploaded,
      skillActivations,
      connectorsUsed,
      activeOnRealWork: false,
    };
    metrics.activeOnRealWork = activeOnRealWork(metrics);
    if (codeSessions > 0)
      metrics.codeSpendUsd =
        Math.round(codeSessions * rng.float(1.5, 6) * 100) / 100;
    out.push({ day, metrics });
  }
  return out;
}

/**
 * Daily skill activations for one user of a published skill: zero before `fromDaysAgo`,
 * weekday-heavy, ramping up over the first three weeks after they start using it.
 */
export function generateSkillUsage(
  rate: number,
  fromDaysAgo: number,
  toDaysAgo: number,
  rng: Rng,
  today: Date,
): { day: string; activations: number }[] {
  const out: { day: string; activations: number }[] = [];
  for (
    let daysAgo = Math.min(89, fromDaysAgo);
    daysAgo >= Math.max(0, toDaysAgo);
    daysAgo--
  ) {
    const date = new Date(today.getTime() - daysAgo * DAY_MS);
    if (isWeekend(date) && !rng.chance(0.08)) continue;
    const age = fromDaysAgo - daysAgo;
    const ramp = Math.min(1, 0.35 + age / 21);
    const expected = rate * ramp * (isWeekend(date) ? 0.2 : 1);
    const activations = Math.max(
      0,
      Math.round(rng.normal(expected, Math.max(0.5, expected * 0.5))),
    );
    if (activations > 0) out.push({ day: isoDay(date), activations });
  }
  return out;
}

// ───────────────────────────────────────── the plan ─────────────────────────────────────────

export interface SeedPlan {
  org: Row<Org>[];
  teams: Row<Team>[];
  people: Row<Person>[];
  contextSources: Row<ContextSource>[];
  contextLayers: Row<ContextLayer>[];
  competencies: Row<Competency>[];
  placements: Row<Placement>[];
  interviews: Row<InterviewSession>[];
  workflows: Row<WorkflowMap>[];
  skills: Row<Skill>[];
  skillVersions: Row<SkillVersion>[];
  grades: Row<Grade>[];
  adoptions: Row<SkillAdoption>[];
  assignments: Row<SkillAssignment>[];
  comments: Row<SkillComment>[];
  promotions: Row<PromotionRequest>[];
  exercises: Row<Exercise>[];
  submissions: Row<Submission>[];
  revisits: Row<Revisit>[];
  coachNotes: Row<CoachNote>[];
  baselines: Row<Baseline>[];
  measurements: Row<Measurement>[];
  usage: Row<UsageSnapshot>[];
  skillUsage: Row<SkillUsage>[];
  mastery: Row<MasterySnapshot>[];
  escalations: Row<Escalation>[];
  waves: Row<Wave>[];
  readouts: Row<Readout>[];
  cost: Row<CostInput>[];
  audit: Row<AuditLog>[];
  agentRuns: Row<AgentRun>[];
}

interface Evidence {
  code: string;
  score: number;
  daysAgo: number;
  context: string;
  prediction: Prediction;
  critiqueQuality: number;
}

/** Builds every row for the demo org. Pure: same `now` and seed give identical output. */
export function buildSeedPlan(
  now: Date = new Date(),
  seed = SEED_VERSION,
): SeedPlan {
  const root = new Rng(seed);
  const ids = root.fork('ids');
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const at = (daysAgo: number, hour = 10, minute = 0) =>
    new Date(
      today.getTime() - daysAgo * DAY_MS + hour * 3_600_000 + minute * 60_000,
    );
  const jitterAt = (daysAgo: number, r: Rng) =>
    at(daysAgo, r.int(8, 17), r.int(0, 59));
  const dayStr = (daysAgo: number) => isoDay(at(daysAgo, 0));

  const personId = new Map<string, string>();
  const teamId = new Map<string, string>();
  const workflowId = new Map<string, string>();
  const skillId = new Map<string, string>();
  const exerciseId = new Map<string, string>();
  const submissionId = new Map<string, string>(); // `${exerciseKey}#${attempt}`
  const promotionId = new Map<string, string>();
  const versionId = new Map<string, string>(); // `${slug}@${version}`
  const versionGradeId = new Map<string, string>();
  const interviewId = new Map<string, string>(); // by workflowKey or `${mode}:${personKey}`
  const waveId = new Map<number, string>();

  for (const p of DEMO_PEOPLE) personId.set(p.key, ids.uuid());
  for (const t of DEMO_TEAMS) teamId.set(t.slug, ids.uuid());
  for (const w of DEMO_WORKFLOWS) workflowId.set(w.key, ids.uuid());
  for (const s of DEMO_SKILLS) {
    skillId.set(s.slug, ids.uuid());
    for (const v of s.versions) {
      versionId.set(`${s.slug}@${v.version}`, ids.uuid());
      if (v.grade) versionGradeId.set(`${s.slug}@${v.version}`, ids.uuid());
    }
  }
  for (const e of DEMO_EXERCISES) {
    exerciseId.set(e.key, ids.uuid());
    for (const s of e.submissions)
      submissionId.set(`${e.key}#${s.attempt}`, ids.uuid());
  }
  for (const p of DEMO_PROMOTIONS) promotionId.set(p.key, ids.uuid());
  for (const i of DEMO_INTERVIEWS)
    interviewId.set(i.workflowKey ?? `${i.mode}:${i.personKey}`, ids.uuid());
  for (const w of DEMO_WAVES) waveId.set(w.number, ids.uuid());

  const orgId = ids.uuid();
  const personByKey = new Map(DEMO_PEOPLE.map((p) => [p.key, p]));
  const pid = (key: string) => {
    const id = personId.get(key);
    if (!id) throw new Error(`seed: unknown person key ${key}`);
    return id;
  };
  const teamOf = (key: string) => {
    const slug = personByKey.get(key)?.teamSlug;
    return slug ? teamId.get(slug)! : null;
  };
  const email = (key: string) => personByKey.get(key)!.email;

  const plan: SeedPlan = {
    org: [],
    teams: [],
    people: [],
    contextSources: [],
    contextLayers: [],
    competencies: [],
    placements: [],
    interviews: [],
    workflows: [],
    skills: [],
    skillVersions: [],
    grades: [],
    adoptions: [],
    assignments: [],
    comments: [],
    promotions: [],
    exercises: [],
    submissions: [],
    revisits: [],
    coachNotes: [],
    baselines: [],
    measurements: [],
    usage: [],
    skillUsage: [],
    mastery: [],
    escalations: [],
    waves: [],
    readouts: [],
    cost: [],
    audit: [],
    agentRuns: [],
  };

  // ── org, teams, people ──
  plan.org.push({ id: orgId, ...DEMO_ORG, createdAt: at(70) });
  plan.cost.push({ id: ids.uuid(), orgId, ...DEMO_COST });

  for (const t of DEMO_TEAMS) {
    plan.teams.push({
      id: teamId.get(t.slug)!,
      orgId,
      name: t.name,
      slug: t.slug,
      rbacGroupId: t.rbacGroupId,
      pluginName: t.pluginName,
      championPersonId: pid(t.championKey),
      inProgram: true,
      purpose: t.purpose,
      programStartedOn: dayStr(t.programStartedDaysAgo),
      createdAt: at(t.programStartedDaysAgo + 2),
    });
  }

  for (const p of DEMO_PEOPLE) {
    const isLead = p.roles.includes('lead');
    plan.people.push({
      id: pid(p.key),
      orgId: isLead ? null : orgId,
      teamId: p.teamSlug ? teamId.get(p.teamSlug)! : null,
      email: p.email,
      name: p.name,
      title: p.title,
      workosUserId: p.workosUserId ?? null,
      claudeUserId: p.workosUserId
        ? null
        : `claude_${Rng.hash(p.email).toString(16)}`,
      roles: p.roles,
      avatarUrl: null,
      status: p.status,
      onboardedAt:
        p.cohortDaysAgo !== null ? at(p.cohortDaysAgo, 9) : at(90, 9),
      consentAt: p.cohortDaysAgo !== null ? at(p.cohortDaysAgo, 9, 5) : null,
      lastActiveAt:
        p.lastActiveDaysAgo !== null ? at(p.lastActiveDaysAgo, 15) : null,
      lastSeenAt:
        p.lastActiveDaysAgo !== null ? at(p.lastActiveDaysAgo, 16) : null,
      premiumSeat: p.premiumSeat ?? false,
      cohortWeek: p.cohortDaysAgo !== null ? dayStr(p.cohortDaysAgo) : null,
      profile: p.profile,
      createdAt: at(p.cohortDaysAgo ?? 90, 8),
    });
    for (const pl of p.placements) {
      plan.placements.push({
        id: ids.uuid(),
        personId: pid(p.key),
        rung: pl.rung,
        by: pl.by,
        evidence: pl.evidence ?? {},
        placedAt: at(pl.daysAgo, 11),
      });
    }
  }

  // ── context ──
  const ownerFor = (layer: string, key?: string) =>
    !key ? null : layer === 'team' ? teamId.get(key)! : pid(key);
  for (const s of DEMO_CONTEXT_SOURCES) {
    plan.contextSources.push({
      id: ids.uuid(),
      orgId,
      layer: s.layer,
      ownerId: ownerFor(s.layer, s.ownerKey),
      type: s.type,
      title: s.title,
      uri: s.uri ?? null,
      content: s.content,
      reviewState: s.reviewState,
      tags: s.tags,
      ingestedAt: at(s.ingestedDaysAgo, 12),
    });
  }
  for (const l of DEMO_CONTEXT_LAYERS) {
    plan.contextLayers.push({
      id: ids.uuid(),
      orgId,
      layer: l.layer,
      ownerId: ownerFor(l.layer, l.ownerKey),
      summary: l.summary,
      vocabulary: l.vocabulary,
      anchorWorkflows: l.anchorWorkflows,
      sensitivities: l.sensitivities,
      systems: l.systems,
      version: l.version,
    });
  }

  // ── competencies ──
  for (const c of COMPETENCY_CATALOG) {
    plan.competencies.push({
      id: ids.uuid(),
      code: c.code,
      rung: c.rung,
      name: c.name,
      description: c.description,
      rubric: c.rubric,
      orderIndex: c.orderIndex,
      minContexts: c.minContexts,
      masteryThreshold: c.masteryThreshold,
    });
  }

  // ── interviews (before workflows so maps can reference the session) ──
  for (const i of DEMO_INTERVIEWS) {
    const id = interviewId.get(i.workflowKey ?? `${i.mode}:${i.personKey}`)!;
    const start = at(i.createdDaysAgo, 14);
    const transcript = i.transcript.map((t, idx) => ({
      ...t,
      at: new Date(start.getTime() + idx * 95_000).toISOString(),
    }));
    plan.interviews.push({
      id,
      orgId,
      personId: pid(i.personKey),
      mode: i.mode,
      workflowMapId: i.workflowKey ? workflowId.get(i.workflowKey)! : null,
      teamId: i.teamSlug ? teamId.get(i.teamSlug)! : teamOf(i.personKey),
      transcript,
      scribe: i.scribe,
      checkerFlags: i.checkerFlags,
      completeness: i.completeness,
      status: i.status,
      voice: i.voice,
      turnCount:
        i.transcript.filter((t) => t.role === 'user').length +
        i.transcript.filter((t) => t.role === 'interviewer').length,
      result: i.result
        ? {
            ...i.result,
            workflowMapIds: (i.result.workflowKeys ?? []).map((k) =>
              workflowId.get(k)!,
            ),
          }
        : null,
      createdAt: start,
      completedAt:
        i.completedDaysAgo !== undefined
          ? at(i.completedDaysAgo, 14, 40)
          : null,
    });
  }

  // ── workflows ──
  for (const w of DEMO_WORKFLOWS) {
    plan.workflows.push({
      id: workflowId.get(w.key)!,
      orgId,
      teamId: teamId.get(w.teamSlug)!,
      ownerPersonId: pid(w.ownerKey),
      name: w.name,
      schema: w.schema,
      completeness: w.completeness,
      championVerified: w.championVerified,
      score: w.score ? scoreWorkflow(w.score) : null,
      status: w.status,
      linkedSkillIds: w.linkedSkillSlugs.map((s) => skillId.get(s)!),
      interviewSessionId: interviewId.get(w.key) ?? null,
      nextWave: w.nextWave,
      createdAt: at(w.createdDaysAgo, 15),
      updatedAt: at(Math.max(0, w.createdDaysAgo - 5), 15),
    });
  }

  // ── skills, versions, skill grades ──
  const promotionBySkillVersion = new Map(
    DEMO_PROMOTIONS.map((p) => [`${p.skillSlug}@${p.version}`, p]),
  );
  const workflowByKey = new Map(DEMO_WORKFLOWS.map((w) => [w.key, w]));
  const gradeRng = root.fork('skill-grades');
  for (const s of DEMO_SKILLS) {
    const sid = skillId.get(s.slug)!;
    const manifest = buildManifest(
      s,
      email,
      promotionBySkillVersion,
      workflowByKey,
      at,
    );
    let latestGradeId: string | null = null;
    let lastGradedAt: Date | null = null;
    for (const v of s.versions) {
      const vid = versionId.get(`${s.slug}@${v.version}`)!;
      let gradeId: string | null = null;
      let gradeScore: number | null = null;
      if (v.grade) {
        gradeId = versionGradeId.get(`${s.slug}@${v.version}`)!;
        gradeScore = weightedScore(GRADER_RUBRIC_SKILL, v.grade.scores);
        const gradedAt = at(v.daysAgo, 16, 20);
        plan.grades.push({
          id: gradeId,
          submissionId: null,
          skillVersionId: vid,
          personId: pid(v.authorKey),
          rubric: buildRubric(GRADER_RUBRIC_SKILL, v.grade.scores, gradeRng),
          score: gradeScore,
          feedback: v.grade.feedback,
          decision: v.grade.decision,
          critiqueQuality: null,
          expectationAccuracy: null,
          securityFindings: v.grade.securityFindings ?? [],
          teachingMoment: v.grade.teachingMoment ?? null,
          graderVersion: GRADER_VERSION,
          model: DEFAULT_MODEL,
          gradedByPersonId: null,
          gradedAt,
        });
        latestGradeId = gradeId;
        lastGradedAt = gradedAt;
      }
      const published =
        (s.status === 'published' || s.status === 'deprecated') &&
        (v.approverKeys?.length ?? 0) > 0;
      plan.skillVersions.push({
        id: vid,
        skillId: sid,
        version: v.version,
        commitSha: ids.sha(),
        tag: published ? `${s.slug}@v${v.version}` : null,
        skillMd: s.skillMd,
        manifest: {
          ...manifest,
          status:
            v.version === s.versions.length
              ? s.status
              : published
                ? 'published'
                : 'in_review',
        },
        changelog: v.changelog,
        authorPersonId: pid(v.authorKey),
        gradeId,
        gradeScore,
        approverPersonIds: (v.approverKeys ?? []).map(pid),
        createdAt: at(v.daysAgo, 15),
      });
    }
    plan.skills.push({
      id: sid,
      orgId,
      slug: s.slug,
      name: s.name,
      triggerLine: s.triggerLine,
      plugin: s.plugin,
      repoPath: `plugins/${s.plugin}/skills/${s.slug}/SKILL.md`,
      ownerPersonId: pid(s.ownerKey),
      teamId: teamId.get(s.teamSlug)!,
      status: s.status,
      rungRequired: s.rungRequired,
      skillMd: s.skillMd,
      boundary: s.boundary,
      sampleCases: s.sampleCases,
      manifest,
      workflowFamily: s.workflowFamily,
      workflowMapId: s.workflowKey ? workflowId.get(s.workflowKey)! : null,
      latestGradeId,
      currentVersion: s.versions.length,
      branch: s.status === 'published' ? 'main' : `skill/${s.slug}`,
      successorSkillId: s.successorSlug ? skillId.get(s.successorSlug)! : null,
      forkedFromSkillId: null,
      authoredBy: s.authoredBy,
      publishedAt:
        s.publishedDaysAgo !== undefined ? at(s.publishedDaysAgo, 17) : null,
      lastRegradedAt: lastGradedAt,
      createdAt: at(s.createdDaysAgo, 14),
      updatedAt: at(Math.min(...s.versions.map((v) => v.daysAgo)), 15),
    });
  }

  for (const a of DEMO_ADOPTIONS)
    plan.adoptions.push({
      id: ids.uuid(),
      skillId: skillId.get(a.skillSlug)!,
      personId: pid(a.personKey),
      exerciseId: null,
      adoptedAt: at(a.daysAgo, 11),
    });
  for (const a of DEMO_ASSIGNMENTS)
    plan.assignments.push({
      id: ids.uuid(),
      orgId,
      plugin: a.plugin,
      teamId: teamId.get(a.teamSlug)!,
      intendedMode: a.intendedMode,
      observedMode: a.observedMode,
      observedAt: at(a.observedDaysAgo, 3),
    });
  for (const c of DEMO_COMMENTS)
    plan.comments.push({
      id: ids.uuid(),
      skillId: skillId.get(c.skillSlug)!,
      personId: pid(c.personKey),
      body: c.body,
      kind: c.kind,
      createdAt: at(c.daysAgo, 14),
    });

  for (const p of DEMO_PROMOTIONS) {
    const vkey = `${p.skillSlug}@${p.version}`;
    plan.promotions.push({
      id: promotionId.get(p.key)!,
      orgId,
      skillId: skillId.get(p.skillSlug)!,
      skillVersionId: versionId.get(vkey)!,
      requestedByPersonId: pid(p.requestedByKey),
      prNumber: p.prNumber,
      prUrl: null,
      branch: `skill/${p.skillSlug}`,
      gradeId: versionGradeId.get(vkey) ?? null,
      boundaryCheck: p.boundaryCheck,
      diffSummary: p.diffSummary,
      approvals: p.approvals.map((a) => ({
        personId: pid(a.personKey),
        role: a.role,
        decision: a.decision,
        note: a.note,
        at: at(a.daysAgo, 15).toISOString(),
      })),
      requiredApproverRoles: p.requiredApproverRoles,
      decision: p.decision,
      decidedAt:
        p.decidedDaysAgo !== undefined ? at(p.decidedDaysAgo, 16) : null,
      testResults: p.testResults,
      highExposure: p.highExposure,
      createdAt: at(p.createdDaysAgo, 13),
    });
  }

  // ── exercises: hand-written plus generated filler ──
  const evidence: Evidence[] = [];
  const exRng = root.fork('exercises');
  const allExercises: DemoExercise[] = [
    ...DEMO_EXERCISES,
    ...generateFillerExercises(exRng),
  ];
  for (const e of allExercises) {
    if (!exerciseId.has(e.key)) exerciseId.set(e.key, ids.uuid());
    for (const s of e.submissions)
      if (!submissionId.has(`${e.key}#${s.attempt}`))
        submissionId.set(`${e.key}#${s.attempt}`, ids.uuid());
  }
  for (const e of allExercises) {
    const eid = exerciseId.get(e.key)!;
    const starter = { ...(e.starter ?? {}) } as Record<string, unknown>;
    if (typeof starter.reviewSubmissionKey === 'string') {
      const key = starter.reviewSubmissionKey;
      const target = allExercises.find((x) => x.key === key);
      if (target) {
        const last = target.submissions[target.submissions.length - 1];
        starter.submissionId = submissionId.get(`${key}#${last.attempt}`);
        starter.exerciseId = exerciseId.get(key);
        starter.authorPersonId = pid(target.personKey);
      }
      delete starter.reviewSubmissionKey;
    }
    // Practice v2: every seeded exercise carries starter.practice for its rung/surface (docs/practice-model.md).
    const workflowName =
      (e.workflowKey && DEMO_WORKFLOWS.find((w) => w.key === e.workflowKey)?.name) ||
      (typeof starter.workflowName === 'string' ? starter.workflowName : null);
    if (!starter.practice)
      starter.practice = practiceOf(
        { brief: e.brief, title: e.title, workSurface: e.workSurface, starter },
        workflowName,
      );
    plan.exercises.push({
      id: eid,
      personId: pid(e.personKey),
      rung: e.rung,
      competencyCodes: e.competencyCodes,
      title: e.title,
      brief: e.brief,
      rationale: e.rationale,
      kind: e.kind,
      mode: e.mode,
      workSurface: e.workSurface,
      contextTag: e.contextTag,
      workflowMapId: e.workflowKey ? workflowId.get(e.workflowKey)! : null,
      skillId: e.skillSlug ? skillId.get(e.skillSlug)! : null,
      hints: e.hints,
      workedExample: e.workedExample ?? null,
      starter,
      status: e.status,
      estimatedMinutes: e.estimatedMinutes,
      scheduledFor:
        e.scheduledDaysAgo !== undefined ? at(e.scheduledDaysAgo, 9) : null,
      completedAt:
        e.completedDaysAgo !== undefined ? at(e.completedDaysAgo, 16) : null,
      generatedBy: e.generatedBy,
      hintsRevealed: e.hintsRevealed ?? 0,
      createdAt: at(e.createdDaysAgo, 8, 30),
    });
    const criteria = e.competencyCodes.flatMap(
      (c) => COMPETENCY_BY_CODE.get(c)?.rubric ?? [],
    );
    for (const s of e.submissions) {
      const sid = submissionId.get(`${e.key}#${s.attempt}`)!;
      const submittedAt = jitterAt(s.daysAgo, exRng);
      plan.submissions.push({
        id: sid,
        exerciseId: eid,
        personId: pid(e.personKey),
        attempt: s.attempt,
        expectationText: s.expectationText,
        expectationConfidence: s.expectationConfidence,
        artifact: s.artifact,
        critiqueText: s.critiqueText,
        coldAttempt: s.coldAttempt,
        submittedAt,
      });
      if (s.grade) {
        const g = s.grade;
        const score = weightedScore(
          criteria,
          fillScores(criteria, g.scores, exRng),
        );
        const outcome: 0 | 1 = g.decision === 'pass' ? 1 : 0;
        const expectationAccuracy =
          Math.round(
            Math.max(
              0,
              1 - brier({ confidence: s.expectationConfidence, outcome }),
            ) * 1000,
          ) / 1000; // 1 − κ-weighted Brier, clamped to 0..1
        plan.grades.push({
          id: ids.uuid(),
          submissionId: sid,
          skillVersionId: null,
          personId: pid(e.personKey),
          rubric: buildRubric(criteria, g.scores, exRng),
          score,
          feedback: g.feedback,
          decision: g.decision,
          critiqueQuality: g.critiqueQuality,
          expectationAccuracy,
          securityFindings: [],
          teachingMoment: g.teachingMoment ?? null,
          graderVersion: GRADER_VERSION,
          model: g.gradedByKey ? null : DEFAULT_MODEL,
          gradedByPersonId: g.gradedByKey ? pid(g.gradedByKey) : null,
          gradedAt: new Date(submittedAt.getTime() + exRng.int(3, 40) * 60_000),
        });
        for (const code of e.competencyCodes) {
          evidence.push({
            code,
            score,
            daysAgo: g.daysAgo,
            context: e.contextTag,
            prediction: { confidence: s.expectationConfidence, outcome },
            critiqueQuality: g.critiqueQuality,
          });
        }
      }
    }
  }

  // ── revisits, coach notes ──
  for (const r of DEMO_REVISITS) {
    const fallback = REVISIT_PROMPTS[r.competencyCode];
    plan.revisits.push({
      id: ids.uuid(),
      personId: pid(r.personKey),
      competencyCode: r.competencyCode,
      exerciseId: null,
      prompt: r.prompt ?? fallback.prompt,
      answerKey: r.answerKey ?? fallback.answerKey,
      intervalStep: r.intervalStep,
      dueAt: at(r.dueDaysAgo, 9),
      doneAt: r.doneDaysAgo !== undefined ? at(r.doneDaysAgo, 9, 20) : null,
      score: r.score ?? null,
      response: r.response ?? null,
      feedback: r.feedback ?? null,
      createdAt: at(
        r.dueDaysAgo + [2, 7, 21, 60, 120][Math.min(4, r.intervalStep)],
        9,
      ),
    });
  }
  for (const n of DEMO_COACH_NOTES)
    plan.coachNotes.push({
      id: ids.uuid(),
      personId: pid(n.personKey),
      note: n.note,
      tags: n.tags,
      author: n.author ?? 'coach',
      createdAt: at(n.daysAgo, 17),
    });

  // ── baselines and measurements ──
  for (const b of DEMO_BASELINES) {
    const bid = ids.uuid();
    const wid = b.workflowKey ? workflowId.get(b.workflowKey)! : null;
    plan.baselines.push({
      id: bid,
      personId: pid(b.personKey),
      workflowMapId: wid,
      task: b.task,
      method: b.method,
      minutesPerWeek: b.minutesPerWeek,
      reworkMinutesPerWeek: b.reworkMinutesPerWeek,
      approvedByPersonId: b.approvedByKey ? pid(b.approvedByKey) : null,
      capturedAt: at(b.capturedDaysAgo, 10),
    });
    const n = b.measurements.length;
    b.measurements.forEach((m, i) => {
      let startDaysAgo = (n - i) * 30;
      const endDaysAgo = (n - i - 1) * 30 + 1;
      if (startDaysAgo >= b.capturedDaysAgo)
        startDaysAgo = b.capturedDaysAgo - 1;
      plan.measurements.push({
        id: ids.uuid(),
        personId: pid(b.personKey),
        workflowMapId: wid,
        baselineId: bid,
        task: b.task,
        minutesPerWeek: m.minutesPerWeek,
        reworkMinutesPerWeek: m.reworkMinutesPerWeek,
        periodStart: dayStr(startDaysAgo),
        periodEnd: dayStr(endDaysAgo),
        method: b.method,
        source: m.source,
        createdAt: at(endDaysAgo, 18),
      });
    });
  }

  // ── usage snapshots (everyone but the lead) ──
  for (const p of DEMO_PEOPLE) {
    if (p.roles.includes('lead')) continue;
    const series = generateUsageSeries(
      p.usage,
      root.fork(`usage:${p.key}`),
      today,
      90,
    );
    for (const s of series)
      plan.usage.push({
        id: ids.uuid(),
        orgId,
        personId: pid(p.key),
        day: s.day,
        metrics: s.metrics,
        source: 'seed',
      });
  }

  // ── skill usage for published (and formerly published) skills ──
  for (const s of DEMO_SKILLS) {
    if (s.publishedDaysAgo === undefined) continue;
    const deprecatedAt =
      s.status === 'deprecated'
        ? Math.min(
            ...s.versions
              .filter((v) => v.version === s.versions.length)
              .map((v) => v.daysAgo),
          )
        : 0;
    const users = new Map<string, number>();
    users.set(s.ownerKey, s.publishedDaysAgo);
    for (const a of DEMO_ADOPTIONS.filter((a) => a.skillSlug === s.slug))
      users.set(a.personKey, Math.min(a.daysAgo, s.publishedDaysAgo));
    for (const [key, fromDaysAgo] of users) {
      const person = personByKey.get(key)!;
      const rate =
        (s.usageRate ?? 1) *
        (key === s.ownerKey ? 1.3 : 1) *
        (person.usage.trend === 'drop_last_month' ? 0.6 : 1);
      const to =
        person.usage.quietAfterDaysAgo !== undefined
          ? Math.max(deprecatedAt, person.usage.quietAfterDaysAgo)
          : deprecatedAt;
      const rows = generateSkillUsage(
        rate,
        fromDaysAgo,
        to,
        root.fork(`skill-usage:${s.slug}:${key}`),
        today,
      );
      for (const r of rows)
        plan.skillUsage.push({
          id: ids.uuid(),
          skillId: skillId.get(s.slug)!,
          personId: pid(key),
          teamId: teamOf(key),
          day: r.day,
          activations: r.activations,
        });
    }
  }

  // ── mastery snapshots for the WorkOS users, last 30 days ──
  const doneRevisits = DEMO_REVISITS.filter(
    (r) => r.doneDaysAgo !== undefined && (r.score ?? 0) >= 0.8,
  );
  for (const key of WORKOS_PERSON_KEYS) {
    const person = personByKey.get(key)!;
    const mRng = root.fork(`mastery:${key}`);
    const codes = COMPETENCY_CATALOG.filter(
      (c) =>
        c.rung <= person.rung ||
        evidence.some(
          (e) =>
            e.code === c.code &&
            DEMO_EXERCISES.some(
              (x) => x.personKey === key && x.competencyCodes.includes(c.code),
            ),
        ),
    );
    for (const comp of codes) {
      let ev = evidence.filter(
        (e) =>
          e.code === comp.code &&
          allExercises.some(
            (x) =>
              x.personKey === key &&
              x.competencyCodes.includes(comp.code) &&
              x.submissions.some(
                (s) => s.grade && s.grade.daysAgo === e.daysAgo,
              ),
          ),
      );
      if (ev.length === 0) ev = syntheticEvidence(comp.code, person, mRng);
      const revisitsForCode = doneRevisits.filter(
        (r) => r.personKey === key && r.competencyCode === comp.code,
      );
      for (let d = 29; d >= 0; d--) {
        const arts: ScoredArtifact[] = ev
          .filter((e) => e.daysAgo >= d)
          .map((e) => ({
            score: e.score,
            daysAgo: e.daysAgo - d,
            context: e.context,
          }));
        if (arts.length === 0) continue;
        const preds = ev.filter((e) => e.daysAgo >= d).map((e) => e.prediction);
        const cq = ev
          .filter((e) => e.daysAgo >= d)
          .map((e) => e.critiqueQuality);
        const critiqueQuality = cq.reduce((a, b) => a + b, 0) / cq.length;
        const rv = revisitsForCode
          .filter((r) => r.doneDaysAgo! >= d)
          .sort((a, b) => a.doneDaysAgo! - b.doneDaysAgo!)[0];
        const { mastery, components } = computeMastery({
          artifacts: arts,
          lastRevisit: rv
            ? { score: rv.score!, daysAgo: rv.doneDaysAgo! - d }
            : null,
          predictions: preds,
          critiqueQuality,
          requiredContexts: comp.minContexts,
        });
        plan.mastery.push({
          id: ids.uuid(),
          personId: pid(key),
          competencyCode: comp.code,
          day: dayStr(d),
          mastery,
          components,
          computedAt: at(d, 23, 30),
        });
      }
    }
  }

  // ── escalations, waves, readouts, audit, agent runs ──
  const resolveRef = (ref?: { kind: string; key: string }): string | null => {
    if (!ref) return null;
    switch (ref.kind) {
      case 'person':
        return pid(ref.key);
      case 'skill':
        return skillId.get(ref.key) ?? null;
      case 'workflow':
        return workflowId.get(ref.key) ?? null;
      case 'promotion':
        return promotionId.get(ref.key) ?? null;
      case 'exercise':
        return exerciseId.get(ref.key) ?? null;
      case 'team':
        return teamId.get(ref.key) ?? null;
      case 'org':
        return orgId;
      case 'wave':
        return waveId.get(Number(ref.key)) ?? null;
      default:
        return null;
    }
  };
  for (const e of DEMO_ESCALATIONS) {
    plan.escalations.push({
      id: ids.uuid(),
      orgId,
      sourceAgent: e.sourceAgent,
      kind: e.kind,
      subjectType: e.subjectType,
      subjectId: resolveRef(e.subjectRef),
      reason: e.reason,
      assigneePersonId: e.assigneeKey ? pid(e.assigneeKey) : null,
      state: e.state,
      slaDueAt: e.slaDueDaysAgo !== undefined ? at(e.slaDueDaysAgo, 17) : null,
      resolution: e.resolution ?? null,
      resolvedAt:
        e.resolvedDaysAgo !== undefined ? at(e.resolvedDaysAgo, 15) : null,
      createdAt: at(e.createdDaysAgo, 9, 45),
    });
  }
  for (const w of DEMO_WAVES) {
    plan.waves.push({
      id: waveId.get(w.number)!,
      orgId,
      name: w.name,
      number: w.number,
      teamIds: w.teamSlugs.map((s) => teamId.get(s)!),
      startsOn: dayStr(w.startsDaysAgo),
      endsOn: dayStr(w.endsDaysAgo),
      targets: w.targets,
      status: w.status,
      createdAt: at(w.startsDaysAgo + 3, 9),
    });
  }
  for (const r of DEMO_READOUTS) {
    plan.readouts.push({
      id: ids.uuid(),
      orgId,
      scopeType: r.scopeType,
      scopeId: r.scopeKey ? teamId.get(r.scopeKey)! : null,
      title: r.title,
      periodStart: dayStr(r.periodStartDaysAgo),
      periodEnd: dayStr(r.periodEndDaysAgo),
      metrics: r.metrics,
      narrative: r.narrative,
      footnotes: r.footnotes,
      exportedAt: r.scopeType === 'org' ? at(r.periodEndDaysAgo - 1, 11) : null,
      generatedAt: at(Math.max(0, r.periodEndDaysAgo), 18),
    });
  }
  for (const a of DEMO_AUDIT) {
    plan.audit.push({
      id: ids.uuid(),
      orgId,
      actorPersonId: a.actorKey ? pid(a.actorKey) : null,
      action: a.action,
      subjectType: a.subjectType,
      subjectId: resolveRef(a.subjectRef),
      meta: a.meta,
      createdAt: at(a.daysAgo, 16, 10),
    });
  }
  const runRng = root.fork('agent-runs');
  for (const r of DEMO_AGENT_RUNS) {
    const heavy =
      r.agent === 'grader' || r.agent === 'builder' || r.agent === 'auditor';
    const inputTokens = runRng.int(
      heavy ? 6_000 : 1_500,
      heavy ? 22_000 : 7_000,
    );
    const outputTokens = runRng.int(heavy ? 900 : 200, heavy ? 3_500 : 1_200);
    plan.agentRuns.push({
      id: ids.uuid(),
      orgId,
      agent: r.agent,
      task: r.task,
      personId: r.personKey ? pid(r.personKey) : null,
      input: r.input,
      output: r.output,
      model: r.model ?? DEFAULT_MODEL,
      inputTokens,
      outputTokens,
      durationMs: runRng.int(2_500, 48_000),
      status: 'mock',
      error: null,
      createdAt: jitterAt(r.daysAgo, runRng),
    });
  }

  return plan;
}

// ───────────────────────────────────────── plan helpers ─────────────────────────────────────────

function buildManifest(
  s: DemoSkill,
  email: (key: string) => string,
  promotions: Map<
    string,
    {
      requestedByKey: string;
      approvals: { personKey: string; daysAgo: number }[];
      decision: string;
    }
  >,
  workflows: Map<string, { name: string }>,
  at: (daysAgo: number, hour?: number) => Date,
): ActivateManifest {
  const merged = [...s.versions]
    .reverse()
    .map((v) => promotions.get(`${s.slug}@${v.version}`))
    .find((p) => p && p.decision === 'merged');
  const lastGraded = [...s.versions].reverse().find((v) => v.grade);
  const manifest: ActivateManifest = {
    id: s.slug,
    owner: email(s.ownerKey),
    team: s.teamSlug,
    rung_required: `L${s.rungRequired}`,
    boundary: {
      may_read: s.boundary.mayRead,
      must_never_receive: s.boundary.mustNeverReceive,
      human_review: s.boundary.humanReview,
    },
    sample_cases: 'cases/',
    status: s.status,
  };
  if (s.workflowKey)
    manifest.baseline_task = workflows.get(s.workflowKey)?.name;
  if (merged || lastGraded) {
    manifest.promotion = {
      requested_by: merged ? email(merged.requestedByKey) : undefined,
      grade_ref: lastGraded
        ? `grade:${s.slug}@v${lastGraded.version}`
        : undefined,
      approved_by: merged
        ? merged.approvals.map((a) => email(a.personKey))
        : undefined,
      approved_at:
        merged && merged.approvals.length
          ? at(merged.approvals[0].daysAgo, 15).toISOString()
          : undefined,
    };
  }
  if (s.successorSlug) manifest.successor = s.successorSlug;
  return manifest;
}

function fillScores(
  criteria: readonly RubricCriterion[],
  scores: Record<string, number>,
  rng: Rng,
): Record<string, number> {
  const given = Object.values(scores);
  const mean = given.length
    ? given.reduce((a, b) => a + b, 0) / given.length
    : 0.8;
  const out: Record<string, number> = { ...scores };
  for (const c of criteria)
    if (out[c.key] === undefined)
      out[c.key] =
        Math.round(
          Math.min(1, Math.max(0, mean + rng.float(-0.05, 0.05))) * 100,
        ) / 100;
  return out;
}

/** Placeholder evidence for competencies a person clearly holds (rung above the code) but has no seeded submission for. */
function syntheticEvidence(
  code: string,
  person: DemoPerson,
  rng: Rng,
): Evidence[] {
  const comp = COMPETENCY_BY_CODE.get(code)!;
  const gap = person.rung - comp.rung; // how far above this rung the person sits
  const base = Math.min(0.96, 0.84 + 0.03 * gap);
  const contexts = person.contexts.length ? person.contexts : ['general'];
  const n = Math.max(comp.minContexts, 3);
  const out: Evidence[] = [];
  for (let i = 0; i < n; i++) {
    const score = Math.round(rng.normal(base, 0.04, 0.7, 0.98) * 100) / 100;
    const confidence =
      Math.round(
        Math.min(0.95, Math.max(0.4, score + rng.float(-0.12, 0.08))) * 100,
      ) / 100;
    out.push({
      code,
      score,
      daysAgo: rng.int(31, 85),
      context: contexts[i % contexts.length],
      prediction: { confidence, outcome: score >= 0.7 ? 1 : 0 },
      critiqueQuality:
        Math.round(rng.normal(0.8 + 0.02 * gap, 0.05, 0.6, 0.95) * 100) / 100,
    });
  }
  return out;
}

const HANDWRITTEN_KEYS = new Set(DEMO_EXERCISES.map((e) => e.personKey));

/** Rung-appropriate exercise history for every learner without hand-written exercises. */
export function generateFillerExercises(rng: Rng): DemoExercise[] {
  const out: DemoExercise[] = [];
  for (const p of DEMO_PEOPLE) {
    if (HANDWRITTEN_KEYS.has(p.key) || !p.roles.includes('learner')) continue;
    const workflows = p.profile.weeklyWorkflows?.length
      ? p.profile.weeklyWorkflows
      : ['your weekly work'];
    const firstPlacement = p.placements[0];
    const placedAt = (r: number) =>
      p.placements.find((pl) => pl.rung === r)?.daysAgo ??
      firstPlacement.daysAgo;
    const nextPlacedAt = (r: number) =>
      p.placements.find((pl) => pl.rung > r)?.daysAgo ?? 0;
    const stalled = p.usage.trend === 'drop_last_month';
    const quietAfter = p.usage.quietAfterDaysAgo;
    let wfIdx = 0;
    for (let r = 0 as Rung; r <= Math.min(4, p.rung); r++) {
      const templates = FILLER_EXERCISES[r] ?? [];
      const current = r === p.rung;
      templates.forEach((t, ti) => {
        const workflow = workflows[wfIdx++ % workflows.length];
        const fill = (s: string) =>
          s.replace(/\{workflow\}/g, workflow.toLowerCase());
        const key = `${p.key}-L${r}-${ti}`;
        const contextTag =
          p.contexts[(ti + r) % Math.max(1, p.contexts.length)] ?? 'general';
        const belowFirstPlacement = r < firstPlacement.rung;
        const windowStart = belowFirstPlacement
          ? firstPlacement.daysAgo + 1
          : placedAt(r);
        const windowEnd = current ? 1 : nextPlacedAt(r);
        const base: Omit<
          DemoExercise,
          'status' | 'submissions' | 'completedDaysAgo' | 'createdDaysAgo'
        > = {
          key,
          personKey: p.key,
          rung: r,
          competencyCodes: t.competencyCodes,
          title: fill(t.title),
          brief: fill(t.brief),
          rationale: fill(t.rationale),
          kind: belowFirstPlacement ? 'diagnostic' : 'artifact',
          mode: 'in_app',
          workSurface: t.workSurface,
          contextTag,
          hints: t.hints,
          estimatedMinutes: r >= 3 ? 60 : r === 2 ? 35 : 15,
          generatedBy: 'coach',
          hintsRevealed: rng.int(0, 2),
        };
        const passedAt = Math.max(
          windowEnd,
          Math.min(windowStart - 1, rng.int(windowEnd, windowStart - 1)),
        );
        const makeSubmission = (
          daysAgo: number,
          decision: 'pass' | 'revise',
          attempt = 1,
        ): DemoSubmission => {
          const target =
            decision === 'pass'
              ? rng.normal(0.85, 0.05, 0.74, 0.96)
              : rng.normal(0.62, 0.05, 0.5, 0.72);
          const scores: Record<string, number> = {};
          for (const code of t.competencyCodes)
            for (const c of COMPETENCY_BY_CODE.get(code)!.rubric)
              scores[c.key] =
                Math.round(
                  Math.min(1, Math.max(0, target + rng.float(-0.06, 0.06))) *
                    100,
                ) / 100;
          const confidence =
            Math.round(
              Math.min(
                0.95,
                Math.max(
                  0.3,
                  (decision === 'pass' ? target : 0.75) + rng.float(-0.15, 0.1),
                ),
              ) * 100,
            ) / 100;
          return {
            attempt,
            daysAgo,
            expectationText: t.expectation,
            expectationConfidence: confidence,
            coldAttempt: attempt === 1,
            artifact: {
              type: t.artifactType,
              content: `${fill(t.title)}: artifact submitted by ${p.name} (${p.title}) for ${workflow}.`,
              ...(t.artifactType === 'prompt_run'
                ? { output: 'Claude output recorded in-Claude; see history.' }
                : {}),
            },
            critiqueText: t.critique,
            grade: {
              daysAgo,
              scores,
              decision,
              critiqueQuality:
                Math.round(
                  rng.normal(
                    decision === 'pass' ? 0.75 : 0.5,
                    0.08,
                    0.3,
                    0.95,
                  ) * 100,
                ) / 100,
              feedback:
                decision === 'pass'
                  ? t.feedback
                  : `Not yet. ${t.feedback.split('.')[0]} is the part to fix; revise with the first hint in mind.`,
            },
          };
        };
        if (!current) {
          out.push({
            ...base,
            status: 'passed',
            completedDaysAgo: passedAt,
            createdDaysAgo: passedAt + rng.int(1, 4),
            submissions: [makeSubmission(passedAt, 'pass')],
          });
          return;
        }
        const daysAtRung = placedAt(r);
        if (ti === 0) {
          if (quietAfter !== undefined && daysAtRung <= quietAfter) {
            out.push({
              ...base,
              status: 'skipped',
              createdDaysAgo: daysAtRung,
              submissions: [],
            });
          } else if (daysAtRung >= 10) {
            const done = Math.max(
              quietAfter ?? 1,
              Math.round(daysAtRung * 0.6),
            );
            out.push({
              ...base,
              status: 'passed',
              completedDaysAgo: done,
              createdDaysAgo: done + 2,
              submissions: [makeSubmission(done, 'pass')],
            });
          } else {
            out.push({
              ...base,
              status: 'active',
              scheduledDaysAgo: 0,
              createdDaysAgo: Math.max(1, daysAtRung - 2),
              submissions: [],
            });
          }
        } else if (quietAfter === undefined) {
          const reviseFirst = rng.chance(0.4);
          if (reviseFirst) {
            const when = rng.int(3, Math.max(4, Math.round(daysAtRung * 0.4)));
            out.push({
              ...base,
              status: 'revise',
              createdDaysAgo: when + 2,
              submissions: [makeSubmission(when, 'revise')],
            });
          } else {
            out.push({
              ...base,
              status: 'active',
              scheduledDaysAgo: 0,
              createdDaysAgo: stalled ? 20 : 2,
              submissions: [],
            });
          }
        }
      });
      // A "next up" on the rung above for active learners who have passed everything at their rung.
      if (
        current &&
        quietAfter === undefined &&
        templates.length === 1 &&
        r < 4 &&
        placedAt(r) >= 10
      ) {
        const next = FILLER_EXERCISES[r + 1]?.[0];
        if (next) {
          const workflow = workflows[wfIdx++ % workflows.length];
          const fill = (s: string) =>
            s.replace(/\{workflow\}/g, workflow.toLowerCase());
          out.push({
            key: `${p.key}-L${r + 1}-next`,
            personKey: p.key,
            rung: (r + 1) as Rung,
            competencyCodes: next.competencyCodes,
            title: fill(next.title),
            brief: fill(next.brief),
            rationale: fill(next.rationale),
            kind: 'artifact',
            mode: 'in_app',
            workSurface: next.workSurface,
            contextTag: p.contexts[0] ?? 'general',
            hints: next.hints,
            status: stalled ? 'active' : 'queued',
            estimatedMinutes: r + 1 >= 3 ? 60 : 30,
            scheduledDaysAgo: stalled ? 0 : -rng.int(1, 4),
            createdDaysAgo: stalled ? 22 : 1,
            generatedBy: 'coach',
            submissions: [],
          });
        }
      }
    }
  }
  return out;
}

// ───────────────────────────────────────── the service ─────────────────────────────────────────

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.SEED_ON_BOOT === 'true') {
      try {
        await this.run();
      } catch (err) {
        this.logger.error(`Seed on boot failed: ${(err as Error).message}`);
      }
    }
  }

  /** Idempotent: does nothing if the demo org already exists. */
  async run(): Promise<void> {
    const existing = await this.dataSource
      .getRepository(Org)
      .findOne({ where: { slug: DEMO_ORG.slug } });
    if (existing) {
      this.logger.log(
        `Demo org "${DEMO_ORG.slug}" already present; skipping seed.`,
      );
      return;
    }
    const started = Date.now();
    const plan = buildSeedPlan(new Date());
    await this.dataSource.transaction(async (m) => {
      await insertAll(m, Org, plan.org);
      await insertAll(m, Team, plan.teams);
      await insertAll(m, Person, plan.people);
      await insertAll(m, ContextSource, plan.contextSources);
      await insertAll(m, ContextLayer, plan.contextLayers);
      await insertAll(m, Competency, plan.competencies);
      await insertAll(m, Placement, plan.placements);
      await insertAll(m, InterviewSession, plan.interviews);
      await insertAll(m, WorkflowMap, plan.workflows);
      await insertAll(m, Skill, plan.skills);
      await insertAll(m, SkillVersion, plan.skillVersions);
      await insertAll(m, Exercise, plan.exercises);
      await insertAll(m, Submission, plan.submissions);
      await insertAll(m, Grade, plan.grades);
      await insertAll(m, SkillAdoption, plan.adoptions);
      await insertAll(m, SkillAssignment, plan.assignments);
      await insertAll(m, SkillComment, plan.comments);
      await insertAll(m, PromotionRequest, plan.promotions);
      await insertAll(m, Revisit, plan.revisits);
      await insertAll(m, CoachNote, plan.coachNotes);
      await insertAll(m, Baseline, plan.baselines);
      await insertAll(m, Measurement, plan.measurements);
      await insertAll(m, UsageSnapshot, plan.usage);
      await insertAll(m, SkillUsage, plan.skillUsage);
      await insertAll(m, MasterySnapshot, plan.mastery);
      await insertAll(m, Escalation, plan.escalations);
      await insertAll(m, Wave, plan.waves);
      await insertAll(m, Readout, plan.readouts);
      await insertAll(m, CostInput, plan.cost);
      await insertAll(m, AuditLog, plan.audit);
      await insertAll(m, AgentRun, plan.agentRuns);
    });
    const total = (Object.keys(plan) as (keyof SeedPlan)[]).reduce(
      (n, k) => n + plan[k].length,
      0,
    );
    this.logger.log(
      `Seeded ${DEMO_ORG.name}: ${total} rows in ${Date.now() - started}ms (${SEED_VERSION}).`,
    );
  }

  /** Wipe every entity table (not migrations) and reseed. */
  async reset(): Promise<{ truncated: string[]; seeded: boolean }> {
    const tables = this.dataSource.entityMetadatas
      .map((meta) => meta.tableName)
      .filter((t) => t !== 'migrations');
    const quoted = tables.map((t) => `"${t}"`).join(', ');
    await this.dataSource.query(
      `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
    );
    this.logger.warn(`Truncated ${tables.length} tables for reseed.`);
    await this.run();
    return { truncated: tables, seeded: true };
  }
}

async function insertAll<T extends ObjectLiteral>(
  m: EntityManager,
  target: EntityTarget<T>,
  rows: Row<T>[],
  chunk = 200,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunk) {
    await m.insert(target, rows.slice(i, i + chunk));
  }
}
