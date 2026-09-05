# LightCI Activate — Architecture

Two hosts, one backend. The NestJS API (`api/`) owns the data spine, the agent roles, the MCP server and the MCP Apps UI resource. The Next.js web app (`frontend/`) carries the heavy surfaces (Ladder, Team, Mission Control, Library, Lead Console, Provisioning). The in-Claude experience is a single-file React bundle (`mcp-app/`) served by the API as `ui://activate/app.html`.

```
lightci-activate/
  api/          NestJS 11 + TypeORM + Postgres. Port 4000. Global prefix /api. MCP at /mcp.
  frontend/     Next 16 (App Router, proxy.ts), Tailwind 4, shadcn (base-ui). Port 3000.
  mcp-app/      Vite + React + @modelcontextprotocol/ext-apps, built to one HTML file the API serves.
  marketplace/  Demo client marketplace repo (plugins/*/skills/*/SKILL.md + activate.yaml). Library source of truth.
  e2e/          Playwright suite against the local stack (real WorkOS password sign-in, mock AI provider).
  infra/        Terraform (ECS Fargate + RDS) and deploy scripts.
  docs/         This file, mastery-model.md.
```

## Identity and authorization

- **WorkOS AuthKit** (`@workos-inc/authkit-nextjs`) in the frontend: hosted SSO/AuthKit redirect plus an email/password form (WorkOS User Management password grant). Session cookie is `wos-session`.
- The frontend calls the API with the WorkOS access token as a Bearer token (`/auth/token` route hands the token to client components).
- The API verifies the JWT against WorkOS JWKS (`jose`), provisions a `Person` on first login (`api/src/auth`), and maps the WorkOS `organization_id` claim to an `Org`. `@lightci.com` users are LightCI activation leads and can switch orgs with the `X-Activate-Org` header.
- Roles live on `Person.roles` (`learner | champion | sponsor | admin | lead`). `@Roles()` + `RolesGuard` gate controllers; every query is scoped to the caller's org unless the caller is a lead.
- The MCP server accepts the same Bearer token (Claude connectors use OAuth to WorkOS; identity joins on email ↔ Claude `user_id`).

## Agent roles (`api/src/agents`)

All roles call Claude through `AiService` (Anthropic SDK, `claude-opus-5` default, structured outputs via `messages.parse` + Zod). `AI_PROVIDER=mock` swaps in deterministic responders so E2E tests run without network. Every call is recorded as an `AgentRun`.

| Role | Service | Entry points |
|---|---|---|
| Interviewer | `InterviewerService` | `POST /api/interviews`, `POST /api/interviews/:id/turns`, voice via `POST /api/realtime/session` (OpenAI Realtime ephemeral key; transcript is fed back to the Interviewer) |
| Scorer | `ScorerService` | `POST /api/workflows/:id/score`, nightly rescoring |
| Builder | `BuilderService` | `POST /api/workflows/:id/build` → draft Skill |
| Coach | `CoachService` | exercise generation, hints, next-up, revisit scheduling, escalation |
| Grader | `GraderService` | `POST /api/submissions/:id/grade`, `POST /api/skills/:id/grade` (rubric + security review) |
| Promoter | `PromoterService` | `POST /api/skills/:id/promotion-requests` → PR (git-backed marketplace) |
| Auditor | `AuditorService` | baselines, hours-back, `POST /api/readouts` |

## Learning model

`MasteryService` implements `docs/mastery-model.md`: recency-weighted artifact scores, cross-context consistency, retention decay, judgement (Brier calibration + critique quality), composite mastery per competency, promotion gates per rung, and a Leitner-style revisit scheduler (2/7/21/60/120 days).

## Skill library and publishing

The marketplace repo is the source of truth. `LibraryService` reads `plugins/**/skills/*/SKILL.md` + `activate.yaml` from `LIBRARY_REPO_PATH` (a local clone; `simple-git` for branches, commits, tags). Promotion = branch `skill/<id>` → PromotionRequest (PR record; when `GITHUB_TOKEN` is set the PR is opened on GitHub) → one-screen approval → merge → `SkillVersion` tagged `<id>@vN`. Usage joins from `SkillUsage` (Analytics API sync, or seeded).

## Analytics ingestion

`AnalyticsSyncService` pulls per-user daily metrics from the Claude Enterprise Analytics API when `CLAUDE_ANALYTICS_API_KEY` is set; otherwise the seeded `UsageSnapshot` rows stand in. "Active on real work" follows Anthropic's definition.

## MCP App

Tools: `my_ladder`, `library`, `skill_detail`, `submit_skill`, `submit_artifact`, `map_workflow`, `team`, `org`, `promotion_queue`, plus the app-only broker `activate_api`. Each tool returns structured text for hosts without UI and `_meta.ui.resourceUri = ui://activate/app.html` for hosts with it. The bundle routes on the tool input/result and fetches data through `activate_api` (same REST payloads as the web app).
