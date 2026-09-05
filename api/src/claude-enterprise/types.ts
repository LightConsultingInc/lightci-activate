import type { UsageMetrics } from '../ops/entities/usage-snapshot.entity';

/**
 * Credentials for one client organisation. Every field is optional: a company
 * may upload only a Compliance Access Key, or add Analytics / Admin keys later.
 *
 *  - analytics:  Analytics API key (scope `read:analytics`), created in
 *                claude.ai > Organization settings > API by the primary owner.
 *  - admin:      Scoped Admin API key for a Claude Enterprise org
 *                (scopes `read:members`, `read:rbac_groups`, or `read:org_audit`).
 *  - compliance: Compliance Access Key (`sk-ant-api01-...`) with any of
 *                `read:compliance_activities`, `read:compliance_user_data`,
 *                `read:compliance_org_data`.
 */
export interface ClaudeKeys {
  analytics?: string;
  admin?: string;
  compliance?: string;
}

export type ClaudeApiName = 'analytics' | 'admin' | 'compliance';

/** `error` covers network failures / 5xx that are neither auth nor config problems. */
export type ProbeStatus = 'ok' | 'unauthorized' | 'unconfigured' | 'error';

export interface ProbeDetail {
  status: ProbeStatus;
  /** HTTP status of the probe request, when one was made. */
  httpStatus?: number;
  /** Scopes the key carries, parsed from a 403 "Got: [...]" message when available. */
  scopes?: string[];
  /** Human-readable reason (never contains the key). */
  message?: string;
}

export interface ProbeResult {
  analytics: ProbeStatus;
  admin: ProbeStatus;
  compliance: ProbeStatus;
  details: Record<ClaudeApiName, ProbeDetail>;
}

// ---------------------------------------------------------------------------
// Raw wire shapes: Admin API (https://api.anthropic.com/v1/organizations/*)
// ---------------------------------------------------------------------------

/** ID-cursor page used by members and invites. */
export interface IdCursorPage<T> {
  data: T[];
  has_more: boolean;
  first_id: string | null;
  last_id: string | null;
}

/** Opaque-token page used by groups, roles and the analytics/compliance directory endpoints. */
export interface TokenPage<T> {
  data: T[];
  has_more?: boolean;
  next_page: string | null;
}

export type EnterpriseOrgRole =
  'user' | 'managed' | 'owner' | 'membership_admin' | 'primary_owner' | string;

export interface AdminUser {
  type: 'user';
  id: string;
  email: string;
  name: string | null;
  role: EnterpriseOrgRole;
  added_at: string;
}

export interface RbacGroup {
  type: 'rbac_group';
  id: string;
  name: string;
  source_type: 'direct' | 'scim' | string;
  /** `null` when role data was temporarily unavailable (retry to distinguish from []). */
  roles: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface RbacGroupMember {
  type: 'rbac_group_member';
  group_id: string;
  user_id: string;
  email: string | null;
  created_at: string;
}

export interface RbacRole {
  type: 'rbac_role';
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Raw wire shapes: Claude Enterprise Analytics API
// (https://api.anthropic.com/v1/organizations/analytics/*)
// ---------------------------------------------------------------------------

export interface ToolActionCounts {
  accepted_count: number;
  rejected_count: number;
}

export interface AnalyticsChatMetrics {
  message_count: number;
  connectors_used_count: number;
  distinct_connectors_used_count: number | null;
  distinct_conversation_count: number | null;
  distinct_files_uploaded_count: number | null;
  distinct_projects_created_count: number;
  distinct_projects_used_count: number | null;
  distinct_shared_artifacts_viewed_count: number | null;
  distinct_artifacts_created_count: number;
  distinct_skills_used_count: number | null;
  shared_conversations_viewed_count: number;
  thinking_message_count: number;
}

export interface AnalyticsClaudeCodeMetrics {
  core_metrics: {
    distinct_session_count: number | null;
    artifacts_created_count: number;
    commit_count: number;
    pull_request_count: number;
    lines_of_code: { added_count: number; removed_count: number };
  };
  tool_actions: {
    edit_tool: ToolActionCounts;
    multi_edit_tool: ToolActionCounts;
    write_tool: ToolActionCounts;
    notebook_edit_tool: ToolActionCounts;
  };
}

export interface AnalyticsCoworkMetrics {
  message_count: number;
  action_count: number;
  connectors_used_count: number;
  distinct_connectors_used_count: number | null;
  skills_used_count: number;
  distinct_skills_used_count: number | null;
  distinct_session_count: number | null;
  dispatch_turn_count: number;
  artifacts_created_count: number;
  distinct_plugins_used_count?: number | null;
  plugins_used_count?: number | null;
  file_edit_count?: number | null;
  sessions_with_file_edits_count?: number | null;
}

export interface AnalyticsOfficeAppMetrics {
  connectors_used_count: number;
  distinct_connectors_used_count: number | null;
  skills_used_count: number;
  distinct_skills_used_count: number | null;
  message_count: number;
  distinct_session_count: number | null;
}

export interface AnalyticsOfficeMetrics {
  excel?: AnalyticsOfficeAppMetrics;
  outlook?: AnalyticsOfficeAppMetrics;
  powerpoint?: AnalyticsOfficeAppMetrics;
  word?: AnalyticsOfficeAppMetrics;
}

export interface AnalyticsScienceMetrics {
  message_count: number;
  distinct_session_count: number | null;
  skills_used_count: number;
  delegation_count: number;
  remote_compute_job_count: number;
}

export interface AnalyticsDesignMetrics {
  distinct_session_count: number | null;
  distinct_projects_created_count: number;
  distinct_projects_used_count: number | null;
  message_count: number;
}

/** One row of GET /v1/organizations/analytics/users. Metric blocks are always present (zeros, not null). */
export interface AnalyticsUserActivity {
  user: { id: string; email_address: string; type: 'user' };
  rbac_group_id?: string | null;
  rbac_group_name?: string | null;
  last_activity_date?: string | null;
  distinct_user_count?: number | null;
  web_search_count?: number;
  chat_metrics?: Partial<AnalyticsChatMetrics>;
  claude_code_metrics?: Partial<AnalyticsClaudeCodeMetrics>;
  cowork_metrics?: Partial<AnalyticsCoworkMetrics>;
  design_metrics?: Partial<AnalyticsDesignMetrics>;
  office_metrics?: AnalyticsOfficeMetrics;
  science_metrics?: Partial<AnalyticsScienceMetrics>;
}

export interface AnalyticsUsersPage {
  data: AnalyticsUserActivity[];
  next_page: string | null;
}

export interface AnalyticsSummary {
  starting_at: string;
  ending_at: string;
  daily_active_user_count: number;
  weekly_active_user_count: number;
  monthly_active_user_count: number;
  daily_adoption_rate: number | null;
  weekly_adoption_rate: number | null;
  monthly_adoption_rate: number | null;
  assigned_seat_count: number | null;
  pending_invite_count: number | null;
  cowork_daily_active_user_count: number;
  cowork_weekly_active_user_count: number;
  cowork_monthly_active_user_count: number;
  chat_daily_active_user_count?: number | null;
  claude_code_daily_active_user_count?: number | null;
  [extra: string]: unknown;
}

export interface AnalyticsSummariesResponse {
  summaries: AnalyticsSummary[];
}

/** Rows of /analytics/skills, /analytics/connectors and /analytics/plugins share this shape. */
export interface AnalyticsNamedUsageRow {
  skill_id?: string | null;
  skill_name?: string | null;
  connector_id?: string | null;
  connector_name?: string | null;
  plugin_id?: string | null;
  plugin_name?: string | null;
  usage_count: number;
  user_count?: number | null;
  distinct_user_count?: number | null;
  product_surface?: string | null;
  rbac_group_id?: string | null;
  user_id?: string | null;
}

export interface AnalyticsNamedUsagePage {
  data: AnalyticsNamedUsageRow[];
  next_page: string | null;
}

export interface AnalyticsDateQuery {
  /** Single UTC day, YYYY-MM-DD. Mutually exclusive with starting_date/ending_date. */
  date?: string;
  starting_date?: string;
  /** Exclusive on /summaries; treated as exclusive elsewhere too (see docs). */
  ending_date?: string;
  /** e.g. `rbac_group_id:rbac_group_01...`, `user_id:user_01...`, `product_surface:cowork`. */
  filter?: string[];
  group_by?: string[];
  limit?: number;
  page?: string;
  order?: 'asc' | 'desc';
  order_by?: string;
}

// ---------------------------------------------------------------------------
// Raw wire shapes: Compliance API (https://api.anthropic.com/v1/compliance/*)
// ---------------------------------------------------------------------------

export type ComplianceActor =
  | {
      type: 'user_actor';
      email_address: string | null;
      user_id: string;
      ip_address?: string | null;
      user_agent?: string | null;
    }
  | {
      type: 'api_actor';
      api_key_id: string;
      ip_address?: string | null;
      user_agent?: string | null;
    }
  | {
      type: 'admin_api_key_actor';
      admin_api_key_id: string;
      ip_address?: string | null;
      user_agent?: string | null;
    }
  | {
      type: 'unauthenticated_user_actor';
      unauthenticated_email_address: string | null;
      ip_address?: string | null;
      user_agent?: string | null;
    }
  | { type: 'anthropic_actor'; email_address: null }
  | {
      type: 'scim_directory_sync_actor';
      workos_event_id?: string;
      directory_id?: string;
      idp_connection_type?: string | null;
    }
  | { type: string; [k: string]: unknown };

export interface ComplianceActivity {
  id: string;
  created_at: string;
  organization_id: string | null;
  organization_uuid: string | null;
  actor: ComplianceActor;
  /** e.g. `claude_chat_created`, `role_assignment`, `rbac_role_assigned`, `compliance_api_accessed`. */
  type: string;
  [extra: string]: unknown;
}

export interface ComplianceOrganization {
  uuid: string;
  name: string;
  created_at: string;
}

export interface ComplianceOrgUser {
  id: string;
  full_name: string | null;
  email: string | null;
  organization_role: EnterpriseOrgRole;
  created_at: string;
}

export interface ComplianceGroup {
  id: string;
  name: string;
  description?: string | null;
  source_type: 'direct' | 'scim' | string;
  roles: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceGroupMember {
  user_id: string;
  email: string | null;
  created_at: string;
  updated_at?: string;
}

export interface ComplianceChat {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  href: string;
  model: string | null;
  organization_id?: string;
  organization_uuid: string;
  project_id: string | null;
  user: { id: string; email_address: string | null };
}

export interface ComplianceLocalSession {
  type: 'compliance_local_session';
  id: string;
  organization_uuid: string;
  workspace_id: string | null;
  user: { id: string; email_address: string | null };
  /** `cowork`, `claude_code`, `claude_science`, `office_agents/*` ... */
  product_surface: string | null;
  created_at: string;
  updated_at: string;
  truncated?: boolean;
}

export interface ComplianceRemoteSession {
  id: string;
  organization_uuid: string;
  user: { id: string; email_address: string | null } | null;
  agent_id: string | null;
  started_by_user: { id: string; email_address: string | null } | null;
  status: 'pending' | 'active' | 'paused' | 'archived' | 'failed' | string;
  created_at: string;
  updated_at: string;
  product_surface: string | null;
  claude_project_id: string | null;
}

/** Session list endpoints return `next_page` but no `has_more`. */
export interface SessionPage<T> {
  data: T[];
  next_page: string | null;
}

// ---------------------------------------------------------------------------
// Normalised shapes returned by ClaudeEnterpriseService
// ---------------------------------------------------------------------------

export interface Member {
  id: string;
  email: string | null;
  name: string | null;
  role: EnterpriseOrgRole;
  addedAt: string;
  /** Which API produced the record. */
  source: 'admin' | 'compliance';
  /** Set when sourced from the compliance directory (per linked org). */
  orgUuid?: string;
}

export interface Group {
  id: string;
  name: string;
  sourceType: 'direct' | 'scim' | string;
  roleIds: string[];
  createdAt: string;
  updatedAt: string;
  source: 'admin' | 'compliance';
}

export interface GroupMember {
  groupId: string;
  userId: string;
  email: string | null;
  addedAt: string;
}

export interface DailyUserMetric {
  userId: string;
  email: string;
  /** UTC day, YYYY-MM-DD. */
  day: string;
  groupId?: string | null;
  groupName?: string | null;
  metrics: UsageMetrics;
}

export interface DailyUserMetricsResult {
  records: DailyUserMetric[];
  /** Days the API refused (typically 400 "not yet available" because of the 1-day lag). */
  skippedDays: { day: string; reason: string }[];
}

export interface SkillUsage {
  skillId: string | null;
  skillName: string;
  usageCount: number;
  userCount: number | null;
  distinctUserCount: number | null;
  productSurface: string | null;
}

export interface ActivityEvent {
  id: string;
  type: string;
  createdAt: string;
  orgId: string | null;
  orgUuid: string | null;
  actor: {
    type: string;
    userId?: string;
    email?: string | null;
    apiKeyId?: string;
  };
  /** Type-specific fields (everything except the envelope). */
  data: Record<string, unknown>;
}

export interface ActivityFeedPage {
  events: ActivityEvent[];
  /** Pass back as `cursor` to fetch the next (older) page; null when exhausted. */
  nextCursor: string | null;
  hasMore: boolean;
}

export interface DateRange {
  /** Inclusive UTC day, YYYY-MM-DD. */
  from: string;
  /** Inclusive UTC day, YYYY-MM-DD. */
  to: string;
}
