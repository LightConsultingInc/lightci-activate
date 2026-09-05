import { Injectable } from '@nestjs/common';
import { ClaudeApiError, ClaudeHttp } from './http';
import type {
  AdminUser,
  IdCursorPage,
  ProbeDetail,
  RbacGroup,
  RbacGroupMember,
  RbacRole,
  TokenPage,
} from './types';

/**
 * Admin API, Claude Enterprise subset.
 * Base: https://api.anthropic.com/v1/organizations/
 * Auth: `x-api-key: <scoped Admin API key created in claude.ai>`, `anthropic-version: 2023-06-01`.
 * Scopes: `read:members` (users, rbac_roles), `read:rbac_groups` (groups, group members),
 *         or `read:org_audit` (all GETs). Rate limit: 100 req/min per organisation.
 * Members paginate with after_id/first_id/last_id; groups and roles with `page`/`next_page`.
 *
 * A regular Claude API key (sk-ant-api03-...) is rejected with 401
 * "The Admin API requires an Admin API key or an organization-scoped API key."
 */
@Injectable()
export class AdminClient {
  readonly http = new ClaudeHttp({ ratePerMinute: 100 });

  listUsers(
    key: string,
    params: {
      limit?: number;
      after_id?: string;
      before_id?: string;
      email?: string;
    } = {},
  ): Promise<IdCursorPage<AdminUser>> {
    return this.http.get<IdCursorPage<AdminUser>>(
      key,
      '/v1/organizations/users',
      params,
    );
  }

  async listAllUsers(key: string): Promise<AdminUser[]> {
    const out: AdminUser[] = [];
    let after: string | undefined;
    for (;;) {
      const page = await this.listUsers(key, { limit: 1000, after_id: after });
      out.push(...page.data);
      if (!page.has_more || !page.last_id) return out;
      after = page.last_id;
    }
  }

  listGroups(
    key: string,
    params: { limit?: number; page?: string } = {},
  ): Promise<TokenPage<RbacGroup>> {
    return this.http.get<TokenPage<RbacGroup>>(
      key,
      '/v1/organizations/rbac_groups',
      params,
    );
  }

  async listAllGroups(key: string): Promise<RbacGroup[]> {
    return this.drain((page) => this.listGroups(key, { limit: 100, page }));
  }

  listGroupMembers(
    key: string,
    groupId: string,
    params: { limit?: number; page?: string } = {},
  ): Promise<TokenPage<RbacGroupMember>> {
    return this.http.get<TokenPage<RbacGroupMember>>(
      key,
      `/v1/organizations/rbac_groups/${encodeURIComponent(groupId)}/members`,
      params,
    );
  }

  async listAllGroupMembers(
    key: string,
    groupId: string,
  ): Promise<RbacGroupMember[]> {
    return this.drain((page) =>
      this.listGroupMembers(key, groupId, { limit: 100, page }),
    );
  }

  listRoles(
    key: string,
    params: { limit?: number; page?: string } = {},
  ): Promise<TokenPage<RbacRole>> {
    return this.http.get<TokenPage<RbacRole>>(
      key,
      '/v1/organizations/rbac_roles',
      params,
    );
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

  async probe(key: string | undefined): Promise<ProbeDetail> {
    if (!key) return { status: 'unconfigured' };
    try {
      await this.listUsers(key, { limit: 1 });
      return { status: 'ok', httpStatus: 200 };
    } catch (e) {
      if (e instanceof ClaudeApiError) {
        if (e.isAuth)
          return {
            status: 'unauthorized',
            httpStatus: e.status,
            scopes: e.grantedScopes,
            message: e.message,
          };
        return { status: 'error', httpStatus: e.status, message: e.message };
      }
      return {
        status: 'error',
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
