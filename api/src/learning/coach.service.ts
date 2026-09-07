import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository, type FindOptionsWhere } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { DAY_MS } from '../common/dates';
import { ContextLayer } from '../context/entities/context-layer.entity';
import { Escalation } from '../ops/entities/escalation.entity';
import { Org } from '../orgs/entities/org.entity';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { WorkflowMap } from '../workflows/entities/workflow-map.entity';
import {
  NextExerciseSchema,
  SkillRunSchema,
  type NextExerciseOutput,
} from './ai-schemas';
import {
  COMPETENCY_BY_CODE,
  COMPETENCY_CATALOG,
  competenciesForRung,
} from './competency-catalog';
import { CoachNote } from './entities/coach-note.entity';
import { Exercise, type WorkSurface } from './entities/exercise.entity';
import { Grade } from './entities/grade.entity';
import { Submission } from './entities/submission.entity';
import type {
  CompetencyView,
  Practice,
  PracticeKind,
  RunBody,
  RunResult,
} from './learning.types';
import {
  PRACTICE_KIND_FOR_SURFACE,
  practiceOf,
  skillTemplate,
} from './mappers';
import { MasteryService } from './mastery.service';
import { MemoryService } from './memory.service';
import {
  COACH_RUN_SYSTEM,
  COACH_SKILL_RUN_SYSTEM,
  COACH_SYSTEM,
  COACH_WORKFLOW_DRAFT_SYSTEM,
  boundaryText,
  dataStanceText,
} from './prompts';
import { buildSituation } from './situation';
import './learning.mocks';

export type SkipReason = 'no_time' | 'blocked' | 'tool_issue' | 'not_relevant';

const SURFACE_FOR_RUNG: Record<number, WorkSurface> = {
  0: 'orientation',
  1: 'prompt',
  2: 'project',
  3: 'skill',
  4: 'workflow',
  5: 'review',
};

/**
 * Coach role (practice v2, docs/practice-model.md): chooses and generates the next practice item from
 * the learner's own context with a pre-filled input area, runs Claude per kind when the learner presses
 * Run, reveals hints one at a time, and handles skips with notes and escalation. Everything is in_app.
 */
@Injectable()
export class CoachService {
  private readonly logger = new Logger(CoachService.name);

  constructor(
    @InjectRepository(Exercise)
    private readonly exercises: Repository<Exercise>,
    @InjectRepository(Submission)
    private readonly submissions: Repository<Submission>,
    @InjectRepository(Grade) private readonly grades: Repository<Grade>,
    @InjectRepository(CoachNote) private readonly notes: Repository<CoachNote>,
    @InjectRepository(Escalation)
    private readonly escalations: Repository<Escalation>,
    @InjectRepository(ContextLayer)
    private readonly layers: Repository<ContextLayer>,
    @InjectRepository(WorkflowMap)
    private readonly workflows: Repository<WorkflowMap>,
    @InjectRepository(Org) private readonly orgs: Repository<Org>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    private readonly ai: AiService,
    private readonly mastery: MasteryService,
    private readonly memory: MemoryService,
  ) {}

  // ───────────────────────── queue ─────────────────────────

  /** The one exercise the learner should do next: active first, then the earliest queued. */
  async nextUp(personId: string): Promise<Exercise | null> {
    const active = await this.exercises.findOne({
      where: { personId, status: 'active' },
      order: { createdAt: 'ASC' },
    });
    if (active) return active;
    const queued = await this.exercises.find({
      where: { personId, status: In(['queued', 'revise']) },
      order: { createdAt: 'ASC' },
    });
    if (queued.length === 0) return null;
    // A "revise" exercise is still the learner's current task; prefer it over new queued work.
    return (
      queued.find((e) => e.status === 'revise') ??
      queued.sort(
        (a, b) =>
          (a.scheduledFor?.getTime() ?? 0) - (b.scheduledFor?.getTime() ?? 0) ||
          +a.createdAt - +b.createdAt,
      )[0]
    );
  }

  async queued(personId: string): Promise<Exercise[]> {
    return this.exercises.find({
      where: { personId, status: 'queued' },
      order: { createdAt: 'ASC' },
    });
  }

  /** nextUp, generating a fresh exercise when the queue is empty and the learner has been placed. */
  async ensureNextUp(
    person: Person,
    orgId: string | null,
  ): Promise<Exercise | null> {
    const existing = await this.nextUp(person.id);
    if (existing) return existing;
    try {
      return await this.generateNextExercise(person, orgId);
    } catch (error) {
      this.logger.warn(
        `Could not generate an exercise for ${person.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  // ───────────────────────── generation ─────────────────────────

  /**
   * Generate the next exercise (task coach.next-exercise). Inputs: the learner's ContextLayer (and the
   * team's and company's), their WorkflowMaps, the weakest unlocked competency, the contexts already
   * used (for diversity) and the last exercise (spacing). The result carries `starter.practice`
   * (ask, kind, workflowName, prefill) so the UI renders one input area with a starting point.
   */
  async generateNextExercise(
    person: Person,
    orgId: string | null,
    opts: {
      kind?: Exercise['kind'];
      workflowMapId?: string | null;
      skillId?: string | null;
      competencyCode?: string | null;
      rung?: number;
      moduleCode?: string | null;
    } = {},
  ): Promise<Exercise> {
    const report = await this.mastery.report(person.id);
    const rung = opts.rung ?? report.rung;
    if (rung === 0 && !opts.kind && !opts.skillId)
      return this.generateFirstRealTask(person, orgId);
    const memory = await this.memory.get(person.id, orgId);
    const knownSystemsSeed: string[] = [...memory.systems];
    const unlocked = report.competencies.filter((c) => c.status !== 'locked' || (opts.rung !== undefined && c.rung === opts.rung));
    const target = this.pickTarget(
      unlocked,
      rung,
      opts.competencyCode ?? null,
      await this.lastExercise(person.id),
    );
    const surface =
      SURFACE_FOR_RUNG[Math.min(5, Math.max(0, rung))] ?? 'prompt';
    const [layers, workflows, org, recent] = await Promise.all([
      this.layersFor(person, orgId),
      this.workflows.find({
        where: orgId
          ? [
              { ownerPersonId: person.id, orgId },
              ...(person.teamId ? [{ teamId: person.teamId, orgId }] : []),
            ]
          : { ownerPersonId: person.id },
        order: { updatedAt: 'DESC' },
        take: 8,
      }),
      orgId ? this.orgs.findOne({ where: { id: orgId } }) : null,
      this.exercises.find({
        where: { personId: person.id },
        order: { createdAt: 'DESC' },
        take: 12,
      }),
    ]);
    const usedContexts = [
      ...new Set(
        recent.map((e) => e.contextTag).filter((t): t is string => Boolean(t)),
      ),
    ];
    const lastTeaching = await this.grades.find({
      where: { personId: person.id },
      order: { gradedAt: 'DESC' },
      take: 3,
    });
    const allowedCodes = unlocked
      .filter((c) => c.rung === rung)
      .map((c) => c.code);
    if (allowedCodes.length === 0)
      allowedCodes.push(
        ...competenciesForRung(Math.min(5, rung) as 0).map((c) => c.code),
      );

    const knownSystems = [...new Set([...knownSystemsSeed, ...layers.flatMap((l) => l.systems ?? []), ...workflows.flatMap((w) => w.schema?.systems ?? []), ...(person.profile?.systems ?? [])].map((x) => x.trim()).filter(Boolean))];
    const out = await this.ai.structured(
      {
        agent: 'coach',
        task: 'coach.next-exercise',
        orgId,
        personId: person.id,
        effort: 'medium',
        system: COACH_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              `# Learner`,
              `Name: ${person.name}; title: ${person.title ?? 'unknown'}; current rung: L${rung}; work surface for this rung: ${surface}.`,
              `Profile: ${JSON.stringify(person.profile ?? {})}`,
              '',
              '# Context layers (person, team, company)',
              layers.length
                ? layers
                    .map(
                      (l) =>
                        `## ${l.layer}\n${l.summary ?? '(no summary)'}\nVocabulary: ${l.vocabulary.map((v) => `${v.term} = ${v.meaning}`).join('; ') || '(none)'}\nAnchor workflows: ${l.anchorWorkflows.join(', ') || '(none)'}\nSystems: ${l.systems.join(', ') || '(none)'}\nSensitivities: ${l.sensitivities.join(', ') || '(none)'}`,
                    )
                    .join('\n\n')
                : '(no context layers yet: use the profile and workflows)',
              '',
              '# Workflow maps (use their names and ids; pick workflowMapId when the exercise is drawn from one)',
              workflows.length
                ? workflows
                    .map(
                      (w) =>
                        `- ${w.id} | ${w.name} | ${w.schema?.purpose ?? ''} | ${w.schema?.frequency ?? ''} ${w.schema?.minutesPerRun ? `${w.schema.minutesPerRun} min/run` : ''} | systems: ${(w.schema?.systems ?? []).join(', ')}`,
                    )
                    .join('\n')
                : '(none mapped yet)',
              '',
              '# Competencies at this rung (code | name | mastery | contexts so far | threshold)',
              ...unlocked
                .filter((c) => c.rung === rung)
                .map(
                  (c) =>
                    `- ${c.code} | ${c.name} | ${c.mastery} | ${c.components.contexts}/${c.minContexts} | ${c.threshold}${c.code === target.code ? '  <- weakest; target this' : ''}`,
                ),
              `Target competency: ${target.code} (${target.name}). Its rubric: ${(COMPETENCY_BY_CODE.get(target.code)?.rubric ?? []).map((r) => `${r.label}: ${r.description}`).join(' | ')}`,
              `Allowed competency codes for this exercise: ${allowedCodes.join(', ')}`,
              '',
              '# Spacing and diversity',
              `Contexts already used: ${usedContexts.join(', ') || '(none)'} — prefer a new contextTag.`,
              `Recent exercises: ${
                recent
                  .slice(0, 5)
                  .map(
                    (e) =>
                      `${e.title} [${e.competencyCodes.join(',')}] ${e.status}`,
                  )
                  .join('; ') || '(none)'
              }`,
              `Recent teaching moments to build on: ${
                lastTeaching
                  .map((g) => g.teachingMoment)
                  .filter(Boolean)
                  .join(' || ') || '(none)'
              }`,
              opts.kind ? `Requested kind: ${opts.kind}.` : '',
              opts.skillId
                ? `This exercise is about adopting skill ${opts.skillId} on the learner's own case.`
                : '',
              '',
              '# What Coach remembers about this learner (use it: target the struggles, build on the strengths, honour the preferences)',
              memory.summary
                ? `Summary: ${memory.summary}`
                : 'Summary: (nothing yet)',
              `Strengths: ${memory.strengths.join('; ') || '(none recorded)'}`,
              `Struggles: ${memory.struggles.join('; ') || '(none recorded)'}`,
              `Preferences: ${memory.preferences.join('; ') || '(none recorded)'}`,
              '',
              '# Systems and connectors this learner works in (suggest the connector in the ask or pre-fill; at project/skill/workflow stages involve a connected source where sensible)',
              knownSystems.length ? knownSystems.join(', ') : '(none recorded; leave a paste slot)',
              '',
              '# Firm compliance boundary and data stance',
              boundaryText(org?.settings?.boundary),
              dataStanceText(org?.settings?.boundary),
              '',
              `Produce one practice item for the ${surface} surface${rung === 3 ? ' with a complete workedExample (shown after the first submission)' : ' (workedExample null)'}. Exactly three hints. The brief is the ask: one sentence. Fill only the prefill fields for this surface.`,
            ]
              .filter((line) => line !== '')
              .join('\n'),
          },
        ],
        mockSeed: {
          rung,
          struggles: memory.struggles,
          systems: knownSystems,
          weakestCode: target.code,
          weakestName: target.name,
          workSurface: surface,
          usedContexts,
          workflows: workflows.map((w) => ({ id: w.id, name: w.name })),
          allowedCodes,
        },
      },
      NextExerciseSchema,
    );

    const draft = this.toExercise(
      out,
      person,
      rung,
      surface,
      allowedCodes,
      target.code,
      workflows.map((w) => w.id),
      opts,
    );
    const workflow =
      workflows.find((w) => w.id === draft.workflowMapId) ??
      workflows[0] ??
      null;
    draft.starter = {
      ...(draft.starter ?? {}),
      practice: await this.practiceFor(out, draft, workflow, person),
    };
    // Review practice needs a teammate's submission; when there is none, fall back to the workflow form.
    const practice = draft.starter.practice as Practice;
    if (practice.kind === 'review' && !practice.prefill.submissionId) {
      draft.workSurface = 'workflow';
      draft.kind = 'artifact';
      draft.starter.practice = await this.practiceFor(
        { ...out, workSurface: 'workflow' },
        draft,
        workflow,
        person,
      );
    }
    const exercise = this.exercises.create(draft);
    if (opts.moduleCode)
      exercise.starter = { ...exercise.starter, practice: { moduleCode: opts.moduleCode, preparedAt: new Date().toISOString(), aheadOfPlacement: rung > report.rung } };
    const saved = await this.exercises.save(exercise);
    this.logger.log(
      `Coach generated "${saved.title}" (${saved.competencyCodes.join(',')}) for ${person.id}`,
    );
    return saved;
  }

  /**
   * Rung 0 practice is one real task: a starter prompt already filled with the learner's role and their
   * most frequent workflow's inputs and outputs, run in the app; no policy quiz and no reading surface.
   */
  async generateFirstRealTask(
    person: Person,
    orgId: string | null,
  ): Promise<Exercise> {
    const [layers, maps] = await Promise.all([
      this.layersFor(person, orgId),
      orgId
        ? this.workflows.find({
            where: [
              { ownerPersonId: person.id, orgId },
              ...(person.teamId ? [{ teamId: person.teamId, orgId }] : []),
            ],
            order: { updatedAt: 'DESC' },
            take: 8,
          })
        : Promise.resolve<WorkflowMap[]>([]),
    ]);
    const situation = buildSituation(
      person,
      layers.find((l) => l.layer === 'person') ?? null,
      maps
        .filter((m) => m.ownerPersonId === person.id)
        .concat(maps.filter((m) => m.ownerPersonId !== person.id)),
    );
    const wf = situation?.workflows[0] ?? null;
    const task = wf?.name ?? 'the task you do most';
    const role = situation?.role ?? person.title ?? 'professional';
    const inputs = wf?.inputs?.length
      ? wf.inputs.join(', ')
      : 'the notes I paste below';
    const outputs = wf?.outputs?.length
      ? wf.outputs.join(', ')
      : 'a finished draft I can use as it is';
    const systems = wf?.systems?.length
      ? ` We normally work in ${wf.systems.join(' and ')}.`
      : '';
    const primarySystem = wf?.systems?.[0] ?? situation?.systems?.[0] ?? null;
    const inputSlot = primarySystem
      ? `[Using the ${primarySystem} connector, pull ${inputs}; if you don't have it, paste them here.]`
      : '[Paste your inputs here.]';
    const starterPrompt = [
      `I am a ${role}. Help me with ${task}.${systems}`,
      `Inputs I will give you: ${inputs}.`,
      `What I need back: ${outputs}, in the shape we use for ${task}.`,
      'Work from the inputs I give you. Put [placeholders] where something is missing rather than guessing. If anything is unclear, ask me one question before you start.',
      '',
      inputSlot,
    ].join('\n');
    const cadence = wf?.runsPerWeek
      ? `${wf.runsPerWeek} time${wf.runsPerWeek === 1 ? '' : 's'} a week`
      : 'more than anything else';
    const brief = `Try one real thing: write what you'd ask Claude for ${task}, then press Run.`;
    const practice: Practice = {
      ask: brief,
      kind: 'prompt',
      workflowName: wf?.name ?? task,
      prefill: { prompt: starterPrompt },
    };
    const exercise = this.exercises.create({
      personId: person.id,
      rung: 0,
      competencyCodes: ['L0.surfaces'],
      title: `Do one real thing: ${task}`.replace(/\s+/g, ' ').slice(0, 60),
      brief,
      rationale: `You do ${task} ${cadence}. Finishing one real run of it with Claude, start to end, is the quickest way to see what this is for; nothing to read first.`,
      kind: 'artifact',
      mode: 'in_app',
      workSurface: 'prompt',
      contextTag: slug(task) || 'first-task',
      workflowMapId: wf?.workflowMapId ?? null,
      skillId: null,
      hints: [
        primarySystem
          ? `Try pulling the real inputs from ${primarySystem} through the connector; if it is not turned on for you, paste them in.`
          : 'Try pasting in the real inputs you would use this week; the more real the material, the more useful the result.',
        'Try telling Claude who reads the result and what they will do with it.',
        'Try asking for the shape you actually use (headings, length, tone) instead of accepting the default.',
      ],
      workedExample: null,
      starter: { practice, starterPrompt, workflowName: wf?.name ?? null },
      status: 'queued',
      estimatedMinutes: 15,
      scheduledFor: new Date(),
      generatedBy: 'coach',
      hintsRevealed: 0,
    });
    const saved = await this.exercises.save(exercise);
    this.logger.log(
      `Coach set the first real task "${saved.title}" for ${person.id}`,
    );
    return saved;
  }

  private toExercise(
    out: NextExerciseOutput,
    person: Person,
    rung: number,
    surface: WorkSurface,
    allowedCodes: string[],
    targetCode: string,
    workflowIds: string[],
    opts: {
      kind?: Exercise['kind'];
      workflowMapId?: string | null;
      skillId?: string | null;
    },
  ): Partial<Exercise> & { starter: Record<string, unknown> } {
    const codes = out.competencyCodes
      .filter((c) => allowedCodes.includes(c) || COMPETENCY_BY_CODE.has(c))
      .slice(0, 2);
    if (codes.length === 0) codes.push(targetCode);
    const hints = out.hints.filter((h) => h.trim()).slice(0, 3);
    while (hints.length < 3)
      hints.push(
        [
          'Try writing the one sentence that says what "good" looks like for this task.',
          'Try naming who will read this and what they need to decide.',
          'Try listing goal, reader, format, limits and what to leave out before you run it.',
        ][hints.length],
      );
    const workflowMapId =
      opts.workflowMapId ??
      (out.workflowMapId && workflowIds.includes(out.workflowMapId)
        ? out.workflowMapId
        : null);
    return {
      personId: person.id,
      rung,
      competencyCodes: codes,
      title: out.title.replace(/\s+/g, ' ').trim().slice(0, 60),
      brief: firstSentence(out.brief) || out.brief,
      rationale: out.rationale,
      kind: opts.kind ?? out.kind ?? 'artifact',
      mode: 'in_app',
      workSurface: out.workSurface ?? surface,
      contextTag: slug(out.contextTag) || null,
      workflowMapId,
      skillId: opts.skillId ?? null,
      hints,
      workedExample:
        rung === 3 || out.workSurface === 'skill' ? out.workedExample : null,
      starter: {},
      status: 'queued',
      estimatedMinutes: Math.min(
        60,
        Math.max(5, Math.round(out.estimatedMinutes || 20)),
      ),
      scheduledFor: new Date(),
      generatedBy: opts.kind === 'adopt' ? 'adopt' : 'coach',
      hintsRevealed: 0,
    };
  }

  /** Build the v2 Practice object for a generated exercise from Coach's prefill fields, per kind. */
  private async practiceFor(
    out: NextExerciseOutput,
    draft: { brief?: string; title?: string; workSurface?: WorkSurface },
    workflow: WorkflowMap | null,
    person: Person,
  ): Promise<Practice> {
    const surface: WorkSurface =
      draft.workSurface ?? out.workSurface ?? 'prompt';
    const kind: PracticeKind = PRACTICE_KIND_FOR_SURFACE[surface] ?? 'prompt';
    const workflowName =
      (out.workflowName ?? '').trim() || workflow?.name || 'your weekly task';
    const ask = draft.brief ?? out.brief;
    const title = draft.title ?? out.title;
    const base = { ask, workflowName };
    const legacy = (ws: WorkSurface) =>
      practiceOf({
        brief: ask,
        title,
        workSurface: ws,
        starter: { workflowName },
      }).prefill;
    switch (kind) {
      case 'prompt':
        return {
          ...base,
          kind,
          prefill: {
            prompt:
              out.prefillPrompt?.trim() ||
              (legacy('prompt') as { prompt: string }).prompt,
            ...(out.prefillMaterial?.trim()
              ? { material: out.prefillMaterial.trim() }
              : {}),
          },
        };
      case 'project': {
        const fb = legacy('project') as {
          instructions: string;
          files: { name: string; content: string }[];
          testTask: string;
        };
        return {
          ...base,
          kind,
          prefill: {
            instructions: out.prefillInstructions?.trim() || fb.instructions,
            files: (out.prefillFiles ?? [])
              .filter((f) => f.name?.trim())
              .slice(0, 2),
            testTask: out.prefillTestTask?.trim() || fb.testTask,
          },
        };
      }
      case 'skill': {
        const reqs = (out.prefillSampleRequests ?? [])
          .map((r) => r.trim())
          .filter(Boolean);
        const defaults = legacy('skill') as {
          sampleRequests: [string, string, string];
        };
        const three = [...reqs, ...defaults.sampleRequests].slice(0, 3) as [
          string,
          string,
          string,
        ];
        return {
          ...base,
          kind,
          prefill: {
            skillMd: out.prefillSkillMd?.trim() || skillTemplate(workflowName),
            sampleRequests: three,
          },
        };
      }
      case 'workflow':
        return {
          ...base,
          kind,
          prefill: { schema: workflow?.schema ?? { purpose: workflowName } },
        };
      case 'review': {
        const submissionId = await this.teammateSubmissionForReview(person);
        return { ...base, kind, prefill: { submissionId: submissionId ?? '' } };
      }
    }
  }

  /** A teammate's latest submission (graded preferred, pending otherwise) for the review kind; null when none. */
  private async teammateSubmissionForReview(
    person: Person,
  ): Promise<string | null> {
    const candidates = await this.exercises.find({
      where: { status: In(['passed', 'revise', 'submitted', 'graded']) },
      order: { createdAt: 'DESC' },
      take: 40,
    });
    const others = candidates.filter(
      (e) => e.personId !== person.id && e.workSurface !== 'review',
    );
    if (others.length === 0) return null;
    const subs = await this.submissions.find({
      where: { exerciseId: In(others.map((e) => e.id)) },
      order: { submittedAt: 'DESC' },
    });
    if (subs.length === 0) return null;
    const graded = await this.grades.find({
      where: { submissionId: In(subs.map((s) => s.id)) },
    });
    const gradedIds = new Set(graded.map((g) => g.submissionId));
    return (subs.find((s) => gradedIds.has(s.id)) ?? subs[0]).id;
  }

  /** Weakest competency at the current rung not yet mastered; spacing: avoid the code the last exercise targeted when an alternative exists. */
  pickTarget(
    unlocked: CompetencyView[],
    rung: number,
    requested: string | null,
    last: Exercise | null,
  ): CompetencyView {
    if (requested) {
      const r = unlocked.find((c) => c.code === requested);
      if (r) return r;
    }
    const atRung = unlocked.filter((c) => c.rung === rung);
    const pool = atRung.length
      ? atRung
      : unlocked.length
        ? unlocked
        : COMPETENCY_CATALOG.filter((c) => c.rung === rung).map((c) => ({
            code: c.code,
            name: c.name,
            rung: c.rung,
            mastery: 0,
            components: {
              artifact: 0,
              consistency: 0,
              retention: 0,
              judgement: 0,
              contexts: 0,
            },
            threshold: c.masteryThreshold,
            minContexts: c.minContexts,
            status: 'in_progress' as const,
          }));
    const unmastered = pool.filter((c) => c.status !== 'mastered');
    const candidates = (unmastered.length ? unmastered : pool).sort(
      (a, b) =>
        a.mastery - b.mastery || a.components.contexts - b.components.contexts,
    );
    const spaced = candidates.filter(
      (c) => !last || !last.competencyCodes.includes(c.code),
    );
    return (spaced.length && candidates.length > 1 ? spaced : candidates)[0];
  }

  private async lastExercise(personId: string): Promise<Exercise | null> {
    return this.exercises.findOne({
      where: { personId },
      order: { createdAt: 'DESC' },
    });
  }

  async layersFor(
    person: Person,
    orgId: string | null,
  ): Promise<ContextLayer[]> {
    if (!orgId) return [];
    const where: FindOptionsWhere<ContextLayer>[] = [
      { orgId, layer: 'person', ownerId: person.id },
      { orgId, layer: 'company', ownerId: IsNull() },
    ];
    if (person.teamId)
      where.push({ orgId, layer: 'team', ownerId: person.teamId });
    const rows = await this.layers.find({ where });
    const order = { person: 0, team: 1, company: 2 };
    return rows.sort((a, b) => order[a.layer] - order[b.layer]);
  }

  // ───────────────────────── run / hints ─────────────────────────

  /**
   * Run Claude for the exercise's practice kind (tasks coach.run.prompt / .project / .skill / .workflow).
   * The body shape follows the kind; review has no Run (409). The last result is kept on starter.lastRun
   * so "Try again" keeps the learner's draft and output.
   */
  async run(
    exercise: Exercise,
    person: Person,
    orgId: string | null,
    body: Partial<RunBody> & Record<string, unknown>,
  ): Promise<RunResult> {
    const practice = practiceOf(exercise);
    const kind = practice.kind;
    if (kind === 'review')
      throw new ConflictException(
        'Review practice has no Run step: read the work, give it a score out of 10 and your notes, then submit.',
      );
    const [org, layers] = await Promise.all([
      orgId ? this.orgs.findOne({ where: { id: orgId } }) : null,
      this.layersFor(person, orgId),
    ]);
    const firmContext = [
      '# Firm compliance boundary and data stance',
      boundaryText(org?.settings?.boundary),
      dataStanceText(org?.settings?.boundary),
      layers.length
        ? `\n# Firm and team context (for vocabulary; do not treat as client data)\n${layers.map((l) => `${l.layer}: ${l.summary ?? ''}`).join('\n')}`
        : '',
    ].join('\n');
    const model = this.ai.provider === 'mock' ? 'mock' : this.ai.defaultModel;
    const common = {
      agent: 'coach',
      orgId,
      personId: person.id,
      effort: 'medium' as const,
    };
    let result: RunResult;
    let summary: Record<string, unknown>;

    if (kind === 'prompt') {
      const prompt = str(body.prompt);
      if (!prompt)
        throw new BadRequestException('prompt is required for this practice.');
      const material = str(body.material);
      const { text, runId } = await this.ai.text({
        ...common,
        task: 'coach.run.prompt',
        system: `${COACH_RUN_SYSTEM}\n\n${firmContext}`,
        messages: [
          {
            role: 'user',
            content: material ? `${prompt}\n\n---\n\n${material}` : prompt,
          },
        ],
        mockSeed: { prompt, material, exerciseId: exercise.id },
      });
      result = { kind, output: text, model, runId };
      summary = { prompt, material, output: text };
    } else if (kind === 'project') {
      const instructions = str(body.instructions);
      const testTask = str(body.testTask);
      const files = Array.isArray(body.files)
        ? (body.files as unknown[]).filter(
            (f): f is { name: string; content: string } =>
              !!f &&
              typeof f === 'object' &&
              typeof (f as { name?: unknown }).name === 'string',
          )
        : [];
      if (!instructions)
        throw new BadRequestException(
          'instructions are required for this practice.',
        );
      if (!testTask)
        throw new BadRequestException(
          'testTask is required for this practice.',
        );
      const projectBlock = [
        `# Project instructions\n${instructions}`,
        ...files.map((f) => `# Project file: ${f.name}\n${f.content ?? ''}`),
      ].join('\n\n');
      const { text, runId } = await this.ai.text({
        ...common,
        task: 'coach.run.project',
        system: `${COACH_RUN_SYSTEM}\n\n${firmContext}\n\n${projectBlock}`,
        messages: [{ role: 'user', content: testTask }],
        mockSeed: {
          instructions,
          files: files.map((f) => f.name),
          testTask,
          exerciseId: exercise.id,
        },
      });
      result = { kind, output: text, model, runId };
      summary = { instructions, files, testTask, output: text };
    } else if (kind === 'skill') {
      const skillMd = str(body.skillMd);
      const requests = Array.isArray(body.sampleRequests)
        ? (body.sampleRequests as unknown[])
            .map((r) => str(r))
            .filter(Boolean)
            .slice(0, 5)
        : [];
      if (!skillMd)
        throw new BadRequestException('skillMd is required for this practice.');
      if (requests.length === 0)
        throw new BadRequestException(
          'At least one sample request is required.',
        );
      const results: { request: string; fired: boolean; output: string }[] = [];
      for (const request of requests) {
        const out = await this.ai.structured(
          {
            ...common,
            task: 'coach.run.skill',
            system: `${COACH_SKILL_RUN_SYSTEM}\n\n${firmContext}`,
            messages: [
              {
                role: 'user',
                content: `# SKILL.md\n${skillMd}\n\n# Request from a teammate\n${request}`,
              },
            ],
            mockSeed: { skillMd, request, exerciseId: exercise.id },
          },
          SkillRunSchema,
        );
        results.push({ request, fired: out.fired, output: out.output });
      }
      result = { kind, results, model, runId: `skill-run-${Date.now()}` };
      summary = { skillMd, results };
    } else {
      const schema =
        body.schema && typeof body.schema === 'object'
          ? (body.schema as Record<string, unknown>)
          : null;
      if (!schema || Object.keys(schema).length === 0)
        throw new BadRequestException(
          'schema (the workflow map) is required for this practice.',
        );
      const { text, runId } = await this.ai.text({
        ...common,
        task: 'coach.run.workflow',
        system: `${COACH_WORKFLOW_DRAFT_SYSTEM}\n\n${firmContext}`,
        messages: [
          {
            role: 'user',
            content: `# Workflow map (${practice.workflowName})\n${JSON.stringify(schema, null, 2)}`,
          },
        ],
        mockSeed: {
          schema,
          workflowName: practice.workflowName,
          exerciseId: exercise.id,
        },
      });
      result = { kind, skillDraft: text, model, runId };
      summary = { schema, skillDraft: text };
    }

    const runs = Array.isArray(exercise.starter.runs)
      ? (exercise.starter.runs as unknown[])
      : [];
    exercise.starter = {
      ...exercise.starter,
      lastRun: {
        kind,
        ...summary,
        runId: result.runId,
        model,
        at: new Date().toISOString(),
      },
      runs: [
        ...runs.slice(-4),
        { runId: result.runId, kind, at: new Date().toISOString() },
      ],
    };
    if (exercise.status === 'queued') exercise.status = 'active';
    await this.exercises.save(exercise);
    return result;
  }

  /** Reveal the next hint (one at a time). */
  async hint(
    exercise: Exercise,
  ): Promise<{ hint: string; hintsRevealed: number; hintsTotal: number }> {
    const total = exercise.hints.length;
    if (exercise.hintsRevealed >= total)
      throw new ConflictException(
        `You have used all ${total} hints. Build it and check it in; a full example opens after your first result.`,
      );
    const hint = exercise.hints[exercise.hintsRevealed];
    exercise.hintsRevealed += 1;
    if (exercise.status === 'queued') exercise.status = 'active';
    await this.exercises.save(exercise);
    return { hint, hintsRevealed: exercise.hintsRevealed, hintsTotal: total };
  }

  /** Where the Coach greets the learner on an exercise. */
  coachIntro(exercise: Exercise, submissionsCount: number): string {
    const comp = exercise.competencyCodes
      .map((c) => COMPETENCY_BY_CODE.get(c)?.name ?? c)
      .join(' and ');
    if (submissionsCount === 0)
      return `This one sharpens ${comp.toLowerCase()}. ${exercise.rationale} Fill in the box, press Run to see what Claude makes, then submit for your score. Hints are there if you stall; take one at a time.`.trim();
    return `Round ${submissionsCount + 1} on ${comp.toLowerCase()}. Your draft is still here. Change the one thing from "what to change", run it again, and submit.`;
  }

  // ───────────────────────── skips & escalation ─────────────────────────

  async skip(
    exercise: Exercise,
    person: Person,
    orgId: string | null,
    reason: SkipReason,
    note?: string,
  ): Promise<{ escalated: boolean; nextUp: Exercise | null }> {
    exercise.status = 'skipped';
    exercise.completedAt = new Date();
    await this.exercises.save(exercise);
    const tag = reason === 'not_relevant' ? null : reason;
    await this.notes.save(
      this.notes.create({
        personId: person.id,
        note: `Skipped "${exercise.title}" (${reason})${note ? `: ${note}` : ''}.`,
        tags: tag ? [tag] : [],
        author: 'coach',
      }),
    );

    let escalated = false;
    if (reason === 'blocked') {
      const last = await this.notes.find({
        where: { personId: person.id },
        order: { createdAt: 'DESC' },
        take: 2,
      });
      if (
        last.length === 2 &&
        last.every((n) => n.tags.includes('blocked')) &&
        orgId
      ) {
        const team = person.teamId
          ? await this.teams.findOne({ where: { id: person.teamId } })
          : null;
        await this.escalations.save(
          this.escalations.create({
            orgId,
            sourceAgent: 'coach',
            kind: 'escalation',
            subjectType: 'person',
            subjectId: person.id,
            reason: `${person.name} skipped two exercises in a row as blocked (latest: "${exercise.title}"${note ? `; ${note}` : ''}). Coach cannot unblock this.`,
            assigneePersonId: team?.championPersonId ?? null,
            state: 'open',
            slaDueAt: new Date(Date.now() + 2 * DAY_MS),
          }),
        );
        await this.notes.save(
          this.notes.create({
            personId: person.id,
            note: 'Escalated to the champion after two consecutive blocked skips.',
            tags: ['escalated'],
            author: 'coach',
          }),
        );
        escalated = true;
      }
    }
    if (reason === 'not_relevant') {
      // Feed the signal back: the next exercise should avoid this context.
      exercise.contextTag = exercise.contextTag
        ? `${exercise.contextTag}`
        : exercise.contextTag;
    }
    await this.memory.record(person.id, orgId, {
      kind: 'exercise_skipped',
      note: `Skipped "${exercise.title}" (${reason})${note ? `: ${note.slice(0, 120)}` : ''}${escalated ? '; escalated to champion' : ''}.`,
      data: {
        exerciseTitle: exercise.title,
        skipReason: reason,
        workSurface: exercise.workSurface,
      },
    });
    const nextUp = await this.ensureNextUp(person, orgId);
    return { escalated, nextUp };
  }
}

function str(x: unknown): string {
  return typeof x === 'string' ? x.trim() : '';
}

function firstSentence(text: string): string {
  const t = (text ?? '').trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(t);
  return (m ? m[1] : t).trim();
}

function slug(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
