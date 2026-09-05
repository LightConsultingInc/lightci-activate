# LightCI Activate

AI-native activation and enablement platform for Claude Enterprise customers. Employees climb a mastery-gated fluency ladder by producing graded artifacts from their own work; skills ship through a governed promotion queue into the client's Claude marketplace; sponsors see adoption, hours back and cost against baselines.

Read `specs/` for the product, `docs/architecture.md` for the system, `docs/mastery-model.md` for the learning science behind the mastery score, and `docs/api-contract.md` for the REST surface.

## Local development

```bash
cp api/.env.example api/.env            # fill in WorkOS, Anthropic (and optionally OpenAI) keys
cp frontend/.env.example frontend/.env.local
node scripts/workos-demo.mjs            # one-time: demo WorkOS org + sign-in users
./scripts/dev.sh                        # postgres :5439, api :4310, web :3000 (seeds the demo org on first boot)
```

Sign in at http://localhost:3000 with a demo user (password `Activate-demo-2026!`):

| Person | Email | Role |
|---|---|---|
| Priya Nair | priya.nair@meridianwealth.demo | learner (L2, Financial Planning) |
| Marcus Reid | marcus.reid@meridianwealth.demo | learner (L1, Wealth Advisors) |
| Daniel Okafor | daniel.okafor@meridianwealth.demo | champion (L5) |
| Elena Marsh | elena.marsh@meridianwealth.demo | sponsor + company admin |
| Zain Lakhani | zain+activate-lead@lightci.com | LightCI activation lead |

Swagger: http://localhost:4310/docs. MCP endpoint: http://localhost:4310/mcp (bundle the app with `cd mcp-app && yarn build`).

## Tests

```bash
(cd api && yarn test)                    # unit
(cd frontend && yarn tsc --noEmit)
./scripts/dev.sh mock &                  # stack with deterministic AI
(cd e2e && yarn test)                    # Playwright, signs in as each demo role
```

## Deploy

`infra/` holds Terraform for AWS (ECS Fargate + RDS). `.github/workflows/deploy-api.yml` builds and rolls the API on pushes to `main`. See `infra/README.md`.
