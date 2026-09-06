# LightCI Activate — working notes for Claude Code

Read `docs/architecture.md` (system), `docs/api-contract.md` (REST shapes, with a Deviations log at the bottom), `docs/mastery-model.md` (learning science behind mastery, revisits and gates), `docs/rex-lessons.md` (governance and MCP patterns we adopted), and `specs/` (product).

## Layout
- `api/` NestJS 11 + TypeORM + Postgres. Port 4310 locally (4000/4100 are taken on this machine). Global prefix `/api`; MCP at `/mcp`; Swagger `/docs`.
- `frontend/` Next 16 App Router (`proxy.ts`, not middleware), Tailwind 4, shadcn on Base UI (`render` prop, not `asChild`). Port 3000.
- `mcp-app/` Vite + React single-file bundle served by the API as `ui://activate/app.html` (`yarn build` → `dist/app.html`).
- `marketplace/` demo client marketplace repo as plain files; the API initialises git at runtime (nested-in-monorepo → `api/.marketplace-work`).
- `e2e/` Playwright; signs in through WorkOS with the seeded demo users. `infra/` Terraform (API + web on ECS Fargate, RDS).

## Conventions
- Every Claude call goes through `AiService` (`api/src/ai`). Register a mock responder for each new task so `AI_PROVIDER=mock` keeps E2E deterministic.
- Scope every query by `@OrgId()`; leads switch orgs via `X-Activate-Org` (frontend cookie `activate_org`). Read org scope from the request, never from async-local storage.
- Payloads carry every number a card shows (no derivation in renderers). Nullable metrics come back as 0 with a `has*` flag.
- Client credentials live in `org_integrations`, AES-GCM encrypted (`ACTIVATE_SECRETS_KEY`). Only the Anthropic key falls back to the platform key.
- Entities are the schema; add a migration (`yarn migration:generate`) for any entity change.

## Running
`./scripts/dev.sh [mock]`; demo sign-ins in `README.md`; `node scripts/workos-demo.mjs` recreates the WorkOS demo org/users; `POST /api/admin/seed/reset` (admin) reseeds.
Tests: `cd api && yarn test`, `cd frontend && yarn tsc --noEmit && yarn lint`, `cd e2e && yarn test` (stack must be running in mock mode).
