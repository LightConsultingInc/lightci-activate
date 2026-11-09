# Infrastructure: LightCI's cloud cells

LightCI runs the cloud edition of Activate as two self-contained cells, each an install of the same
Terraform module customers use (`deploy/terraform/aws`) with `edition = "cloud"`. Nothing crosses regions.

| Cell | Region | Web | API | Connector |
|---|---|---|---|---|
| us | us-east-1 | `activate.lciventure.com` | `api.activate.lciventure.com` | `mcp.activate.lciventure.com` |
| eu | eu-central-1 | `eu.activate.lciventure.com` | `api.eu.activate.lciventure.com` | `mcp.eu.activate.lciventure.com` |

`cells.json` is the machine-readable list (the website's sign-in router reads it).

## Layout

```
infra/
  cells.json                 # the cells, their hosts and regions
  aws/
    bootstrap/{us,eu}/       # layer 0 per cell: state backend, secret shells, ECR, deploy role, GitHub environment
    envs/{us-prod,eu-prod}/  # the cell itself, from deploy/terraform/aws (applied by .github/workflows/deploy.yml)
    modules/
      cell-bootstrap/        # what bootstrap/* instantiates
      network/               # VPC with public/private subnets across AZs (the cell roots use it)
  helm/langfuse/             # Helm chart for self-hosted Langfuse (LLM observability), unrelated to the cells
```

## Layer 0: bootstrap (once per cell)

`aws/bootstrap/<cell>` keeps local state on purpose: it creates the bucket the cell's state lives in.
It is small, holds no secret values, and is re-importable. It owns:

- the state bucket `lightci-activate-tfstate-<cell>` and lock table `lightci-activate-tfstate-locks-<cell>`
- Secrets Manager shells the cell root looks up by name: `activate-<cell>-workos` (JSON `{"api-key","client-id"}`),
  `activate-<cell>-anthropic`, `activate-<cell>-secrets-key`, plus `activate-us-openai` in the US cell and the
  product-wide `activate-license-signing-key` (US, us-east-1)
- ECR repositories `activate/server` and `activate/web` (immutable tags, scan on push, keep 20 releases)
- the IAM role `activate-<cell>-deploy`, assumable only by the `<cell>-prod` GitHub environment through OIDC
- the GitHub environment `<cell>-prod` and the repository secret `AWS_DEPLOY_ROLE_<CELL>`

```bash
export GITHUB_TOKEN=$(gh auth token)
cd infra/aws/bootstrap/us && terraform init && terraform apply
```

Then write each secret value once (they never enter Terraform state):

```bash
aws secretsmanager put-secret-value --secret-id activate-us-workos --secret-string '{"api-key":"sk_…","client-id":"client_…"}'
aws secretsmanager put-secret-value --secret-id activate-us-anthropic --secret-string 'sk-ant-…'
aws secretsmanager put-secret-value --secret-id activate-us-secrets-key --secret-string "$(openssl rand -base64 32)"
```

Back up `activate-<cell>-secrets-key` with the database: credentials stored in the database are encrypted with it.

## Layer 1: the cell

`aws/envs/<cell>-prod` is applied by the deploy workflow, never by hand in steady state. It creates the VPC
(`modules/network`), the ACM certificates validated through the lciventure.com zone, and the module: api,
worker and web on ECS Fargate (ARM64), RDS Postgres Multi-AZ with 35-day PITR and deletion protection, EFS
for the marketplace working copies, a people load balancer (web and API) and a connector load balancer
(`/mcp` restricted to Anthropic's ranges behind WAF, `/oauth` and `/.well-known` open), logs for a year.

To review a change locally: `cd infra/aws/envs/us-prod && terraform init && terraform plan -var image_tag=<version>`.

## Deploying a release

Releases are built automatically by `.github/workflows/release.yml` on a `v*` tag (signed images, SBOM, chart,
bundle). Promotion to the cells is a human action: run **Deploy cells** (`deploy.yml`) with the version and the
cells (`us,eu` by default). Per cell, `deploy-cell.yml`:

1. verifies the release's cosign signatures and mirrors `server` and `web` from GHCR into the cell's ECR (crane);
2. `terraform apply` with the new `image_tag` (new task definitions; services keep the old version until rolled);
3. snapshots the database, runs `activate migrate` as a one-shot task and requires exit 0;
4. rolls api, worker and web, waits for them to stabilise, and requires each one to finish on the task
   definition just applied (the circuit breaker rolls a failed service back, and a rolled-back service counts as stable);
5. checks `/api/ready`, then bakes for 30 minutes with no 5xx from the people load balancer before the next cell.

Required reviewers on GitHub environments need GitHub Enterprise on a private repository, so running the
workflow by hand is the approval gate.

## WorkOS

Each cell has its own WorkOS production environment since 2026-11-02 (US `client_01M6EB66EM6Y7RZKPBCJ8E0AK9`,
EU `client_01M6EB6CVN073T8AWWJF6N9W1M`); the shared test environment (`sk_test_`) is now only for local
development and E2E. A cell's key pair lives in `activate-<cell>-workos` (JSON `api-key`, `client-id`); to
rotate it, write the new pair and roll the services. The LightCI activation lead user
(`zain+activate-lead@lightci.com`) exists in both environments; its password is in the shared secret
`activate-lead-signin` (us-east-1), declared by the US bootstrap root.

- Redirect URIs: `node scripts/workos-redirects.mjs [us|eu]` registers `<web>/callback` for each cell (idempotent).
- Roles: `WORKOS_API_KEY=… node scripts/workos-roles.mjs` creates the environment roles `activate-admin`,
  `activate-sponsor` and `activate-champion` (idempotent; run once per environment, done for test, US and EU on
  2026-11-06). Customers assign their own IdP groups to these while connecting their directory or SSO.
- Customer onboarding is self-serve: a lead creates the client and invites its admin from the client page; the
  admin connects the IdP from Company admin > Sign-in. Nobody at LightCI handles a setup link.
- Webhooks (dashboard only): endpoint `<api>/api/webhooks/workos`, events `organization_membership.*`,
  `user.deleted`, `dsync.user.deleted`. Put the signing secret in `activate-<cell>-workos-webhook` and set
  `workos_webhook_secret_name` on the cell root.

## MCP connector

Claude Enterprise owners add `https://mcp.activate.lciventure.com/mcp` (US) or
`https://mcp.eu.activate.lciventure.com/mcp` (EU) as an org-level custom connector. The server publishes
OAuth protected-resource metadata; people sign in with their firm identity.

## History

The former `dev` stack (`lightci-activate-api.lciventure.com`, deployed from `deploy-api.yml` with an IAM
user) was torn down on 2026-11-01 when the cells went live; its root and modules were removed in the same change.

v1.0.0 went live in both cells on 2026-11-02, on the seventh Deploy cells run. The first six found, in order:
the GitHub OIDC immutable subject, an apostrophe in a security group description, a dualstack connector
balancer without IPv6 subnets, one target group attached to two balancers, a people balancer that ignored
`people_alb_internet_facing` (private addresses, so readiness never answered), and a worker health check on
`/health` instead of `/api/health` (the circuit breaker left both cells with no worker while the run passed).
Each is fixed in the module and the workflow, so a self-hosted install gets the same fixes.
