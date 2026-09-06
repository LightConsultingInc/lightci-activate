import { ConflictException, Injectable, Logger } from '@nestjs/common';
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
import { NextExerciseSchema, type NextExerciseOutput } from './ai-schemas';
import {
  COMPETENCY_BY_CODE,
  COMPETENCY_CATALOG,
  competenciesForRung,
} from './competency-catalog';
import { CoachNote } from './entities/coach-note.entity';
import { Exercise, type WorkSurface } from './entities/exercise.entity';
import { Grade } from './entities/grade.entity';
import { Submission } from './entities/submission.entity';
import type { CompetencyView } from './learning.types';
import { MasteryService } from './mastery.service';
import { MemoryService, type PersonMemory } from './memory.service';
import { COACH_RUN_SYSTEM, COACH_SYSTEM, boundaryText } from './prompts';
import { buildSituation } from './situation';
import './learning.mocks';

export type SkipReason = 'no_time' | 'blocked' | 'tool_issue' | 'not_relevant';

export interface RunInput {
  prompt: string;
  context?: string;
  project?: {
    instructions?: string;
    files?: { name: string; content: string }[];
  };
}

const SURFACE_FOR_RUNG: Record<number, WorkSurface> = {
  0: 'orientation',
  1: 'prompt',
  2: 'project',
  3: 'skill',
  4: 'workflow',
  5: 'review',
};

/**
 * Coach role: chooses and generates the next exercise from the learner's own context, runs Claude
 * inside the work surface, reveals hints one at a time, builds the "open in Claude" pack, and
 * handles skips with notes and escalation. Teaching moments are attached by the Grader at grading time.
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
   * used (for diversity) and the last exercise (spacing). Mode defaults to in_claude for L1–L2 learners
   * with no in-app history.
   */
  async generateNextExercise(
    person: Person,
    orgId: string | null,
    opts: {
      kind?: Exercise['kind'];
      workflowMapId?: string | null;
      skillId?: string | null;
      competencyCode?: string | null;
    } = {},
  ): Promise<Exercise> {
    const report = await this.mastery.report(person.id);
    const rung = report.rung;
    if (rung === 0 && !opts.kind && !opts.skillId) return this.generateFirstRealTask(person, orgId);
    const memory = await this.memory.get(person.id, orgId);
    const unlocked = report.competencies.filter((c) => c.status !== 'locked');
    const target = this.pickTarget(
      unlocked,
      rung,
      opts.competencyCode ?? null,
      await this.lastExercise(person.id),
    );
    const surface =
      SURFACE_FOR_RUNG[Math.min(5, Math.max(0, rung))] ?? 'prompt';
    const [layers, workflows, org, recent, inAppHistory] = await Promise.all([
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
      this.submissions.count({ where: { personId: person.id } }),
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
              memory.summary ? `Summary: ${memory.summary}` : 'Summary: (nothing yet)',
              `Strengths: ${memory.strengths.join('; ') || '(none recorded)'}`,
              `Struggles: ${memory.struggles.join('; ') || '(none recorded)'}`,
              `Preferences: ${memory.preferences.join('; ') || '(none recorded)'}`,
              '',
              '# Firm compliance boundary',
              boundaryText(org?.settings?.boundary),
              '',
              `Produce one exercise for the ${surface} surface${rung === 3 ? ' with a complete workedExample (unlocked after the first submission)' : ' (workedExample null)'}. Exactly three hints.`,
            ]
              .filter((line) => line !== '')
              .join('\n'),
          },
        ],
        mockSeed: {
          rung,
          struggles: memory.struggles,
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

    const exercise = this.exercises.create(
      this.toExercise(
        out,
        person,
        rung,
        surface,
        allowedCodes,
        target.code,
        workflows.map((w) => w.id),
        inAppHistory,
        opts,
      ),
    );
    exercise.mode = modeForPreferences(memory, exercise.mode);
    const saved = await this.exercises.save(exercise);
    this.logger.log(
      `Coach generated "${saved.title}" (${saved.competencyCodes.join(',')}) for ${person.id}`,
    );
    return saved;
  }

  /**
   * Rung 0 practice is one real task: a starter prompt already filled with the learner's role and their
   * most frequent workflow's inputs and outputs, done in Claude, no policy quiz and no reading surface.
   */
  async generateFirstRealTask(person: Person, orgId: string | null): Promise<Exercise> {
    const [layers, maps] = await Promise.all([
      this.layersFor(person, orgId),
      orgId ? this.workflows.find({ where: [{ ownerPersonId: person.id, orgId }, ...(person.teamId ? [{ teamId: person.teamId, orgId }] : [])], order: { updatedAt: 'DESC' }, take: 8 }) : Promise.resolve<WorkflowMap[]>([]),
    ]);
    const situation = buildSituation(person, layers.find((l) => l.layer === 'person') ?? null, maps.filter((m) => m.ownerPersonId === person.id).concat(maps.filter((m) => m.ownerPersonId !== person.id)));
    const wf = situation?.workflows[0] ?? null;
    const task = wf?.name ?? 'the task you do most';
    const role = situation?.role ?? person.title ?? 'professional';
    const inputs = wf?.inputs?.length ? wf.inputs.join(', ') : 'the notes I paste below';
    const outputs = wf?.outputs?.length ? wf.outputs.join(', ') : 'a finished draft I can use as it is';
    const systems = wf?.systems?.length ? ` We normally work in ${wf.systems.join(' and ')}.` : '';
    const brief = [
      `I am a ${role}. Help me with ${task}.${systems}`,
      `Inputs I will give you: ${inputs}.`,
      `What I need back: ${outputs}, in the shape we use for ${task}.`,
      'Use only the facts I give you. Put [placeholders] where something is missing rather than guessing. If anything is unclear, ask me one question before you start.',
      '',
      '[Paste your inputs here. No client names or account details.]',
    ].join('\n');
    const cadence = wf?.runsPerWeek ? `${wf.runsPerWeek} time${wf.runsPerWeek === 1 ? '' : 's'} a week` : 'more than anything else';
    const exercise = this.exercises.create({
      personId: person.id,
      rung: 0,
      competencyCodes: ['L0.surfaces'],
      title: `Do one real thing: ${task}`.replace(/\s+/g, ' ').slice(0, 60),
      brief,
      rationale: `You do ${task} ${cadence}. Finishing one real run of it with Claude, start to end, is the quickest way to see what this is for; nothing to read first.`,
      kind: 'artifact',
      mode: 'in_claude',
      workSurface: 'prompt',
      contextTag: slug(task) || 'first-task',
      workflowMapId: wf?.workflowMapId ?? null,
      skillId: null,
      hints: [
        'Try pasting in the real inputs you would use this week, with names and numbers swapped for placeholders.',
        'Try telling Claude who reads the result and what they will do with it.',
        'Try asking for the shape you actually use (headings, length, tone) instead of accepting the default.',
      ],
      workedExample: null,
      starter: { starterPrompt: brief, workflowName: wf?.name ?? null },
      status: 'queued',
      estimatedMinutes: 15,
      scheduledFor: new Date(),
      generatedBy: 'coach',
      hintsRevealed: 0,
    });
    const saved = await this.exercises.save(exercise);
    this.logger.log(`Coach set the first real task "${saved.title}" for ${person.id}`);
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
    inAppHistory: number,
    opts: {
      kind?: Exercise['kind'];
      workflowMapId?: string | null;
      skillId?: string | null;
    },
  ): Partial<Exercise> {
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
    const mode: Exercise['mode'] =
      rung <= 2 && inAppHistory === 0 ? 'in_claude' : 'in_app';
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
      brief: out.brief,
      rationale: out.rationale,
      kind: opts.kind ?? out.kind ?? 'artifact',
      mode,
      workSurface: out.workSurface ?? surface,
      contextTag: slug(out.contextTag) || null,
      workflowMapId,
      skillId: opts.skillId ?? null,
      hints,
      workedExample:
        rung === 3 || out.workSurface === 'skill' ? out.workedExample : null,
      starter: out.starterNotes ? { notes: out.starterNotes } : {},
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

  // ───────────────────────── run / hints / pack ─────────────────────────

  /** L1/L2 "run Claude" inside the work surface (task coach.run). Requires a stated expectation (enforced by the controller). */
  async run(
    exercise: Exercise,
    person: Person,
    orgId: string | null,
    input: RunInput,
  ): Promise<{ output: string; model: string; runId: string }> {
    const [org, layers] = await Promise.all([
      orgId ? this.orgs.findOne({ where: { id: orgId } }) : null,
      this.layersFor(person, orgId),
    ]);
    const projectBlock = input.project
      ? [
          `# Project instructions\n${input.project.instructions ?? '(none)'}`,
          ...(input.project.files ?? []).map(
            (f) => `# Project file: ${f.name}\n${f.content}`,
          ),
        ].join('\n\n')
      : '';
    const system = [
      COACH_RUN_SYSTEM,
      '',
      '# Firm compliance boundary',
      boundaryText(org?.settings?.boundary),
      layers.length
        ? `\n# Firm and team context (for vocabulary; do not treat as client data)\n${layers.map((l) => `${l.layer}: ${l.summary ?? ''}`).join('\n')}`
        : '',
      projectBlock ? `\n${projectBlock}` : '',
    ].join('\n');
    const content = input.context
      ? `${input.context.trim()}\n\n---\n\n${input.prompt}`
      : input.prompt;
    const { text, runId } = await this.ai.text({
      agent: 'coach',
      task: 'coach.run',
      orgId,
      personId: person.id,
      effort: 'medium',
      system,
      messages: [{ role: 'user', content }],
      mockSeed: { prompt: input.prompt, exerciseId: exercise.id },
    });
    const model = this.ai.provider === 'mock' ? 'mock' : this.ai.defaultModel;
    const runs = Array.isArray(exercise.starter.runs)
      ? (exercise.starter.runs as unknown[])
      : [];
    exercise.starter = {
      ...exercise.starter,
      lastRun: {
        prompt: input.prompt,
        output: text,
        runId,
        model,
        at: new Date().toISOString(),
      },
      runs: [
        ...runs.slice(-4),
        {
          runId,
          at: new Date().toISOString(),
          promptChars: input.prompt.length,
        },
      ],
    };
    if (exercise.status === 'queued') exercise.status = 'active';
    await this.exercises.save(exercise);
    return { output: text, model, runId };
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

  /** The copy-ready pack for in_claude mode. */
  async openInClaudePack(
    exercise: Exercise,
    person: Person,
    orgId: string | null,
  ): Promise<{ prompt: string; contextBundle: string }> {
    const [org, layers, workflow] = await Promise.all([
      orgId ? this.orgs.findOne({ where: { id: orgId } }) : null,
      this.layersFor(person, orgId),
      exercise.workflowMapId
        ? this.workflows.findOne({ where: { id: exercise.workflowMapId } })
        : null,
    ]);
    const comps = exercise.competencyCodes
      .map((c) => COMPETENCY_BY_CODE.get(c))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
    const prompt = [
      `I am doing a LightCI Activate exercise (L${exercise.rung}, "${exercise.title}").`,
      '',
      exercise.brief,
      '',
      'Before you produce anything, ask me for a one-line guess of what I think will come back, and wait for it. After your output, ask me to run through a short self-check (does it only use facts I gave it, is it for the right reader, is it the right shape) before we refine anything. Give me nudges before answers if I get stuck.',
      'Use placeholders for any client-specific detail; do not invent client data.',
    ].join('\n');
    const contextBundle = [
      `# Exercise context for Claude`,
      `Skills this builds: ${comps.map((c) => `${c.name} — ${c.description}`).join('\n')}`,
      '',
      `# Firm boundary`,
      boundaryText(org?.settings?.boundary),
      '',
      ...(layers.length
        ? [
            `# Context`,
            ...layers.map(
              (l) =>
                `${l.layer}: ${l.summary ?? ''}${l.vocabulary.length ? `\nVocabulary: ${l.vocabulary.map((v) => `${v.term} = ${v.meaning}`).join('; ')}` : ''}`,
            ),
            '',
          ]
        : []),
      ...(workflow
        ? [
            `# Workflow: ${workflow.name}`,
            JSON.stringify(workflow.schema, null, 2),
            '',
          ]
        : []),
      '# When you are done',
      'Paste what you built back into Activate with your one-line guess and your self-check; the result covers both.',
    ].join('\n');
    if (exercise.status === 'queued') {
      exercise.status = 'active';
      await this.exercises.save(exercise);
    }
    return { prompt, contextBundle };
  }

  /** Where the Coach greets the learner on an exercise. */
  coachIntro(exercise: Exercise, submissionsCount: number): string {
    const comp = exercise.competencyCodes
      .map((c) => COMPETENCY_BY_CODE.get(c)?.name ?? c)
      .join(' and ');
    if (submissionsCount === 0)
      return `This one sharpens ${comp.toLowerCase()}. ${exercise.rationale} Build it, jot a one-line guess of what will come back, tick the self-check, then check it in for your result. Hints are there if you stall; take one at a time. ${exercise.workedExample ? 'A full example opens after your first result.' : ''}`.trim();
    return `Round ${submissionsCount + 1} on ${comp.toLowerCase()}. Re-read the one thing to do differently from your last result and change exactly that; say what you changed in your guess.`;
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
      data: { exerciseTitle: exercise.title, skipReason: reason, mode: exercise.mode, workSurface: exercise.workSurface },
    });
    const nextUp = await this.ensureNextUp(person, orgId);
    return { escalated, nextUp };
  }
}

/** Honour stated working preferences: typing-only / in-app → in_app; "in Claude" → in_claude. */
export function modeForPreferences(memory: Pick<PersonMemory, 'preferences'>, fallback: Exercise['mode']): Exercise['mode'] {
  const prefs = memory.preferences.join(' | ').toLowerCase();
  if (/typing[- ]only|prefers? (to )?typ(e|ing)|in[- ]app|no claude|stay(s)? in (the )?app/.test(prefs)) return 'in_app';
  if (/prefers? (working |doing it )?in claude|open in claude/.test(prefs)) return 'in_claude';
  return fallback;
}

function slug(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
