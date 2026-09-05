import { Injectable } from '@nestjs/common';
import { ClaudeApiError, ClaudeHttp } from './http';
import type {
  ComplianceActivity,
  ComplianceChat,
  ComplianceGroup,
  ComplianceGroupMember,
  ComplianceLocalSession,
  ComplianceOrganization,
  ComplianceOrgUser,
  ComplianceRemoteSession,
  IdCursorPage,
  ProbeDetail,
  SessionPage,
  TokenPage,
} from './types';

export interface ActivitiesQuery {
  limit?: number;
  after_id?: string;
  before_id?: string;
  'created_at.gte'?: string;
  'created_at.gt'?: string;
  'created_at.lte'?: string;
  'created_at.lt'?: string;
  activity_types?: string[];
  actor_ids?: string[];
  organization_ids?: string[];
}

/**
 * Compliance API.
 * Base: https://api.anthropic.com/v1/compliance/
 * Auth: `x-api-key: <Compliance Access Key sk-ant-api01-...>`, `anthropic-version: 2023-06-01`.
 * Scopes: read:compliance_activities (activities), read:compliance_user_data (chats, files,
 *   projects, sessions, org users, group members), read:compliance_org_data (organizations,
 *   roles, groups, settings). 403 bodies say exactly which scope is missing.
 * Rate limit: 600 req/min per parent org; 429 carries `retry-after`.
 */
@Injectable()
export class ComplianceClient {
  readonly http = new ClaudeHttp({ ratePerMinute: 600 });

  /** GET /v1/compliance/activities — newest first; page with after_id = previous last_id. */
  activities(
    key: string,
    q: ActivitiesQuery = {},
  ): Promise<IdCursorPage<ComplianceActivity>> {
    return this.http.get<IdCursorPage<ComplianceActivity>>(
      key,
      '/v1/compliance/activities',
      {
        limit: q.limit,
        after_id: q.after_id,
        before_id: q.before_id,
        'created_at.gte': q['created_at.gte'],
        'created_at.gt': q['created_at.gt'],
        'created_at.lte': q['created_at.lte'],
        'created_at.lt': q['created_at.lt'],
        'activity_types[]': q.activity_types,
        'actor_ids[]': q.actor_ids,
        'organization_ids[]': q.organization_ids,
      },
    );
  }

  /** Requires read:compliance_org_data. */
  listOrganizations(
    key: string,
    params: { limit?: number; page?: string } = {},
  ): Promise<TokenPage<ComplianceOrganization>> {
    return this.http.get<TokenPage<ComplianceOrganization>>(
      key,
      '/v1/compliance/organizations',
      params,
    );
  }

  /** Requires read:compliance_user_data. Verified working with the LightCI fallback key. */
  listOrgUsers(
    key: string,
    orgUuid: string,
    params: { limit?: number; page?: string } = {},
  ): Promise<TokenPage<ComplianceOrgUser>> {
    return this.http.get<TokenPage<ComplianceOrgUser>>(
      key,
      `/v1/compliance/organizations/${encodeURIComponent(orgUuid)}/users`,
      params,
    );
  }

  async listAllOrgUsers(
    key: string,
    orgUuid: string,
  ): Promise<ComplianceOrgUser[]> {
    return this.drain((page) =>
      this.listOrgUsers(key, orgUuid, { limit: 500, page }),
    );
  }

  /** Requires read:compliance_org_data. */
  listGroups(
    key: string,
    params: { limit?: number; page?: string } = {},
  ): Promise<TokenPage<ComplianceGroup>> {
    return this.http.get<TokenPage<ComplianceGroup>>(
      key,
      '/v1/compliance/groups',
      params,
    );
  }

  async listAllGroups(key: string): Promise<ComplianceGroup[]> {
    return this.drain((page) => this.listGroups(key, { limit: 500, page }));
  }

  /** Requires read:compliance_user_data. */
  listGroupMembers(
    key: string,
    groupId: string,
    params: { limit?: number; page?: string } = {},
  ): Promise<TokenPage<ComplianceGroupMember>> {
    return this.http.get<TokenPage<ComplianceGroupMember>>(
      key,
      `/v1/compliance/groups/${encodeURIComponent(groupId)}/members`,
      params,
    );
  }

  async listAllGroupMembers(
    key: string,
    groupId: string,
  ): Promise<ComplianceGroupMember[]> {
    return this.drain((page) =>
      this.listGroupMembers(key, groupId, { limit: 500, page }),
    );
  }

  /** GET /v1/compliance/apps/chats — oldest first; `order_by=updated_at` for incremental export. */
  listChats(
    key: string,
    q: {
      limit?: number;
      after_id?: string;
      order_by?: 'created_at' | 'updated_at';
      'updated_at.gte'?: string;
      'created_at.gte'?: string;
      user_ids?: string[];
    } = {},
  ): Promise<IdCursorPage<ComplianceChat>> {
    return this.http.get<IdCursorPage<ComplianceChat>>(
      key,
      '/v1/compliance/apps/chats',
      {
        limit: q.limit,
        after_id: q.after_id,
        order_by: q.order_by,
        'updated_at.gte': q['updated_at.gte'],
        'created_at.gte': q['created_at.gte'],
        'user_ids[]': q.user_ids,
      },
    );
  }

  /** GET /v1/compliance/apps/sessions/local — Cowork desktop, Claude Code, Science, M365. Newest first. */
  listLocalSessions(
    key: string,
    q: {
      limit?: number;
      page?: string;
      'created_at.gte'?: string;
      'created_at.lt'?: string;
      'updated_at.gte'?: string;
    } = {},
  ): Promise<SessionPage<ComplianceLocalSession>> {
    return this.http.get<SessionPage<ComplianceLocalSession>>(
      key,
      '/v1/compliance/apps/sessions/local',
      q,
    );
  }

  /** GET /v1/compliance/apps/sessions/remote — cloud Cowork sessions (`cowork_remote`). */
  listRemoteSessions(
    key: string,
    q: {
      limit?: number;
      page?: string;
      'created_at.gte'?: string;
      'created_at.lt'?: string;
      user_ids?: string[];
      organization_ids?: string[];
    } = {},
  ): Promise<SessionPage<ComplianceRemoteSession>> {
    return this.http.get<SessionPage<ComplianceRemoteSession>>(
      key,
      '/v1/compliance/apps/sessions/remote',
      {
        limit: q.limit,
        page: q.page,
        'created_at.gte': q['created_at.gte'],
        'created_at.lt': q['created_at.lt'],
        'user_ids[]': q.user_ids,
        'organization_ids[]': q.organization_ids,
      },
    );
  }

  /**
   * Discover linked org UUIDs without `read:compliance_org_data`: sample recent chats and
   * local sessions (which carry `organization_uuid`). Used as a fallback for listOrgUsers.
   */
  async discoverOrgUuids(key: string): Promise<string[]> {
    const uuids = new Set<string>();
    const [chats, sessions] = await Promise.allSettled([
      this.listChats(key, { limit: 200, order_by: 'updated_at' }),
      this.listLocalSessions(key, { limit: 200 }),
    ]);
    if (chats.status === 'fulfilled')
      for (const c of chats.value.data) uuids.add(c.organization_uuid);
    if (sessions.status === 'fulfilled')
      for (const s of sessions.value.data) uuids.add(s.organization_uuid);
    if (uuids.size === 0 && chats.status === 'rejected') throw chats.reason;
    return [...uuids];
  }

  private async drain<T>(
    fetchPage: (page?: string) => Promise<TokenPage<T>>,
  ): Promise<T[]> {
    const out: T[] = [];
    let page: string | undefined;
    do {
      const res = await fetchPage(page);
      out.push(...res.data);
      page = res.next_page ?? undefined;
    } while (page);
    return out;
  }

  /**
   * Try the activity feed, then chats; a key is "ok" if any compliance endpoint accepts it.
   * The 403 message tells us the scopes the key actually carries.
   */
  async probe(key: string | undefined): Promise<ProbeDetail> {
    if (!key) return { status: 'unconfigured' };
    let scopes: string[] | undefined;
    let last: ClaudeApiError | undefined;
    for (const attempt of [
      () => this.activities(key, { limit: 1 }),
      () => this.listChats(key, { limit: 1 }),
    ]) {
      try {
        await attempt();
        return { status: 'ok', httpStatus: 200, scopes };
      } catch (e) {
        if (!(e instanceof ClaudeApiError))
          return {
            status: 'error',
            message: e instanceof Error ? e.message : String(e),
          };
        scopes ??= e.grantedScopes;
        last = e;
        if (e.status === 401) break; // bad key: no point trying other endpoints
        if (!e.isAuth)
          return { status: 'error', httpStatus: e.status, message: e.message };
      }
    }
    return {
      status: 'unauthorized',
      httpStatus: last?.status,
      scopes,
      message: last?.message,
    };
  }
}
