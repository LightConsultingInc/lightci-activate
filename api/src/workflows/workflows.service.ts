import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PersonRefService } from '../learning/person-ref.service';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { Skill } from '../skills/entities/skill.entity';
import { LibraryService } from '../skills/library.service';
import type { PersonRef, SkillCard } from '../skills/skills.types';
import { Baseline } from './entities/baseline.entity';
import { Measurement } from './entities/measurement.entity';
import {
  WorkflowMap,
  type WorkflowSchema,
} from './entities/workflow-map.entity';
import {
  type BacklogResponse,
  type BaselineInput,
  type CreateWorkflowInput,
  type MeasurementInput,
  type PatchWorkflowInput,
  type WorkflowDetail,
  type WorkflowFilters,
  type WorkflowSummary,
  hoursAtStake,
  schemaCompleteness,
  toBaselineView,
  toMeasurementView,
  toWorkflowSummary,
} from './workflows.types';

/**
 * Workflow maps, baselines and measurements: CRUD and the WorkflowSummary/Detail views. Scorer and
 * Builder sit on top of this. Every query is scoped to the org.
 */
@Injectable()
export class WorkflowsService {
  constructor(
    @InjectRepository(WorkflowMap)
    private readonly maps: Repository<WorkflowMap>,
    @InjectRepository(Baseline)
    private readonly baselines: Repository<Baseline>,
    @InjectRepository(Measurement)
    private readonly measurements: Repository<Measurement>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(Person) private readonly people: Repository<Person>,
    @InjectRepository(Skill) private readonly skills: Repository<Skill>,
    private readonly library: LibraryService,
    private readonly refs: PersonRefService,
  ) {}

  async find(orgId: string, id: string): Promise<WorkflowMap> {
    const map = await this.maps.findOne({ where: { id, orgId } });
    if (!map) throw new NotFoundException('Workflow not found in this org');
    return map;
  }

  async canEdit(person: Person, map: WorkflowMap): Promise<boolean> {
    if (map.ownerPersonId === person.id) return true;
    return this.library.isChampionFor(person, map.teamId);
  }

  async assertCanEdit(person: Person, map: WorkflowMap) {
    if (!(await this.canEdit(person, map)))
      throw new ForbiddenException(
        'Only the owner or a champion may change this workflow',
      );
  }

  // ───────────────────────── views ─────────────────────────

  async summaries(
    orgId: string,
    maps: WorkflowMap[],
    personId?: string | null,
  ): Promise<WorkflowSummary[]> {
    if (maps.length === 0) return [];
    const ids = maps.map((m) => m.id);
    const teams = new Map(
      (await this.teams.find({ where: { orgId } })).map((t) => [t.id, t]),
    );
    const ownerIds = [
      ...new Set(
        maps.map((m) => m.ownerPersonId).filter((x): x is string => Boolean(x)),
      ),
    ];
    const owners = new Map<string, PersonRef>();
    if (ownerIds.length)
      for (const r of await this.refs.refs(
        await this.people.find({ where: { id: In(ownerIds) } }),
      ))
        owners.set(r.id, r);
    const skillIds = [...new Set(maps.flatMap((m) => m.linkedSkillIds))];
    const cards = new Map<string, SkillCard>();
    if (skillIds.length)
      for (const c of await this.library.cards(
        orgId,
        await this.skills.find({ where: { orgId, id: In(skillIds) } }),
        personId,
      ))
        cards.set(c.id, c);
    const baselines = await this.baselines.find({
      where: { workflowMapId: In(ids) },
      order: { capturedAt: 'DESC' },
    });
    const measurements = await this.measurements.find({
      where: { workflowMapId: In(ids) },
      order: { periodEnd: 'DESC', createdAt: 'DESC' },
    });
    const latestBaseline = new Map<string, Baseline>();
    for (const b of baselines)
      if (b.workflowMapId && !latestBaseline.has(b.workflowMapId))
        latestBaseline.set(b.workflowMapId, b);
    const latestMeasurement = new Map<string, Measurement>();
    for (const m of measurements)
      if (m.workflowMapId && !latestMeasurement.has(m.workflowMapId))
        latestMeasurement.set(m.workflowMapId, m);
    return maps.map((m) => {
      const team = m.teamId ? teams.get(m.teamId) : undefined;
      return toWorkflowSummary(m, {
        team: team ? { id: team.id, name: team.name } : null,
        owner: m.ownerPersonId ? (owners.get(m.ownerPersonId) ?? null) : null,
        linkedSkills: m.linkedSkillIds
          .map((id) => cards.get(id))
          .filter((c): c is SkillCard => Boolean(c)),
        baseline: latestBaseline.get(m.id) ?? null,
        measurement: latestMeasurement.get(m.id) ?? null,
      });
    });
  }

  async summary(
    orgId: string,
    map: WorkflowMap,
    personId?: string | null,
  ): Promise<WorkflowSummary> {
    return (await this.summaries(orgId, [map], personId))[0];
  }

  async detail(
    orgId: string,
    map: WorkflowMap,
    personId?: string | null,
  ): Promise<WorkflowDetail> {
    const summary = await this.summary(orgId, map, personId);
    const baselines = await this.baselines.find({
      where: { workflowMapId: map.id },
      order: { capturedAt: 'DESC' },
    });
    const measurements = await this.measurements.find({
      where: { workflowMapId: map.id },
      order: { periodEnd: 'DESC' },
    });
    return {
      ...summary,
      schema: map.schema,
      interviewSessionId: map.interviewSessionId,
      baselines: baselines.map(toBaselineView),
      measurements: measurements.map(toMeasurementView),
    };
  }

  async getDetail(
    orgId: string,
    id: string,
    personId?: string | null,
  ): Promise<WorkflowDetail> {
    return this.detail(orgId, await this.find(orgId, id), personId);
  }

  // ───────────────────────── list / backlog ─────────────────────────

  async list(
    orgId: string,
    filters: WorkflowFilters = {},
    personId?: string | null,
  ): Promise<WorkflowSummary[]> {
    const where: Record<string, unknown> = { orgId };
    if (filters.teamId) where.teamId = filters.teamId;
    if (filters.status) where.status = filters.status;
    if (filters.nextWave !== undefined) where.nextWave = filters.nextWave;
    if (filters.ownerPersonId) where.ownerPersonId = filters.ownerPersonId;
    const maps = await this.maps.find({ where, order: { updatedAt: 'DESC' } });
    const summaries = await this.summaries(orgId, maps, personId);
    return summaries.sort(
      (a, b) =>
        (b.score?.composite ?? -1) - (a.score?.composite ?? -1) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  async backlog(
    orgId: string,
    teamId?: string,
    personId?: string | null,
  ): Promise<BacklogResponse> {
    const items = await this.list(orgId, teamId ? { teamId } : {}, personId);
    const maps = await this.maps.find({
      where: teamId ? { orgId, teamId } : { orgId },
    });
    const byId = new Map(maps.map((m) => [m.id, m]));
    const totals = {
      hoursAtStake:
        Math.round(
          items.reduce(
            (n, i) =>
              n + (i.score?.hours ?? hoursAtStake(byId.get(i.id)?.schema)),
            0,
          ) * 10,
        ) / 10,
      candidates: items.filter(
        (i) => i.status === 'candidate' || i.status === 'scored',
      ).length,
      inBuild: items.filter((i) => i.status === 'in_build').length,
      shipped: items.filter(
        (i) => i.status === 'shipped' || i.status === 'measured',
      ).length,
      nextWave: items.filter((i) => i.nextWave).length,
    };
    return { items, totals };
  }

  // ───────────────────────── CRUD ─────────────────────────

  async create(
    orgId: string,
    person: Person,
    input: CreateWorkflowInput,
  ): Promise<WorkflowDetail> {
    if (!input.name?.trim()) throw new ConflictException('name is required');
    const teamId = input.teamId === undefined ? person.teamId : input.teamId;
    if (teamId && !(await this.teams.exists({ where: { id: teamId, orgId } })))
      throw new NotFoundException('Team not found in this org');
    const schema = this.normaliseSchema(input.schema ?? {});
    const map = await this.maps.save(
      this.maps.create({
        orgId,
        teamId: teamId ?? null,
        ownerPersonId: person.id,
        name: input.name.trim(),
        schema,
        completeness: schemaCompleteness(schema),
        championVerified: false,
        score: null,
        status: 'candidate',
        linkedSkillIds: [],
        nextWave: false,
      }),
    );
    return this.detail(orgId, map, person.id);
  }

  async patch(
    orgId: string,
    person: Person,
    id: string,
    input: PatchWorkflowInput,
  ): Promise<WorkflowDetail> {
    const map = await this.find(orgId, id);
    await this.assertCanEdit(person, map);
    if (input.name !== undefined && input.name.trim())
      map.name = input.name.trim();
    if (input.schema !== undefined) {
      map.schema = this.normaliseSchema({ ...map.schema, ...input.schema });
      map.completeness = schemaCompleteness(map.schema);
      map.championVerified = false;
    }
    if (input.status !== undefined) {
      if (
        !['candidate', 'scored', 'in_build', 'shipped', 'measured'].includes(
          input.status,
        )
      )
        throw new ConflictException('invalid status');
      map.status = input.status;
    }
    if (input.nextWave !== undefined) {
      if (!(await this.library.isChampionFor(person, map.teamId)))
        throw new ForbiddenException('Only a champion can set the next wave');
      map.nextWave = Boolean(input.nextWave);
    }
    if (input.teamId !== undefined) {
      if (
        input.teamId &&
        !(await this.teams.exists({ where: { id: input.teamId, orgId } }))
      )
        throw new NotFoundException('Team not found in this org');
      map.teamId = input.teamId;
    }
    await this.maps.save(map);
    return this.detail(orgId, map, person.id);
  }

  private normaliseSchema(
    schema: Partial<WorkflowSchema>,
  ): Partial<WorkflowSchema> {
    const out: Partial<WorkflowSchema> = { ...schema };
    if (out.minutesPerRun !== undefined)
      out.minutesPerRun = Math.max(0, Number(out.minutesPerRun) || 0);
    if (out.runsPerWeek !== undefined)
      out.runsPerWeek = Math.max(0, Number(out.runsPerWeek) || 0);
    if (out.steps)
      out.steps = out.steps.map((s, i) => ({ ...s, order: s.order ?? i + 1 }));
    for (const k of [
      'inputs',
      'steps',
      'decisions',
      'exceptions',
      'systems',
      'mustNeverLeave',
      'outputs',
      'humanReview',
    ] as const) {
      if (out[k] !== undefined && !Array.isArray(out[k])) delete out[k];
    }
    return out;
  }

  // ───────────────────────── baselines & measurements ─────────────────────────

  async addBaseline(
    orgId: string,
    person: Person,
    id: string,
    input: BaselineInput,
  ): Promise<WorkflowDetail> {
    const map = await this.find(orgId, id);
    if (!(input.minutesPerWeek >= 0))
      throw new ConflictException(
        'minutesPerWeek must be a non-negative number',
      );
    if (!['time_diary', 'interview_estimate'].includes(input.method))
      throw new ConflictException(
        'method must be time_diary or interview_estimate',
      );
    const subjectId =
      input.personId && (await this.library.isChampionFor(person, map.teamId))
        ? input.personId
        : (map.ownerPersonId ?? person.id);
    const approved =
      input.method === 'interview_estimate' &&
      (await this.library.isChampionFor(person, map.teamId))
        ? person.id
        : null;
    await this.baselines.save(
      this.baselines.create({
        personId: subjectId,
        workflowMapId: map.id,
        task: input.task?.trim() || map.name,
        method: input.method,
        minutesPerWeek: input.minutesPerWeek,
        reworkMinutesPerWeek: Math.max(0, input.reworkMinutesPerWeek ?? 0),
        approvedByPersonId: approved,
      }),
    );
    return this.detail(orgId, map, person.id);
  }

  async addMeasurement(
    orgId: string,
    person: Person,
    id: string,
    input: MeasurementInput,
  ): Promise<WorkflowDetail> {
    const map = await this.find(orgId, id);
    if (!(input.minutesPerWeek >= 0))
      throw new ConflictException(
        'minutesPerWeek must be a non-negative number',
      );
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.periodStart ?? '') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.periodEnd ?? '')
    )
      throw new ConflictException(
        'periodStart and periodEnd must be YYYY-MM-DD',
      );
    if (input.periodEnd < input.periodStart)
      throw new ConflictException('periodEnd must not be before periodStart');
    if (!['time_diary', 'interview_estimate'].includes(input.method))
      throw new ConflictException(
        'method must be time_diary or interview_estimate',
      );
    const subjectId =
      input.personId && (await this.library.isChampionFor(person, map.teamId))
        ? input.personId
        : (map.ownerPersonId ?? person.id);
    const baseline = await this.baselines.findOne({
      where: { workflowMapId: map.id },
      order: { capturedAt: 'DESC' },
    });
    if (!baseline)
      throw new ConflictException(
        'Capture a baseline before recording measurements; no number is reported without one.',
      );
    await this.measurements.save(
      this.measurements.create({
        personId: subjectId,
        workflowMapId: map.id,
        baselineId: baseline.id,
        task: input.task?.trim() || baseline.task,
        minutesPerWeek: input.minutesPerWeek,
        reworkMinutesPerWeek: Math.max(0, input.reworkMinutesPerWeek ?? 0),
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        method: input.method,
        source:
          input.source === 'auditor' &&
          (await this.library.isChampionFor(person, map.teamId))
            ? 'auditor'
            : 'self',
      }),
    );
    if (map.status === 'shipped')
      await this.maps.update(map.id, { status: 'measured' });
    return this.getDetail(orgId, map.id, person.id);
  }
}
