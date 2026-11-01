import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { isoDay } from '../common/dates';
import { Org } from '../orgs/entities/org.entity';
import { Person } from '../orgs/entities/person.entity';
import { OrgService, slugify } from '../orgs/org.service';
import { IntegrationsService } from '../orgs/integrations.service';
import { WorkosService, type PortalIntent } from '../auth/workos.service';
import { parseEmailDomains } from '../auth/email-domains';
import { DEFAULT_ROLE_MAPPING } from '../auth/role-mapping';
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
import type {
  LeadClientRow,
  LeadQueue,
  PersonRef,
  PromotionView,
} from './ops.types';

export const ACTIVE_PCT_TARGET = 0.6; // spec: weekly active on real work ≥ 60%

export interface CreateClientInput {
  name: string;
  slug?: string;
  /** Link an existing WorkOS organisation instead of creating one. */
  workosOrganizationId?: string | null;
  /** Email domains the company owns; sign-in routes them to its SSO. */
  emailDomains?: string[] | string;
  /** Create the WorkOS organisation as part of provisioning (default true when WorkOS is configured). */
  createIdentityOrganization?: boolean;
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
    private readonly workos: WorkosService,
    @InjectRepository(Org) private readonly orgs: Repository<Org>,
    @InjectRepository(Wave) private readonly waves: Repository<Wave>,
    @InjectRepository(CostInput)
    private readonly costInputs: Repository<CostInput>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
    @InjectRepository(Person) private readonly people: Repository<Person>,
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
      const open = f.escalations.filter((x) => x.state !== 'resolved');
      // Assignees outside the org's roster (LightCI leads) are looked up directly.
      const outsiders = await this.outsideAssignees(
        f,
        open.map((e) => e.assigneePersonId),
      );
      for (const e of open) {
        out.escalations.push({
          ...e,
          org: ref,
          subject: this.subject(f, e.subjectType, e.subjectId),
          assignee:
            personById(f, e.assigneePersonId) ??
            (e.assigneePersonId
              ? (outsiders.get(e.assigneePersonId) ?? null)
              : null),
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

  private async outsideAssignees(
    f: OrgFacts,
    ids: (string | null)[],
  ): Promise<Map<string, PersonRef>> {
    const missing = [
      ...new Set(
        ids.filter(
          (id): id is string =>
            Boolean(id) && !f.people.some((p) => p.id === id),
        ),
      ),
    ];
    if (!missing.length) return new Map();
    const rows = await this.people.find({ where: { id: In(missing) } });
    return new Map(
      rows.map((p) => [
        p.id,
        {
          id: p.id,
          name: p.name,
          email: p.email,
          title: p.title,
          avatarUrl: p.avatarUrl,
          teamId: p.teamId,
          teamName: null,
          rung: 0,
          roles: p.roles,
        },
      ]),
    );
  }

  /** Small subject summary for the queue card and drawer; `slug` lets the UI deep-link skills. */
  private subject(
    f: OrgFacts,
    type: string,
    id: string | null,
  ): { id: string; name: string; type: string; slug?: string | null } | null {
    if (!id) return null;
    const mk = (name: string | null | undefined, slug?: string | null) =>
      name ? { id, name, type, ...(slug !== undefined ? { slug } : {}) } : null;
    switch (type) {
      case 'person':
        return mk(f.people.find((p) => p.id === id)?.name);
      case 'team':
        return mk(f.teamName.get(id));
      case 'skill': {
        const s = f.skills.find((x) => x.id === id);
        return mk(s?.name, s?.slug ?? null);
      }
      case 'workflow':
        return mk(f.workflows.find((w) => w.id === id)?.name);
      case 'exercise':
        return mk(f.exercises.find((e) => e.id === id)?.title);
      case 'promotion_request': {
        const pr = f.promotions.find((p) => p.id === id);
        const s = pr ? f.skills.find((x) => x.id === pr.skillId) : undefined;
        return mk(s?.name, s?.slug ?? null);
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
          reason: 'weekly active on real work below target',
          stalledSince: null,
          slaDueAt: null,
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
          reason: 'weekly active on real work below target',
          stalledSince: null,
          slaDueAt: null,
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
          metric: s.reason?.includes('activity dropped')
            ? 'activityDrop'
            : 'stalledDays',
          value: s.stalledDays,
          threshold: f.stalledAfterDays,
          reason: s.reason,
          stalledSince: s.stalledSince,
          slaDueAt: s.slaDueAt,
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
    const emailDomains = parseEmailDomains(dto.emailDomains);
    for (const domain of emailDomains) {
      const taken = await this.orgs
        .createQueryBuilder('o')
        .where(':domain = ANY(o."emailDomains")', { domain })
        .getOne();
      if (taken)
        throw new ConflictException(
          `The email domain ${domain} already belongs to ${taken.name}`,
        );
    }

    // Create the customer's identity organisation unless the lead linked an existing one.
    let workosOrganizationId = dto.workosOrganizationId ?? null;
    const createIdentity =
      !workosOrganizationId &&
      this.workos.enabled &&
      dto.createIdentityOrganization !== false;
    if (createIdentity) {
      const created = await this.workos.createOrganization(
        dto.name.trim(),
        emailDomains,
        slug,
      );
      workosOrganizationId = created.id;
    }

    const org = await this.orgs.save(
      this.orgs.create({
        name: dto.name.trim(),
        slug,
        workosOrganizationId,
        emailDomains,
        industry: dto.industry ?? null,
        sponsorName: dto.sponsorName ?? null,
        seats: Math.round(dto.seats),
        premiumSeats: Math.max(0, Math.round(dto.premiumSeats ?? 0)),
        residencyMode: dto.residencyMode ?? 'lightci_hosted',
        settings: {
          leaderboardsEnabled: false,
          stalledAfterDays: 14,
          baselineMethod: 'interview_estimate',
          // New orgs take roles from their IdP from day one.
          identity: { roleMapping: { ...DEFAULT_ROLE_MAPPING } },
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
          identityCreated: createIdentity,
          emailDomains,
        },
      }),
    );
    return org;
  }

  /**
   * A one-time Admin Portal link for the customer's IT admin to connect their IdP or
   * directory themselves. The link is not stored; it is handed to the lead to pass on.
   */
  async portalLink(
    actor: Person,
    orgId: string,
    intent: PortalIntent,
    returnUrl: string,
  ): Promise<{ url: string; intent: PortalIntent }> {
    const org = await this.orgs.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Org not found');
    if (!org.workosOrganizationId)
      throw new BadRequestException(
        'This company has no identity organisation yet. Provision one first.',
      );
    if (!this.workos.enabled)
      throw new BadRequestException('WorkOS is not configured on this server.');
    const url = await this.workos.portalLink(
      org.workosOrganizationId,
      intent,
      returnUrl,
    );
    await this.audit.save(
      this.audit.create({
        orgId: org.id,
        actorPersonId: actor.id,
        action: 'identity.portal_link',
        subjectType: 'org',
        subjectId: org.id,
        meta: { intent },
      }),
    );
    return { url, intent };
  }

  async client(id: string) {
    const org = await this.orgs.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Org not found');
    const ssoConnections =
      org.workosOrganizationId && this.workos.enabled
        ? await this.workos.countActiveConnections(org.workosOrganizationId)
        : null;
    const [row, setup, integrations, teams, waves, costInputs] =
      await Promise.all([
        this.clientRow(org, null),
        this.orgService.setup(org.id, { ssoConnections }),
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
