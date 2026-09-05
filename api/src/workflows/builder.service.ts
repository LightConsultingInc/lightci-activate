import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { ContextLayer } from '../context/entities/context-layer.entity';
import { Escalation } from '../ops/entities/escalation.entity';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { LibraryService } from '../skills/library.service';
import type { SkillDetail } from '../skills/skills.types';
import { slugify } from '../skills/skills.types';
import { BuilderOutputSchema } from './ai-schemas';
import { WorkflowMap } from './entities/workflow-map.entity';
import './workflows.mocks';

export const BUILDER_ESCALATION_CONFIDENCE = 0.6;

const BUILDER_SYSTEM = `You are the Builder for LightCI Activate at a regulated wealth-management firm. You compile a verified workflow map into a draft Claude skill that a learner will review, grade and promote.
Write SKILL.md in this exact structure: YAML frontmatter (name = slug, description = the trigger line, metadata: activate-id / activate-version "0" / activate-owner), then sections "## When to use", "## Inputs", "## Steps", "## Output format", "## Boundaries", "## Examples" with exactly two canonical, complete examples (one routine, one that must be declined or partially declined). Use the team's own vocabulary from the map and firm context.
The trigger line says when to use AND when not to, names the inputs, and names the adjacent tasks it does not cover.
Boundaries come from the map: may_read = the inputs' data classes/sources that are allowed; must_never_receive = the map's mustNeverLeave plus every forbidden class in the firm boundary; human_review = the map's review points (at least one when output leaves the team or enters a system of record). Steps never write to a read-only system; a human does.
Progressive disclosure: the body holds only what every run needs; no restated firm context, no filler. Four sample cases: two should-trigger, one should-not, one ambiguous. Report confidence honestly — below 0.6 means a human must rework the draft before it is graded — and list open questions the map did not settle.`;

/**
 * Builder role: drafts an anchor skill (SKILL.md, boundary, sample cases) from a workflow map,
 * creates it as a draft in the library owned by the caller, links it to the workflow, and
 * escalates when its own confidence is low. Builder is the highest-risk role in a regulated firm:
 * nothing it produces is published without Grader + human approval.
 */
@Injectable()
export class BuilderService {
  private readonly logger = new Logger(BuilderService.name);

  constructor(
    @InjectRepository(WorkflowMap) private readonly maps: Repository<WorkflowMap>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(ContextLayer) private readonly layers: Repository<ContextLayer>,
    @InjectRepository(Escalation) private readonly escalations: Repository<Escalation>,
    private readonly library: LibraryService,
    private readonly ai: AiService,
  ) {}

  async build(workflowMapId: string, person: Person): Promise<{ skill: SkillDetail; confidence: number; openQuestions: string[]; escalated: boolean }> {
    const map = await this.maps.findOneOrFail({ where: { id: workflowMapId } });
    if (map.completeness < 0.4) throw new ConflictException(`Workflow map is ${(map.completeness * 100).toFixed(0)}% complete; finish the Interviewer session (≥ 40%) before building.`);
    const boundary = await this.library.orgBoundary(map.orgId);
    const team = map.teamId ? await this.teams.findOne({ where: { id: map.teamId } }) : null;
    const company = await this.layers.findOne({ where: { orgId: map.orgId, layer: 'company' } });
    const teamLayer = map.teamId ? await this.layers.findOne({ where: { orgId: map.orgId, layer: 'team', ownerId: map.teamId } }) : null;
    const plugin = team?.pluginName ?? 'shared';
    const family = slugify(map.name).split('-').slice(0, 2).join('-');

    const out = await this.ai.structured(
      {
        agent: 'builder',
        task: 'builder.skill',
        orgId: map.orgId,
        personId: person.id,
        effort: 'high',
        maxTokens: 20000,
        system: BUILDER_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              `# Workflow: ${map.name}`,
              `Team: ${team?.name ?? 'unassigned'} (slug ${team?.slug ?? 'shared'}, plugin ${plugin}). Owner: ${person.name} <${person.email}>. Completeness ${(map.completeness * 100).toFixed(0)}%${map.championVerified ? ', champion verified' : ' (not yet champion verified)'}.`,
              '',
              '# Firm boundary',
              `Allowed data classes: ${boundary.allowedDataClasses.join(', ') || 'none declared'}`,
              `Forbidden data classes: ${boundary.forbiddenDataClasses.join(', ') || 'none declared'}`,
              `Read-only systems: ${boundary.readOnlySystems.join(', ') || 'none declared'}`,
              `Human review points: ${boundary.humanReviewPoints.join(', ') || 'none declared'}`,
              '',
              '# Firm context',
              company?.summary ?? '(none)',
              company?.vocabulary?.length ? `Vocabulary: ${company.vocabulary.map((v) => `${v.term} = ${v.meaning}`).join('; ')}` : '',
              teamLayer ? `\n# Team context\n${teamLayer.summary ?? ''}\n${teamLayer.vocabulary?.length ? `Vocabulary: ${teamLayer.vocabulary.map((v) => `${v.term} = ${v.meaning}`).join('; ')}` : ''}` : '',
              '',
              '# Workflow map (schema)',
              JSON.stringify(map.schema, null, 2),
            ].join('\n'),
          },
        ],
        mockSeed: { name: map.name, schema: map.schema, slug: slugify(map.name), teamSlug: team?.slug ?? 'shared', plugin, ownerEmail: person.email, forbiddenDataClasses: boundary.forbiddenDataClasses, humanReviewPoints: boundary.humanReviewPoints, family },
      },
      BuilderOutputSchema,
    );

    const skill = await this.library.create(map.orgId, person, {
      name: out.name,
      slug: out.slug,
      plugin,
      teamId: map.teamId,
      triggerLine: out.triggerLine,
      skillMd: out.skillMd,
      boundary: {
        mayRead: out.boundary.mayRead,
        mustNeverReceive: [...new Set([...out.boundary.mustNeverReceive, ...boundary.forbiddenDataClasses])],
        humanReview: out.boundary.humanReview,
      },
      sampleCases: out.sampleCases,
      workflowMapId: map.id,
      rungRequired: out.rungRequired,
      workflowFamily: family,
      authoredBy: 'builder',
    });

    const fresh = await this.maps.findOneOrFail({ where: { id: map.id } });
    await this.maps.update(map.id, { status: 'in_build', linkedSkillIds: fresh.linkedSkillIds.includes(skill.id) ? fresh.linkedSkillIds : [...fresh.linkedSkillIds, skill.id] });

    let escalated = false;
    if (out.confidence < BUILDER_ESCALATION_CONFIDENCE) {
      escalated = true;
      await this.escalations.save(
        this.escalations.create({
          orgId: map.orgId,
          sourceAgent: 'builder',
          kind: 'escalation',
          subjectType: 'skill',
          subjectId: skill.id,
          reason: `Builder confidence ${(out.confidence * 100).toFixed(0)}% for "${out.name}" from workflow "${map.name}". ${out.openQuestions.length ? `Open questions: ${out.openQuestions.join(' | ')}` : 'The map is thin; a human should rework the draft before grading.'}`,
          assigneePersonId: team?.championPersonId ?? null,
          state: 'open',
          slaDueAt: new Date(Date.now() + 3 * 86_400_000),
        }),
      );
      this.logger.warn(`Builder escalated ${out.slug} (confidence ${out.confidence})`);
    }
    if (out.openQuestions.length) await this.library.comment(map.orgId, person, skill.id, `Builder open questions:\n- ${out.openQuestions.join('\n- ')}\n\nConfidence ${(out.confidence * 100).toFixed(0)}%.`, 'system');
    return { skill: await this.library.getDetail(map.orgId, skill.id, person.id), confidence: out.confidence, openQuestions: out.openQuestions, escalated };
  }
}
