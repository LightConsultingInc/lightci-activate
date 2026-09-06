import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { ClaudeEnterpriseService } from '../claude-enterprise/claude-enterprise.service';
import { ROLES, type Role } from '../common/roles';
import { SecretsService } from '../common/secrets.service';
import { ContextSource } from '../context/entities/context-source.entity';
import { AuditLog } from '../ops/entities/audit-log.entity';
import { Baseline } from '../workflows/entities/baseline.entity';
import {
  Org,
  type ComplianceBoundary,
  type MarketplaceRepo,
} from './entities/org.entity';
import {
  INTEGRATION_KINDS,
  OrgIntegration,
  type IntegrationKind,
} from './entities/org-integration.entity';
import { Person } from './entities/person.entity';
import { Team } from './entities/team.entity';
import {
  IntegrationsService,
  type IntegrationSummary,
} from './integrations.service';
import { settingsOf, type GovernedOrgSettings } from './org-settings';

export interface OrgPatch {
  settings?: Partial<GovernedOrgSettings>;
  seats?: number;
  premiumSeats?: number;
  marketplaceRepo?: MarketplaceRepo | null;
  name?: string;
  industry?: string | null;
  sponsorName?: string | null;
  auditNote?: string;
}

export interface SetupStep {
  key: string;
  label: string;
  done: boolean;
  detail: string;
}

export interface TeamPatch {
  name?: string;
  championPersonId?: string | null;
  inProgram?: boolean;
  pluginName?: string | null;
  rbacGroupId?: string | null;
  purpose?: string | null;
  programStartedOn?: string | null;
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'team'
  );
}

@Injectable()
export class OrgService {
  private readonly logger = new Logger(OrgService.name);

  constructor(
    @InjectRepository(Org) private readonly orgs: Repository<Org>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(Person) private readonly people: Repository<Person>,
    @InjectRepository(OrgIntegration)
    private readonly integrationRows: Repository<OrgIntegration>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
    @InjectRepository(ContextSource)
    private readonly sources: Repository<ContextSource>,
    @InjectRepository(Baseline)
    private readonly baselines: Repository<Baseline>,
    private readonly integrations: IntegrationsService,
    private readonly secrets: SecretsService,
    private readonly ai: AiService,
    private readonly claude: ClaudeEnterpriseService,
  ) {}

  // ---------------------------------------------------------------- org

  async get(orgId: string) {
    const org = await this.load(orgId);
    const [people, teams] = await Promise.all([
      this.people.count({ where: { orgId } }),
      this.teams.count({ where: { orgId } }),
    ]);
    return { ...org, counts: { people, teams } };
  }

  async load(orgId: string): Promise<Org> {
    const org = orgId
      ? await this.orgs.findOne({ where: { id: orgId } })
      : null;
    if (!org) throw new NotFoundException('Org not found');
    return org;
  }

  /** PATCH /org. Policy and boundary changes bump their versions and write AuditLog entries. */
  async patch(orgId: string, actor: Person, dto: OrgPatch): Promise<Org> {
    const org = await this.load(orgId);
    const before = settingsOf(org);
    const changes: Record<string, unknown> = {};
    const note = dto.auditNote?.trim() || undefined;
    if (note) changes.note = note;
    if (dto.settings) {
      // Older clients sent their own `usagePolicyVersion`; the API owns every version field.
      const { usagePolicyVersion: _legacyVersion, ...incoming } =
        dto.settings as Partial<GovernedOrgSettings> & {
          usagePolicyVersion?: number;
        };
      void _legacyVersion;
      const next: GovernedOrgSettings = { ...before, ...incoming };
      delete (next as { usagePolicyVersion?: number }).usagePolicyVersion;
      const policyChanged =
        dto.settings.usagePolicy !== undefined &&
        (dto.settings.usagePolicy ?? '') !== (before.usagePolicy ?? '');
      const boundaryChanged =
        dto.settings.boundary !== undefined &&
        JSON.stringify(normaliseBoundary(dto.settings.boundary)) !==
          JSON.stringify(normaliseBoundary(before.boundary));
      // never let a client overwrite the bookkeeping fields directly
      next.policyVersion = before.policyVersion ?? (before.usagePolicy ? 1 : 0);
      next.boundaryVersion =
        before.boundaryVersion ?? (before.boundary ? 1 : 0);
      next.policyUpdatedAt = before.policyUpdatedAt ?? null;
      next.boundaryUpdatedAt = before.boundaryUpdatedAt ?? null;
      const now = new Date().toISOString();
      if (policyChanged) {
        next.policyVersion += 1;
        next.policyUpdatedAt = now;
        await this.log(orgId, actor, 'policy.updated', 'org', orgId, {
          version: next.policyVersion,
          chars: (next.usagePolicy ?? '').length,
          ...(note ? { note } : {}),
        });
        changes.policyVersion = next.policyVersion;
      }
      if (boundaryChanged) {
        next.boundary = normaliseBoundary(dto.settings.boundary)!;
        next.boundaryVersion += 1;
        next.boundaryUpdatedAt = now;
        await this.log(orgId, actor, 'boundary.updated', 'org', orgId, {
          version: next.boundaryVersion,
          boundary: next.boundary,
          ...(note ? { note } : {}),
        });
        changes.boundaryVersion = next.boundaryVersion;
      }
      org.settings = next;
      changes.settings = Object.keys(dto.settings);
    }
    if (dto.seats !== undefined) {
      assertNonNegInt(dto.seats, 'seats');
      org.seats = dto.seats;
      changes.seats = dto.seats;
    }
    if (dto.premiumSeats !== undefined) {
      assertNonNegInt(dto.premiumSeats, 'premiumSeats');
      org.premiumSeats = dto.premiumSeats;
      changes.premiumSeats = dto.premiumSeats;
    }
    if (dto.marketplaceRepo !== undefined) {
      org.marketplaceRepo = dto.marketplaceRepo
        ? {
            ...dto.marketplaceRepo,
            linkedAt: dto.marketplaceRepo.linkedAt ?? new Date().toISOString(),
          }
        : null;
      changes.marketplaceRepo = Boolean(dto.marketplaceRepo);
    }
    if (dto.name !== undefined && dto.name.trim()) {
      org.name = dto.name.trim();
      changes.name = org.name;
    }
    if (dto.industry !== undefined) org.industry = dto.industry;
    if (dto.sponsorName !== undefined) org.sponsorName = dto.sponsorName;
    const saved = await this.orgs.save(org);
    await this.log(orgId, actor, 'org.updated', 'org', orgId, changes);
    return saved;
  }

  // ---------------------------------------------------------------- integrations

  listIntegrations(orgId: string): Promise<IntegrationSummary[]> {
    return this.integrations.list(orgId);
  }

  async putIntegration(
    orgId: string,
    actor: Person,
    kind: string,
    secret: string,
    config?: Record<string, string>,
  ): Promise<IntegrationSummary> {
    const k = assertKind(kind);
    if (!secret || !secret.trim())
      throw new BadRequestException('secret is required');
    await this.integrations.upsert(orgId, k, secret, actor.id, config ?? {});
    const result = await this.verifyIntegration(orgId, actor, k);
    await this.log(
      orgId,
      actor,
      'integration.updated',
      'org_integration',
      null,
      { kind: k, ok: result.status === 'verified' },
    );
    return result;
  }

  async deleteIntegration(orgId: string, actor: Person, kind: string) {
    const k = assertKind(kind);
    await this.integrations.remove(orgId, k);
    await this.setConfiguredFlag(orgId, k, false);
    await this.log(
      orgId,
      actor,
      'integration.removed',
      'org_integration',
      null,
      { kind: k },
    );
    return { ok: true };
  }

  async verifyIntegration(
    orgId: string,
    actor: Person | null,
    kind: string,
  ): Promise<IntegrationSummary> {
    const k = assertKind(kind);
    const row = await this.integrationRows.findOne({
      where: { orgId, kind: k },
    });
    if (!row) throw new NotFoundException(`No ${k} key stored for this org`);
    const secret = this.secrets.decrypt(row.encryptedSecret);
    const { ok, detail } = await this.check(k, secret);
    await this.integrations.markVerification(orgId, k, ok, detail);
    await this.setConfiguredFlag(orgId, k, ok);
    if (actor)
      await this.log(
        orgId,
        actor,
        'integration.verified',
        'org_integration',
        row.id,
        { kind: k, ok, detail },
      );
    const summary = (await this.integrations.list(orgId)).find(
      (i) => i.kind === k,
    )!;
    return summary;
  }

  private async check(
    kind: IntegrationKind,
    secret: string,
  ): Promise<{ ok: boolean; detail: string }> {
    try {
      switch (kind) {
        case 'anthropic':
          return await this.ai.verifyKey(secret);
        case 'claude_analytics':
        case 'claude_admin':
        case 'claude_compliance': {
          const api = kind.replace('claude_', '') as
            'analytics' | 'admin' | 'compliance';
          const probe = await this.claude.probe({ [api]: secret });
          const status = probe[api];
          const d = probe.details[api];
          const scopes = d.scopes?.length
            ? ` scopes: ${d.scopes.join(', ')}`
            : '';
          return status === 'ok'
            ? { ok: true, detail: `${api} API reachable.${scopes}` }
            : {
                ok: false,
                detail: `${status}${d.httpStatus ? ` (${d.httpStatus})` : ''}${d.message ? `: ${d.message}` : ''}${scopes}`,
              };
        }
        case 'github': {
          const res = await fetch('https://api.github.com/user', {
            headers: {
              Authorization: `Bearer ${secret}`,
              'User-Agent': 'lightci-activate',
              Accept: 'application/vnd.github+json',
            },
          });
          if (!res.ok)
            return { ok: false, detail: `GitHub responded ${res.status}` };
          const body = (await res.json()) as { login?: string };
          const scopes = res.headers.get('x-oauth-scopes');
          return {
            ok: true,
            detail: `Token valid for ${body.login ?? 'user'}${scopes ? ` (scopes: ${scopes})` : ''}`,
          };
        }
      }
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async setConfiguredFlag(
    orgId: string,
    kind: IntegrationKind,
    ok: boolean,
  ) {
    const flag: Record<string, keyof GovernedOrgSettings | null> = {
      claude_analytics: 'claudeAnalyticsConfigured',
      claude_admin: 'claudeAdminConfigured',
      claude_compliance: 'claudeComplianceConfigured',
      anthropic: null,
      github: null,
    };
    const key = flag[kind];
    if (!key) return;
    const org = await this.load(orgId);
    org.settings = { ...settingsOf(org), [key]: ok };
    await this.orgs.save(org);
  }

  // ---------------------------------------------------------------- setup checklist

  async setup(
    orgId: string,
  ): Promise<{ steps: SetupStep[]; complete: number; total: number }> {
    const org = await this.load(orgId);
    const s = settingsOf(org);
    const [integrations, teams, contextReviewed, baselines, people] =
      await Promise.all([
        this.integrations.list(orgId),
        this.teams.find({ where: { orgId } }),
        this.sources.count({
          where: { orgId, layer: 'company', reviewState: 'reviewed' },
        }),
        this.people
          .find({ where: { orgId }, select: { id: true } })
          .then((ps) =>
            ps.length
              ? this.baselines.count({
                  where: { personId: In(ps.map((p) => p.id)) },
                })
              : 0,
          ),
        this.people.count({ where: { orgId } }),
      ]);
    const configured = (k: IntegrationKind) =>
      integrations.find((i) => i.kind === k);
    const keyOk = (k: IntegrationKind) => {
      const i = configured(k);
      return Boolean(
        i?.configured && (i.status === 'verified' || i.source === 'platform'),
      );
    };
    const keyKinds: IntegrationKind[] = [
      'anthropic',
      'claude_analytics',
      'claude_admin',
      'claude_compliance',
    ];
    const keysDone =
      keyOk('anthropic') &&
      (keyOk('claude_analytics') ||
        keyOk('claude_admin') ||
        keyOk('claude_compliance'));
    const groups = teams.filter((t) => t.rbacGroupId).length;
    const steps: SetupStep[] = [
      {
        key: 'keys',
        label: 'API keys configured',
        done: keysDone,
        detail: keyKinds
          .map(
            (k) =>
              `${k}: ${configured(k)?.status ?? (configured(k)?.configured ? configured(k)!.source : 'missing')}`,
          )
          .join(', '),
      },
      {
        key: 'sso',
        label: 'SSO linked (WorkOS organization)',
        done: Boolean(org.workosOrganizationId),
        detail: org.workosOrganizationId
          ? `WorkOS org ${org.workosOrganizationId}; ${people} people`
          : 'No WorkOS organization id on the org',
      },
      {
        key: 'groups',
        label: 'Groups imported as teams',
        done: groups > 0,
        detail: `${groups} of ${teams.length} teams linked to an RBAC group`,
      },
      {
        key: 'context',
        label: 'Company context ingested and reviewed',
        done: contextReviewed >= 1,
        detail: `${contextReviewed} reviewed company source(s)`,
      },
      {
        key: 'governance',
        label: 'Usage policy and compliance boundary set',
        done:
          Boolean(s.usagePolicy?.trim()) &&
          Boolean(
            s.boundary &&
            (s.boundary.allowedDataClasses?.length ||
              s.boundary.forbiddenDataClasses?.length),
          ),
        detail: `policy v${s.policyVersion ?? (s.usagePolicy ? 1 : 0)}, boundary v${s.boundaryVersion ?? (s.boundary ? 1 : 0)}`,
      },
      {
        key: 'repo',
        label: 'Marketplace repo linked',
        done: Boolean(org.marketplaceRepo),
        detail: org.marketplaceRepo
          ? `${org.marketplaceRepo.provider}${org.marketplaceRepo.owner ? ` ${org.marketplaceRepo.owner}/${org.marketplaceRepo.repo}` : ''} (${org.marketplaceRepo.defaultBranch})`
          : 'Not linked',
      },
      {
        key: 'connector',
        label: 'Activate connector verified in Claude',
        done: Boolean(s.connectorVerifiedAt),
        detail: s.connectorVerifiedAt
          ? `Verified ${s.connectorVerifiedAt}`
          : 'my_ladder has not rendered in a test chat yet',
      },
      {
        key: 'baseline',
        label: 'At least one baseline captured',
        done: baselines >= 1,
        detail: `${baselines} baseline(s)`,
      },
    ];
    return {
      steps,
      complete: steps.filter((x) => x.done).length,
      total: steps.length,
    };
  }

  // ---------------------------------------------------------------- teams

  async listTeams(orgId: string) {
    if (!orgId) return []; // lead with no client selected
    const [teams, people] = await Promise.all([
      this.teams.find({ where: { orgId }, order: { name: 'ASC' } }),
      this.people.find({ where: { orgId } }),
    ]);
    const byId = new Map(people.map((p) => [p.id, p]));
    return teams.map((t) => {
      const champion = t.championPersonId
        ? byId.get(t.championPersonId)
        : undefined;
      return {
        ...t,
        members: people.filter((p) => p.teamId === t.id).length,
        champion: champion
          ? {
              id: champion.id,
              name: champion.name,
              email: champion.email,
              avatarUrl: champion.avatarUrl,
            }
          : null,
      };
    });
  }

  async createTeam(
    orgId: string,
    actor: Person,
    dto: TeamPatch & { name: string; slug?: string },
  ) {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    const slug = await this.uniqueSlug(
      orgId,
      dto.slug ? slugify(dto.slug) : slugify(dto.name),
    );
    if (dto.championPersonId)
      await this.assertPersonInOrg(orgId, dto.championPersonId);
    const team = await this.teams.save(
      this.teams.create({
        orgId,
        name: dto.name.trim(),
        slug,
        pluginName: dto.pluginName ?? slug,
        championPersonId: dto.championPersonId ?? null,
        rbacGroupId: dto.rbacGroupId ?? null,
        inProgram: dto.inProgram ?? true,
        purpose: dto.purpose ?? null,
        programStartedOn: dto.programStartedOn ?? null,
      }),
    );
    if (team.championPersonId)
      await this.ensureChampionRole(team.championPersonId);
    await this.log(orgId, actor, 'team.created', 'team', team.id, {
      name: team.name,
    });
    return team;
  }

  async patchTeam(orgId: string, actor: Person, id: string, dto: TeamPatch) {
    const team = await this.teams.findOne({ where: { id, orgId } });
    if (!team) throw new NotFoundException('Team not found');
    if (dto.name !== undefined && dto.name.trim()) team.name = dto.name.trim();
    if (dto.championPersonId !== undefined) {
      if (dto.championPersonId)
        await this.assertPersonInOrg(orgId, dto.championPersonId);
      team.championPersonId = dto.championPersonId;
    }
    if (dto.inProgram !== undefined) team.inProgram = dto.inProgram;
    if (dto.pluginName !== undefined) team.pluginName = dto.pluginName;
    if (dto.rbacGroupId !== undefined) team.rbacGroupId = dto.rbacGroupId;
    if (dto.purpose !== undefined) team.purpose = dto.purpose;
    if (dto.programStartedOn !== undefined)
      team.programStartedOn = dto.programStartedOn;
    const saved = await this.teams.save(team);
    if (saved.championPersonId)
      await this.ensureChampionRole(saved.championPersonId);
    await this.log(orgId, actor, 'team.updated', 'team', id, { ...dto });
    return saved;
  }

  /** Admin API groups → Teams (match on rbacGroupId, then name/slug; create the rest). 501 when no admin key. */
  async importGroups(orgId: string, actor: Person) {
    const resolved = await this.integrations.resolve(orgId, 'claude_admin');
    if (!resolved)
      throw new NotImplementedException(
        'No Claude Admin API key configured for this org. Add one under Integrations (scope read:rbac_groups) and retry.',
      );
    let groups;
    try {
      groups = await this.claude.listGroups({ admin: resolved.secret });
    } catch (error) {
      throw new NotImplementedException(
        `Admin API groups unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const teams = await this.teams.find({ where: { orgId } });
    let created = 0;
    let linked = 0;
    for (const g of groups) {
      const existing =
        teams.find((t) => t.rbacGroupId === g.id) ??
        teams.find(
          (t) =>
            t.name.toLowerCase() === g.name.toLowerCase() ||
            t.slug === slugify(g.name),
        );
      if (existing) {
        if (existing.rbacGroupId !== g.id) {
          existing.rbacGroupId = g.id;
          await this.teams.save(existing);
          linked++;
        }
        continue;
      }
      const slug = await this.uniqueSlug(orgId, slugify(g.name));
      const team = await this.teams.save(
        this.teams.create({
          orgId,
          name: g.name,
          slug,
          rbacGroupId: g.id,
          pluginName: slug,
          inProgram: false,
        }),
      );
      teams.push(team);
      created++;
    }
    const org = await this.load(orgId);
    org.settings = { ...settingsOf(org), claudeAdminConfigured: true };
    await this.orgs.save(org);
    await this.log(orgId, actor, 'teams.imported', 'org', orgId, {
      groups: groups.length,
      created,
      linked,
      source: groups[0]?.source ?? 'admin',
    });
    return {
      groups: groups.length,
      created,
      linked,
      teams: await this.listTeams(orgId),
    };
  }

  private async uniqueSlug(orgId: string, base: string) {
    let slug = base;
    for (let i = 2; await this.teams.findOne({ where: { orgId, slug } }); i++)
      slug = `${base}-${i}`;
    return slug;
  }

  private async ensureChampionRole(personId: string) {
    const p = await this.people.findOne({ where: { id: personId } });
    if (p && !p.roles.includes('champion'))
      await this.people.update(p.id, { roles: [...p.roles, 'champion'] });
  }

  private async assertPersonInOrg(orgId: string, personId: string) {
    const p = await this.people.findOne({ where: { id: personId, orgId } });
    if (!p) throw new BadRequestException('Person is not in this org');
    return p;
  }

  // ---------------------------------------------------------------- people

  async listPeople(orgId: string, teamId?: string | null) {
    if (!orgId) return []; // lead with no client selected
    const people = await this.people.find({
      where: teamId ? { orgId, teamId } : { orgId },
      order: { name: 'ASC' },
    });
    const teams = await this.teams.find({ where: { orgId } });
    const teamName = new Map(teams.map((t) => [t.id, t.name]));
    return people.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      title: p.title,
      avatarUrl: p.avatarUrl,
      teamId: p.teamId,
      teamName: p.teamId ? (teamName.get(p.teamId) ?? null) : null,
      roles: p.roles,
      status: p.status,
      premiumSeat: p.premiumSeat,
      claudeUserId: p.claudeUserId,
      cohortWeek: p.cohortWeek,
      onboardedAt: p.onboardedAt,
      lastActiveAt: p.lastActiveAt,
      lastSeenAt: p.lastSeenAt,
      createdAt: p.createdAt,
    }));
  }

  async patchPerson(
    orgId: string,
    actor: Person,
    id: string,
    dto: {
      teamId?: string | null;
      roles?: string[];
      title?: string | null;
      status?: Person['status'];
      premiumSeat?: boolean;
    },
  ) {
    const p = await this.people.findOne({ where: { id, orgId } });
    if (!p) throw new NotFoundException('Person not found in this org');
    if (dto.teamId !== undefined) {
      if (
        dto.teamId &&
        !(await this.teams.findOne({ where: { id: dto.teamId, orgId } }))
      )
        throw new BadRequestException('Team is not in this org');
      p.teamId = dto.teamId;
    }
    if (dto.roles !== undefined) {
      const roles = [...new Set(dto.roles)].filter((r): r is Role =>
        (ROLES as readonly string[]).includes(r),
      );
      if (roles.length !== new Set(dto.roles).size)
        throw new BadRequestException(
          `roles must be a subset of ${ROLES.join(', ')}`,
        );
      if (roles.includes('lead') && !actor.roles.includes('lead'))
        throw new ForbiddenException(
          'Only a LightCI lead can grant the lead role',
        );
      if (
        !roles.includes('lead') &&
        p.roles.includes('lead') &&
        !actor.roles.includes('lead')
      )
        roles.push('lead');
      p.roles = roles.length ? roles : ['learner'];
    }
    if (dto.title !== undefined) p.title = dto.title;
    if (dto.status !== undefined) {
      if (!['invited', 'active', 'inactive'].includes(dto.status))
        throw new BadRequestException('status must be invited|active|inactive');
      p.status = dto.status;
    }
    if (dto.premiumSeat !== undefined) p.premiumSeat = dto.premiumSeat;
    const saved = await this.people.save(p);
    await this.log(orgId, actor, 'person.updated', 'person', id, { ...dto });
    return saved;
  }

  // ---------------------------------------------------------------- audit

  private log(
    orgId: string,
    actor: Person | null,
    action: string,
    subjectType: string | null,
    subjectId: string | null,
    meta: Record<string, unknown> = {},
  ) {
    return this.audit.save(
      this.audit.create({
        orgId,
        actorPersonId: actor?.id ?? null,
        action,
        subjectType,
        subjectId,
        meta,
      }),
    );
  }
}

function assertKind(kind: string): IntegrationKind {
  if (!(INTEGRATION_KINDS as readonly string[]).includes(kind))
    throw new BadRequestException(
      `kind must be one of ${INTEGRATION_KINDS.join(', ')}`,
    );
  return kind as IntegrationKind;
}

function assertNonNegInt(v: unknown, name: string) {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0)
    throw new BadRequestException(`${name} must be a non-negative integer`);
}

function normaliseBoundary(
  b: ComplianceBoundary | null | undefined,
): ComplianceBoundary | null {
  if (!b) return null;
  const arr = (x: unknown) =>
    Array.isArray(x)
      ? [...new Set(x.map((s) => String(s).trim()).filter(Boolean))].sort()
      : [];
  return {
    allowedDataClasses: arr(b.allowedDataClasses),
    forbiddenDataClasses: arr(b.forbiddenDataClasses),
    readOnlySystems: arr(b.readOnlySystems),
    humanReviewPoints: arr(b.humanReviewPoints),
  };
}
