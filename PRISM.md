# Running LightCI Activate locally (and in the PRISM sandbox)

This is the local-setup guide for two readers: a developer bringing the stack up on their own
machine, and an automated agent run inside the PRISM cloud sandbox. The sandbox has **no Docker
daemon**, so Postgres runs as a plain process instead of the `docker compose` service that
`scripts/dev.sh` assumes; everything else is the same as the README's "Local development" flow.
It is also the repo's memory of what previous sandbox runs learned — see
[Sandbox notes / gotchas](#sandbox-notes--gotchas) at the end and keep it current.

Never put secrets or env values in this file. Variable *names* and where they come from only.

In a hurry (sandbox, env files already in place): `.prism/scripts/stack.sh up mock`, then
http://localhost:3000/login. Details in [Fast path](#fast-path-sandbox).

## What runs where

| Piece | Directory | Port | Notes |
|---|---|---|---|
| Postgres 16 (sandbox) / `postgres:15` (compose) | — | **5439** | db `lightci_activate`, user `postgres`, password `postgres` (the compose defaults) |
| API — NestJS 11 + TypeORM | `api/` | **4310** | global prefix `/api`; Swagger `/docs`; MCP `/mcp`; Prometheus `:9464/metrics` |
| Web — Next 16 App Router | `frontend/` | **3000** | same-origin `/api/*` proxy to `API_URL`; login page `/login` |
| MCP app bundle — Vite | `mcp-app/` | — | `yarn build` → `dist/app.html`, served by the API as `ui://activate/app.html` |
| Playwright suite | `e2e/` | — | signs in through WorkOS as each seeded demo user; needs the API in mock-AI mode |

There is **no root `package.json` and no yarn workspaces** — run `yarn install` separately in
`api/`, `frontend/`, `mcp-app/` and `e2e/`.

## Prerequisites

- Node **22.14.0**, pinned in `.nvmrc` (`nvm use`); the sandbox ships 22.22.0, which runs the
  stack fine. yarn v1 (`1.22.x`).
- Postgres server binaries: `initdb`, `pg_ctl`, `pg_isready`, `psql`, `createdb`. On the sandbox
  they live in `/usr/lib/postgresql/16/bin`. Or Docker Desktop, in which case `./scripts/dev.sh`
  does the rest.
- `ffmpeg` and the Playwright Chromium build if you intend to record verification evidence:
  `cd e2e && npx playwright install --with-deps chromium`.

## Environment files

Two gitignored files carry every credential. Copy the examples and fill them in; in the PRISM
sandbox they are pre-provisioned, so **do not overwrite, print or commit them**.

- `api/.env` — from `api/.env.example`. The names that matter locally:
  `PORT` (4310), `NODE_ENV`, `WEB_URL`, `DB_HOST`, `DB_PORT` (5439), `DB_USERNAME`, `DB_PASSWORD`,
  `DB_DATABASE`, `MIGRATIONS_RUN_ON_BOOT`, `SEED_ON_BOOT`, `AI_PROVIDER` (`live` | `mock`),
  `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`, `ANTHROPIC_FAST_MODEL`), `WORKOS_API_KEY`,
  `WORKOS_CLIENT_ID`, `ACTIVATE_SECRETS_KEY`, `LIBRARY_REPO_PATH` (`../marketplace`),
  `LEAD_EMAIL_DOMAINS`, `MCP_DEV_USER_EMAIL`.
- `frontend/.env.local` — there is no `frontend/.env.example` in the repo despite what the README
  says; the names it needs are `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`
  (or `SESSION_SECRET`, 32+ chars), `WEB_URL`, `API_URL` (`http://localhost:4310`) and
  `AUTH_PROVIDER` (`workos`).

Where the values come from: WorkOS keys belong to LightCI's shared test environment
(`node scripts/workos-demo.mjs` creates the demo org and users there once); the Anthropic and
OpenAI keys are LightCI platform keys; `ACTIVATE_SECRETS_KEY` is any string locally.

## Fast path (sandbox)

```bash
.prism/scripts/stack.sh up mock     # postgres → installs (if needed) → mcp-app build → api → web
.prism/scripts/stack.sh status      # health of each piece
.prism/scripts/stack.sh down        # stop api, web and postgres
```

`up` is idempotent: it skips whatever is already running (so to switch an API between mock and
live, `down` first), keeps the Postgres data directory in
`/var/tmp/activate-pg` (outside the repo), and leaves logs in `/tmp/api.log`, `/tmp/frontend.log`
and `/tmp/install-*.log`. Pass `live` instead of `mock` to use the real Anthropic key.
A cold run (installs + first compile) takes ~3 min; a warm one ~20 s.

The sections below are what the script does, step by step, for when you need to do one piece by
hand.

## Step by step

### 1. Postgres as a plain process (no Docker)

`docker-compose.yml` runs `postgres:15` and publishes it on `DB_PORT` (dev.sh defaults it to
5439 because 5432 is taken on LightCI machines). Reproduce the same database without Docker:

```bash
PGBIN=/usr/lib/postgresql/16/bin
PGDATA=/var/tmp/activate-pg                    # anywhere outside the repo; db-data/ is gitignored too
mkdir -p "$PGDATA" && chown postgres:postgres "$PGDATA"
sudo -u postgres $PGBIN/initdb -D "$PGDATA" -U postgres --auth=trust --auth-host=md5 -E UTF8
sudo -u postgres $PGBIN/pg_ctl -D "$PGDATA" -o "-p 5439 -c listen_addresses=localhost" -l "$PGDATA/server.log" start
sudo -u postgres $PGBIN/pg_isready -h localhost -p 5439 -U postgres   # "accepting connections"
sudo -u postgres psql -p 5439 -U postgres -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres createdb -p 5439 -U postgres lightci_activate
PGPASSWORD=postgres psql -h localhost -p 5439 -U postgres -d lightci_activate -c 'select 1'
```

Stop it with `sudo -u postgres $PGBIN/pg_ctl -D "$PGDATA" stop -m fast`. When you are not
root, drop the `sudo -u postgres` and `chown` parts but keep `-U postgres`: `initdb -U postgres`
creates only that role, so a bare `psql` would try your OS user and fail with
`role "<you>" does not exist`. The distro's `service postgresql start` also works if you
first change `port = 5432` to `5439` in `/etc/postgresql/16/main/postgresql.conf`, but the
`initdb` route needs no system config and survives a different Postgres major.

### 2. Install

```bash
(cd api && yarn install --frozen-lockfile)
(cd frontend && yarn install --frozen-lockfile)
(cd mcp-app && yarn install --frozen-lockfile && yarn build)   # dist/app.html, served at /mcp
(cd e2e && yarn install --frozen-lockfile && npx playwright install --with-deps chromium)
```

Run them **one after another**: parallel `yarn install`s share one yarn cache and fail with
`ENOENT … .yarn-tarball.tgz`.

### 3. Migrate and seed

Both happen on boot: `MIGRATIONS_RUN_ON_BOOT` defaults to on outside production, and with
`SEED_ON_BOOT=true` the API seeds the Meridian Wealth Partners demo org (~4k rows, well under a
second) the first time it finds an empty database. To run migrations ahead of boot, or to check
the schema is current: `cd api && yarn migration:run` (~7 s). To reseed later:
`POST /api/admin/seed/reset` as an admin (truncates every table — see the E2E caveat below).

### 4. Boot the API

```bash
cd api && AI_PROVIDER=mock setsid nohup yarn -s start:dev > /tmp/api.log 2>&1 &   # drop AI_PROVIDER=mock for live Claude
```

`start:dev` is `nest start --watch`; the compiled server runs as a child process
(`node api/dist/main`), so when stopping by hand kill both or :4310 stays taken. Built artifacts
work too (`yarn build && node dist/main.js`, what CI's `scripts/ci/e2e-stack.sh` does). First boot
takes 40–60 s (compile + migrations + seed). Prove it:

```bash
curl -s http://localhost:4310/api/health   # {"status":"ok"}  — the process is up
curl -s http://localhost:4310/api/ready    # {"status":"ok","db":"ok","migrations":"current",...} — safe to use
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4310/docs   # 200, Swagger UI
```

`/api/health` only says the process answers; `/api/ready` also checks the database connection
and that no migration is pending, and answers **503** until both hold — poll `ready`, not
`health`, before pointing anything at the API.

### 5. Boot the web app

```bash
cd frontend && setsid nohup yarn -s dev > /tmp/frontend.log 2>&1 &
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/login    # 200 once ready
```

Next dev (Turbopack) reports ready in under a second; the first request to each page compiles
it, so allow ~5–10 s for the first `/login` and a few seconds per new route after that.
`/` redirects (307) to `/login` when signed out; `/sign-in` redirects straight to the WorkOS
hosted flow, so poll `/login` (or `/sign-in`, which answers 307) for readiness. The browser talks
to the API through the app's same-origin `/api/*` proxy, which forwards to `API_URL`.

## Signing in and testing

Sign in at http://localhost:3000/login with a seeded demo user: email first, then the password
step. The shared demo password is in `README.md` (do not copy it here).

| Person | Email | Role |
|---|---|---|
| Priya Nair | priya.nair@meridianwealth.demo | learner (L2, Financial Planning) |
| Marcus Reid | marcus.reid@meridianwealth.demo | learner (L1, Wealth Advisors) |
| Daniel Okafor | daniel.okafor@meridianwealth.demo | champion (L5) |
| Elena Marsh | elena.marsh@meridianwealth.demo | sponsor + company admin |
| Zain Lakhani | zain+activate-lead@lightci.com | LightCI activation lead |

Authentication is real WorkOS password auth, so the sandbox needs outbound HTTPS to
`api.workos.com` (it has it). For a browserless API token the e2e helpers use the WorkOS
password grant with the ids from `api/.env` (`e2e/tests/helpers/workos.ts`).

**Mock AI.** `AI_PROVIDER=mock` answers every Claude call from `AiService`'s registered mock
responders, which is what the Playwright suite expects; `./scripts/dev.sh mock` is the Docker
equivalent of `.prism/scripts/stack.sh up mock`. Live mode calls Anthropic with the key in
`api/.env`.

```bash
(cd api && yarn test)                             # unit tests
(cd frontend && yarn tsc --noEmit && yarn lint)   # typecheck + lint
(cd e2e && yarn test)                             # Playwright, stack must be up in mock mode
(cd e2e && npx playwright test --project=setup)   # just the five sign-ins (~50 s) — a quick auth smoke
(cd e2e && npx playwright test smoke.spec.ts)     # shell + roles smoke (~30 s)
(cd e2e && npx playwright test tests/qa)          # the PRISM verification specs only (~60 s incl. sign-ins)
(cd e2e && E2E_VIDEO=1 npx playwright test tests/qa)   # same, recorded — videos under e2e/test-results/
```

**E2E caveat:** `tests/00-reset.spec.ts` calls `POST /api/admin/seed/reset`, which truncates
every table and reseeds Meridian — any extra org you created locally (e.g. with
`scripts/fresh-client.mjs`) disappears. Only run the suite against a local stack.

**PRISM verification specs are regression tests.** `e2e/tests/qa/` holds one Playwright spec per
PRISM requirement (`prism-local-setup.spec.ts` for this guide). They are ordinary members of the
suite: `cd e2e && yarn test` runs them, and so does CI's E2E job. Keep them in git — the suite is
the regression set — and when you add one, write it so it passes against the plain mock-mode
stack with no manual setup, like every other spec. Record a run with `E2E_VIDEO=1` (viewport
1440×900; downscale frames before viewing them).

## Recording terminal evidence

Some work has no screen to drive: an API-only change, a migration, a new REST or Swagger
endpoint, or this setup guide itself. For those, record the terminal instead of the browser.
`.prism/scripts/record-terminal.mjs` runs any shell command in a pty, streams its output into
a terminal-styled page in headless Chromium, and saves the Playwright recording as a 1280×720
`.mp4` — the same kind of video evidence a UI spec produces.

```bash
node .prism/scripts/record-terminal.mjs 'curl -s http://localhost:4310/api/health'
node .prism/scripts/record-terminal.mjs 'curl -s http://localhost:4310/api/ready && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4310/docs' /tmp/evidence/api-ready.mp4
```

The first argument is the whole command, quoted; the optional second one is the output path.
Without it the file lands in `/tmp/evidence/terminal-<UTC timestamp>.mp4`, and the path is
printed last either way. The command runs from the repo root, its output is echoed to your
terminal too, and the helper exits with the command's own exit code, so a failing walkthrough
fails the caller. Needs `e2e/node_modules` with the Playwright Chromium build (section 2) and
`ffmpeg`; a trivial command takes ~5 s end to end.

Use it to:

- prove backend-only changes — boot the API and curl `/api/health`, `/api/ready` and the
  endpoint you changed, or hit Swagger (`/docs`) and the JSON it describes (`/docs-json`);
- show a migration or seed running (`cd api && yarn migration:run`);
- walk through a setup document step by step. `.prism/scripts/qa-local-setup-verify.sh` is the
  worked example: it tears the stack down and replays sections 1–5 above verbatim, printing
  every health check. Record it with
  `node .prism/scripts/record-terminal.mjs .prism/scripts/qa-local-setup-verify.sh /tmp/evidence/local-setup.mp4`
  (~3–4 min, and it leaves the stack running in mock mode).

Prefer a Playwright spec whenever there is a page to show; use the terminal recording when
there is not, or alongside one when the proof is in the API.

## Sandbox notes / gotchas

Dated entries, newest first. Future runs: **append** an entry when you learn something a later
run needs (an adapted step, a timing, a flaky area); correct an entry that turned out wrong
rather than adding a contradicting one. Keep it tight.

### 2026-11-02 — first sandbox run

- **No Docker daemon.** `scripts/dev.sh` fails at `docker compose up`; use `initdb` + `pg_ctl`
  (section 1) or `.prism/scripts/stack.sh`. The sandbox Postgres is **16**; compose pins
  `postgres:15`. The schema has no 15-specific features, migrations and seed run clean on 16.
- The system Postgres service listens on 5432 by default while `api/.env` expects **5439**.
  Either move the service's port or (preferred) run a separate cluster on 5439 so the checked-in
  env stays untouched.
- `api/.env` and `frontend/.env.local` are pre-provisioned in the sandbox. Leave them alone.
- `yarn install` in several packages **in parallel** corrupts the shared yarn cache
  (`ENOENT … .yarn-tarball.tgz`). Sequential installs: api ~15 s, frontend ~15 s.
- Timings: `yarn migration:run` ~7 s; API first boot ~45 s to `/api/ready` (nest watch compile
  + migrations + seed ~0.3 s); web `/login` first response ~5 s; warm `stack.sh up` ~20 s.
- Stopping the API: `nest --watch` forks `node api/dist/main`; `pkill -f "nest start --watch"`
  alone leaves the server on :4310. `stack.sh down` kills both.
- Backgrounding from a real terminal: `nohup yarn start:dev &` shields only yarn — the forked
  `node dist/main` and `next-server` still die when the terminal (pty) closes. Use
  `setsid nohup … &` (as the doc and `stack.sh` now do); from a tty-less shell plain `nohup` is enough.
- Outbound network works: WorkOS sign-in for all five demo roles passes
  (`npx playwright test --project=setup`), as does `smoke.spec.ts` against the mock-AI stack.
- Evidence recording: `E2E_VIDEO=1` turns on Playwright video in `e2e/playwright.config.ts`
  (viewport 1440×900 — downscale frames before viewing them). PRISM verification specs live in
  `e2e/tests/qa/` and are part of the regular suite (`yarn test`, CI included) — the team keeps
  them as regression tests. For backend-only proof use `.prism/scripts/record-terminal.mjs`
  (see [Recording terminal evidence](#recording-terminal-evidence)).
- The Playwright Chromium build in `/opt/pw-browsers` can lag the pinned `@playwright/test`
  version (`Executable doesn't exist at …chromium_headless_shell-NNNN`); `stack.sh up` does not
  install browsers, so run `cd e2e && npx playwright install --with-deps chromium` once
  (~30 s) before any recording or Playwright run.
