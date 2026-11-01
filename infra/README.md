# Infrastructure

Terraform infra for deploying the NestJS API to AWS. The API image is built from `api/Dockerfile`.

## Layout

```
infra/
  config/              # ignored deploy env files + checked-in examples
  aws/
    modules/           # reusable building blocks (network, database, service)
    envs/{dev,us-prod,eu-prod}/   # root modules — `terraform apply` runs here (the prod cells use deploy/terraform/aws)
  scripts/deploy.sh    # terraform + image push + ECS rollout wrapper
  helm/langfuse/       # Helm chart for self-hosted Langfuse (LLM observability)
```

Each env has its own Terraform state. Backend config in `envs/*/backend.tf` is a starter template — fill in your bucket / lock table before `terraform init`.

## Stack

- Region: `us-east-1`
- VPC: managed by Terraform with public/private subnets across multiple AZs
- Compute: two ECS Fargate services (x86_64), each behind its own ALB: the API (`lightci-activate-api.lciventure.com`, health `/api/health`) and the Next.js web app (`lightci-activate.lciventure.com`, health `/api/health`)
- DB: Amazon RDS for PostgreSQL, credentials in Secrets Manager
- Image registry: ECR (one repo per env)
- DNS: Route53 aliases use the `lciventure.com` hosted zone (`Z02709411RIL5VJ45VIDP`); Terraform can create and DNS-validate the ACM certificate when no certificate ARN is provided

The full DB secret JSON is injected into the container as the `DB` env var; `api/src/typeorm.config.ts` parses `{host, port, username, password, dbname}` from it. TypeORM migrations run automatically on app boot (`migrationsRun: true`).

LightCI platform secrets (WorkOS, Anthropic, OpenAI, the at-rest encryption key for client-uploaded keys) live in Secrets Manager under `lightci-activate-dev-*` and are mapped in `envs/dev/terraform.tfvars` (`extra_secrets` for the API, `web_secrets` for the web app). Client-specific Claude Enterprise keys are uploaded in-app and encrypted at rest. Additional app secrets live in Secrets Manager and are mapped to env vars via the `extra_secrets` variable — see `envs/*/terraform.tfvars`.

## Deploy Config

`scripts/deploy.sh` loads optional shell env files before running Terraform, image push, rollout, or release commands:

```text
infra/config/common.env
infra/config/aws/common.env
infra/config/aws/{env}.env
```

The real `.env` files are ignored because they may contain credentials. Copy the matching `.env.example` and set shell exports there:

```bash
cp infra/config/aws/dev.env.example infra/config/aws/dev.env
```

## Getting started

```bash
./infra/scripts/deploy.sh dev init
./infra/scripts/deploy.sh dev apply
./infra/scripts/deploy.sh dev release   # build + push image, roll the ECS service
```

Day-to-day deploys happen from CI: `.github/workflows/deploy-api.yml` builds and pushes the image to ECR on pushes to `main`, then forces a new ECS deployment.

## WorkOS

The web app signs in through WorkOS AuthKit. Register these redirect URIs in the WorkOS dashboard (Redirects) for the environment whose client id is in `lightci-activate-dev-workos-client-id`:

- `http://localhost:3000/callback` (local; already registered)
- `https://lightci-activate.lciventure.com/callback` (dev)

and set the "Sign-in endpoint" (initiate login URI) to `https://lightci-activate.lciventure.com/sign-in`.

## MCP connector

Claude Enterprise owners add `https://lightci-activate-api.lciventure.com/mcp` as an org-level custom connector. The server publishes OAuth protected-resource metadata pointing at WorkOS; users sign in with their firm identity.


## Production cells (us-prod, eu-prod)

`envs/us-prod` (us-east-1, 10.90.0.0/16) and `envs/eu-prod` (eu-central-1, 10.100.0.0/16) run the cloud edition from the same module customers use, `deploy/terraform/aws`. Each cell is self-contained in its region: state bucket and lock table (`backend.tf`), Secrets Manager entries, KMS, RDS with Multi-AZ and 35-day PITR, EFS, logs. Before the first `terraform apply` in a cell:

1. Create the state bucket and lock table named in `backend.tf`.
2. Create the secrets referenced in `terraform.tfvars`: the cell's WorkOS environment (`{"api-key","client-id"}`), the Anthropic key, the encryption key (`openssl rand -base64 32`, backed up with the database), the GHCR pull credentials, and for the US cell the OpenAI key (voice stays off in the EU cell).
3. Put the lightci.com hosted zone id in `terraform.tfvars`.
4. In GitHub: environments `us-prod` and `eu-prod` with required reviewers; secrets `AWS_DEPLOY_ROLE_US` / `AWS_DEPLOY_ROLE_EU` (OIDC roles the workflow assumes).

`.github/workflows/deploy.yml` then rolls every release tag through us-prod and eu-prod in order: apply, snapshot, migrate task, roll, `/api/ready`, a 30-minute bake with no 5xx. `infra/cells.json` is the list the website's sign-in router reads.
