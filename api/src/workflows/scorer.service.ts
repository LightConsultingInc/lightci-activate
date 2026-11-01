import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { Org } from '../orgs/entities/org.entity';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { LibraryService } from '../skills/library.service';
import { ScorerOutputSchema } from './ai-schemas';
import {
  WorkflowMap,
  type WorkflowScore,
} from './entities/workflow-map.entity';
import { normaliseComposite, rawComposite } from './workflows.types';
import './workflows.mocks';

export { normaliseComposite, rawComposite };

export const RESCORE_MIN_COMPLETENESS = 0.6;

const SCORER_SYSTEM = `You are the Scorer for LightCI Activate at a regulated wealth-management firm. You rank workflows for the automation backlog.
Score four dimensions from the workflow map and the firm's compliance boundary:
- value (0..1): business value of taking this work off people's plates — client impact, revenue relevance, error cost, how many people run it.
- hoursPerWeek: hours/week at stake across the team. Start from minutesPerRun × runsPerWeek ÷ 60; adjust only if the map says several people run it.
- readiness (0..1): template-shaped inputs, explicit steps, few judgement calls, Claude-shaped steps already present, systems read-only. Sparse or contradictory maps score low.
- exposure (0..1): restricted data classes among the inputs, outputs that leave the firm, writes to systems of record, missing human-review points. Restricted inputs alone push exposure above 0.5.
Write a rationale of three or four sentences an operating partner could read: why it ranks where it does and the one change that would move it most. Facts from the map only; do not invent volumes.`;

/**
 * Scorer role: value × hours × readiness ÷ (1 + exposure), normalised 0..100 against the org's max.
 * Scores one map (POST /workflows/:id/score), rescores all candidates, and runs nightly.
 */
@Injectable()
export class ScorerService {
  private readonly logger = new Logger(ScorerService.name);

  constructor(
    @InjectRepository(WorkflowMap)
    private readonly maps: Repository<WorkflowMap>,
    @InjectRepository(Org) private readonly orgs: Repository<Org>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(Person) private readonly people: Repository<Person>,
    private readonly library: LibraryService,
    private readonly ai: AiService,
  ) {}

  /** Score one workflow; renormalises every composite in the org so ranks stay comparable. */
  async score(
    workflowMapId: string,
    actorPersonId: string | null = null,
  ): Promise<WorkflowMap> {
    const map = await this.maps.findOneOrFail({ where: { id: workflowMapId } });
    const boundary = await this.library.orgBoundary(map.orgId);
    const team = map.teamId
      ? await this.teams.findOne({ where: { id: map.teamId } })
      : null;
    const teamSize = map.teamId
      ? await this.people.count({
          where: { teamId: map.teamId, orgId: map.orgId },
        })
      : 1;
    const out = await this.ai.structured(
      {
        agent: 'scorer',
        task: 'scorer.workflow',
        orgId: map.orgId,
        personId: actorPersonId,
        model: this.ai.fastModel,
        effort: 'low',
        system: SCORER_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              `# Workflow: ${map.name}`,
              `Team: ${team?.name ?? 'unassigned'} (${teamSize} people). Schema completeness ${(map.completeness * 100).toFixed(0)}%${map.championVerified ? ', champion verified' : ''}.`,
              '',
              '# Firm boundary',
              `Forbidden data classes: ${boundary.forbiddenDataClasses.join(', ') || 'none declared'}`,
              `Read-only systems: ${boundary.readOnlySystems.join(', ') || 'none declared'}`,
              `Human review points: ${boundary.humanReviewPoints.join(', ') || 'none declared'}`,
              '',
              '# Workflow map (schema)',
              JSON.stringify(map.schema, null, 2),
            ].join('\n'),
          },
        ],
        mockSeed: {
          name: map.name,
          schema: map.schema,
          completeness: map.completeness,
          forbiddenDataClasses: boundary.forbiddenDataClasses,
          readOnlySystems: boundary.readOnlySystems,
          teamSize,
        },
      },
      ScorerOutputSchema,
    );
    const score: WorkflowScore = {
      value: out.value,
      hours: Math.round(out.hoursPerWeek * 100) / 100,
      readiness: out.readiness,
      exposure: out.exposure,
      composite: 0,
      rationale: out.rationale,
    };
    map.score = score;
    if (map.status === 'candidate') map.status = 'scored';
    await this.maps.save(map);
    await this.renormalise(map.orgId);
    return this.maps.findOneOrFail({ where: { id: map.id } });
  }

  /** Recompute `composite` for every scored map in the org against the org max. */
  async renormalise(orgId: string): Promise<void> {
    const scored = await this.maps.find({ where: { orgId } });
    const raws = scored.map((m) =>
      m.score
        ? rawComposite(
            m.score.value,
            m.score.hours,
            m.score.readiness,
            m.score.exposure,
          )
        : 0,
    );
    const max = Math.max(0, ...raws);
    for (let i = 0; i < scored.length; i++) {
      const m = scored[i];
      if (!m.score) continue;
      const composite = normaliseComposite(raws[i], max);
      if (m.score.composite !== composite)
        await this.maps.update(m.id, { score: { ...m.score, composite } });
    }
  }

  /** Score every candidate/scored map in the org (optionally one team) with completeness ≥ 0.6. */
  async rescoreAll(
    orgId: string,
    teamId?: string,
    actorPersonId: string | null = null,
  ): Promise<{ scored: number; skipped: number }> {
    const where = {
      orgId,
      status: In(['candidate', 'scored']),
      completeness: MoreThanOrEqual(RESCORE_MIN_COMPLETENESS),
      ...(teamId ? { teamId } : {}),
    };
    const maps = await this.maps.find({ where, order: { updatedAt: 'ASC' } });
    let scored = 0;
    for (const m of maps) {
      try {
        await this.score(m.id, actorPersonId);
        scored++;
      } catch (e) {
        this.logger.warn(
          `Scoring ${m.name} (${m.id}) failed: ${(e as Error).message}`,
        );
      }
    }
    const total = await this.maps.count({
      where: {
        orgId,
        status: In(['candidate', 'scored']),
        ...(teamId ? { teamId } : {}),
      },
    });
    return { scored, skipped: total - maps.length };
  }

  /** Nightly rescoring of candidates across all orgs (job `nightly.scorer`, 03:15). */
  async nightly(): Promise<void> {
    if (process.env.SCORER_NIGHTLY === 'off') return;
    const orgs = await this.orgs.find({ select: { id: true, name: true } });
    for (const org of orgs) {
      try {
        const r = await this.rescoreAll(org.id);
        if (r.scored)
          this.logger.log(
            `Nightly rescore ${org.name}: ${r.scored} scored, ${r.skipped} skipped (completeness < ${RESCORE_MIN_COMPLETENESS})`,
          );
      } catch (e) {
        this.logger.warn(
          `Nightly rescore failed for ${org.name}: ${(e as Error).message}`,
        );
      }
    }
  }
}
