# Infrastructure

Terraform infra for deploying the NestJS API to AWS. The API image is built from `api/Dockerfile`.

## Layout

```
infra/
  config/              # ignored deploy env files + checked-in examples
  aws/
    modules/           # reusable building blocks (network, database, service)
    envs/{dev,prod}/   # root modules — `terraform apply` runs here
  scripts/deploy.sh    # terraform + image push + ECS rollout wrapper
  helm/langfuse/       # Helm chart for self-hosted Langfuse (LLM observability)
```

Each env has its own Terraform state. Backend config in `envs/*/backend.tf` is a starter template — fill in your bucket / lock table before `terraform init`.

## Stack

- Region: `us-east-1`
- VPC: managed by Terraform with public/private subnets across multiple AZs
- Compute: ECS Fargate (x86_64) behind an ALB, health check on `/api/health`
- DB: Amazon RDS for PostgreSQL, credentials in Secrets Manager
- Image registry: ECR (one repo per env)
- DNS: Route53 aliases use the `lciventure.com` hosted zone (`Z02709411RIL5VJ45VIDP`); Terraform can create and DNS-validate the ACM certificate when no certificate ARN is provided

The full DB secret JSON is injected into the container as the `DB` env var; `api/src/typeorm.config.ts` parses `{host, port, username, password, dbname}` from it. TypeORM migrations run automatically on app boot (`migrationsRun: true`).

Additional app secrets live in Secrets Manager and are mapped to env vars via the `extra_secrets` variable — see `envs/*/terraform.tfvars`.

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
