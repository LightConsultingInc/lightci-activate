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

### Refresh demo data with today's dates

Seeded data is dated relative to the day it was generated, so after a couple of weeks adoption charts trail off to zero. `node api/dist/seed/refresh-demo.cli.js meridian` drops and reseeds the demo firm whole. `node api/dist/seed/refresh-demo.cli.js <org slug or id> "<Firm Name>" <ShortName> <domain> keep@one.com,keep@two.com` purges another org's populated rows, keeping the named people and everything attached to them (exercises, attempts, memory, workflows, baselines), then populates it again. Build the API first.

### Make a fresh client org look live

`node api/dist/seed/populate.cli.js <orgId> "<Firm Name>" <ShortName> <email-domain>` (or `POST /api/admin/seed/populate/:orgId` as an admin) fills an existing org with the demo firm's teams, people, skills, practice history, usage, baselines and readouts, renamed for that firm. It touches nothing already in the org: your own person, exercises, memory and workflows stay as they are. Run `cd api && yarn build` first.


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
(cd api && yarn test)                    # 165 unit tests
(cd frontend && yarn tsc --noEmit && yarn lint)
./scripts/dev.sh mock &                  # stack with deterministic AI (AI_PROVIDER=mock)
(cd e2e && yarn test)                    # 82 Playwright tests, signs in as each demo role via WorkOS
```

The E2E suite resets the demo seed first, so run it against a local stack only.

## In Claude

Add `http://localhost:4310/mcp` (or the deployed API) as a custom connector. Tools: `my_ladder`, `library`, `skill_detail`, `submit_skill`, `submit_artifact`, `map_workflow`, `team`, `org`, `promotion_queue`. The Coach skill lives in `marketplace/plugins/activate-coach`. For a local MCP client without OAuth set `MCP_DEV_USER_EMAIL=priya.nair@meridianwealth.demo` and send `X-Activate-Dev-User` with that email.

## Deploy

`infra/` holds Terraform for AWS (ECS Fargate + RDS). `.github/workflows/deploy-api.yml` builds and rolls the API on pushes to `main`. See `infra/README.md`.
