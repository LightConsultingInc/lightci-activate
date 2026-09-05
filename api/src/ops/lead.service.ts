import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isoDay } from '../common/dates';
import { Org } from '../orgs/entities/org.entity';
import type { Person } from '../orgs/entities/person.entity';
import { OrgService, slugify } from '../orgs/org.service';
import { IntegrationsService } from '../orgs/integrations.service';
import { AuditLog } from './entities/audit-log.entity';
import { CostInput } from './entities/cost-input.entity';
import { Wave } from './entities/wave.entity';
import {
  activeInWindow,
  MetricsService,
  round,
  rungDistribution,
  stalledFor,
  type OrgFacts,
} from './metrics.service';
import { personById, personRef, promotionView } from './shape';
import type { LeadClientRow, LeadQueue, PromotionView } from './ops.types';

export const ACTIVE_PCT_TARGET = 0.6; // spec: weekly active on real work ≥ 60%

export interface CreateClientInput {
  name: string;
  slug?: string;
  workosOrganizationId?: string | null;
  industry?: string | null;
  sponsorName?: string | null;
  seats: number;
  premiumSeats?: number;
  residencyMode?: Org['residencyMode'];
}

@Injectable()
export class LeadService {
  constructor(
    private readonly metrics: MetricsService,
    private readonly orgService: OrgService,
    private readonly integrations: IntegrationsService,
    @InjectRepository(Org) private readonly orgs: Repository<Org>,
    @InjectRepository(Wave) private readonly waves: Repository<Wave>,
    @InjectRepository(CostInput)
    private readonly costInputs: Repository<CostInput>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
  ) {}

  private orgRef(o: Org) {
    return { id: o.id, name: o.name, slug: o.slug };
  }

  async queue(): Promise<LeadQueue> {
    const orgs = await this.orgs.find({ order: { name: 'ASC' } });
    const waves = await this.waves.find({ order: { startsOn: 'DESC' } });
    const out: LeadQueue = {
      escalations: [],
      approvals: [],
      stalled: [],
      waves: [],
    };
    for (const org of orgs) {
      const f = await this.metrics.load(org.id, { usageDays: 70 });
      const ref = this.orgRef(org);
      for (const e of f.escalations.filter((x) => x.state !== 'resolved')) {
        out.escalations.push({
          ...e,
          org: ref,
          subject: this.subjectLabel(f, e.subjectType, e.subjectId),
          assignee: personById(f, e.assigneePersonId),
        });
      }
      for (const pr of f.promotions.filter((p) => p.decision === 'pending')) {
        const skill = f.skills.find((s) => s.id === pr.skillId);
        const team = skill?.teamId
          ? f.teams.find((t) => t.id === skill.teamId)
          : null;
        const championTrusted = Boolean(
          team?.championPersonId &&
          (f.rungs.get(team.championPersonId) ?? 0) >= 5,
        );
        if (
          pr.highExposure ||
          pr.requiredApproverRoles.includes('compliance') ||
          !championTrusted
        ) {
          const view = promotionView(pr, f);
          if (view) out.approvals.push({ ...view, org: ref });
        }
      }
      out.stalled.push(...this.stalledRows(f, ref));
      for (const w of waves.filter(
        (x) => x.orgId === org.id && x.status !== 'complete',
      ))
        out.waves.push(this.waveRow(f, ref, w));
    }
    out.escalations.sort(
      (a, b) =>
        (a.slaDueAt?.getTime() ?? Infinity) -
          (b.slaDueAt?.getTime() ?? Infinity) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
    return out;
  }

  private subjectLabel(
    f: OrgFacts,
    type: string,
    id: string | null,
  ): string | null {
    if (!id) return null;
    switch (type) {
      case 'person':
        return f.people.find((p) => p.id === id)?.name ?? null;
      case 'team':
        return f.teamName.get(id) ?? null;
      case 'skill':
        return f.skills.find((s) => s.id === id)?.name ?? null;
      case 'workflow':
        return f.workflows.find((w) => w.id === id)?.name ?? null;
      case 'exercise':
        return f.exercises.find((e) => e.id === id)?.title ?? null;
      case 'promotion_request': {
        const pr = f.promotions.find((p) => p.id === id);
        return pr
          ? (f.skills.find((s) => s.id === pr.skillId)?.name ?? null)
          : null;
      }
      default:
        return null;
    }
  }

  private stalledRows(
    f: OrgFacts,
    org: { id: string; name: string; slug: string },
  ): LeadQueue['stalled'] {
    const rows: LeadQueue['stalled'] = [];
    const today = isoDay(f.now);
    if (f.people.length) {
      const pct = activeInWindow(f.activeDays, today, 7).size / f.people.length;
      if (pct < ACTIVE_PCT_TARGET)
        rows.push({
          org,
          team: null,
          person: null,
          metric: 'weeklyActivePct',
          value: round(pct),
          threshold: ACTIVE_PCT_TARGET,
        });
    }
    for (const t of f.teams.filter((x) => x.inProgram)) {
      const members = f.people.filter((p) => p.teamId === t.id);
      if (!members.length) continue;
      const ids = new Set(members.map((m) => m.id));
      const pct =
        activeInWindow(
          f.activeDays.filter((a) => ids.has(a.personId)),
          today,
          7,
        ).size / members.length;
      if (pct < ACTIVE_PCT_TARGET)
        rows.push({
          org,
          team: { id: t.id, name: t.name },
          person: null,
          metric: 'weeklyActivePct',
          value: round(pct),
          threshold: ACTIVE_PCT_TARGET,
        });
    }
    for (const p of f.people) {
      const s = stalledFor(f, p);
      if (s.stalled)
        rows.push({
          org,
          team: p.teamId
            ? { id: p.teamId, name: f.teamName.get(p.teamId) ?? '' }
            : null,
          person: personRef(p, f),
          metric: s.reason?.startsWith('activity')
            ? 'activityDrop'
            : 'stalledDays',
          value: s.stalledDays,
          threshold: f.stalledAfterDays,
        });
    }
    return rows;
  }

  private waveRow(
    f: OrgFacts,
    org: { id: string; name: string; slug: string },
    w: Wave,
  ): LeadQueue['waves'][number] {
    const teamIds = new Set(w.teamIds);
    const members = f.people.filter((p) => p.teamId && teamIds.has(p.teamId));
    const ids = new Set(members.map((m) => m.id));
    const today = isoDay(f.now);
    const week = Math.max(
      1,
      Math.floor(
        (Date.parse(today) - Date.parse(w.startsOn)) / (7 * 86_400_000),
      ) + 1,
    );
    const skillsShipped = f.skills.filter(
      (s) =>
        s.status === 'published' &&
        s.teamId &&
        teamIds.has(s.teamId) &&
        s.publishedAt &&
        isoDay(s.publishedAt) >= w.startsOn,
    ).length;
    const withBaseline = new Set(
      f.baselines.filter((b) => ids.has(b.personId)).map((b) => b.personId),
    ).size;
    return {
      org,
      wave: w,
      week,
      skillsShipped,
      target: w.targets?.skillsShipped ?? 0,
      baselineCoveragePct: members.length
        ? round(withBaseline / members.length)
        : 0,
      activePct: members.length
        ? round(
            activeInWindow(
              f.activeDays.filter((a) => ids.has(a.personId)),
              today,
              7,
            ).size / members.length,
          )
        : 0,
      status: w.status,
    };
  }

  async clients(): Promise<LeadClientRow[]> {
    const orgs = await this.orgs.find({ order: { name: 'ASC' } });
    const waves = await this.waves.find({ where: { status: 'active' } });
    const rows: LeadClientRow[] = [];
    for (const org of orgs)
      rows.push(
        await this.clientRow(
          org,
          waves.find((w) => w.orgId === org.id) ?? null,
        ),
      );
    return rows;
  }

  private async clientRow(org: Org, wave: Wave | null): Promise<LeadClientRow> {
    const f = await this.metrics.load(org.id, { usageDays: 14 });
    const seats = Math.max(org.seats, f.people.length);
    return {
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        industry: org.industry,
        sponsorName: org.sponsorName,
        isDemo: org.isDemo,
        createdAt: org.createdAt,
      },
      seats,
      activePct: seats
        ? round(activeInWindow(f.activeDays, isoDay(f.now), 7).size / seats)
        : 0,
      rungDistribution: rungDistribution(
        f.people.map((p) => f.rungs.get(p.id) ?? 0),
      ),
      skillsPublished: f.skills.filter((s) => s.status === 'published').length,
      openEscalations: f.escalations.filter((e) => e.state !== 'resolved')
        .length,
      wave,
    };
  }

  async createClient(actor: Person, dto: CreateClientInput): Promise<Org> {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    if (typeof dto.seats !== 'number' || dto.seats < 0)
      throw new BadRequestException('seats must be a non-negative number');
    const slug = slugify(dto.slug?.trim() || dto.name);
    if (await this.orgs.findOne({ where: { slug } }))
      throw new ConflictException(`Slug "${slug}" is already taken`);
    if (
      dto.workosOrganizationId &&
      (await this.orgs.findOne({
        where: { workosOrganizationId: dto.workosOrganizationId },
      }))
    )
      throw new ConflictException(
        'That WorkOS organization is already linked to another org',
      );
    const org = await this.orgs.save(
      this.orgs.create({
        name: dto.name.trim(),
        slug,
        workosOrganizationId: dto.workosOrganizationId ?? null,
        industry: dto.industry ?? null,
        sponsorName: dto.sponsorName ?? null,
        seats: Math.round(dto.seats),
        premiumSeats: Math.max(0, Math.round(dto.premiumSeats ?? 0)),
        residencyMode: dto.residencyMode ?? 'lightci_hosted',
        settings: {
          leaderboardsEnabled: false,
          stalledAfterDays: 14,
          baselineMethod: 'interview_estimate',
        },
        marketplaceRepo: null,
        isDemo: false,
      }),
    );
    await this.costInputs.save(this.costInputs.create({ orgId: org.id }));
    await this.audit.save(
      this.audit.create({
        orgId: org.id,
        actorPersonId: actor.id,
        action: 'org.created',
        subjectType: 'org',
        subjectId: org.id,
        meta: {
          slug,
          seats: org.seats,
          workosLinked: Boolean(org.workosOrganizationId),
        },
      }),
    );
    return org;
  }

  async client(id: string) {
    const org = await this.orgs.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Org not found');
    const [row, setup, integrations, teams, waves, costInputs] =
      await Promise.all([
        this.clientRow(org, null),
        this.orgService.setup(org.id),
        this.integrations.list(org.id),
        this.orgService.listTeams(org.id),
        this.waves.find({ where: { orgId: org.id }, order: { number: 'ASC' } }),
        this.costInputs.findOne({ where: { orgId: org.id } }),
      ]);
    return {
      ...row,
      org,
      wave:
        waves.find((w) => w.status === 'active') ??
        waves[waves.length - 1] ??
        null,
      setup,
      integrations,
      teams,
      waves,
      costInputs,
    };
  }
}
