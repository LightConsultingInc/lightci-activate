# LightCI Activate — Architecture

Two hosts, one backend. The NestJS API (`api/`) owns the data spine, the agent roles, the MCP server and the MCP Apps UI resource. The Next.js web app (`frontend/`) carries the heavy surfaces (Ladder, Team, Mission Control, Library, Lead Console, Provisioning). The in-Claude experience is a single-file React bundle (`mcp-app/`) served by the API as `ui://activate/app.html`.

```
lightci-activate/
  api/          NestJS 11 + TypeORM + Postgres. Port 4310 locally (3000 in the image). Global prefix /api. MCP at /mcp.
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
- The API verifies the JWT against WorkOS JWKS (`jose`), provisions a `Person` on first login (`api/src/auth`), and maps the WorkOS `organization_id` claim to an `Org`. Email domains listed in `LEAD_EMAIL_DOMAINS` (cloud default `lightci.com`, self-hosted default none) are LightCI activation leads; only leads may switch orgs with the `X-Activate-Org` header. Everyone else is bound to their own org, and an org-less person is refused with a plain message.
- **Bring-your-own SSO.** Each client org owns a WorkOS organisation (created when a lead provisions the client, with the company's `emailDomains`). The client's IT admin connects their IdP or directory through a one-time Admin Portal link from the lead console. `GET /api/auth/lookup?email=` tells the login page whether an address goes to SSO, a password (demo orgs), or is unknown. Roles follow the IdP: `Org.settings.identity.roleMapping` (`auth/role-mapping.ts`) is applied on every sign-in and on `organization_membership` webhooks (`POST /api/webhooks/workos`, signature-verified over the raw body); `lead` is never mapped. Directory or membership removals deactivate the person.
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

## Runtime roles, background work and the marketplace remote

One server image, three ways to run it (`ACTIVATE_ROLE`):

| Role | Serves | Runs |
|---|---|---|
| `api` | REST, MCP, OAuth metadata, `/api/health`, `/api/ready` | Nothing in the background; enqueues jobs |
| `worker` | `/api/health` and `/api/ready` only (no Nest HTTP app) | Queue handlers and the nightly schedules |
| `all` | Both | Both (local development, Compose evaluation) |

- **Configuration is validated before boot** (`api/src/config/env.ts`). Production refuses an incomplete or unsafe set: missing encryption key, an unencrypted remote database, demo seed or mock AI flags, a self-hosted install without a marketplace remote. `ACTIVATE_EDITION=cloud|self-hosted` changes defaults (vendor lead domains, demo seed).
- **Jobs** (`api/src/jobs`) use pg-boss in the application database, schema `pgboss`; there is no Redis. Feature modules register handlers on `JobRegistry`; the worker runs them. The four nightly jobs (`nightly.mastery` 02:00, `nightly.revisits` 03:00, `nightly.scorer` and `nightly.analytics` 03:15, `WORKER_TIMEZONE`) are queue schedules, so they fire once however many processes run. `module.prepare` is a singleton job keyed by person and module, so any replica can start or report it. Unit tests use `InlineJobs`; `yarn test:int` exercises the real queue on Postgres.
- **Cross-replica locks** use Postgres advisory locks (`common/pg-lock.ts`): interview completion, marketplace writes, the demo seed.
- **Marketplace** (`skills/git-repo.service.ts`) resolves a repo per org: the org's own GitHub repository (`Org.marketplaceRepo` plus a token in integrations), the instance-level remote from `LIBRARY_PROVIDER` / `LIBRARY_REPOSITORY` / `LIBRARY_GIT_TOKEN` or `LIBRARY_REMOTE_URL` (self-hosted), or the shared local folder (`LIBRARY_REPO_PATH`, development and demos). Remotes are the source of truth: every write fetches, resets to the remote default branch, commits and pushes before returning, under the `marketplace:<org>` lock; failures are recorded on the repo and surfaced on the admin Marketplace page and by `activate doctor`. Clones live under `LIBRARY_CLONES_DIR` (`/data/marketplace-clones` in the image). Tokens travel as an HTTP header for the git subprocess and are never written to disk.
- **Migrations** run as a step (`activate migrate`, advisory-locked) in production and on boot elsewhere (`MIGRATIONS_RUN_ON_BOOT`). `/api/ready` fails while migrations are pending.
- **Web app** (`frontend/`) reads `WEB_URL` and `API_URL` at runtime and proxies `/api/*` to the API from its own origin (`app/api/[...path]/route.ts`), so one web image serves every deployment and the browser never needs the API's address.
- **Logs** are JSON lines with a `requestId` (inbound `X-Request-Id` honoured and echoed). Headers are never serialised; prompt and response content is never logged.
