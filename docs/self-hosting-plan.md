# Self-hosted Activate, bring-your-own SSO, and EU/US cells

Implementation plan. Written 2026-10-31 against commit 55bd58b. Companion to `docs/architecture.md` and to the published guide at lightci.com/activate/self-host (`lightci-website/components/activate-self-host.tsx`), which this plan makes true.

## Context

The self-host guide went live on 2026-10-26 describing a Helm chart, direct OIDC, a license file, a worker process, an `activate doctor` CLI and a set of security guarantees. None of that exists. Today the product is one NestJS image that runs HTTP, cron jobs, migrations and git writes in every replica, authenticates only through WorkOS, keeps the marketplace git tree on each container's own disk, and deploys to a single us-east-1 dev environment. We want three things:

1. A self-hosted model a customer's platform team can install and operate, matching the guide.
2. Customers bring their own SSO, both in LightCI's cloud and self-hosted.
3. An EU cell and a US cell of the LightCI cloud, with data at rest in region.

The unifying idea: **one deployable that runs three ways.** Self-hosted is the customer running the bundle. The US and EU clouds are LightCI running the same bundle in two regions. Bring-your-own SSO is a property of the bundle.

### Decisions taken (2026-10-31)

| Decision | Choice |
|---|---|
| Self-hosted identity | Built-in direct OIDC provider, plus WorkOS as an option. WorkOS stays the cloud default. |
| Packaging | Helm chart and Terraform/ECS module both ship in 1.0, plus Compose for evaluation. |
| EU cell | eu-central-1 (Frankfurt). Model calls go to api.anthropic.com (US). Bedrock EU is a documented later option. |
| Licensing | Offline signed license file in the first self-hosted release. |
| Registry (assumed, not yet decided) | GHCR (`ghcr.io/lightconsultinginc/activate/*`) for images and the OCI Helm chart. `registry.lightci.com` in the guide becomes `ghcr.io/lightci` unless we decide to front a registry ourselves. |

### Facts established during exploration that shape the plan

- Git state is per container with no remote: `api/src/skills/git-repo.service.ts` runs `git init` on files copied into the image, never clones, fetches or pushes main. Prod Terraform already sets two API replicas, so commits diverge and vanish on redeploy. A real remote and a single writer are prerequisites, not polish.
- The four `@Cron` jobs (`learning/mastery.service.ts:510`, `learning/revisit.service.ts:240`, `workflows/scorer.service.ts:173`, `ops/analytics-sync.service.ts:67`) run on every replica with no lock. `revisit-decay-check` can insert duplicates; `scorer.nightly` doubles token spend.
- Tenancy holes: `WorkosGuard` (`api/src/auth/workos.guard.ts:79-82`) lets an org-less non-lead pick any org via `X-Activate-Org`; the token audience is never checked; a WorkOS `admin` role becomes an Activate admin, and `RolesGuard` lets any admin reach `POST /api/admin/seed/reset`, which truncates every tenant; `POST /api/auth/invites` has no role check.
- Fail-open defaults: `ACTIVATE_SECRETS_KEY` falls back to a dev key (`api/src/common/secrets.service.ts:16`); the DB client uses `rejectUnauthorized: false` (`api/src/typeorm.config.ts:42`); `LEAD_EMAIL_DOMAINS` defaults to `lightci.com`; `SEED_ON_BOOT=true` in dev infra; the demo marketplace is baked into the image (`api/Dockerfile:25`); the web image bakes `NEXT_PUBLIC_*` URLs at build time so it cannot be a single published artifact.
- Already generic and reusable: `Person` apart from `workosUserId`; `RolesGuard`, `requestContext`, `@OrgId`; `OrgIntegration` + `SecretsService` for per-org encrypted secrets; `Org.settings` jsonb; `Org.residencyMode` already has a `client_hosted` value; the MCP REST bridge forwards whatever bearer it got; `apiFetch` only needs a different token source; `LeadService.createClient` is the org-creation logic to extract; the Terraform modules are region-agnostic.
- External facts: WorkOS processes identity data in the US under SCCs with no EU region. Anthropic calls connectors from `160.79.104.0/23` and `2607:6bc0::/48` (published, "won't change without notice"). Claude Enterprise connectors prefer Dynamic Client Registration; pre-registered client credentials have persistence bugs reported by users. Bedrock serves current Claude models through EU geo inference profiles when we want them.

## Target architecture

```
                 ┌──────────── web (Next, stateless) ────────────┐
browser ───────► │  /          UI                                 │
                 │  /api/*     same-origin proxy → API_URL        │
                 └───────────────────────┬───────────────────────┘
                                         ▼
Claude ──/mcp──► ┌──────────── api (Nest, ACTIVATE_ROLE=api) ─────┐
(Anthropic IPs)  │  REST /api, MCP /mcp, OAuth AS /oauth/*,       │
                 │  /.well-known/*, /api/health, /api/ready       │
                 └───────────────────────┬───────────────────────┘
                                         │ pg-boss jobs + state
                 ┌──────────── worker (ACTIVATE_ROLE=worker, 1) ──┐
                 │  schedules, jobs, git clone/push, analytics    │
                 │  volume: /data (marketplace clones, cache)     │
                 └───────────────────────┬───────────────────────┘
                                         ▼
                              PostgreSQL (the only system of record)
   migrate: one-shot `activate migrate` before every rollout (Job / ECS task)
   identity: WorkOS (cloud default)  |  built-in OIDC + OAuth AS (self-hosted)
```

Same `activate/server` image for api, worker, migrate and the `activate` CLI. Same `activate/web` image everywhere, configured at runtime.

## Workstreams

Estimates are for one engineer; WS1 and WS2 can run in parallel with a second. WS7 (release and upgrade lifecycle) is listed after WS5 but its pieces land inside M2, M5 and M6.

### WS0. Hardening and tenancy safety (prerequisite for everything) — ~1.5 weeks

Ships to the cloud dev environment immediately; nothing here waits on packaging.

1. **Startup config validation.** New `api/src/config/env.ts` (zod schema) run first in `main.ts`. Required vars differ by `ACTIVATE_ROLE` and `ACTIVATE_EDITION` (`cloud` | `self-hosted`). Self-hosted requires: `ACTIVATE_SECRETS_KEY`, `PUBLIC_API_URL`, `WEB_URL`, DB vars, one identity provider, `ACTIVATE_LICENSE_FILE`. Refuse to boot in production with `SEED_ON_BOOT`, `MCP_DEV_USER_EMAIL`, or `AI_PROVIDER=mock`.
2. **Secrets key fails closed.** `common/secrets.service.ts`: throw when unset and `NODE_ENV=production`. Add `ACTIVATE_SECRETS_KEY_PREVIOUS` (comma list) so `decrypt` tries old keys; `activate secrets rotate` re-encrypts `org_integrations` rows (WS3 CLI).
3. **Database TLS.** `typeorm.config.ts`: `DB_SSL_MODE` (`disable|require|verify-ca|verify-full`, default `verify-full` when not local) and `DB_SSL_CA_FILE`. Ship the AWS RDS global CA bundle in the image for convenience. Terraform: add a parameter group with `rds.force_ssl=1` to `infra/aws/modules/database`. Keep `DB_SSL=true|false` as a deprecated alias.
4. **Tenancy fixes in `auth/workos.guard.ts` and friends.**
   - Non-leads never take `X-Activate-Org`; an org-less non-lead gets 403 "Your company isn't set up yet" instead of a free choice of tenant.
   - Verify `aud` once we confirm which claim WorkOS sets (the OIDC provider in WS1 enforces audience unconditionally).
   - `POST /api/auth/invites` gets `@Roles('champion','admin')`.
   - Seed controller becomes `@Roles('lead')` and `SeedModule` is imported only when `ACTIVATE_EDITION=cloud && NODE_ENV!=production` or `ACTIVATE_ALLOW_SEED=true`.
   - `LEAD_EMAIL_DOMAINS` default becomes empty; LightCI cloud envs set it explicitly.
5. **Readiness.** `GET /api/ready` in `healthcheck/`: DB ping, migrations current (compare `migrations` table to the compiled list), license valid (WS3), identity issuer discoverable (cached). `/api/health` stays liveness-only. Chart and Terraform probes use `/api/ready`.
6. **Migrations as a step, not a side effect.** `migrationsRun` true only when `NODE_ENV!=production`. New `api/src/cli.ts` with `migrate` (wrapped in `pg_advisory_lock`) and later `doctor`, `support-bundle`, `secrets rotate`, `bootstrap`. The CLIs in `seed/*.cli.ts` move under it.
7. **Logs and request ids.** `nestjs-pino` JSON lines with `requestId` (set in a middleware before the guard; `RequestStore.requestId` already exists in `common/request-context.ts`). Prompt and response content stay out of logs (already true).
8. **Image hygiene.** Stop `COPY marketplace/` in `api/Dockerfile`; dev keeps `LIBRARY_REPO_PATH=../marketplace`, cloud demo uses a remote (WS2). Pin base image by digest. Add `readonlyRootFilesystem`-compatible paths (`/tmp`, `/data`).

Files: `api/src/main.ts`, `api/src/app.module.ts`, `api/src/config/env.ts` (new), `api/src/common/secrets.service.ts`, `api/src/typeorm.config.ts`, `api/src/auth/workos.guard.ts`, `api/src/auth/auth.controller.ts`, `api/src/auth/people.service.ts`, `api/src/seed/seed.controller.ts`, `api/src/seed/seed.module.ts`, `api/src/healthcheck/*`, `api/src/cli.ts` (new), `api/Dockerfile`, `infra/aws/modules/database/main.tf`.

### WS1. Identity: bring-your-own SSO — ~3.5 weeks

#### 1a. Cloud: WorkOS organizations done properly (~1 week, ships first)

WorkOS is already a BYO-SSO broker; we are only using its password flow.

- **Provisioning.** `LeadService.createClient` creates the WorkOS organization through `workos.organizations.createOrganization({ name, domains })` instead of accepting a free-text id (`frontend/components/lead/clients-view.tsx:120`). Store `workosOrganizationId`. Add `emailDomains` to `Org`.
- **Self-serve SSO and directory setup.** Client detail page gets "Set up single sign-on" and "Connect your directory" buttons that call `workos.portal.generateLink({ organization, intent: 'sso' | 'dsync' })` and open the WorkOS Admin Portal. The setup checklist `sso` step (`orgs/org.service.ts:400-406`) becomes "SSO connection active" via `workos.sso.listConnections`.
- **Email-first login.** `frontend/app/(auth)/login`: email field first; `GET /api/auth/lookup?email=` (public, rate-limited) returns `{ mode: 'sso' | 'password' | 'unknown' }` by matching `Org.emailDomains`. SSO → `/sign-in?organization_id=` (existing route, `frontend/app/(auth)/sign-in/route.ts`). Password stays only for orgs flagged `isDemo` or when `AUTH_PASSWORD_LOGIN=true`.
- **Roles from the IdP, every login.** Convention: WorkOS organization roles `activate-admin`, `activate-sponsor`, `activate-champion` (customers map IdP groups to these in the Admin Portal, or Directory Sync does it). `people.service.ts upsert` applies `Org.settings.identity.roleMapping` (default maps those slugs; `member` → learner) on every sign-in, not just creation. Manual grants of `admin|sponsor|champion` survive only when the org has no role mapping configured. `lead` is never mapped from an IdP.
- **Deprovisioning.** Handle WorkOS webhooks `dsync.user.deleted` / `organization_membership.deleted` → `Person.status='inactive'`. Webhook endpoint `POST /api/webhooks/workos` verified with `WORKOS_WEBHOOK_SECRET`.

#### 1b. Identity abstraction (~0.5 week)

`api/src/auth/identity/`:

```ts
interface IdentityClaims { issuer; subject; email; name?; avatarUrl?; groups: string[]; roles: string[]; orgHint?: string }
interface IdentityProvider {
  kind: 'workos' | 'oidc';
  verifyBearer(token: string): Promise<IdentityClaims | null>;   // JWKS + issuer + audience
  authorizationServer(): AuthorizationServerMetadata;             // for /.well-known
  loginUrl(params: { organizationId?; loginHint?; redirectUri }): Promise<string>;
}
```

`WorkosIdentityProvider` wraps today's `resolveUser` + `WorkosService.getUser`. The guard is renamed `IdentityGuard` and depends on the interface. `Person.workosUserId` is generalised to `identityIssuer` + `identitySubject` (migration backfills from the WorkOS issuer; keep the old column one release). `skills/library.service.ts:235` and `auth/people.service.ts` switch to the new lookup. Provider selection: `AUTH_PROVIDER=workos|oidc` (instance-level; per-org direct OIDC in cloud stays out of scope because WorkOS covers it).

#### 1c. Built-in OIDC provider and OAuth authorization server (~2 weeks)

For self-hosted, the customer's IdP is the identity source, but Activate must still be an OAuth authorization server for two clients: the web app and Claude's connector. Verifying raw IdP access tokens is unreliable (Google issues opaque tokens; Entra needs an exposed API scope; Claude prefers Dynamic Client Registration, which Okta and Entra do not offer). So Activate runs a **minimal OAuth 2.1 server** in front of the IdP:

- Endpoints under `/oauth/`: `authorize` (redirects to the IdP via `openid-client`, PKCE required), `callback`, `token` (authorization_code + refresh_token), `register` (DCR, public clients and confidential clients with redirect allow-list), `jwks`. `/.well-known/oauth-authorization-server` and `oauth-protected-resource` (`mcp/well-known.controller.ts`) point at these instead of WorkOS when `AUTH_PROVIDER=oidc`.
- Tokens: RS256 JWTs signed by an instance key pair stored encrypted in a new `instance_keys` table (generated on first boot, rotatable). Access token 1 h, refresh 30 days, `aud` = `PUBLIC_API_URL`, claims: subject, email, name, groups, org.
- Config (guide names): `AUTH_OIDC_ISSUER`, `AUTH_OIDC_CLIENT_ID`, `AUTH_OIDC_CLIENT_SECRET`, `AUTH_OIDC_SCOPES` (default `openid profile email`), `AUTH_GROUPS_CLAIM` (default `groups`), `AUTH_ROLE_MAP` (JSON; `{"learner":["*"]}` default), `AUTH_PASSWORD_LOGIN=false`. Role mapping reuses 1a's `roleMapping` logic with groups instead of role slugs. Entra `groupsAreIds` handled by matching either display name or object id.
- Scope: no consent screen (first-party), no client secrets for public clients, no device flow. ~600 lines plus tests, using `jose` (already a dependency) and `openid-client`.
- Reverted WorkOS path keeps working untouched: in `workos` mode the AS endpoints are not mounted.

#### 1d. Frontend decoupling (~0.5 week)

The seven AuthKit imports collapse into `frontend/lib/session.ts` with two implementations chosen by `AUTH_PROVIDER`: AuthKit (today) and a sealed `iron-session` cookie holding the Activate tokens from 1c. `/auth/token`, `lib/api.server.ts`, `lib/auth.ts`, `proxy.ts` (cookie name), `sign-in`, `callback`, `login/actions.ts` consume the abstraction. Redirect URI is `${WEB_URL}/callback` at runtime, dropping `NEXT_PUBLIC_WORKOS_REDIRECT_URI`.

#### MCP under direct OIDC

Claude adds `https://<mcp-host>/mcp`, discovers the Activate AS, registers via DCR, and signs the user in through the customer's IdP. The 401 text in `mcp/mcp.controller.ts:31` becomes provider-neutral. Chart ingress for the MCP host defaults `sourceRanges` to Anthropic's published range (`160.79.104.0/23`, `2607:6bc0::/48`) and serves only `/mcp`, `/oauth/*`, `/.well-known/*`.

Files: `api/src/auth/**` (new `identity/`, `oauth/`), `api/src/mcp/oauth-metadata.ts`, `api/src/mcp/well-known.controller.ts`, `api/src/mcp/mcp.controller.ts`, `api/src/ops/lead.service.ts`, `api/src/orgs/entities/org.entity.ts` (+migration), `api/src/orgs/entities/person.entity.ts` (+migration), `frontend/lib/session.ts` (new), `frontend/app/(auth)/**`, `frontend/proxy.ts`, `frontend/components/lead/*`, `e2e/tests/helpers/auth.ts`.

### WS2. Runtime split, job queue, real git remote — ~2.5 weeks

1. **Role switch.** `ACTIVATE_ROLE=api|worker|all` (default `all` locally). `main.ts` → `bootstrapApi()` or `bootstrapWorker()` (`NestFactory.createApplicationContext(WorkerModule)`, the pattern `seed/*.cli.ts` already uses). `ScheduleModule.forRoot()` moves from `app.module.ts` into `WorkerModule`. `SeedService.onApplicationBootstrap` and `GitRepoService.onModuleInit` run only in worker/all.
2. **Job queue with pg-boss** (Postgres only, keeps the "no Redis" promise). `api/src/jobs/` with `JobsService.enqueue(name, payload, { singletonKey })` and handlers registered in the worker. First wave of jobs: `promotion.package`, `promotion.merge`, `library.write`, `marketplace.sync`, `module.prepare`, `workflow.build`, `interview.followup` (the inline `coach.generateNextExercise` after interview completion), and the four nightly jobs as pg-boss schedules with singleton keys (fixes double runs). Interactive calls that the UI awaits (grading a submission, interview turns, exercise runs) stay synchronous in the API for now; they are stateless apart from DB writes. The in-memory maps in `interviews/interviewer.service.ts:81` and `learning/module-prep.service.ts:43` are replaced by DB state so two API replicas agree.
3. **Git becomes a remote with one writer.** `skills/git-repo.service.ts`: clone `Org.marketplaceRepo` (or `LIBRARY_REPOSITORY` + `LIBRARY_GIT_TOKEN` in self-hosted) into `/data/marketplace/<orgId>` on first use, `fetch` before every write, `push` main and tags after `publish`, `pushBranch` for drafts. Only the worker writes. `LibraryService.sync/status/readRepoSkills` run as `marketplace.sync` jobs; API reads the DB. `LIBRARY_PROVIDER=github|gitlab|azure-devops` selects the PR API client (GitHub first; others are stubs that return "open the PR manually" until implemented). `GITHUB_TOKEN`/`GITHUB_REPO` remain as aliases. `PromoterService` PR numbering (`promoter.service.ts:373-378`) becomes a DB sequence.
4. **Web image configured at runtime.** `frontend/next.config.ts` rewrites `/api/:path*` → `API_URL` so the browser calls same-origin; `NEXT_PUBLIC_API_URL` disappears and CORS becomes unnecessary for the first-party web app. One published web image.

Files: `api/src/main.ts`, `api/src/worker.module.ts` (new), `api/src/jobs/**` (new), `api/src/skills/git-repo.service.ts`, `api/src/skills/library.service.ts`, `api/src/skills/promoter.service.ts`, `api/src/learning/module-prep.service.ts`, `api/src/interviews/interviewer.service.ts`, `frontend/next.config.ts`, `frontend/lib/api.ts`.

### WS3. Config-driven bootstrap, license, CLI — ~1.5 weeks

1. **First boot from config.** `activate bootstrap` (also run automatically by the worker on first start when `ACTIVATE_ORG_SLUG` is set): creates the org via an `OrgProvisioningService` extracted from `LeadService.createClient` (`ops/lead.service.ts:347-397`), inserts the competency catalogue (extracted from `seed/seed.service.ts:1622` into `api/src/catalog/competencies.ts`, applied idempotently by every edition), pre-creates `ACTIVATE_ORG_INITIAL_ADMINS` as `Person` rows with `roles: ['admin','sponsor']`, `status: 'invited'` (login matches by email, `people.service.ts:78-80`), sets `marketplaceRepo` from `LIBRARY_*`. Initial admins keep admin regardless of group mapping (break-glass, as the guide says).
2. **License.** `api/src/license/`: Ed25519-signed JWT read from `ACTIVATE_LICENSE_FILE`; LightCI public key embedded in the image. Claims: `licenseId`, `org` (slug, name), `seats`, `premiumSeats`, `features[]`, `issuedAt`, `expiresAt`. `LicenseService.verify()` at boot (fail closed when `ACTIVATE_EDITION=self-hosted`), exposed in `/api/ready` and `activate doctor`. Seat use = active persons; banner for admins at 90% of seats and 30 days before expiry; after expiry a 14-day grace, then a `LicenseGuard` rejects non-GET requests except for admin settings and license upload. Admin UI card under Settings. LightCI-internal `scripts/license-issue.mjs` signs with a key in Secrets Manager. Cloud edition skips all of this.
3. **`activate` CLI** (`api/src/cli.ts`, shipped as `/app/bin/activate` in the image): `migrate`, `bootstrap`, `doctor` (database and schema version, license, identity discovery and JWKS, Anthropic key, Claude Enterprise key scopes, marketplace clone and push access, voice), `support-bundle` (versions, redacted config, doctor output, last N log lines, job history; never content or emails in clear), `secrets rotate`.

Files: `api/src/cli.ts`, `api/src/bootstrap/**` (new), `api/src/catalog/competencies.ts` (new), `api/src/license/**` (new), `frontend/app/(app)/settings/license` (new), `scripts/license-issue.mjs` (new).

### WS4. Packaging and release pipeline — ~3 weeks

1. **Release workflow** `.github/workflows/release.yml` on tags `v*`: build `activate/server` and `activate/web` for amd64 and arm64, push to GHCR with `:X.Y.Z` and `:X.Y`, cosign keyless signing (GitHub OIDC), syft SPDX SBOM attached as attestation, Trivy gate on critical CVEs, `helm package` + `helm push oci://ghcr.io/lightconsultinginc/charts`, offline bundle (`docker save` archives, chart, `SHA256SUMS`) attached to the GitHub Release. Publish the verification public key path the guide references. Replace static AWS keys in `deploy-api.yml` with an OIDC role.
2. **Helm chart** `deploy/helm/activate`: `web` Deployment + HPA + PDB; `api` Deployment + HPA + PDB; `worker` StatefulSet (1 replica, PVC at `/data`); `migrate` Job as `pre-install,pre-upgrade` hook running `activate migrate`; `bootstrap` post-install hook; Services; `internal` Ingress (web + api hosts) and `mcp` Ingress (paths `/mcp`, `/oauth`, `/.well-known`, `sourceRanges` default to Anthropic's range); NetworkPolicy; optional ServiceMonitor; `securityContext` exactly as the guide shows; every secret via `existingSecret` with the key names in the guide's `values.yaml`. Values keys match the guide verbatim so the guide's file installs unchanged. Tests: `helm lint`, `helm-unittest`, and a kind-based install smoke in CI that waits for `/api/ready` and runs `activate doctor`.
3. **Compose** `deploy/compose/`: `docker-compose.yml` (postgres, migrate, api, worker, web) and `.env.example`; published to the GitHub Release so `curl -fsSLO` in the guide works.
4. **Terraform module** `deploy/terraform/aws` (published to the Terraform registry as `lightci/activate/aws`): refactor `infra/aws/modules/service` to take `create_load_balancer`, `command`, `efs_volume`, a shared `cluster_arn`, an external `image` (so GHCR works without ECR), autoscaling, deployment circuit breaker, ECS Exec. Add a worker service with EFS at `/data`, a `migrate` one-shot task run before rollouts, an internal ALB for web and api, an optional public ALB for the MCP host with a WAF IPSet of Anthropic's range, RDS `multi_az`, `rds.force_ssl` parameter group, KMS keys, Secrets Manager inputs as ARNs. `infra/aws/envs/*` become thin consumers of this module.
5. **Metrics.** `prom-client` on `:9464/metrics` in api and worker with the metric names the guide lists; pg-boss provides queue depth and last-success timestamps.

Files: `.github/workflows/release.yml` (new), `.github/workflows/deploy-api.yml`, `deploy/helm/activate/**` (new), `deploy/compose/**` (new), `deploy/terraform/aws/**` (new, from `infra/aws/modules/*`), `api/src/metrics/**` (new).

### WS5. US and EU cells — ~1 week after WS4

- Two root modules consuming the Terraform module: `infra/aws/envs/us-prod` (us-east-1, 10.90.0.0/16) and `infra/aws/envs/eu-prod` (eu-central-1, 10.100.0.0/16). Each: own S3 state bucket in region, own Secrets Manager entries, own KMS, multi-AZ RDS with PITR, NAT per AZ, CloudWatch logs in region. The existing unapplied `envs/prod` is replaced by `us-prod`.
- Hosts: `activate.lciventure.com` / `api.activate.lciventure.com` / `mcp.activate.lciventure.com` (US) and `eu.activate.lciventure.com` / `api.eu.activate.lciventure.com` / `mcp.eu.activate.lciventure.com` (EU), in the lciventure.com zone LightCI already runs in AWS. Separate WorkOS environment per cell (its own client id, redirect URIs and organizations). `LEAD_EMAIL_DOMAINS=lightci.com` set per cell; leads sign in to each cell separately.
- Login routing: a static `cells.json` (domain → cell) published by provisioning and read by the marketing-site sign-in link, redirecting by email domain. Orgs are cell-local; nothing crosses regions.
- Model residency: per the decision, both cells call api.anthropic.com. Record this in the DPA and the guide. `AI_PROVIDER=bedrock` with the EU geo inference profile is the documented upgrade path, implemented behind `AiService.clientFor` when a customer requires it (note: `thinking`, `output_config.effort`, structured outputs and `cache_control` need per-platform verification; `verifyKey` uses `models.list`, which is Anthropic-only). Voice (OpenAI Realtime) is off in EU by default.
- CI: `deploy.yml` over cells with one OIDC role per cell (`infra/aws/bootstrap/<cell>`). GHCR packages are private, so the workflow verifies each release's cosign signature and mirrors the two images into the cell's own ECR before applying; ECS pulls with its task execution role and no registry credential lives in the cell.

Files: `infra/aws/envs/us-prod/**`, `infra/aws/envs/eu-prod/**`, `.github/workflows/deploy.yml`, `lightci-website` sign-in routing.

### WS7. Release and upgrade lifecycle — ~1 week, spread across M2–M5

How a change gets from `main` to a customer's cluster, LightCI's cells, and the content inside them. This is what the guide's Upgrades section promises.

**Versioning and cadence**
- One version number for the whole product: server image, web image, chart, Compose file and Terraform module all carry the same `X.Y.Z` tag, cut from `main` by the release workflow (WS4). Patch as needed, minor monthly, major at most yearly. Supported: the current minor and the previous one.
- Release notes are generated from conventional commits plus a hand-written `RELEASE_NOTES.md` section per release: new config keys, changed defaults, migrations, and anything an operator must do. Published on the GitHub Release and mirrored to the guide's changelog page.

**Compatibility rules the code enforces, not just promises**
- Within a major, migrations are additive only (no `DROP`, no `NOT NULL` on existing columns without a default, no renames). A CI check (`scripts/check-migrations.mjs`) rejects a PR that adds a destructive statement unless the PR carries a `major-release` label. This is what makes rolling back the app without restoring the database safe.
- Every release runs `activate migrate` against a database at the previous minor and the one before it in CI (two-version upgrade test) and then boots the previous image against the new schema (rollback test).
- The chart's `appVersion` equals the image tag; `helm upgrade` fails fast if `values.image.tag` is pinned to a version the chart does not know (prevents a chart/image mismatch).
- Deprecated env vars and values keys keep working for two minors with a startup warning naming the replacement (`GITHUB_TOKEN` → `LIBRARY_GIT_TOKEN`, `DB_SSL` → `DB_SSL_MODE`, and so on, via the WS0 env schema).

**Upgrade procedure per packaging (all follow the same shape: check, snapshot, migrate, roll, verify)**
- Helm: `helm upgrade` runs the `migrate` Job as a `pre-upgrade` hook; pods roll only if it succeeds; `helm rollback` restores the previous release against the newer, additive schema. `activate doctor --pre-upgrade <version>` (reads the release manifest) warns about new required keys before anything changes.
- Terraform module: bumping `image_tag` plans a new task definition; a `null_resource` or the `deploy` script runs the one-shot `migrate` ECS task and waits for exit 0 before `update-service`; the ECS deployment circuit breaker rolls back a failing service automatically.
- Compose: `docker compose pull && docker compose up -d`; the `migrate` service is `depends_on` by api and worker with `condition: service_completed_successfully`.
- Database snapshot before every upgrade is the operator's step and is spelled out in each procedure; the `migrate` command prints a reminder and the target schema version.

**How operators learn an update exists**
- `GET https://releases.lightci.com/activate/index.json` (a static file published by the release workflow): versions, dates, support status, security advisories. The worker checks it daily when `UPDATE_CHECK_ENABLED=true` (default true, trivially disabled for restricted networks; it sends nothing but the request) and the admin Settings page shows "1.2.0 available" with a link to the notes. `activate doctor` prints the same. No telemetry is sent; seat-count telemetry stays a separate opt-in (`TELEMETRY_ENABLED`, default false).
- Security fixes: critical within 7 days, high within 30, as patches on both supported minors, announced in the index with an `advisory` flag so the banner is red.

**Content and plugin updates**
- Lessons, practice templates and mock responders ship inside the server image, so they update with the release. Content changes that need data (new competencies) are migrations like any other.
- The Coach plugin (`marketplace/plugins/activate-coach`) is versioned separately inside the image. A worker job `plugin.update` compares the bundled version with the customer's marketplace repo on each start and after each upgrade, and opens a pull request with the diff. Champions review and merge; Claude Enterprise syncs it. Nothing is pushed to `main` of a customer repo without review. The same job handles the first-boot "add the Coach plugin" PR the guide describes.

**LightCI cloud cells**
- Promotion by hand: `deploy.yml` (workflow_dispatch with a version and the cells) rolls `vX.Y.Z` through `us-prod` then `eu-prod`, each gated on the previous cell's `/api/ready` and a 30-minute bake with no new 5xx. Running it by hand is the approval gate, because required reviewers on GitHub environments need GitHub Enterprise on a private repository. Same migrate-then-roll sequence as the Terraform module, because the cells use the module. There is no dev cell any more; the former dev stack was torn down when the cells went live.
- Rollback is a redeploy of the previous tag; the additive-migration rule makes that safe without a restore.
- The license renewal path for self-hosted (`activate-license` Secret replaced, worker restarted, 30-day warning, 14-day grace) is in WS3 and is unaffected by upgrades.

**Managed-in-your-cloud (deferred, noted)**
- The guide's middle column (LightCI operates the customer's deployment through a role they grant) is the same Terraform module and the same upgrade procedure run from LightCI's CI with a cross-account IAM role. Nothing in this plan blocks it; it is out of scope for 1.0 and gets its own plan when the first customer wants it.

Files: `.github/workflows/release.yml`, `.github/workflows/deploy.yml`, `scripts/check-migrations.mjs` (new), `api/src/cli.ts` (`doctor --pre-upgrade`, `migrate --check`), `api/src/jobs/handlers/plugin-update.ts` (new), `api/src/jobs/handlers/update-check.ts` (new), `deploy/helm/activate/templates/migrate-job.yaml`, `deploy/compose/docker-compose.yml`, `deploy/terraform/aws/migrate.tf`, `RELEASE_NOTES.md` (new), the `releases.lightci.com` static bucket.

### WS6. Make the guide true — ongoing, with a day-one fix

Day one (website repo, `components/activate-self-host.tsx`): add a visible banner "Self-hosted Activate 1.0 is in early access; this page describes the 1.0 release", remove the three false security bullets (fails closed, verify-full, no demo data) until WS0 ships, change the registry host, fix the redirect URI to `/callback`, state WorkOS as the cloud default and direct OIDC as the self-hosted option, cite Anthropic's published IP range. Then update each section as its workstream lands; the guide's values keys and env var names are the contract the code adopts (`DB_SSL_MODE`, `DB_SSL_CA_FILE`, `AUTH_OIDC_*`, `AUTH_ROLE_MAP`, `ACTIVATE_LICENSE_FILE`, `ACTIVATE_ORG_*`, `LIBRARY_PROVIDER`, `LIBRARY_REPOSITORY`, `LIBRARY_GIT_TOKEN`, `TELEMETRY_ENABLED` as a no-op default false). Update `docs/architecture.md` (deployment section, port numbers, lead rule) and `infra/README.md`.

## Status (2026-11-01)

Everything below is on branch `m0-hardening`, not yet merged or released. Each milestone's tests ran locally against real services (Postgres, Keycloak, a bare git remote, Docker images, a kind cluster); CI now runs the same on every pull request.

| Milestone | State | Evidence |
|---|---|---|
| M0 hardening (WS0) | done | `f8e7000`; `env.spec.ts`, DB TLS tests, tenancy fixes |
| M1 cloud BYO-SSO (WS1 cloud) | done | `940b47d`; `workos.int.spec.ts` against the WorkOS test environment, E2E in WorkOS mode (113 passed) |
| M2 runtime split, jobs, git remote (WS2) | done | `088197a`; `jobs`, `pg-lock`, `git-remote` integration specs; k6 baseline |
| M3 + M4 direct OIDC, OAuth server, licence, bootstrap, CLI (WS1 self-hosted, WS3) | done | `1397679`; `oauth` (Keycloak), `bootstrap`, `license`, `rotate` specs; E2E in OIDC mode (108 passed) |
| M5 packaging (WS4) | done, uncommitted at the time of writing | Helm chart with 28 unit tests, Compose, Terraform module validated, release workflow, metrics (`metrics.int.spec.ts`), kind install smoke (`scripts/ci/kind-smoke.sh`: TLS Postgres, Keycloak over a private CA, licence, migrate and bootstrap hooks, doctor, metrics, web sign-in routing, upgrade, rollback, volume survival) and Compose smoke (`scripts/ci/compose-smoke.sh`). The smokes found and fixed four defects the unit and E2E suites could not see: the web app sent browsers to the in-cluster API address to sign in (now `PUBLIC_API_URL`); the connector host's IP whitelist covered `/oauth` and `/.well-known`, which people's browsers need (now split: `/mcp` only); the Compose stack refused to boot because production rejects a plaintext database host (now an explicit, warned `DB_SSL_ALLOW_PLAINTEXT` for the single-node evaluation); and api and worker starting together deadlocked in Postgres while creating pg-boss queues (now serialised under the advisory lock). Final local results: kind smoke passed, Compose smoke passed, E2E WorkOS mode 108 passed (3 reruns after a toast-overlay fix), E2E OIDC mode 110 passed (one timing-tolerant test fix) |
| WS7 release and upgrade lifecycle | done, uncommitted | `check-migrations.mjs`, `upgrade-path.sh` in the release workflow, chart image-tag lock (T7.7), deprecated-alias sunset test (T7.3), update check and admin banner (`updates.int.spec.ts`, T7.4), Coach plugin pull requests (`plugin-update.int.spec.ts`, T7.5), release notes gate (T7.6) |
| WS5 cells | bootstrapped in both regions; roots plan clean (75 resources each); first deploy in progress | `infra/aws/bootstrap/us`, `eu` (state backend, secret shells, ECR, deploy role, GitHub environment); `infra/aws/envs/us-prod`, `eu-prod` from the shared module in the lciventure.com zone; `deploy.yml` (by hand) / `deploy-cell.yml` (cosign verify, ECR mirror); `infra/cells.json`; `scripts/workos-redirects.mjs`. Both cells currently share the WorkOS test environment; an EU production environment and the webhook endpoints (dashboard) are still to do |
| WS6 guide | in progress | website corrections against the shipped chart and code |

Still open before the first customer (see the rollout gate): T1.11 manual sign-off with a real Claude Enterprise org; T1.14 ZAP scan; T2.5 Compose replica topology against a scratch GitHub repo; T5.x once the cells are applied; T6.1/T6.2 harnesses that execute the guide's code blocks and diff its tables against `env.ts` and `values.yaml`; the `releases.lightci.com` bucket (`RELEASES_BUCKET` repository variable) so installed copies can read the index; per-cell WorkOS production environments (both cells run on the shared test environment today) and their webhook endpoints registered in the dashboard with `workos_webhook_secret_name` set on each cell root. Done on 2026-11-01: the licence signing key lives in Secrets Manager (`activate-license-signing-key`, us-east-1) and as the `LICENSE_SIGNING_KEY` GitHub secret; `ANTHROPIC_API_KEY`, `WORKOS_API_KEY` and `WORKOS_CLIENT_ID` are GitHub secrets.

Lint: `cd api && yarn lint` now gates CI with zero errors (292 pre-existing errors were fixed without behaviour changes).

## Sequencing and milestones

| Milestone | Weeks | Contents | Proof |
|---|---|---|---|
| M0 Hardening | 1–2 | WS0, WS6 day-one | Cloud dev runs with `/api/ready`, fail-closed secrets, lead-only seed, tenancy fixes; guide banner live |
| M1 Cloud BYO-SSO | 2–3 | WS1a | A client org created from the lead console connects Okta via the Admin Portal and signs in with mapped roles |
| M2 Runtime split | 3–6 | WS2 (parallel with M3) | Two API replicas + one worker on dev; a skill promotion lands in a real GitHub remote; nightly jobs run once. Recorded 2026-11-01: k6 baseline on the local mock stack, 50 browsing + 5 submitting for 60 s, reads p95 15 ms, submits p95 92 ms, 0 failed of 7,611 requests |
| M3 Direct OIDC + AS | 4–6 | WS1b–d | E2E suite passes against a Keycloak container with `AUTH_PROVIDER=oidc`; Claude connects via DCR |
| M4 Bootstrap, license, CLI | 6–7 | WS3 | Fresh DB → `activate bootstrap` → admin signs in; `activate doctor` all green; expired license → read-only |
| M5 Packaging | 7–10 | WS4, WS7 | `helm install` from the guide's `values.yaml` into kind and into a customer-like EKS; Compose up on one VM; Terraform module applies in a fresh AWS account; signed images verify with cosign; `helm upgrade` 1.0.0 → 1.0.1 → rollback succeeds in CI; the update banner appears against a test release index |
| M6 Cells | 10–11 | WS5, WS7 | us-prod and eu-prod live from the module; a tagged release flows dev → us → eu with gates; EU org data, logs and backups confined to eu-central-1 |

About 12 weeks for one engineer, about 8 with two (WS1 and WS2 in parallel from week 3). WS7 has no milestone of its own: the migration-compatibility check lands with WS2 (M2), the migrate hooks and update index with WS4 (M5), the cell promotion flow with WS5 (M6).

A milestone closes only when its test tables in the Test plan below are green in CI: M0 → T0; M1 → T1.1–T1.6; M2 → T2 and T7.1–T7.3; M3 → T1.7–T1.14; M4 → T3; M5 → T4, T6, T7.4–T7.7; M6 → T5. The customer rollout gate at the end of the Test plan sits after M6 and before the first paying self-hosted customer; allow two further weeks for the pilot and the penetration test, so GA is about week 14 for one engineer.

## Test plan

The bar: when every milestone is green we roll this out to paying customers who run it themselves. So every workstream has its own tests with pass criteria, nothing ships on "it worked on my machine", and the last gate is a real customer pilot. Test IDs below are referenced from PRs and from the go/no-go checklist.

### Principles

- **A workstream is done when its tests exist and pass in CI**, not when the code merges. Each WS table below is the definition of done for that WS.
- **Test like a customer.** The acceptance environment is installed from the published guide only, by someone who did not build the feature, with no access to the engineering team during the attempt.
- **Every failure mode in the guide's Troubleshooting table has a test that produces it** and checks the error message an operator sees.
- **Nothing synthetic leaks.** Mock AI, seed data and dev headers are compile-time or edition-gated; a test asserts they are absent from release images.
- **Fixtures are real.** Identity tests run against Keycloak (and a WorkOS test environment), git tests against a real bare remote and a scratch GitHub repo, infra tests against kind and a disposable AWS account.

### Test levels and where they run

| Level | Tooling | Runs |
|---|---|---|
| Unit | Jest, hand-built services with `FakeRepo` and `fakeAi()` (`api/src/learning/testing/fake-repo.ts`) | every PR |
| Integration | Jest + Testcontainers (Postgres, Keycloak, `oauth2-mock-server`, bare git, local `registry:2`) in `api/test/integration/` | every PR |
| End-to-end | Playwright (`e2e/`), run twice: `AUTH_PROVIDER=workos` and `AUTH_PROVIDER=oidc` | every PR (mock AI), nightly (live AI, dev cell) |
| Replica and topology | Docker Compose with `api` ×2 and `worker` ×1 in CI | every PR touching `api/`, nightly |
| Chart and infra | `helm lint`, `helm-unittest`, kind install; `terraform fmt/validate`, tflint, checkov; disposable-account apply | every PR for lint and kind; apply nightly and per release |
| Supply chain | cosign, syft, Trivy, CodeQL, gitleaks | every PR (scan), every release (sign, attest, verify) |
| Performance | k6 scripts in `perf/` against the replica stack and the dev cell | nightly, and per release against staging-selfhost |
| Operational drills | Scripted runbooks: upgrade, rollback, restore, key rotation, license expiry, IdP outage | per release candidate, then quarterly |
| Documentation acceptance | Timed fresh-engineer install from the guide; doc-block execution harness | per release candidate |
| Pilot | One design-partner customer self-hosting for two weeks | once before GA, then per major |

Environments: `local` (`./scripts/dev.sh mock`), `ci`, `dev` cell (us-east-1, continuous), `staging-selfhost` (an EKS cluster plus a fresh AWS account that LightCI runs as a pretend customer, installed strictly from the guide), `us-prod`, `eu-prod`, `pilot` (customer-owned).

### WS0 tests: hardening and tenancy

| ID | Test | How | Pass |
|---|---|---|---|
| T0.1 | Env validation per role and edition | Unit: boot `env.ts` with each required var missing, for `api`/`worker`/`all` × `cloud`/`self-hosted` | Exit non-zero naming the variable; full set boots; `SEED_ON_BOOT`, `MCP_DEV_USER_EMAIL`, `AI_PROVIDER=mock` refused when `NODE_ENV=production` |
| T0.2 | Secrets key fails closed and rotates | Unit + integration: no key in production → exit; encrypt with key A, start with key B and `PREVIOUS=A` → decrypt ok; `activate secrets rotate` → all rows re-encrypted; remove A → still ok | All four assertions; rotate is idempotent on re-run |
| T0.3 | Database TLS modes | Integration: Postgres container with self-signed CA; `verify-full` with wrong CA fails, right CA passes, hostname mismatch fails; `require` ignores CA; local host allows `disable` | Each mode behaves as named; error text names the mode |
| T0.4 | Tenancy: org header | Integration through the HTTP guard: org-less non-lead + header → 403 with the plain message; lead + header → scoped; member + foreign header → own org data only | No path lets a non-lead read another org |
| T0.5 | Seed routes gated | Integration: self-hosted edition → routes absent (404); cloud dev → admin 403, lead 200 | As stated; a release-image smoke (T0.10) confirms absence |
| T0.6 | Invite authorisation | E2E: learner invite → 403; champion → 201 and invitation sent | As stated |
| T0.7 | Readiness | Integration: DB stopped → 503 `{db:"fail"}`; pending migration → 503 `{migrations:"pending"}`; license invalid (self-hosted) → 503; healthy → 200 with the documented body | Body shape matches the guide; liveness stays 200 throughout |
| T0.8 | Migrate as a step | Integration: two concurrent `activate migrate` → both exit 0, each migration applied once; production boot with pending migration does not auto-run | Advisory lock holds; `/api/ready` reports pending |
| T0.9 | Logs | Integration: submit an exercise containing a sentinel string; capture stdout | Every line is JSON with `requestId`; sentinel never appears; no email addresses in clear |
| T0.10 | Release image hygiene | CI on built image: no `/marketplace`, runs as uid 1001, read-only root FS boots with only `/tmp` and `/data` writable, Trivy critical = 0, base image digest-pinned | All pass |
| T0.11 | Regression | Existing 165 unit and 82 E2E specs in mock mode | Green in both auth modes once WS1 lands |

Exit: all T0 green on `main`; dev cell running with fail-closed config for one week with no auth or 5xx regressions.

### WS1 tests: identity

| ID | Test | How | Pass |
|---|---|---|---|
| T1.1 | Provisioning creates the WorkOS org | Integration against the WorkOS test environment (nightly) and a mocked SDK (per PR) | Org exists with domains; `workosOrganizationId` stored; duplicate domain → 409 with clear text |
| T1.2 | Admin Portal links | Integration: `sso` and `dsync` links generated; manual (per release): complete an Okta developer-tenant SAML connection via the portal and sign in | Links open the portal scoped to the org; SSO sign-in lands in the right org |
| T1.3 | Email-first lookup | E2E: SSO domain → `sso`; demo domain → `password`; unknown → `unknown`; 50 rapid lookups → 429 | Routing correct; no user enumeration beyond mode |
| T1.4 | Roles from IdP on every login | E2E (WorkOS roles) and integration (OIDC groups): grant `activate-admin` → next login has admin+sponsor; revoke → learner; `lead` in a group → ignored; no mapping configured → manual grants persist | All four |
| T1.5 | Deprovisioning webhook | Integration: bad signature → 400; `dsync.user.deleted` → `status=inactive`; inactive user's API call → 401 | As stated |
| T1.6 | Existing suite in WorkOS mode | E2E | 82 specs green, unchanged |
| T1.7 | IdentityGuard with OIDC tokens | Unit with jose test JWKS: wrong `aud`, wrong `iss`, expired, `alg=none`, key not in JWKS → 401; valid → person provisioned by issuer+subject; migration backfill resolves old `workosUserId` rows | All reject paths 401 with no stack trace in body |
| T1.8 | OAuth AS correctness | Integration against the AS with `oauth2-mock-server` upstream: authorize without PKCE → `invalid_request`; code reuse → `invalid_grant`; redirect mismatch → error; `state` replay → error; refresh rotates and old refresh is revoked; DCR returns client; discovery and JWKS documents valid; checklist from RFC 9700 (OAuth 2.0 Security BCP) walked and recorded | Every item passes; results file committed under `docs/security/oauth-bcp-checklist.md` |
| T1.9 | Groups to roles across IdPs | Integration: Okta-style group names, Entra object ids, missing groups claim | Mapped correctly; missing claim → learner only and `doctor` warns |
| T1.10 | Full suite in OIDC mode | E2E against a Keycloak container with an imported realm (five role users, groups) | 82 specs plus the new WS1 specs green |
| T1.11 | Claude connector end to end | Automated: a script does discovery → DCR → PKCE code flow (headless Keycloak login) → calls `my_ladder` over MCP. Manual per release: a real Claude Enterprise org adds the connector, signs in through Keycloak and through Okta, tool call renders the panel, audit entry written | Automated green in CI; manual sign-off recorded with screenshots |
| T1.12 | Session cookie and refresh | E2E: cookie is `HttpOnly; Secure; SameSite=Lax`; token refreshed before expiry without a redirect; sign-out revokes the refresh token server-side (replay → 401) | All |
| T1.13 | Password login off by default | E2E self-hosted mode: login shows no password fields; `AUTH_PASSWORD_LOGIN=true` restores them for demo orgs only | As stated |
| T1.14 | Web security scan | ZAP baseline against web, API, AS and MCP on the replica stack; explicit open-redirect test on `next`, CSRF on `/callback` | Zero medium or high findings, or each one triaged with a ticket |

Exit: both E2E modes green on every PR; T1.11 manual sign-off against a real Claude Enterprise org with both Keycloak and Okta.

### WS2 tests: runtime split, jobs, git

| ID | Test | How | Pass |
|---|---|---|---|
| T2.1 | Role switch | Integration: `api` → no schedules registered, no git init, nothing written under `/data`; `worker` → no HTTP listener; `all` → both | As stated |
| T2.2 | Job queue semantics | Integration with two workers: a scheduled job fires once per schedule; kill a worker mid-job → retried on the other within the retry window; after N failures the job is in the dead-letter state and visible in admin | As stated; counts asserted from pg-boss tables |
| T2.3 | Every migrated handler | Unit with `FakeRepo`/`fakeAi()`; integration: API returns 202 with a job id and the status endpoint reaches `completed` | One spec per handler; status transitions asserted |
| T2.4 | Git remote behaviour | Integration against a bare repo: clone on first use; write → push; two promotions in parallel serialised; remote changed externally → fetch then write succeeds; push rejected → job fails with the documented error and `activate_marketplace_publish_failures_total` increments; bad token → `doctor` reports | All six |
| T2.5 | Replica topology | Compose `api` ×2, `worker` ×1: promote a skill over MCP; both replicas report the same library status; recreate all containers → data intact; delete the worker volume → re-clones from remote | PR exists on the scratch GitHub repo; states agree; nothing lost |
| T2.6 | Cross-replica dedupe | Integration: interview complete and voice flush sent concurrently to different replicas | Exactly one map, one exercise |
| T2.7 | Module prep status across replicas | Integration: start prep on replica A, poll status on B | Consistent progress; completion visible on both |
| T2.8 | Web image runtime config | E2E: same web image booted with two different `API_URL`s; Playwright network log shows the browser only calls the web origin; `grep` of the built bundle finds no `NEXT_PUBLIC_API_URL` | All |
| T2.9 | Performance baseline | k6 against the replica stack: 200 virtual learners browsing, 20 concurrent submissions, 10 MCP sessions, 15 minutes | p95 reads < 500 ms, submissions complete < 60 s, zero 5xx, worker queue drains; numbers recorded and used for the guide's sizing table |
| T2.10 | Nightly jobs unchanged in effect | Integration on seeded data: run each former cron as a job; compare mastery snapshot, revisit, scorer and analytics row counts to the pre-split baseline | Identical counts; `revisit-decay-check` no longer duplicates under two workers |

Exit: dev cell runs `api` ×2 + `worker` ×1 for two weeks; T2.5 and T2.9 green on every release candidate.

### WS3 tests: bootstrap, license, CLI

| ID | Test | How | Pass |
|---|---|---|---|
| T3.1 | Bootstrap from config | Integration: empty DB + `ACTIVATE_ORG_*` → org, competency catalogue, admin rows; re-run → no changes; missing var → clear error; admin signs in via OIDC → admin role kept even when group mapping says learner (break-glass) | All |
| T3.2 | License states | Unit + E2E: valid → ready ok; tampered signature → self-hosted refuses to boot, cloud ignores; 25 days to expiry → banner; expired + 7 days → banner, writes allowed; expired + 15 days → writes 403 except sign-in, admin settings, license upload; seats at 90% → banner; seats exceeded → provisioning blocked with plain message; 5-minute clock skew tolerated; replace Secret + restart → all clear | Every state; the read-only guard never blocks an admin from uploading a license |
| T3.3 | License issuance | Round trip with a test key pair in CI; gitleaks rule for the production private key | Round trip ok; the production key never appears in the repo or images |
| T3.4 | `activate doctor` | Integration: one failing fixture per check (bad DB credentials, unreachable JWKS, Anthropic 401, Claude key with wrong scopes, no git push access, voice disabled) | Each prints the symbol and message from the guide; exit code non-zero on any failure; healthy run matches the guide's sample output |
| T3.5 | `activate support-bundle` | Integration with sentinel email, prompt text and key values in the DB and logs | Tar contains the documented files; grep finds no sentinel; values are hashed where the guide says hashed |
| T3.6 | Rotation on real data | Integration: 50 encrypted integrations, rotate, verify every one decrypts | 100% |

Exit: a fresh database reaches "admin signed in, doctor all green" from config alone in under five minutes, in CI.

### WS4 tests: packaging and release pipeline

| ID | Test | How | Pass |
|---|---|---|---|
| T4.1 | Release workflow on a pre-release tag | Tag `v1.0.0-rc.1`: multi-arch manifests present; `cosign verify` with the GitHub identity passes; SBOM attestation downloads and parses; Trivy gate proven by a one-off branch pinning a known-critical dependency | All; the Trivy proof is recorded once and kept as a CI fixture |
| T4.2 | Chart templates | `helm lint`; `helm-unittest` for every template (secret references, probes on `/api/ready`, securityContext values, ingress paths and `sourceRanges` default, NetworkPolicy rules, PDB, HPA); `helm template` with the guide's `values.yaml` verbatim | Renders without error; every assertion green |
| T4.3 | kind install lifecycle | Install → ready → `doctor` → MCP well-known reachable from outside the cluster namespace → login page; `helm upgrade` same version (hook idempotent); upgrade rc.1 → rc.2; `helm rollback`; uninstall keeps the PVC | All; timings recorded |
| T4.4 | NetworkPolicy | From a test pod: api cannot reach arbitrary internet, can reach allowed egress; web cannot reach Postgres; worker can reach git host | As stated |
| T4.5 | Pod security | Namespace labelled `pod-security.kubernetes.io/enforce=restricted`; OpenShift compatibility checked in OpenShift Local (random uid) | Installs under `restricted`; OpenShift result recorded, with a documented SCC if needed |
| T4.6 | Compose from the guide | Fresh Ubuntu runner: run the guide's commands verbatim; up; `doctor`; login; upgrade by tag; down and up | Works without edits; data persists |
| T4.7 | Terraform module | `fmt`, `validate`, tflint, checkov per PR; nightly `apply` in the disposable account: tasks healthy, migrate task ran, MCP ALB returns 403 from a non-Anthropic IP, `destroy` leaves nothing (checked with the tagging API) | All |
| T4.8 | Offline bundle | Load into a local `registry:2`; install in kind with egress blocked except the allowed destinations | Installs and `doctor` is green |
| T4.9 | Metrics and alerts | `/metrics` exposes every metric named in the guide; kube-prometheus in kind scrapes via the ServiceMonitor; the stale-job alert fires when a schedule is paused | All |
| T4.10 | Documentation acceptance | An engineer who has not worked on Activate installs on staging-selfhost from the guide only, timed, no questions allowed; every stumble logged | Install under 60 minutes; zero blocking stumbles; every logged item becomes a doc or product fix before GA |

Exit: T4.3, T4.6, T4.7 green on the release candidate; T4.10 passed by two different people.

### WS5 tests: cells

| ID | Test | How | Pass |
|---|---|---|---|
| T5.1 | Cells differ only where intended | Diff of `terraform plan` JSON between `us-prod` and `eu-prod` | Only region, CIDRs, hostnames, account ids |
| T5.2 | Residency audit | Script over the tagging API per cell; state bucket, secrets, logs, snapshots | Every resource tagged with a cell is in that cell's region |
| T5.3 | Cross-cell isolation | From a US task, attempt to connect to the EU database endpoint and vice versa | Connection refused at the network layer |
| T5.4 | Login routing | E2E against the marketing sign-in: EU-provisioned domain → EU host; US → US host; unknown → generic page | As stated |
| T5.5 | WorkOS environment separation | Sign in with a US org's user on the EU host | Rejected; no account created |
| T5.6 | Gated promotion | Tag an rc; inject a failing `/api/ready` in us-prod | eu-prod deployment does not start; alert fires; fixing and re-running promotes |
| T5.7 | Restore drill per cell | PITR restore to a new instance, repoint, `doctor`; measured | RTO under 1 hour, RPO under 5 minutes; runbook updated with actuals |
| T5.8 | Backups present | Daily check of automated snapshots and PITR window | Alert if missing |
| T5.9 | Latency from region | k6 from a Frankfurt runner against eu-prod, same profile as T2.9 | p95 reads < 500 ms; Anthropic round-trip recorded in the guide's residency note |

Exit: both cells live from the module; T5.2 and T5.3 attached to the data-residency statement in the DPA.

### WS7 tests: release and upgrade lifecycle

| ID | Test | How | Pass |
|---|---|---|---|
| T7.1 | Migration compatibility check | PR with `DROP COLUMN` → CI fails; with the `major-release` label → passes; additive migration → passes | As stated |
| T7.2 | Two-version upgrade and rollback | CI: database at N-2 → `migrate` N-1 → `migrate` N; boot image N-1 against schema N and run the smoke E2E | Both migrations apply; N-1 serves normally |
| T7.3 | Deprecated aliases | Boot with `GITHUB_TOKEN` only, `DB_SSL` only | Works; one warning naming the replacement; removed after two minors with a failing test reminding us |
| T7.4 | Update index and banner | Worker reads a fixture index; admin sees "1.2.0 available"; `UPDATE_CHECK_ENABLED=false` → egress proxy log shows no request | As stated |
| T7.5 | Coach plugin update | After an upgrade in the replica stack, the `plugin.update` job opens exactly one PR on the scratch repo; second run opens none; never pushes to `main` | As stated |
| T7.6 | Release notes present | CI fails the release if `RELEASE_NOTES.md` has no section for the tag | As stated |
| T7.7 | Chart and image version lock | `helm upgrade` with `image.tag` not matching `appVersion` | Fails fast with a clear message |

### WS6 tests: documentation stays true

| ID | Test | How | Pass |
|---|---|---|---|
| T6.1 | Guide code blocks execute | A harness extracts the install, validate, upgrade and compose blocks from `activate-self-host.tsx` and runs them in the kind and Compose jobs | Every block runs unmodified |
| T6.2 | Configuration reference matches code | Script compares the guide's env var and values tables to `env.ts` and the chart's `values.schema.json` | CI fails on any drift in either direction |
| T6.3 | Troubleshooting table is real | Each row's "likely cause" has a test that triggers it (mapped to T0.7, T1.7, T1.9, T2.4, T3.4, T4.3) | Each row cites its test id |

### Customer rollout gate (go/no-go before the first paying self-hosted customer)

All of the following, signed off and dated in `docs/release-readiness.md`:

1. **Tests.** Every T-table above green on the release candidate; no skipped tests; coverage report attached.
2. **Security.** Third-party penetration test of web, API, OAuth AS and MCP on staging-selfhost with no open high or critical; CodeQL and dependency audit clean of high; gitleaks clean; threat model for the AS and the MCP surface reviewed; the guide's security claims each map to a test id.
3. **Performance and sizing.** T2.9 and T5.9 results back every row of the guide's sizing table.
4. **Reliability.** Two-week soak on the dev cell at `api` ×2 + `worker` ×1 with weekly chaos (kill worker, restart database, rotate secrets) and no data loss or stuck jobs.
5. **Disaster recovery.** T5.7 completed with measured RTO and RPO; restore runbook followed by someone other than its author.
6. **Operations.** Runbooks exist and were exercised: upgrade, rollback, restore, key rotation, license renewal, IdP change, support-bundle handling; alerts defined for stale jobs, readiness failures, publish failures, license expiry.
7. **Documentation.** T4.10 passed twice; T6.2 green; release notes and changelog page published.
8. **Pilot.** One design-partner customer installs self-hosted with LightCI on a call, runs two weeks with real users, upgrades once to a patch release, completes at least one skill promotion to their marketplace, and their issues are closed or accepted as known limitations in the release notes.
9. **Legal and commercial.** DPA updated for US model processing and the subprocessor list (AWS, Anthropic, WorkOS, OpenAI where voice is on); license terms final; support SLA for the two supported minors published.
10. **Support.** A simulated ticket goes from customer `support-bundle` to resolution using only the bundle.

After GA, the nightly, per-release and quarterly cadences above keep running; the rollout gate is repeated, in full, for every major and in abbreviated form (items 1, 2, 7) for every minor.

## Risks and open points

- **Claude connector OAuth.** Users report pre-registered client credentials not persisting in Claude Enterprise. The built-in AS with DCR avoids that path. Test against a real Claude Enterprise org before M3 closes.
- **WorkOS residency.** Identity data for EU-cell customers transits US-hosted WorkOS. Accepted for now; direct OIDC is the escape hatch for customers who refuse it, and would need the per-org OIDC-in-cloud extension (out of scope).
- **Model residency.** Both cells send prompts to the US Anthropic API by decision. Bedrock EU is ready to implement behind `AiService` when required; feature parity (adaptive thinking, structured outputs, prompt caching) needs checking on Bedrock first.
- **Synchronous grading.** Left in the API for now. If p95 request time or ALB idle timeouts become a problem, the next wave moves grading to jobs with a polling UI; `exercises.status='queued'` already exists.
- **Registry choice.** Plan assumes GHCR. If `registry.lightci.com` must stay, we need to run or front a registry (Harbor, or ECR Public with a redirect) and the chart `global.imageRegistry` default changes.
- **Frontend session rewrite.** AuthKit's sealed cookie is replaced only in `oidc` mode; the WorkOS path stays on AuthKit to avoid regressions in the cloud product.
- **License lockout.** Read-only mode must never block admins from uploading a new license or signing in; covered by the `LicenseGuard` exemptions and an E2E spec.
