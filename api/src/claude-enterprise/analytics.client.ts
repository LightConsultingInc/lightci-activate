import { Injectable } from '@nestjs/common';
import { ClaudeApiError, ClaudeHttp, type Query } from './http';
import type {
  AnalyticsDateQuery,
  AnalyticsNamedUsagePage,
  AnalyticsNamedUsageRow,
  AnalyticsSummariesResponse,
  AnalyticsUserActivity,
  AnalyticsUsersPage,
  ProbeDetail,
} from './types';

/**
 * Claude Enterprise Analytics API.
 * Base: https://api.anthropic.com/v1/organizations/analytics/
 * Auth: `x-api-key: <Analytics API key>` (scope `read:analytics`), `anthropic-version: 2023-06-01`.
 * Rate limit: 60 req/min per organisation. Data lag: ~1 day (available ~17:00 UTC next day).
 *
 * Verified paths (probe returned 403 naming `read:analytics`, i.e. the route exists):
 *   /users, /summaries, /skills, /connectors, /plugins
 * `/projects` returned 404 on probe and is deliberately not exposed.
 */
@Injectable()
export class AnalyticsClient {
  readonly http = new ClaudeHttp({ ratePerMinute: 60 });

  private q(p: AnalyticsDateQuery): Query {
    return {
      date: p.date,
      starting_date: p.starting_date,
      ending_date: p.ending_date,
      'filter[]': p.filter,
      'group_by[]': p.group_by,
      limit: p.limit,
      page: p.page,
      order: p.order,
      order_by: p.order_by,
    };
  }

  /** GET /v1/organizations/analytics/users — one page of per-user activity. */
  listUsers(
    key: string,
    params: AnalyticsDateQuery,
  ): Promise<AnalyticsUsersPage> {
    return this.http.get<AnalyticsUsersPage>(
      key,
      '/v1/organizations/analytics/users',
      this.q(params),
    );
  }

  /** All pages of per-user activity for the given query. */
  async listAllUsers(
    key: string,
    params: AnalyticsDateQuery,
  ): Promise<AnalyticsUserActivity[]> {
    const out: AnalyticsUserActivity[] = [];
    let page: string | undefined;
    do {
      const res = await this.listUsers(key, {
        ...params,
        limit: params.limit ?? 1000,
        page,
      });
      out.push(...res.data);
      page = res.next_page ?? undefined;
    } while (page);
    return out;
  }

  /** GET /v1/organizations/analytics/summaries — DAU/WAU/MAU per day. `ending_date` is exclusive. */
  summaries(
    key: string,
    params: { starting_date: string; ending_date?: string; filter?: string[] },
  ): Promise<AnalyticsSummariesResponse> {
    return this.http.get<AnalyticsSummariesResponse>(
      key,
      '/v1/organizations/analytics/summaries',
      {
        starting_date: params.starting_date,
        ending_date: params.ending_date,
        'filter[]': params.filter,
      },
    );
  }

  skills(
    key: string,
    params: AnalyticsDateQuery,
  ): Promise<AnalyticsNamedUsagePage> {
    return this.http.get<AnalyticsNamedUsagePage>(
      key,
      '/v1/organizations/analytics/skills',
      this.q(params),
    );
  }

  connectors(
    key: string,
    params: AnalyticsDateQuery,
  ): Promise<AnalyticsNamedUsagePage> {
    return this.http.get<AnalyticsNamedUsagePage>(
      key,
      '/v1/organizations/analytics/connectors',
      this.q(params),
    );
  }

  plugins(
    key: string,
    params: AnalyticsDateQuery,
  ): Promise<AnalyticsNamedUsagePage> {
    return this.http.get<AnalyticsNamedUsagePage>(
      key,
      '/v1/organizations/analytics/plugins',
      this.q(params),
    );
  }

  async listAll(
    fn: (
      key: string,
      params: AnalyticsDateQuery,
    ) => Promise<AnalyticsNamedUsagePage>,
    key: string,
    params: AnalyticsDateQuery,
  ): Promise<AnalyticsNamedUsageRow[]> {
    const out: AnalyticsNamedUsageRow[] = [];
    let page: string | undefined;
    // Callers pass an unbound method (e.g. `client.skills`); run it against this client.
    const fetchPage: typeof fn = (k, p) => Reflect.apply(fn, this, [k, p]);
    do {
      const res = await fetchPage(key, {
        ...params,
        limit: params.limit ?? 1000,
        page,
      });
      out.push(...res.data);
      page = res.next_page ?? undefined;
    } while (page);
    return out;
  }

  /**
   * Cheap auth check: one row of /users for a day that is certainly past the lag.
   * A 400 ("date not yet available") still proves the key is authorised.
   */
  async probe(key: string | undefined): Promise<ProbeDetail> {
    if (!key) return { status: 'unconfigured' };
    const day = new Date(Date.now() - 4 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    try {
      await this.listUsers(key, { date: day, limit: 1 });
      return { status: 'ok', httpStatus: 200 };
    } catch (e) {
      if (e instanceof ClaudeApiError) {
        if (e.status === 400)
          return { status: 'ok', httpStatus: 400, message: e.message };
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
