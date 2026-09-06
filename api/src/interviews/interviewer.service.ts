import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Exercise } from '../learning/entities/exercise.entity';
import { In, IsNull, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import type { ZodType } from 'zod';
import { AiService } from '../ai/ai.service';
import { ContextLayer } from '../context/entities/context-layer.entity';
import { ContextSource } from '../context/entities/context-source.entity';
import { CoachService } from '../learning/coach.service';
import { Placement } from '../learning/entities/placement.entity';
import type { ExerciseSummary } from '../learning/learning.types';
import { toExerciseSummary } from '../learning/mappers';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import {
  WorkflowMap,
  type WorkflowSchema,
} from '../workflows/entities/workflow-map.entity';
import {
  InterviewSession,
  type InterviewTurn,
} from './entities/interview-session.entity';
import {
  INTERVIEW_PLAN,
  INTERVIEWER_COMPLETE_SYSTEM,
  INTERVIEWER_SCRIBE_SYSTEM,
  INTERVIEWER_SYSTEM,
  MODE_BRIEF,
  OPENING_QUESTION,
  renderInterviewState,
} from './interviewer.prompts';
import {
  completeSchemaFor,
  schemaCompleteness,
  scribeSchemaFor,
  stripNulls,
  turnSchemaFor,
  WORKFLOW_SCHEMA_KEYS,
  type ChampionCompleteOutput,
  type IntakeCompleteOutput,
  type WorkflowCompleteOutput,
  type WorkflowScribe,
  compactMapToScribe,
  type WorkflowMapOutT,
} from './interviewer.schemas';
import type {
  InterviewCompleteResponse,
  InterviewMode,
  InterviewView,
} from './interviews.types';
import './interviewer.mocks';

export const FINISH_COMPLETENESS = 0.85;
export const FINISH_TURNS = 14;
/** Per-call ceiling for interviewer Claude calls (turn, scribe, complete). */
export const AI_TIMEOUT_MS = 120_000;
/** Spoken turns rendered into a prompt; older turns are summarised by the scribe state. */
export const PROMPT_TURNS = 40;
/** Budget for the first Coach exercise inside intake completion; past it we fall back to the queue. */
const FIRST_EXERCISE_BUDGET_MS = 90_000;

/**
 * Interviewer role (assistant / scribe / checker). Persists transcript, scribe draft and checker flags
 * on InterviewSession; `complete()` turns the interview into ContextLayer, WorkflowMaps, a diagnostic
 * Placement and the first exercise (intake), team context and seed maps (champion), or a filled map (workflow).
 */
@Injectable()
export class InterviewerService {
  private readonly logger = new Logger(InterviewerService.name);
  /** In-flight completions by session id so a double call (finish button + voice flush) runs once. */
  private readonly completing = new Map<
    string,
    Promise<InterviewCompleteResponse>
  >();

  constructor(
    @InjectRepository(InterviewSession)
    private readonly sessions: Repository<InterviewSession>,
    @InjectRepository(WorkflowMap)
    private readonly workflows: Repository<WorkflowMap>,
    @InjectRepository(ContextLayer)
    private readonly layers: Repository<ContextLayer>,
    @InjectRepository(ContextSource)
    private readonly sources: Repository<ContextSource>,
    @InjectRepository(Placement)
    private readonly placements: Repository<Placement>,
    @InjectRepository(Person) private readonly people: Repository<Person>,
    @InjectRepository(Exercise)
    private readonly exercises: Repository<Exercise>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    private readonly ai: AiService,
    private readonly coach: CoachService,
  ) {}

  // ───────────────────────── lifecycle ─────────────────────────

  async start(
    person: Person,
    orgId: string,
    input: {
      mode: InterviewMode;
      workflowMapId?: string | null;
      teamId?: string | null;
      voice?: boolean;
    },
  ): Promise<InterviewSession> {
    if (input.mode === 'workflow' && input.workflowMapId) {
      const wf = await this.workflows.findOne({
        where: { id: input.workflowMapId, orgId },
      });
      if (!wf)
        throw new NotFoundException('Workflow map not found in this org');
    }
    if (
      input.mode === 'champion' &&
      !person.roles.some((r) =>
        ['champion', 'sponsor', 'admin', 'lead'].includes(r),
      )
    )
      throw new ForbiddenException(
        'Champion interviews are for champions (or sponsors/admins).',
      );
    const existingWorkflow =
      input.mode === 'workflow' && input.workflowMapId
        ? await this.workflows.findOne({ where: { id: input.workflowMapId } })
        : null;
    const now = new Date().toISOString();
    const session = this.sessions.create({
      orgId,
      personId: person.id,
      mode: input.mode,
      workflowMapId: input.workflowMapId ?? null,
      teamId: input.teamId ?? person.teamId ?? null,
      transcript: [
        { role: 'interviewer', content: OPENING_QUESTION[input.mode], at: now },
      ],
      scribe: existingWorkflow ? { ...(existingWorkflow.schema ?? {}) } : {},
      checkerFlags: [],
      completeness: existingWorkflow
        ? schemaCompleteness('workflow', existingWorkflow.schema)
        : 0,
      status: 'active',
      voice: Boolean(input.voice),
      turnCount: 0,
      result: null,
    });
    return this.sessions.save(session);
  }

  async load(id: string, orgId: string): Promise<InterviewSession> {
    const session = await this.sessions.findOne({ where: { id, orgId } });
    if (!session) throw new NotFoundException('Interview not found');
    return session;
  }

  /** self, or champion/sponsor/admin/lead of the same org. */
  async assertCanView(session: InterviewSession, user: Person): Promise<void> {
    if (session.personId === user.id) return;
    if (user.roles.some((r) => ['sponsor', 'admin', 'lead'].includes(r)))
      return;
    if (user.roles.includes('champion')) {
      const subject = await this.people.findOne({
        where: { id: session.personId },
      });
      if (subject?.teamId && subject.teamId === user.teamId) return;
      const team = subject?.teamId
        ? await this.teams.findOne({ where: { id: subject.teamId } })
        : null;
      if (team?.championPersonId === user.id) return;
    }
    throw new ForbiddenException('You cannot view this interview.');
  }

  view(session: InterviewSession): InterviewView {
    const transcript = session.transcript.filter(
      (t): t is InterviewTurn & { role: 'interviewer' | 'user' } =>
        t.role === 'interviewer' || t.role === 'user',
    );
    const nextQuestion =
      [...transcript].reverse().find((t) => t.role === 'interviewer')
        ?.content ?? OPENING_QUESTION[session.mode];
    return {
      id: session.id,
      mode: session.mode,
      status: session.status,
      completeness: session.completeness,
      transcript: transcript.map((t) => ({
        role: t.role,
        content: t.content,
        at: t.at,
        ...(t.via ? { via: t.via } : {}),
      })),
      scribe: session.scribe,
      checkerFlags: session.checkerFlags,
      turnCount: session.turnCount,
      nextQuestion,
      result: session.result,
      voice: session.voice,
      finished: session.status === 'complete' || Boolean((session.result as Record<string, unknown> | null)?.finishedByInterviewer),
      proposeFinish:
        session.status === 'active' &&
        (session.completeness >= FINISH_COMPLETENESS ||
          session.turnCount >= FINISH_TURNS),
    };
  }

  // ───────────────────────── turns ─────────────────────────

  /** One learner turn: append, then ask Claude (task interviewer.turn) for the next question, scribe update and checker flags. */
  async turn(
    session: InterviewSession,
    content: string,
  ): Promise<InterviewSession> {
    if (session.status !== 'active')
      throw new ConflictException('This interview is already complete.');
    const text = content.trim();
    if (!text) throw new BadRequestException('content is required');
    session.transcript = [
      ...session.transcript,
      { role: 'user', content: text, at: new Date().toISOString() },
    ];
    session.turnCount += 1;
    return this.runScribe(session);
  }

  /**
   * Voice: append turns spoken in the Realtime session (the agent is the interviewer there), then run the
   * scribe + checker only (task interviewer.scribe). No question is generated; `view()` returns the
   * agent's last spoken question as `nextQuestion`. Writes are conditional on `status = 'active'` so a
   * flush that lands while `complete()` is finishing can never reopen the interview.
   */
  async appendVoiceTranscript(
    session: InterviewSession,
    turns: { role: 'user' | 'interviewer'; content: string }[],
  ): Promise<InterviewSession> {
    if (session.status !== 'active')
      throw new ConflictException('This interview is already complete.');
    const clean = turns
      .map((t) => ({ role: t.role, content: (t.content ?? '').trim() }))
      .filter((t) => t.content);
    if (clean.length === 0)
      throw new BadRequestException(
        'turns must contain at least one non-empty turn',
      );
    const at = new Date().toISOString();
    session.transcript = [
      ...session.transcript,
      ...clean.map((t) => ({
        role: t.role,
        content: t.content,
        at,
        via: 'voice' as const,
      })),
    ];
    session.turnCount += clean.filter((t) => t.role === 'user').length;
    session.voice = true;
    if (session.turnCount === 0) return this.saveIfActive(session);
    const out = await this.ai.structured(
      {
        agent: 'interviewer',
        task: 'interviewer.scribe',
        orgId: session.orgId,
        personId: session.personId,
        effort: 'low',
        maxTokens: 4000,
        timeoutMs: AI_TIMEOUT_MS,
        system: `${INTERVIEWER_SCRIBE_SYSTEM}\n\n${MODE_BRIEF[session.mode]}`,
        messages: [
          {
            role: 'user',
            content: renderInterviewState(
              session,
              'Produce the scribe update, checker flags and completeness for everything said so far.',
              PROMPT_TURNS,
            ),
          },
        ],
        mockSeed: this.mockSeed(session),
      },
      scribeSchemaFor(session.mode),
    );
    this.applyScribe(session, out);
    return this.saveIfActive(session);
  }

  private async runScribe(
    session: InterviewSession,
  ): Promise<InterviewSession> {
    const out = await this.ai.structured(
      {
        agent: 'interviewer',
        task: 'interviewer.turn',
        orgId: session.orgId,
        personId: session.personId,
        effort: 'low',
        maxTokens: 4000,
        timeoutMs: AI_TIMEOUT_MS,
        system: `${INTERVIEWER_SYSTEM}\n\n${MODE_BRIEF[session.mode]}\n\nInterview plan (in order):\n${INTERVIEW_PLAN[session.mode].map((p, i) => `${i + 1}. ${p}`).join('\n')}`,
        messages: [
          {
            role: 'user',
            content: renderInterviewState(
              session,
              'Turns marked "(voice)" were spoken in a voice session and count as answered. Produce the next question, the scribe update, checker flags, completeness and whether to propose finishing.',
              PROMPT_TURNS,
            ),
          },
        ],
        mockSeed: this.mockSeed(session),
      },
      turnSchemaFor(session.mode),
    );
    this.applyScribe(session, out);
    // The model decides when the interview ends (out.finish); no text matching, no forced wrap-up suffix.
    const nextQuestion = out.nextQuestion.trim();
    if (out.finish) session.result = { ...(session.result ?? {}), finishedByInterviewer: true };
    session.transcript = [
      ...session.transcript,
      {
        role: 'interviewer' as const,
        content: nextQuestion,
        at: new Date().toISOString(),
      },
    ];
    return this.saveIfActive(session);
  }

  private mockSeed(session: InterviewSession): Record<string, unknown> {
    const lastUser =
      [...session.transcript].reverse().find((t) => t.role === 'user')
        ?.content ?? '';
    return {
      mode: session.mode,
      turnCount: session.turnCount,
      lastUser,
      scribe: session.scribe,
    };
  }

  /** Merge a scribe/checker output into the session and append the scribe/checker transcript rows. */
  private applyScribe(
    session: InterviewSession,
    out: {
      scribeUpdate: unknown;
      checkerFlags: { field: string; issue: string }[];
      completeness: number;
    },
  ): void {
    const update = stripNulls(out.scribeUpdate as Record<string, unknown>);
    session.scribe = { ...session.scribe, ...update };
    session.checkerFlags = out.checkerFlags.slice(0, 12);
    const local = schemaCompleteness(session.mode, session.scribe);
    session.completeness =
      Math.round(
        Math.min(
          1,
          Math.max(0, Math.max(local * 0.9, Math.min(1, out.completeness))),
        ) * 100,
      ) / 100;
    const at = new Date().toISOString();
    session.transcript = [
      ...session.transcript,
      ...(Object.keys(update).length
        ? [{ role: 'scribe' as const, content: JSON.stringify(update), at }]
        : []),
      ...(session.checkerFlags.length
        ? [
            {
              role: 'checker' as const,
              content: JSON.stringify(session.checkerFlags),
              at,
            },
          ]
        : []),
    ];
  }

  /**
   * Persist turn state only while the row is still active (a concurrent `complete()` wins). Returns the
   * row as stored, so a caller racing completion sees `status: 'complete'` rather than a stale copy.
   */
  private async saveIfActive(
    session: InterviewSession,
  ): Promise<InterviewSession> {
    const patch: Partial<InterviewSession> = {
      transcript: session.transcript,
      scribe: session.scribe,
      checkerFlags: session.checkerFlags,
      completeness: session.completeness,
      turnCount: session.turnCount,
      voice: session.voice,
    };
    const res = await this.sessions.update(
      { id: session.id, status: 'active' },
      patch as QueryDeepPartialEntity<InterviewSession>,
    );
    if (res.affected === 0) {
      const fresh = await this.sessions.findOne({ where: { id: session.id } });
      if (fresh) return fresh;
    }
    return session;
  }

  // ───────────────────────── completion ─────────────────────────

  /**
   * Idempotent: an already-complete session returns its stored result; concurrent calls for the same
   * session share one run. The row is re-read first so voice turns flushed just before (or alongside)
   * the finish call are included.
   */
  async complete(
    session: InterviewSession,
    user: Person,
    orgId: string,
  ): Promise<InterviewCompleteResponse> {
    const inflight = this.completing.get(session.id);
    if (inflight) return inflight;
    const run = this.completeOnce(session, user, orgId).finally(() =>
      this.completing.delete(session.id),
    );
    this.completing.set(session.id, run);
    return run;
  }

  private async completeOnce(
    stale: InterviewSession,
    user: Person,
    orgId: string,
  ): Promise<InterviewCompleteResponse> {
    const session =
      (await this.sessions.findOne({ where: { id: stale.id, orgId } })) ??
      stale;
    if (session.status === 'complete') {
      const ids = (session.result?.exerciseIds as string[] | undefined) ?? [];
      const prior = ids.length
        ? await this.exercises.find({ where: { id: In(ids) } })
        : await this.exercises.find({
            where: {
              personId: session.personId,
              status: In(['active', 'queued']),
            },
            order: { createdAt: 'ASC' },
            take: 1,
          });
      return {
        interview: this.view(session),
        workflowMapIds:
          (session.result?.workflowMapIds as string[] | undefined) ?? [],
        exercises: prior.map(toExerciseSummary),
        ...(session.result?.placement
          ? {
              placement: session.result.placement as {
                rung: number;
                evidence: string[];
              },
            }
          : {}),
      };
    }
    if (session.turnCount === 0)
      throw new ConflictException(
        'Answer at least one question before completing the interview.',
      );
    const subject =
      (await this.people.findOne({ where: { id: session.personId } })) ?? user;
    const out: unknown = await this.ai.structured<unknown>(
      {
        agent: 'interviewer',
        task: 'interviewer.complete',
        orgId,
        personId: session.personId,
        effort: 'low',
        maxTokens: 6000,
        timeoutMs: AI_TIMEOUT_MS,
        system: `${INTERVIEWER_COMPLETE_SYSTEM}\n\n${MODE_BRIEF[session.mode]}`,
        messages: [
          {
            role: 'user',
            content: renderInterviewState(
              session,
              'Turns marked "(voice)" were spoken in a voice session. Produce the final structured result for this mode.',
              PROMPT_TURNS,
            ),
          },
        ],
        mockSeed: {
          mode: session.mode,
          turnCount: session.turnCount,
          scribe: session.scribe,
        },
      },
      completeSchemaFor(session.mode) as ZodType<unknown>,
    );

    let workflowMapIds: string[] = [];
    let placement: { rung: number; evidence: string[] } | undefined;
    let exercises: ExerciseSummary[] = [];

    if (session.mode === 'intake') {
      const r = out as IntakeCompleteOutput;
      const profile = r.profile;
      subject.profile = {
        responsibilities: profile.responsibilities,
        weeklyWorkflows: profile.weeklyWorkflows.map((w) => w.name),
        claudeUseToday: profile.claudeUseToday,
        selfRatedComfort: profile.selfRatedComfort,
        systems: [
          ...new Set(profile.weeklyWorkflows.flatMap((w) => w.systems)),
        ],
      };
      if (!subject.title && profile.role)
        subject.title = profile.role.slice(0, 120);
      subject.onboardedAt = subject.onboardedAt ?? new Date();
      await this.people.save(subject);
      await this.upsertLayer(orgId, 'person', subject.id, r.contextLayer);
      await this.saveSource(orgId, 'person', subject.id, session, 'intake');
      const maps = r.workflowMaps.slice(0, 4);
      workflowMapIds = await this.createMaps(
        orgId,
        subject,
        session,
        maps.length >= 2
          ? maps
          : [
              ...maps,
              ...profile.weeklyWorkflows.slice(maps.length, 2).map((w) => ({
                name: w.name,
                schema: {
                  ...emptyWorkflowScribe(),
                  minutesPerRun: w.minutesPerRun,
                  runsPerWeek: w.runsPerWeek,
                  systems: w.systems,
                },
              })),
            ],
      );
      const rung = Math.min(2, Math.max(0, Math.round(r.placement.rung)));
      placement = { rung, evidence: r.placement.evidence };
      await this.placements.save(
        this.placements.create({
          personId: subject.id,
          rung,
          by: 'diagnostic',
          evidence: {
            interviewSessionId: session.id,
            evidence: r.placement.evidence,
            selfRatedComfort: profile.selfRatedComfort,
          },
        }),
      );
      try {
        // Bounded: a slow Coach call must not hold the completion response (a live run hit 13m on a
        // connection error inside the SDK's retries); the queued-exercise fallback below covers it.
        const first = await withBudget(
          this.coach.generateNextExercise(subject, orgId, {
            workflowMapId: workflowMapIds[0] ?? null,
          }),
          FIRST_EXERCISE_BUDGET_MS,
          'coach.next-exercise',
        );
        exercises = [toExerciseSummary(first)];
      } catch (error) {
        this.logger.warn(
          `First exercise after intake failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (exercises.length === 0) {
        // Fall back to whatever Coach already has queued so the learner always leaves intake with a next step.
        const queued = await this.exercises.find({
          where: { personId: subject.id, status: In(['active', 'queued']) },
          order: { createdAt: 'ASC' },
          take: 1,
        });
        exercises = queued.map(toExerciseSummary);
      }
      session.result = {
        profile,
        workflowMapIds,
        placement,
        contextLayer: r.contextLayer,
        exerciseIds: exercises.map((e) => e.id),
      };
    } else if (session.mode === 'champion') {
      const r = out as ChampionCompleteOutput;
      const teamId = session.teamId ?? subject.teamId;
      if (!teamId)
        throw new BadRequestException(
          'A champion interview needs a team (teamId).',
        );
      const team = await this.teams.findOne({ where: { id: teamId, orgId } });
      if (!team) throw new NotFoundException('Team not found in this org');
      await this.upsertLayer(orgId, 'team', teamId, r.contextLayer);
      await this.saveSource(orgId, 'team', teamId, session, 'interview');
      if (!team.purpose && r.teamPurpose) {
        team.purpose = r.teamPurpose.slice(0, 500);
        await this.teams.save(team);
      }
      workflowMapIds = await this.createMaps(
        orgId,
        subject,
        session,
        r.workflowMaps.slice(0, 6),
        teamId,
      );
      // Scorer run: WorkflowsModule owns ScorerService; maps are left as 'candidate' for POST /workflows/rescore.
      session.result = {
        teamPurpose: r.teamPurpose,
        priorities: r.priorities,
        workflowMapIds,
        contextLayer: r.contextLayer,
        scorerRun: 'pending',
      };
    } else {
      const r = out as WorkflowCompleteOutput;
      const schema = toWorkflowSchema({
        ...session.scribe,
        ...stripNulls(r.schema as Record<string, unknown>),
      });
      let map = session.workflowMapId
        ? await this.workflows.findOne({
            where: { id: session.workflowMapId, orgId },
          })
        : null;
      if (!map) {
        map = this.workflows.create({
          orgId,
          teamId: session.teamId ?? subject.teamId ?? null,
          ownerPersonId: subject.id,
          name: r.name ?? schema.purpose?.slice(0, 80) ?? 'Mapped workflow',
          schema: {},
          status: 'candidate',
          linkedSkillIds: [],
        });
      }
      map.schema = { ...(map.schema ?? {}), ...schema };
      map.completeness = Math.max(
        schemaCompleteness('workflow', map.schema),
        Math.min(1, r.completeness),
      );
      map.interviewSessionId = session.id;
      if (r.name && (!map.name || map.name === 'Mapped workflow'))
        map.name = r.name;
      map = await this.workflows.save(map);
      workflowMapIds = [map.id];
      await this.saveSource(orgId, 'person', subject.id, session, 'interview');
      session.result = {
        workflowMapIds,
        completeness: map.completeness,
        openQuestions: r.openQuestions,
      };
    }

    // Re-read before the final write so a voice flush that landed during the Claude call is kept.
    const latest =
      (await this.sessions.findOne({ where: { id: session.id } })) ?? session;
    latest.result = session.result;
    latest.status = 'complete';
    latest.completedAt = new Date();
    if (latest.completeness < FINISH_COMPLETENESS)
      latest.completeness = Math.max(
        latest.completeness,
        schemaCompleteness(latest.mode, latest.scribe),
      );
    const saved = await this.sessions.save(latest);
    return {
      interview: this.view(saved),
      workflowMapIds,
      ...(placement ? { placement } : {}),
      exercises,
    };
  }

  /** Champion verification: mark the interview's workflow maps verified (with optional corrections applied to a single-map interview). */
  async verify(
    session: InterviewSession,
    champion: Person,
    approved: boolean,
    corrections?: Partial<WorkflowSchema>,
  ): Promise<InterviewSession> {
    const ids = session.workflowMapId
      ? [session.workflowMapId]
      : ((session.result?.workflowMapIds as string[] | undefined) ?? []);
    if (ids.length) {
      const maps = await this.workflows.find({
        where: { id: In(ids), orgId: session.orgId },
      });
      for (const map of maps) {
        if (
          corrections &&
          (ids.length === 1 || map.id === session.workflowMapId)
        ) {
          map.schema = { ...(map.schema ?? {}), ...corrections };
          map.completeness = Math.max(
            map.completeness,
            schemaCompleteness('workflow', map.schema),
          );
        }
        map.championVerified = approved;
        await this.workflows.save(map);
      }
    }
    if (corrections && session.mode === 'workflow')
      session.scribe = { ...session.scribe, ...corrections };
    session.result = {
      ...(session.result ?? {}),
      championVerified: approved,
      verifiedBy: champion.id,
      verifiedAt: new Date().toISOString(),
    };
    return this.sessions.save(session);
  }

  // ───────────────────────── persistence helpers ─────────────────────────

  private async createMaps(
    orgId: string,
    owner: Person,
    session: InterviewSession,
    maps: (
      | { name: string; schema: WorkflowScribe | Record<string, unknown> }
      | WorkflowMapOutT
    )[],
    teamId?: string | null,
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const m of maps) {
      const raw =
        'schema' in m
          ? (m.schema as Record<string, unknown>)
          : compactMapToScribe(m);
      const schema = toWorkflowSchema(stripNulls(raw));
      const row = await this.workflows.save(
        this.workflows.create({
          orgId,
          teamId: teamId ?? session.teamId ?? owner.teamId ?? null,
          ownerPersonId: owner.id,
          name: m.name.slice(0, 120),
          schema,
          completeness: schemaCompleteness(
            'workflow',
            schema as Record<string, unknown>,
          ),
          championVerified: false,
          status: 'candidate',
          linkedSkillIds: [],
          interviewSessionId: session.id,
          nextWave: false,
        }),
      );
      ids.push(row.id);
    }
    return ids;
  }

  private async upsertLayer(
    orgId: string,
    layer: 'person' | 'team',
    ownerId: string,
    data: {
      summary: string;
      vocabulary: { term: string; meaning: string }[];
      anchorWorkflows: string[];
      sensitivities: string[];
      systems: string[];
    },
  ): Promise<ContextLayer> {
    const existing = await this.layers.findOne({
      where: { orgId, layer, ownerId },
    });
    const row =
      existing ?? this.layers.create({ orgId, layer, ownerId, version: 0 });
    row.summary = data.summary;
    row.vocabulary = mergeBy(existing?.vocabulary ?? [], data.vocabulary, (v) =>
      v.term.toLowerCase(),
    );
    row.anchorWorkflows = uniq([
      ...(existing?.anchorWorkflows ?? []),
      ...data.anchorWorkflows,
    ]);
    row.sensitivities = uniq([
      ...(existing?.sensitivities ?? []),
      ...data.sensitivities,
    ]);
    row.systems = uniq([...(existing?.systems ?? []), ...data.systems]);
    row.version = (existing?.version ?? 0) + 1;
    return this.layers.save(row);
  }

  private async saveSource(
    orgId: string,
    layer: 'person' | 'team',
    ownerId: string,
    session: InterviewSession,
    type: 'intake' | 'interview',
  ): Promise<void> {
    const existing = await this.sources.findOne({
      where: {
        orgId,
        layer,
        ownerId: ownerId ?? IsNull(),
        type,
        uri: `interview:${session.id}`,
      },
    });
    if (existing) return;
    await this.sources.save(
      this.sources.create({
        orgId,
        layer,
        ownerId,
        type,
        title: `${session.mode} interview ${new Date().toISOString().slice(0, 10)}`,
        uri: `interview:${session.id}`,
        content: session.transcript
          .filter((t) => t.role === 'interviewer' || t.role === 'user')
          .map((t) => `${t.role}: ${t.content}`)
          .join('\n'),
        reviewState: 'pending',
        tags: { mode: session.mode, interviewSessionId: session.id },
      }),
    );
  }
}

function emptyWorkflowScribe(): WorkflowScribe {
  return {
    purpose: null,
    trigger: null,
    frequency: null,
    minutesPerRun: null,
    runsPerWeek: null,
    inputs: null,
    steps: null,
    decisions: null,
    exceptions: null,
    systems: null,
    mustNeverLeave: null,
    outputs: null,
    humanReview: null,
  };
}

/** Keep only WorkflowSchema keys and coerce step systems to strings. */
export function toWorkflowSchema(
  obj: Record<string, unknown>,
): Partial<WorkflowSchema> {
  const out: Record<string, unknown> = {};
  for (const key of WORKFLOW_SCHEMA_KEYS)
    if (obj[key] !== undefined && obj[key] !== null) out[key] = obj[key];
  if (Array.isArray(out.steps))
    out.steps = (
      out.steps as {
        order: number;
        action: string;
        actor: string;
        system?: string | null;
      }[]
    ).map((s) => ({
      order: s.order,
      action: s.action,
      actor: s.actor,
      ...(s.system ? { system: s.system } : {}),
    }));
  if (Array.isArray(out.inputs))
    out.inputs = (
      out.inputs as {
        name: string;
        source: string;
        dataClass?: string | null;
      }[]
    ).map((i) => ({
      name: i.name,
      source: i.source,
      ...(i.dataClass ? { dataClass: i.dataClass } : {}),
    }));
  return out;
}

/** Resolve with the promise or reject after `ms` (the underlying work keeps running; the caller falls back). */
function withBudget<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} exceeded ${ms}ms budget`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
}

function mergeBy<T>(a: T[], b: T[], key: (t: T) => string): T[] {
  const m = new Map<string, T>();
  for (const x of [...a, ...b]) m.set(key(x), x);
  return [...m.values()];
}
