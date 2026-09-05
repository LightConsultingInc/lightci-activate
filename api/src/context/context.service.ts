import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { z } from 'zod';
import { AiService } from '../ai/ai.service';
import { registerMockResponder } from '../ai/mock-responders';
import { hasAnyRole } from '../common/roles.guard';
import type { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { AuditLog } from '../ops/entities/audit-log.entity';
import { ContextLayer } from './entities/context-layer.entity';
import {
  ContextSource,
  type ContextLayerKind,
} from './entities/context-source.entity';

export const LAYERS: ContextLayerKind[] = ['company', 'team', 'person'];
export const SOURCE_TYPES = [
  'transcript',
  'proposal',
  'org_chart',
  'sop',
  'confluence',
  'drive',
  'interview',
  'intake',
  'policy',
] as const;

export interface CreateSourceInput {
  layer: ContextLayerKind;
  ownerId?: string | null;
  type: ContextSource['type'];
  title: string;
  uri?: string | null;
  content?: string | null;
  tags?: Record<string, string>;
}

export const ContextSummarySchema = z.object({
  summary: z.string(),
  vocabulary: z.array(z.object({ term: z.string(), meaning: z.string() })),
  anchorWorkflows: z.array(z.string()),
  sensitivities: z.array(z.string()),
  systems: z.array(z.string()),
});
export type ContextSummary = z.infer<typeof ContextSummarySchema>;

const SYSTEM = `You compile a context layer for an AI enablement programme from reviewed source documents (scoping transcripts, proposals, org charts, SOPs, policies, intake interviews).
Return: a plain-prose summary (what this company/team/person does, how the work flows, what matters), the vocabulary the people actually use (term → meaning), the anchor workflows (recurring pieces of work by the name people use), sensitivities (data classes and topics that must stay out of Claude or need review) and the systems of record touched.
Only use what is in the sources. Do not invent names, numbers or systems. Keep restricted data out of the summary itself.`;

/** Deterministic stand-in: derives every field from the source texts so E2E runs are stable. */
registerMockResponder('context.summarise', (call) => {
  const seed = (call.mockSeed ?? {}) as {
    layer?: string;
    titles?: string[];
    text?: string;
  };
  const text = seed.text ?? '';
  const words =
    text.match(/\b[A-Z][A-Za-z]{2,}(?:\s[A-Z][A-Za-z]{2,})?\b/g) ?? [];
  const uniq = (xs: string[]) => [...new Set(xs)];
  const caps = uniq(words).slice(0, 8);
  const systems = uniq(
    (
      text.match(
        /\b(Salesforce|HubSpot|Jira|Confluence|Slack|SharePoint|Excel|Outlook|Workday|NetSuite|Redtail|Orion|Tamarac|Drive|GitHub|Snowflake)\b/gi,
      ) ?? []
    ).map((s) => s[0].toUpperCase() + s.slice(1).toLowerCase()),
  );
  const sensitivities = uniq(
    (
      text.match(
        /\b(SSN|PII|PHI|account numbers?|client (?:data|statements?)|salary|compensation|passwords?|MNPI)\b/gi,
      ) ?? []
    ).map((s) => s.toLowerCase()),
  );
  const workflows = uniq(
    (
      text.match(
        /\b[a-z]+(?:ly)?\s(?:prep|review|report|memo|letter|reconciliation|onboarding|close|update|summary)\b/gi,
      ) ?? []
    ).map((s) => s.toLowerCase()),
  ).slice(0, 6);
  return {
    summary:
      `[mock] ${seed.layer ?? 'company'} context from ${seed.titles?.length ?? 0} source(s): ${(seed.titles ?? []).join(', ')}. ${text.replace(/\s+/g, ' ').slice(0, 280)}`.trim(),
    vocabulary: caps.map((term) => ({
      term,
      meaning: `As used in the sources: ${term}.`,
    })),
    anchorWorkflows: workflows,
    sensitivities,
    systems,
  } satisfies ContextSummary;
});

@Injectable()
export class ContextService {
  constructor(
    private readonly ai: AiService,
    @InjectRepository(ContextSource)
    private readonly sources: Repository<ContextSource>,
    @InjectRepository(ContextLayer)
    private readonly layers: Repository<ContextLayer>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
  ) {}

  /** Champions may touch their team's layer and their own; sponsors/admins/leads anything in the org. */
  private async assertCanEdit(
    orgId: string,
    user: Person,
    layer: ContextLayerKind,
    ownerId: string | null,
  ) {
    if (hasAnyRole(user, ['sponsor', 'admin'])) return;
    if (layer === 'person' && ownerId === user.id) return;
    if (layer === 'team' && ownerId) {
      const team = await this.teams.findOne({ where: { id: ownerId, orgId } });
      if (
        team &&
        (team.championPersonId === user.id || team.id === user.teamId)
      )
        return;
    }
    throw new ForbiddenException(
      'You may only edit context for your own team or yourself.',
    );
  }

  private normaliseOwner(
    layer: ContextLayerKind,
    ownerId: string | null | undefined,
  ): string | null {
    if (layer === 'company') return null;
    if (!ownerId || ['company', 'org', '-', 'null'].includes(ownerId))
      throw new BadRequestException(`${layer} layer requires an ownerId`);
    return ownerId;
  }

  async listSources(
    orgId: string,
    user: Person,
    layer?: string | null,
    ownerId?: string | null,
  ) {
    if (layer && !LAYERS.includes(layer as ContextLayerKind))
      throw new BadRequestException(
        `layer must be one of ${LAYERS.join(', ')}`,
      );
    const where: Record<string, unknown> = { orgId };
    if (layer) where.layer = layer;
    if (ownerId) where.ownerId = ownerId;
    const rows = await this.sources.find({
      where,
      order: { ingestedAt: 'DESC' },
    });
    if (hasAnyRole(user, ['sponsor', 'admin'])) return rows;
    return rows.filter(
      (s) =>
        s.layer === 'company' ||
        (s.layer === 'person' && s.ownerId === user.id) ||
        (s.layer === 'team' && s.ownerId === user.teamId),
    );
  }

  async createSource(orgId: string, user: Person, dto: CreateSourceInput) {
    if (!LAYERS.includes(dto.layer))
      throw new BadRequestException(
        `layer must be one of ${LAYERS.join(', ')}`,
      );
    if (!(SOURCE_TYPES as readonly string[]).includes(dto.type))
      throw new BadRequestException(
        `type must be one of ${SOURCE_TYPES.join(', ')}`,
      );
    if (!dto.title?.trim()) throw new BadRequestException('title is required');
    if (!dto.uri && !dto.content)
      throw new BadRequestException('Provide uri or content');
    const ownerId = this.normaliseOwner(dto.layer, dto.ownerId);
    await this.assertCanEdit(orgId, user, dto.layer, ownerId);
    const row = await this.sources.save(
      this.sources.create({
        orgId,
        layer: dto.layer,
        ownerId,
        type: dto.type,
        title: dto.title.trim(),
        uri: dto.uri ?? null,
        content: dto.content ?? null,
        reviewState: 'pending',
        tags: dto.tags ?? {},
      }),
    );
    await this.log(orgId, user, 'context.source.added', row.id, {
      layer: row.layer,
      type: row.type,
      title: row.title,
    });
    return row;
  }

  async patchSource(
    orgId: string,
    user: Person,
    id: string,
    dto: {
      reviewState?: ContextSource['reviewState'];
      title?: string;
      content?: string | null;
      tags?: Record<string, string>;
    },
  ) {
    const row = await this.sources.findOne({ where: { id, orgId } });
    if (!row) throw new NotFoundException('Source not found');
    await this.assertCanEdit(orgId, user, row.layer, row.ownerId);
    if (dto.reviewState !== undefined) {
      if (!['pending', 'reviewed', 'rejected'].includes(dto.reviewState))
        throw new BadRequestException(
          'reviewState must be pending|reviewed|rejected',
        );
      row.reviewState = dto.reviewState;
    }
    if (dto.title !== undefined && dto.title.trim())
      row.title = dto.title.trim();
    if (dto.content !== undefined) row.content = dto.content;
    if (dto.tags !== undefined) row.tags = dto.tags;
    const saved = await this.sources.save(row);
    await this.log(orgId, user, 'context.source.updated', id, {
      ...dto,
      content: dto.content ? `${dto.content.length} chars` : undefined,
    });
    return saved;
  }

  async listLayers(orgId: string, user: Person) {
    const [layers, sources] = await Promise.all([
      this.layers.find({
        where: { orgId },
        order: { layer: 'ASC', updatedAt: 'DESC' },
      }),
      this.sources.find({ where: { orgId } }),
    ]);
    const visible = hasAnyRole(user, ['sponsor', 'admin'])
      ? layers
      : layers.filter(
          (l) =>
            l.layer === 'company' ||
            (l.layer === 'person' && l.ownerId === user.id) ||
            (l.layer === 'team' && l.ownerId === user.teamId),
        );
    return visible.map((l) => {
      const mine = sources.filter(
        (s) =>
          s.layer === l.layer && (s.ownerId ?? null) === (l.ownerId ?? null),
      );
      return {
        ...l,
        sources: {
          total: mine.length,
          reviewed: mine.filter((s) => s.reviewState === 'reviewed').length,
          pending: mine.filter((s) => s.reviewState === 'pending').length,
        },
      };
    });
  }

  /** Summarise reviewed sources (falling back to all non-rejected) into the layer; bumps version. */
  async rebuild(
    orgId: string,
    user: Person,
    layer: string,
    ownerParam: string | null,
  ) {
    if (!LAYERS.includes(layer as ContextLayerKind))
      throw new BadRequestException(
        `layer must be one of ${LAYERS.join(', ')}`,
      );
    const kind = layer as ContextLayerKind;
    const ownerId =
      kind === 'company' ? null : this.normaliseOwner(kind, ownerParam);
    await this.assertCanEdit(orgId, user, kind, ownerId);
    const all = await this.sources.find({
      where: ownerId ? { orgId, layer: kind, ownerId } : { orgId, layer: kind },
      order: { ingestedAt: 'ASC' },
    });
    const scoped = all.filter((s) => (s.ownerId ?? null) === ownerId);
    const reviewed = scoped.filter((s) => s.reviewState === 'reviewed');
    const used = reviewed.length
      ? reviewed
      : scoped.filter((s) => s.reviewState !== 'rejected');
    if (used.length === 0)
      throw new BadRequestException('No sources to summarise for this layer');
    const text = used
      .map(
        (s) =>
          `## ${s.title} (${s.type}${s.uri ? `, ${s.uri}` : ''})\n${(s.content ?? '').slice(0, 20_000)}`,
      )
      .join('\n\n');
    const summary = await this.ai.structured<ContextSummary>(
      {
        agent: 'auditor',
        task: 'context.summarise',
        orgId,
        personId: user.id,
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: `Layer: ${kind}${ownerId ? ` (owner ${ownerId})` : ''}\nSources (${used.length}, ${reviewed.length} reviewed):\n\n${text}`,
          },
        ],
        effort: 'medium',
        mockSeed: {
          layer: kind,
          titles: used.map((s) => s.title),
          text: used
            .map((s) => s.content ?? '')
            .join('\n')
            .slice(0, 4000),
        },
      },
      ContextSummarySchema,
    );
    const existing = (
      await this.layers.find({
        where: ownerId
          ? { orgId, layer: kind, ownerId }
          : { orgId, layer: kind },
      })
    ).find((l) => (l.ownerId ?? null) === ownerId);
    const row =
      existing ??
      this.layers.create({ orgId, layer: kind, ownerId, version: 0 });
    row.summary = summary.summary;
    row.vocabulary = summary.vocabulary;
    row.anchorWorkflows = summary.anchorWorkflows;
    row.sensitivities = summary.sensitivities;
    row.systems = summary.systems;
    row.version = (row.version ?? 0) + 1;
    const saved = await this.layers.save(row);
    await this.log(orgId, user, 'context.layer.rebuilt', saved.id, {
      layer: kind,
      ownerId,
      version: saved.version,
      sources: used.length,
      reviewedOnly: reviewed.length > 0,
    });
    return {
      ...saved,
      sourcesUsed: used.map((s) => ({
        id: s.id,
        title: s.title,
        reviewState: s.reviewState,
      })),
    };
  }

  private log(
    orgId: string,
    actor: Person,
    action: string,
    subjectId: string | null,
    meta: Record<string, unknown>,
  ) {
    return this.audit.save(
      this.audit.create({
        orgId,
        actorPersonId: actor.id,
        action,
        subjectType: 'context',
        subjectId,
        meta,
      }),
    );
  }
}
