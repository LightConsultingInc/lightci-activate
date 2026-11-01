import { Injectable, Logger } from '@nestjs/common';
import { AdminClient } from './admin.client';
import { AnalyticsClient } from './analytics.client';
import { ComplianceClient } from './compliance.client';
import { ClaudeApiError, maskKey } from './http';
import { toDailyUserMetric } from './usage-mapper';
import type {
  ActivityEvent,
  ActivityFeedPage,
  ClaudeApiName,
  ClaudeKeys,
  ComplianceActivity,
  DailyUserMetricsResult,
  DateRange,
  Group,
  GroupMember,
  Member,
  ProbeResult,
  SkillUsage,
} from './types';

const DAY_MS = 86_400_000;

/**
 * Facade over the three Claude Enterprise APIs.
 *
 * Every method takes a `ClaudeKeys` object first (per-client credentials uploaded through
 * Activate). When the caller passes `undefined`, the LightCI fallback keys from the
 * environment are used:
 *   CLAUDE_ANALYTICS_API_KEY  (falls back to CLAUDE_ENTERPRISE_API_KEY)
 *   CLAUDE_ADMIN_API_KEY      (falls back to CLAUDE_ENTERPRISE_API_KEY)
 *   CLAUDE_COMPLIANCE_API_KEY
 */
@Injectable()
export class ClaudeEnterpriseService {
  private readonly log = new Logger(ClaudeEnterpriseService.name);

  constructor(
    readonly analytics: AnalyticsClient,
    readonly admin: AdminClient,
    readonly compliance: ComplianceClient,
  ) {}

  /** Fallback/demo keys from the environment. Read lazily so tests can set env vars. */
  envKeys(): ClaudeKeys {
    const e = process.env;
    const analytics =
      e.CLAUDE_ANALYTICS_API_KEY || e.CLAUDE_ENTERPRISE_API_KEY || undefined;
    const admin =
      e.CLAUDE_ADMIN_API_KEY || e.CLAUDE_ENTERPRISE_API_KEY || undefined;
    const compliance = e.CLAUDE_COMPLIANCE_API_KEY || undefined;
    return { analytics, admin, compliance };
  }

  /** Which APIs the env fallback is configured for (not whether the keys are valid; use probe()). */
  get enabled(): Record<ClaudeApiName, boolean> {
    const k = this.envKeys();
    return {
      analytics: !!k.analytics,
      admin: !!k.admin,
      compliance: !!k.compliance,
    };
  }

  private resolve(keys?: ClaudeKeys): ClaudeKeys {
    return keys ?? this.envKeys();
  }

  // ---------------------------------------------------------------- probe

  /** Validate a key set the moment an admin uploads it. Never throws. */
  async probe(keys?: ClaudeKeys): Promise<ProbeResult> {
    const k = this.resolve(keys);
    const [analytics, admin, compliance] = await Promise.all([
      this.analytics.probe(k.analytics),
      this.admin.probe(k.admin),
      this.compliance.probe(k.compliance),
    ]);
    this.log.debug(
      `probe analytics=${analytics.status}(${maskKey(k.analytics)}) admin=${admin.status}(${maskKey(k.admin)}) compliance=${compliance.status}(${maskKey(k.compliance)})`,
    );
    return {
      analytics: analytics.status,
      admin: admin.status,
      compliance: compliance.status,
      details: { analytics, admin, compliance },
    };
  }

  // ---------------------------------------------------------------- directory

  /**
   * Members of the organisation. Prefers the Admin API; falls back to the Compliance directory
   * (`/v1/compliance/organizations/{org}/users`, scope read:compliance_user_data), discovering
   * linked org UUIDs via /organizations or, failing that, from recent chats/sessions.
   */
  async listMembers(keys?: ClaudeKeys): Promise<Member[]> {
    const k = this.resolve(keys);
    if (k.admin) {
      try {
        const users = await this.admin.listAllUsers(k.admin);
        return users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name ?? null,
          role: u.role,
          addedAt: u.added_at,
          source: 'admin' as const,
        }));
      } catch (e) {
        if (!(e instanceof ClaudeApiError && e.isAuth) || !k.compliance)
          throw e;
        this.log.warn(
          `Admin API rejected key ${maskKey(k.admin)} (${e.status}); falling back to Compliance directory`,
        );
      }
    }
    if (!k.compliance)
      throw new ClaudeApiError(
        401,
        'unconfigured',
        'listMembers needs an admin or compliance key',
      );

    const orgUuids = await this.orgUuids(k.compliance);
    const out: Member[] = [];
    for (const orgUuid of orgUuids) {
      const users = await this.compliance.listAllOrgUsers(
        k.compliance,
        orgUuid,
      );
      for (const u of users) {
        out.push({
          id: u.id,
          email: u.email,
          name: u.full_name,
          role: u.organization_role,
          addedAt: u.created_at,
          source: 'compliance',
          orgUuid,
        });
      }
    }
    return out;
  }

  private async orgUuids(complianceKey: string): Promise<string[]> {
    try {
      const orgs: string[] = [];
      let page: string | undefined;
      do {
        const res = await this.compliance.listOrganizations(complianceKey, {
          limit: 500,
          page,
        });
        orgs.push(...res.data.map((o) => o.uuid));
        page = res.next_page ?? undefined;
      } while (page);
      if (orgs.length) return orgs;
    } catch (e) {
      if (!(e instanceof ClaudeApiError && e.status === 403)) throw e;
    }
    return this.compliance.discoverOrgUuids(complianceKey);
  }

  /** RBAC groups. Admin API (read:rbac_groups) first, then Compliance (read:compliance_org_data). */
  async listGroups(keys?: ClaudeKeys): Promise<Group[]> {
    const k = this.resolve(keys);
    if (k.admin) {
      try {
        const groups = await this.admin.listAllGroups(k.admin);
        return groups.map((g) => ({
          id: g.id,
          name: g.name,
          sourceType: g.source_type,
          roleIds: g.roles ?? [],
          createdAt: g.created_at,
          updatedAt: g.updated_at,
          source: 'admin' as const,
        }));
      } catch (e) {
        if (!(e instanceof ClaudeApiError && e.isAuth) || !k.compliance)
          throw e;
      }
    }
    if (!k.compliance)
      throw new ClaudeApiError(
        401,
        'unconfigured',
        'listGroups needs an admin or compliance key',
      );
    const groups = await this.compliance.listAllGroups(k.compliance);
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      sourceType: g.source_type,
      roleIds: g.roles ?? [],
      createdAt: g.created_at,
      updatedAt: g.updated_at,
      source: 'compliance' as const,
    }));
  }

  async listGroupMembers(
    keys: ClaudeKeys | undefined,
    groupId: string,
  ): Promise<GroupMember[]> {
    const k = this.resolve(keys);
    if (k.admin) {
      try {
        const members = await this.admin.listAllGroupMembers(k.admin, groupId);
        return members.map((m) => ({
          groupId: m.group_id,
          userId: m.user_id,
          email: m.email,
          addedAt: m.created_at,
        }));
      } catch (e) {
        if (!(e instanceof ClaudeApiError && e.isAuth) || !k.compliance)
          throw e;
      }
    }
    if (!k.compliance)
      throw new ClaudeApiError(
        401,
        'unconfigured',
        'listGroupMembers needs an admin or compliance key',
      );
    const members = await this.compliance.listAllGroupMembers(
      k.compliance,
      groupId,
    );
    return members.map((m) => ({
      groupId,
      userId: m.user_id,
      email: m.email,
      addedAt: m.created_at,
    }));
  }

  // ---------------------------------------------------------------- analytics

  /**
   * Per-user, per-day metrics for [from, to] inclusive. One /analytics/users call (plus pages)
   * per day, so a 30-day range costs >= 30 of the 60 req/min budget. Days the API reports as
   * not yet available (400, one-day lag) are returned in `skippedDays` rather than failing.
   */
  async dailyUserMetrics(
    keys: ClaudeKeys | undefined,
    range: DateRange & { groupId?: string },
  ): Promise<DailyUserMetricsResult> {
    const k = this.resolve(keys);
    if (!k.analytics)
      throw new ClaudeApiError(
        401,
        'unconfigured',
        'dailyUserMetrics needs an analytics key',
      );
    const result: DailyUserMetricsResult = { records: [], skippedDays: [] };
    const filter = range.groupId
      ? [`rbac_group_id:${range.groupId}`]
      : undefined;
    for (const day of eachDay(range.from, range.to)) {
      try {
        const rows = await this.analytics.listAllUsers(k.analytics, {
          date: day,
          filter,
        });
        for (const row of rows)
          result.records.push(toDailyUserMetric(row, day));
      } catch (e) {
        if (e instanceof ClaudeApiError && e.status === 400) {
          result.skippedDays.push({ day, reason: e.message });
          continue;
        }
        throw e;
      }
    }
    return result;
  }

  /**
   * Skill usage aggregated over [from, to]. `ending_date` is sent as `to + 1 day`, assuming the
   * exclusive semantics documented for /summaries apply here too.
   */
  async skillUsage(
    keys: ClaudeKeys | undefined,
    range: DateRange & { groupId?: string; groupByProductSurface?: boolean },
  ): Promise<SkillUsage[]> {
    const k = this.resolve(keys);
    if (!k.analytics)
      throw new ClaudeApiError(
        401,
        'unconfigured',
        'skillUsage needs an analytics key',
      );
    const rows = await this.analytics.listAll(
      (key, params) => this.analytics.skills(key, params),
      k.analytics,
      {
        starting_date: range.from,
        ending_date: addDays(range.to, 1),
        filter: range.groupId ? [`rbac_group_id:${range.groupId}`] : undefined,
        group_by: range.groupByProductSurface ? ['product_surface'] : undefined,
      },
    );
    return rows.map((r) => ({
      skillId: r.skill_id ?? null,
      skillName: r.skill_name ?? r.skill_id ?? 'unknown',
      usageCount: r.usage_count ?? 0,
      userCount: r.user_count ?? null,
      distinctUserCount: r.distinct_user_count ?? null,
      productSurface: r.product_surface ?? null,
    }));
  }

  // ---------------------------------------------------------------- compliance

  /**
   * Activity feed since an RFC 3339 timestamp, newest first. Pass `nextCursor` back as `cursor`
   * for the next (older) page. Skill-sharing shows up as `role_assignment` / `rbac_role_assigned`;
   * pass `types` to filter server-side.
   */
  async activityFeed(
    keys: ClaudeKeys | undefined,
    opts: { since: string; cursor?: string; limit?: number; types?: string[] },
  ): Promise<ActivityFeedPage> {
    const k = this.resolve(keys);
    if (!k.compliance)
      throw new ClaudeApiError(
        401,
        'unconfigured',
        'activityFeed needs a compliance key',
      );
    const page = await this.compliance.activities(k.compliance, {
      'created_at.gte': opts.since,
      after_id: opts.cursor,
      limit: opts.limit ?? 100,
      activity_types: opts.types,
    });
    return {
      events: page.data.map(normalizeActivity),
      nextCursor: page.has_more ? page.last_id : null,
      hasMore: page.has_more,
    };
  }
}

export function normalizeActivity(a: ComplianceActivity): ActivityEvent {
  const {
    id,
    created_at,
    organization_id,
    organization_uuid,
    actor,
    type,
    ...data
  } = a;
  const act: ActivityEvent['actor'] = { type: actor?.type ?? 'unknown' };
  if (actor && 'user_id' in actor && typeof actor.user_id === 'string')
    act.userId = actor.user_id;
  if (actor && 'email_address' in actor)
    act.email = (actor.email_address as string | null) ?? null;
  if (actor && 'api_key_id' in actor && typeof actor.api_key_id === 'string')
    act.apiKeyId = actor.api_key_id;
  if (
    actor &&
    'admin_api_key_id' in actor &&
    typeof actor.admin_api_key_id === 'string'
  )
    act.apiKeyId = actor.admin_api_key_id;
  return {
    id,
    type,
    createdAt: created_at,
    orgId: organization_id ?? null,
    orgUuid: organization_uuid ?? null,
    actor: act,
    data,
  };
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Inclusive list of YYYY-MM-DD days. Throws on malformed input or reversed ranges. */
export function eachDay(from: string, to: string): string[] {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b))
    throw new Error(`Invalid date range ${from}..${to} (expected YYYY-MM-DD)`);
  if (b < a) throw new Error(`Date range end ${to} is before start ${from}`);
  const days: string[] = [];
  for (let t = a; t <= b; t += DAY_MS)
    days.push(new Date(t).toISOString().slice(0, 10));
  return days;
}
