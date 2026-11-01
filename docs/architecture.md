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
- **Two identity modes** (`AUTH_PROVIDER`). `workos` is the cloud default below. `oidc` is for self-hosted installs: the customer's own OpenID Connect provider (Okta, Entra ID, Keycloak…) is the identity source, and Activate runs a minimal OAuth 2.1 authorization server in front of it (`api/src/auth/oauth`): `/oauth/authorize` sends the person to the IdP, `/oauth/callback` provisions them (`PeopleService.provisionFromOidc`: match by issuer+subject, then email; org by email domain or the sole org; roles from the IdP groups through the org mapping, `AUTH_ROLE_MAP`, or the default names), and `/oauth/token` issues RS256 access tokens (`aud` = `PUBLIC_API_URL`, 1 h) with rotating refresh tokens. The web app is a public PKCE client (`activate-web`); MCP hosts register dynamically at `/oauth/register`. Signing keys live in `instance_keys`, private half encrypted with `ACTIVATE_SECRETS_KEY`, public half at `/oauth/jwks`. Discovery (`/.well-known/*`) names Activate as the authorization server in this mode. The web app keeps a sealed `activate-session` cookie (`frontend/lib/session.ts`) and refreshes tokens through the API.
- **Bring-your-own SSO (WorkOS mode).** Each client org owns a WorkOS organisation (created when a lead provisions the client, with the company's `emailDomains`). The client's IT admin connects their IdP or directory through a one-time Admin Portal link from the lead console. `GET /api/auth/lookup?email=` tells the login page whether an address goes to SSO, a password (demo orgs), or is unknown. Roles follow the IdP: `Org.settings.identity.roleMapping` (`auth/role-mapping.ts`) is applied on every sign-in and on `organization_membership` webhooks (`POST /api/webhooks/workos`, signature-verified over the raw body); `lead` is never mapped. Directory or membership removals deactivate the person.
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

## Self-hosted edition: license, first boot and the `activate` CLI

- **Edition.** `ACTIVATE_EDITION=self-hosted` turns on offline licensing, drops the vendor lead domain default, hides the demo seed, and makes a marketplace remote mandatory. `cloud` (default) is what LightCI runs.
- **License** (`api/src/license`). A JWT signed by LightCI (Ed25519; public key in `license-public-key.ts`, private key only in LightCI's secret store, minted by `scripts/license-issue.mjs`). Read from `ACTIVATE_LICENSE_FILE`, `ACTIVATE_LICENSE`, or an admin upload in `instance_settings`, whichever expires latest. States: valid, expiring (30 days), grace (14 days after expiry, everything works), expired (read-only: `LicenseGuard` refuses writes except sign-in, health and installing a new license), missing or invalid (the process refuses to start). Seat usage is active plus invited people; admins see a banner from 90% and when seats run out. `GET/POST /api/admin/license`, and the License tab under Company admin.
- **First boot** (`api/src/bootstrap`). On the worker (or `all`) role and via `activate bootstrap`: upsert the competency catalogue from code, then, when `ACTIVATE_ORG_SLUG` (or `_NAME`) is set, create the organisation with `ACTIVATE_ORG_EMAIL_DOMAINS`, `ACTIVATE_ORG_SEATS`, the marketplace from `LIBRARY_*`, default settings, cost inputs and an audit row, and pre-create `ACTIVATE_ORG_INITIAL_ADMINS` as invited admins. Idempotent and advisory-locked; initial admins keep admin whatever their IdP groups say (break-glass).
- **CLI** (`api/src/cli.ts`, `/usr/local/bin/activate` in the image): `migrate [--check]`, `doctor` (database and schema, license, identity, Anthropic key, Claude Enterprise key scopes per org, marketplace per org, job queue, voice), `bootstrap`, `support-bundle [path]` (versions, redacted config, doctor output, schema, job history, table counts, org list; never content, keys or addresses), `secrets rotate` (re-encrypt integrations and signing keys from `ACTIVATE_SECRETS_KEY_PREVIOUS` to the current key).


## Packaging, observability and the update lifecycle (M5, WS7)

**Images and chart.** One server image (`ghcr.io/lightconsultinginc/activate/server`) serves the `api`, `worker` and `all` roles and carries the `activate` CLI; one web image (`.../web`) reads `WEB_URL` and `API_URL` at runtime. Both are digest-pinned to `node:22-alpine`, run as uid 1001 on a read-only root filesystem (`/tmp` and `/data` writable), are built for amd64 and arm64, signed with cosign (keyless) and attested with an SPDX SBOM by `.github/workflows/release.yml`. The Helm chart (`deploy/helm/activate`, OCI at `ghcr.io/lightconsultinginc/charts/activate`), the Compose file (`deploy/compose`) and the Terraform module (`deploy/terraform/aws`) all carry the release version; the chart refuses an image tag that differs from its `appVersion` unless `global.allowImageTagMismatch` is set.

**Local marketplace on a read-only image.** When `LIBRARY_PROVIDER=local` and the source folder is not writable, `GitRepoService` mirrors it into `LIBRARY_WORK_DIR` (on `/data`) and runs git there, the same way it does for a folder nested inside another repository.

**Metrics.** `api/src/metrics` serves Prometheus text on `METRICS_PORT` (9464) through its own HTTP server, so it is never routed through the ingress; `METRICS_ENABLED=false` turns it off. Names: `http_server_duration_seconds` (route, method, status), `activate_ai_requests_total` and `activate_ai_tokens_total` (task, model, outcome or direction), `activate_jobs_queued` and `activate_job_last_success_timestamp` per queue (refreshed from pg-boss on scrape), `activate_marketplace_publish_failures_total` (reason), `activate_license_seats` and `activate_license_seats_used`, plus the Node defaults. The chart exposes a `metrics` port on the api Service and the worker headless Service and can create a ServiceMonitor.

**Updates.** `api/src/updates` reads the static release index (`UPDATE_INDEX_URL`, default `https://releases.lightci.com/activate/index.json`, built by `scripts/release-index.mjs` from the GitHub releases) once a day (`updates.check`, also once when a worker boots) and stores the result in `instance_settings`. `GET /api/admin/updates` feeds the admin banner (`components/shell/update-banner.tsx`, red for a security advisory) and `activate doctor` prints a line. Self-hosted only; `UPDATE_CHECK_ENABLED=false` sends nothing.

**Coach plugin.** The plugin ships in the image (`COACH_PLUGIN_DIR`, `/app/plugins/activate-coach`). `PluginUpdateService` (`plugin.update`, once per worker boot) compares the bundled version with each organisation's marketplace and, when newer, pushes the files on `activate/coach-plugin-v<version>` with the installation's connector URL and opens a pull request (GitHub) or leaves the branch (other remotes). An existing branch means the proposal is already out; default branches are never written.

**Upgrade lifecycle.** `scripts/check-migrations.mjs` keeps migrations additive within a major; `scripts/ci/upgrade-path.sh` runs N-2 → N-1 → N migrations and boots N-1 against the N schema on every release; Helm runs `activate migrate` as a pre-upgrade hook and `activate bootstrap` post-install; the Terraform module exposes `migrate_command`; Compose gates api and worker on the `migrate` service. Deprecated environment names keep working for two minors with a warning, and `env.spec.ts` fails at the sunset release.

**Cells.** `infra/aws/envs/us-prod` (us-east-1, 10.90.0.0/16) and `eu-prod` (eu-central-1, 10.100.0.0/16) consume the same module as customers with `edition=cloud`, WorkOS per cell and `LEAD_EMAIL_DOMAINS=lightci.com`; hosts live in the lciventure.com zone (`activate.lciventure.com`, `api.`, `mcp.`, and `eu.activate.lciventure.com`, `api.eu.`, `mcp.eu.`). State, secrets, logs and snapshots stay in the cell's region. Each cell has a bootstrap root (`infra/aws/bootstrap/<cell>`, local state) that owns what the cell root needs before it can run: the state bucket and lock table, the Secrets Manager shells the cell root looks up by name (`activate-<cell>-workos|anthropic|secrets-key`, plus `-openai` in the US and the product-wide `activate-license-signing-key`), two ECR repositories (`activate/server`, `activate/web`), the OIDC deploy role GitHub assumes, and the GitHub environment plus its `AWS_DEPLOY_ROLE_<CELL>` secret. Secret values are written once by hand and never enter state. `.github/workflows/deploy.yml` is run by hand (required reviewers need GitHub Enterprise on a private repository) and promotes a release through us-prod then eu-prod: verify the GHCR signatures with cosign, mirror the two images into the cell's ECR with crane, apply with the new tag, snapshot, migrate task, roll, `/api/ready`, a 30-minute bake with no 5xx. `infra/cells.json` lists the cells for the sign-in router on the website; `scripts/workos-redirects.mjs` registers each cell's callback in a WorkOS environment.
