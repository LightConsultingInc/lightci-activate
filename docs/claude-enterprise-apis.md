# Claude Enterprise APIs: Analytics, Admin, Compliance

Research notes and live probe results for the `api/src/claude-enterprise/` adapter.
Researched 2026-09-05 against the official docs on `platform.claude.com` and probed
against the LightCI Claude Enterprise org with the keys in `api/.env`.

## TL;DR

| API | Base path | Key type (prefix) | Scope(s) | Rate limit | Env fallback key | Probe result |
| --- | --- | --- | --- | --- | --- | --- |
| Analytics | `https://api.anthropic.com/v1/organizations/analytics/*` | Analytics API key (claude.ai > Org settings > API, primary owner) | `read:analytics` | 60 req/min per org | `CLAUDE_ENTERPRISE_API_KEY` (`sk-ant-api03-U...`) | **401** – it is a regular Claude API key, not an Analytics key |
| Admin (Enterprise subset) | `https://api.anthropic.com/v1/organizations/*` | Scoped Admin API key created in claude.ai | `read:members`, `read:rbac_groups`, or `read:org_audit` | 100 req/min per org | none (same `sk-ant-api03` key tried) | **401** |
| Compliance | `https://api.anthropic.com/v1/compliance/*` | Compliance Access Key (`sk-ant-api01-...`) | `read:compliance_activities`, `read:compliance_user_data`, `read:compliance_org_data`, `delete:compliance_user_data` | 600 req/min per parent org | `CLAUDE_COMPLIANCE_API_KEY` (`sk-ant-api01-E...`) | **partial** – key carries only `read:compliance_user_data` |

Headers for every request on all three APIs:

```
x-api-key: <key>
anthropic-version: 2023-06-01
```

No `Authorization: Bearer` (that is only for `org:admin` OAuth tokens on Console orgs) and no
`anthropic-beta` header is required (the former `ce-user-management-2026-07-13` beta header is
accepted but no longer needed).

Key types are **not interchangeable**: an Admin key cannot call Analytics, an Analytics key cannot
call Admin, a Claude API key (`sk-ant-api03`) can call none of them. A `read:org_audit` Admin key
can, however, call every Admin GET and the Compliance read endpoints.

### What each key in `.env` can do today

* `CLAUDE_ENTERPRISE_API_KEY` = `sk-ant-api03-U...` (regular Claude API key). Every Admin and
  Analytics endpoint returns:
  `401 {"type":"error","error":{"type":"authentication_error","message":"The Admin API requires an Admin API key or an organization-scoped API key."}}`
  To fix: the org's primary owner creates an **Analytics API key** (scope `read:analytics`) and,
  optionally, an **Admin API key** with `read:members` + `read:rbac_groups` (or `read:org_audit`)
  at claude.ai > Organization settings > API.
* `CLAUDE_COMPLIANCE_API_KEY` = `sk-ant-api01-E...`. Scopes: `['read:compliance_user_data']` only
  (the 403 body tells you). Working: chats, projects, local sessions, remote sessions,
  `organizations/{uuid}/users`. Not working (403): activities, organizations, groups, roles.
  To fix: create a new Compliance Access Key (scopes are immutable) that also carries
  `read:compliance_activities` and `read:compliance_org_data`.

## Error contract (all three APIs)

```json
{"type":"error","error":{"type":"permission_error","message":"Missing required scopes. Got: ['read:compliance_user_data'] Needed: ['read:analytics']"},"request_id":"req_011..."}
```

* `401 authentication_error` – wrong key type / revoked key.
* `403 permission_error` – valid key, missing scope. Message is `Missing required scopes. Got: [...] Needed: [...]`
  (or `Needed one of: [...]`). The adapter parses `Got:` to report the scopes a key has.
* `400 invalid_request_error` – on Analytics, requesting a day that is not yet available (1-day lag).
* `429 rate_limit_error` – honour `retry-after` (seconds). Also `anthropic-ratelimit-requests-{limit,remaining,reset}`.
* `5xx` – retry with backoff unless `x-should-retry: false`.

## Analytics API (Claude Enterprise)

Docs: <https://platform.claude.com/docs/en/manage-claude/analytics-api>,
reference <https://platform.claude.com/docs/en/api/admin/analytics>.

* Data available from 2026-01-01. Engagement endpoints are per-day snapshots with ~1-day lag
  (a day becomes available ~17:00 UTC the next day); requesting an unavailable day returns 400
  naming the latest available day.
* "Active user" = sent >= 1 chat message, or >= 1 Claude Code session with tool use or git activity,
  or >= 1 Cowork session with tool use or message activity.
* Per-product metric blocks are always present (zeros, not null). Distinct counts are HLL
  approximations (<2% error) and are `null` when scoped to an RBAC group.
* List params use bracket notation: `filter[]=rbac_group_id:rbac_group_01...&group_by[]=rbac_group_id`.
* Rate limit 60 req/min per organisation (all endpoints combined).

Verified route existence by probing with a key that lacks `read:analytics` (real routes answer 403
naming the scope, unknown routes answer 404):

| Path | Exists | Purpose |
| --- | --- | --- |
| `GET /v1/organizations/analytics/users` | yes (403) | per-user daily metrics |
| `GET /v1/organizations/analytics/summaries` | yes (403) | DAU/WAU/MAU, seats, adoption rate |
| `GET /v1/organizations/analytics/skills` | yes (403) | per-skill usage |
| `GET /v1/organizations/analytics/connectors` | yes (403) | per-connector usage |
| `GET /v1/organizations/analytics/plugins` | yes (403) | per-plugin usage |
| `GET /v1/organizations/analytics/projects` | **no (404)** | documented in one summary but not live; not exposed by the adapter |
| `GET /v1/organizations/analytics/usage_report`, `user_usage_report`, `cost_report`, `user_cost_report` | not probed | token/cost (usage-based plans); amounts are decimal strings in cents |

### `GET /v1/organizations/analytics/users`

Query: `date=YYYY-MM-DD` (single day) or `starting_date`/`ending_date`; `filter[]` in
`project_id:`, `rbac_group_id:`, `user_id:`; `group_by[]=rbac_group_id`; `limit` (default 100, max 1000);
`page` (opaque `next_page`); `order`, `order_by`.

Response shape (from the reference; not observed live because no key has `read:analytics`):

```json
{
  "data": [{
    "user": { "id": "user_01...", "email_address": "user1@example.com", "type": "user" },
    "rbac_group_id": null, "rbac_group_name": null, "last_activity_date": "2026-09-01",
    "web_search_count": 0,
    "chat_metrics": {
      "message_count": 12, "connectors_used_count": 1, "distinct_connectors_used_count": 1,
      "distinct_conversation_count": 3, "distinct_files_uploaded_count": 2,
      "distinct_projects_created_count": 0, "distinct_projects_used_count": 1,
      "distinct_shared_artifacts_viewed_count": 0, "distinct_artifacts_created_count": 1,
      "distinct_skills_used_count": 1, "shared_conversations_viewed_count": 0, "thinking_message_count": 4
    },
    "claude_code_metrics": {
      "core_metrics": { "distinct_session_count": 2, "artifacts_created_count": 0, "commit_count": 1,
        "pull_request_count": 0, "lines_of_code": { "added_count": 120, "removed_count": 30 } },
      "tool_actions": { "edit_tool": { "accepted_count": 5, "rejected_count": 1 },
        "multi_edit_tool": { "accepted_count": 0, "rejected_count": 0 },
        "write_tool": { "accepted_count": 2, "rejected_count": 0 },
        "notebook_edit_tool": { "accepted_count": 0, "rejected_count": 0 } }
    },
    "cowork_metrics": { "message_count": 3, "action_count": 9, "connectors_used_count": 2,
      "distinct_connectors_used_count": 1, "skills_used_count": 2, "distinct_skills_used_count": 1,
      "distinct_session_count": 1, "dispatch_turn_count": 0, "artifacts_created_count": 1 },
    "design_metrics": { "distinct_session_count": 0, "distinct_projects_created_count": 0, "distinct_projects_used_count": 0, "message_count": 0 },
    "office_metrics": { "excel": { "...": 0 }, "outlook": { "...": 0 }, "powerpoint": { "...": 0 }, "word": { "...": 0 } },
    "science_metrics": { "message_count": 0, "distinct_session_count": 0, "skills_used_count": 0, "delegation_count": 0, "remote_compute_job_count": 0 }
  }],
  "next_page": null
}
```

Mapping to `UsageMetrics` lives in `usage-mapper.ts` (see the doc-comment there).

### `GET /v1/organizations/analytics/summaries`

Query: `starting_date` (inclusive), `ending_date` (exclusive), `filter[]=rbac_group_id:...`.
Response: `{ "summaries": [{ "starting_at", "ending_at", "daily_active_user_count",
"weekly_active_user_count", "monthly_active_user_count", "daily_adoption_rate", "assigned_seat_count",
"pending_invite_count", "cowork_daily_active_user_count", ..., "chat_daily_active_user_count",
"claude_code_daily_active_user_count", ... }] }`.

### `GET /v1/organizations/analytics/{skills|connectors|plugins}`

Same date/filter params as `/users`; `filter[]`/`group_by[]` accept `product_surface`, `rbac_group_id`,
`user_id`. Rows: `{ skill_id|connector_id|plugin_id, skill_name|connector_name|plugin_name,
usage_count, user_count, distinct_user_count, product_surface }`, plus `next_page`. Connector names are
normalised (e.g. `mcp-atlassian` -> `atlassian`).

## Admin API (Claude Enterprise subset)

Docs: <https://platform.claude.com/docs/en/manage-claude/user-management>,
<https://platform.claude.com/docs/en/manage-claude/admin-api>.

Endpoints available to Claude Enterprise orgs (others such as workspaces/API keys are Console-only):

| Endpoint | Scope | Pagination |
| --- | --- | --- |
| `GET /v1/organizations/users?limit=&after_id=&email=` | `read:members` | `has_more`, `first_id`, `last_id` (pass `last_id` as `after_id`) |
| `GET /v1/organizations/users/{user_id}` | `read:members` | – |
| `GET /v1/organizations/invites` | `read:members` | id cursor |
| `GET /v1/organizations/rbac_groups?limit=&page=` | `read:rbac_groups` (needs a key created for all linked orgs) | `next_page` -> `page` |
| `GET /v1/organizations/rbac_groups/{group_id}/members` | `read:rbac_groups` | `next_page` |
| `GET /v1/organizations/rbac_roles`, `/{role_id}`, `/{role_id}/permissions` | `read:members` | `next_page` |

Rate limit 100 req/min per org. Enterprise org roles: `user`, `managed`, `owner`, `membership_admin`,
`primary_owner`.

Documented shapes:

```json
{ "data": [{ "type": "user", "id": "user_01...", "email": "user1@example.com", "name": "User One", "role": "user", "added_at": "2026-06-12T09:14:03Z" }],
  "has_more": false, "first_id": "user_01...", "last_id": "user_01..." }

{ "data": [{ "type": "rbac_group", "id": "rbac_group_01...", "name": "Engineering", "source_type": "direct",
  "roles": ["rbac_role_01..."], "created_at": "...", "updated_at": "..." }], "has_more": false, "next_page": null }

{ "data": [{ "type": "rbac_group_member", "group_id": "rbac_group_01...", "user_id": "user_01...", "email": "user1@example.com", "created_at": "..." }],
  "has_more": false, "next_page": null }
```

Live probe (2026-09-05):

```
GET /v1/organizations/users?limit=3        x-api-key: sk-ant-api03-U...  -> 401 authentication_error
GET /v1/organizations/rbac_groups?limit=3  x-api-key: sk-ant-api03-U...  -> 401
GET /v1/organizations/users?limit=3        x-api-key: sk-ant-api01-E...  -> 403 "Missing required scope: read:members or read:org_audit"
GET /v1/organizations/rbac_groups?limit=3  x-api-key: sk-ant-api01-E...  -> 403 "Got: ['read:compliance_user_data'] Needed one of: ['read:org_audit', 'read:rbac_groups']"
GET /v1/organizations/me                   x-api-key: sk-ant-api01-E...  -> 403 "Missing required scope: api:admin"
```

## Compliance API

Docs: <https://platform.claude.com/docs/en/manage-claude/compliance-api> and sub-pages
(`compliance-api-access`, `compliance-activity-feed`, `compliance-content-data`, `compliance-sessions`,
`compliance-org-data`, `compliance-errors`).

Rate limit 600 req/min per parent org (shared across all keys). Remote-session endpoints have an
extra budget. Activities retained 6 years, queryable within ~1 minute; recording starts when the
Compliance API is enabled (no backfill).

| Endpoint | Scope | Pagination | Probe |
| --- | --- | --- | --- |
| `GET /v1/compliance/activities` (`limit` <= 5000, `after_id`, `before_id`, `created_at.{gte,gt,lte,lt}`, `activity_types[]`, `actor_ids[]`, `organization_ids[]`) | `read:compliance_activities` | newest first; `has_more`, `first_id`, `last_id`; next page = `after_id=last_id` | **403** (key lacks scope) |
| `GET /v1/compliance/organizations` | `read:compliance_org_data` | `next_page` | **403** |
| `GET /v1/compliance/organizations/{org_uuid}/users` | `read:compliance_user_data` | `next_page` | **200** |
| `GET /v1/compliance/organizations/{org_uuid}/roles` | `read:compliance_org_data` | `next_page` | **403** |
| `GET /v1/compliance/organizations/{org_uuid}/settings` | `read:compliance_org_data` | – | not probed |
| `GET /v1/compliance/groups`, `/{group_id}` | `read:compliance_org_data` | `next_page` | **403** |
| `GET /v1/compliance/groups/{group_id}/members` | `read:compliance_user_data` | `next_page` | not probed (no group id) |
| `GET /v1/compliance/apps/chats` (`order_by=updated_at`, `updated_at.gte`, `user_ids[]` 1-10) | `read:compliance_user_data` | oldest first; `after_id` | **200** |
| `GET /v1/compliance/apps/chats/{id}/messages` | `read:compliance_user_data` | `after_id` | not probed |
| `GET /v1/compliance/apps/projects`, `/{id}`, `/{id}/attachments` | `read:compliance_user_data` | `next_page` | **200** (list) |
| `GET /v1/compliance/apps/sessions/local` (`created_at.gte/lt`, `updated_at.gte`, `limit` <= 500) | `read:compliance_user_data` | `next_page` only (no `has_more`) | **200** |
| `GET /v1/compliance/apps/sessions/local/{id}/messages` | `read:compliance_user_data` | `next_page`, cursors expire after 24h | not probed |
| `GET /v1/compliance/apps/sessions/remote` (`created_at.*`, `user_ids[]`, `organization_ids[]`) | `read:compliance_user_data` | `next_page` | **200** |
| `GET /v1/compliance/users` | – | – | **404** (path does not exist; users are per-org) |

`/v1/compliance/activities` with the `sk-ant-api03` key returns **404** (not 401), so a 404 on that
path is also a "wrong key type" signal.

### Observed samples (PII masked, org id constant)

`GET /v1/compliance/apps/chats?limit=1`:

```json
{"data":[{"id":"claude_chat_015qqVdR6FYMXP9iHMLjuydK","name":"","created_at":"2025-05-12T19:26:18.303254Z",
 "updated_at":"2025-05-12T19:27:04.812783Z","deleted_at":"2025-05-12T19:27:05.253648Z",
 "organization_id":"org_012ACKve1brR8zGo4EXjQb6A","organization_uuid":"0961d00a-be79-4169-99df-3872866727ab",
 "project_id":null,"model":null,"user":{"id":"user_01D4VbeDbVbsdh3PEBWJw2Td","email_address":"user1@example.com"},
 "href":"https://claude.ai/chat/2736240d-..."}],
 "has_more":true,"first_id":"eyJrIjogImNyZWF0ZWRfYXQi...","last_id":"eyJrIjogImNyZWF0ZWRfYXQi..."}
```

`GET /v1/compliance/apps/chats?limit=2&order_by=updated_at&updated_at.gte=2026-08-29T00:00:00Z`:

```json
{"data":[{"id":"claude_chat_01LreSE1MeBALXeZkikrLQRB","name":"Comfort Colors t-shirt color identification",
 "created_at":"2026-08-29T00:00:02.439496Z","updated_at":"2026-08-29T00:00:12.911604Z","deleted_at":null,
 "organization_id":"org_012ACKve1brR8zGo4EXjQb6A","organization_uuid":"0961d00a-be79-4169-99df-3872866727ab",
 "project_id":null,"model":"claude-fable-5","user":{"id":"user_01QWRoZRAbZPT6Xjz6Xh2wr8","email_address":"user1@example.com"},
 "href":"https://claude.ai/chat/a0cc263b-..."}, {"...":"second chat, model claude-sonnet-5"}],
 "has_more":true,"first_id":"...","last_id":"..."}
```

`GET /v1/compliance/apps/sessions/local?limit=1`:

```json
{"data":[{"type":"compliance_local_session","id":"clls_eyJ2IjoxLCJvIjoi...","organization_uuid":"0961d00a-be79-4169-99df-3872866727ab",
 "workspace_id":null,"user":{"id":"user_01S3i7BCdMUDC2Z1WeDWTdcK","email_address":"user1@example.com"},
 "product_surface":"cowork","created_at":"2026-09-05T20:09:49.430112Z","updated_at":"2026-09-05T20:10:46.457818Z","truncated":false}],
 "next_page":"page_eyJ2IjoxLCJmIjoicyIs..."}
```

(`truncated` is an undocumented extra field; `product_surface` values: `cowork`, `claude_code`,
`claude_science`, `office_agents/{excel,powerpoint,word,outlook}`.)

`GET /v1/compliance/apps/sessions/remote?limit=1`:

```json
{"data":[{"id":"cse_01849NapEjw8YFiu3UZYhdYE","organization_uuid":"0961d00a-be79-4169-99df-3872866727ab",
 "user":{"id":"user_01UhxpFH2725esebLvvP4Q5u","email_address":"user1@example.com"},"agent_id":null,"started_by_user":null,
 "status":"active","created_at":"2026-09-05T20:10:15.555997Z","updated_at":"2026-09-05T20:10:15.555997Z",
 "product_surface":"cowork_remote","claude_project_id":null}],"next_page":"page_AMESvgEKJABgk2oXFgk16TD-..."}
```

`GET /v1/compliance/apps/projects?limit=1`:

```json
{"data":[{"id":"claude_proj_011CP4BYwEheWn317EnfRKye","name":"How to use Claude","created_at":"2025-05-12T19:24:11.525867Z",
 "updated_at":"2025-05-12T19:24:11.525867Z","organization_id":"org_012ACKve1brR8zGo4EXjQb6A",
 "organization_uuid":"0961d00a-be79-4169-99df-3872866727ab","user":{"id":"user_01D4VbeDbVbsdh3PEBWJw2Td","email_address":"user1@example.com"},
 "is_private":false,"deleted_at":null}],"has_more":true,"next_page":"page_eyJjcmVhdGVkX2F0Ijog..."}
```

`GET /v1/compliance/organizations/0961d00a-be79-4169-99df-3872866727ab/users?limit=3`:

```json
{"data":[
 {"id":"user_01D4VbeDbVbsdh3PEBWJw2Td","full_name":"User One","email":"user1@example.com","created_at":"2025-05-02T12:48:33.113970Z","organization_role":"owner"},
 {"id":"user_01TH55FR9fi4feWPobGqsWYY","full_name":"User Two","email":"user2@example.com","created_at":"2025-02-21T14:42:47.473615Z","organization_role":"primary_owner"},
 {"id":"user_014CMDCm41YCQ4AvL8YvFnVM","full_name":"User Three","email":"user3@example.com","created_at":"2025-03-04T16:26:40.407263Z","organization_role":"user"}],
 "has_more":true,"next_page":"page_eyJjcmVhdGVkX2F0Ijog..."}
```

`GET /v1/compliance/activities?limit=2` with the current key:

```json
{"type":"error","error":{"type":"permission_error","message":"Missing required scopes. Got: ['read:compliance_user_data'] Needed one of: ['read:compliance_activities', 'read:org_audit']"},"request_id":"req_011..."}
```

Documented Activity shape (not observed live):

```json
{"data":[{"id":"activity_01...","created_at":"2026-04-10T08:09:10Z","organization_id":"org_01...","organization_uuid":"...",
 "actor":{"type":"user_actor","email_address":"user1@example.com","user_id":"user_01...","ip_address":"192.0.2.34","user_agent":"..."},
 "type":"claude_chat_created","claude_chat_id":"claude_chat_01...","claude_project_id":"claude_proj_01..."}],
 "has_more":true,"first_id":"activity_01...","last_id":"activity_01..."}
```

Actor union: `user_actor`, `api_actor`, `admin_api_key_actor`, `unauthenticated_user_actor`,
`anthropic_actor`, `scim_directory_sync_actor`. Hundreds of `type` values; RBAC/skill-sharing events
include `role_assignment`, `rbac_role_assigned`, `rbac_role_permission_added`. Note `claude_*_viewed`
means an app loaded content, not that a person read it.

Rate-limit headers observed on 200s: `anthropic-ratelimit-requests-limit: 600`,
`anthropic-ratelimit-requests-remaining: 59x`, `anthropic-ratelimit-requests-reset: <RFC3339>`.
403s carried `x-should-retry: false`.

## Adapter behaviour summary (`api/src/claude-enterprise/`)

* All client and service methods take the credential explicitly (`ClaudeKeys` per client org);
  env keys are only used when the caller passes `undefined`.
* `probe(keys)` returns `ok | unauthorized | unconfigured | error` per API plus the scopes parsed
  from 403 bodies, so an uploaded key can be validated immediately.
* `listMembers` uses the Admin API when an admin key works, otherwise the Compliance directory
  (`/organizations` when `read:compliance_org_data` is present, else org UUIDs discovered from
  recent chats/sessions, then `/organizations/{uuid}/users`). This path works with the current key.
* `dailyUserMetrics` issues one `/analytics/users?date=` call per day (guaranteed per-user-per-day
  rows) and reports not-yet-available days in `skippedDays`.
* `activityFeed` maps the id-cursor pagination to `{ events, nextCursor, hasMore }`.
* Retry: 429 honours `retry-after`; 5xx retried with exponential backoff unless `x-should-retry: false`;
  per-key token bucket at 60/100/600 req/min for analytics/admin/compliance.
