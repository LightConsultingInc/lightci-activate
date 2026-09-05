import type { UsageMetrics } from '../ops/entities/usage-snapshot.entity';
import type {
  AnalyticsUserActivity,
  DailyUserMetric,
  ToolActionCounts,
} from './types';

const n = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;
const acts = (t: ToolActionCounts | undefined): number =>
  n(t?.accepted_count) + n(t?.rejected_count);

/** Total Claude Code tool actions (accepted + rejected across edit/multi-edit/write/notebook). */
export function claudeCodeToolActions(rec: AnalyticsUserActivity): number {
  const t = rec.claude_code_metrics?.tool_actions;
  return (
    acts(t?.edit_tool) +
    acts(t?.multi_edit_tool) +
    acts(t?.write_tool) +
    acts(t?.notebook_edit_tool)
  );
}

/**
 * Map one Analytics API per-user row to Activate's UsageMetrics.
 *
 * Field choices (see docs/claude-enterprise-apis.md for the raw shape):
 *  - messages          chat_metrics.message_count
 *  - codeSessions      claude_code_metrics.core_metrics.distinct_session_count (null -> 0)
 *  - coworkSessions    cowork_metrics.distinct_session_count (null -> 0)
 *  - projectsUsed      chat_metrics.distinct_projects_used_count (null -> 0)
 *  - filesUploaded     chat_metrics.distinct_files_uploaded_count (null -> 0)
 *  - skillActivations  cowork.skills_used_count + science.skills_used_count + office.*.skills_used_count
 *                      + chat.distinct_skills_used_count (chat only exposes a distinct count)
 *  - connectorsUsed    chat.connectors_used_count + cowork.connectors_used_count + office.*.connectors_used_count
 *  - activeOnRealWork  Anthropic's "active user" definition: a chat message, a Claude Code
 *                      session with tool use or git activity, or a Cowork session with tool use
 *                      or message activity.
 *  - codeSpendUsd      optional; supplied by the caller from user_cost_report (cents string).
 */
export function mapUserActivityToUsageMetrics(
  rec: AnalyticsUserActivity,
  codeSpendCents?: string | number | null,
): UsageMetrics {
  const chat = rec.chat_metrics ?? {};
  const code = rec.claude_code_metrics?.core_metrics;
  const cowork = rec.cowork_metrics ?? {};
  const science = rec.science_metrics ?? {};
  const office = Object.values(rec.office_metrics ?? {}).filter(Boolean);

  const messages = n(chat.message_count);
  const codeSessions = n(code?.distinct_session_count);
  const coworkSessions = n(cowork.distinct_session_count);

  const toolActions = claudeCodeToolActions(rec);
  const gitActivity =
    n(code?.commit_count) +
    n(code?.pull_request_count) +
    n(code?.lines_of_code?.added_count) +
    n(code?.lines_of_code?.removed_count);
  // distinct_session_count is null when the query is scoped to an RBAC group, so do not require it:
  // any tool or git activity implies a session existed.
  const codeActive = toolActions > 0 || gitActivity > 0;
  const coworkActive =
    n(cowork.action_count) > 0 || n(cowork.message_count) > 0;

  const skillActivations =
    n(cowork.skills_used_count) +
    n(science.skills_used_count) +
    office.reduce((s, o) => s + n(o.skills_used_count), 0) +
    n(chat.distinct_skills_used_count);

  const connectorsUsed =
    n(chat.connectors_used_count) +
    n(cowork.connectors_used_count) +
    office.reduce((s, o) => s + n(o.connectors_used_count), 0);

  const metrics: UsageMetrics = {
    messages,
    codeSessions,
    coworkSessions,
    projectsUsed: n(chat.distinct_projects_used_count),
    filesUploaded: n(chat.distinct_files_uploaded_count),
    skillActivations,
    connectorsUsed,
    activeOnRealWork: messages > 0 || codeActive || coworkActive,
  };
  const spend = centsToUsd(codeSpendCents);
  if (spend !== undefined) metrics.codeSpendUsd = spend;
  return metrics;
}

/** Analytics amounts are decimal strings in cents, e.g. "41280.000000" -> 412.8. */
export function centsToUsd(
  cents: string | number | null | undefined,
): number | undefined {
  if (cents === null || cents === undefined || cents === '') return undefined;
  const v = typeof cents === 'number' ? cents : Number.parseFloat(cents);
  if (!Number.isFinite(v)) return undefined;
  return Math.round(v) / 100;
}

export function toDailyUserMetric(
  rec: AnalyticsUserActivity,
  day: string,
  codeSpendCents?: string | number | null,
): DailyUserMetric {
  return {
    userId: rec.user.id,
    email: rec.user.email_address,
    day,
    groupId: rec.rbac_group_id ?? null,
    groupName: rec.rbac_group_name ?? null,
    metrics: mapUserActivityToUsageMetrics(rec, codeSpendCents),
  };
}
