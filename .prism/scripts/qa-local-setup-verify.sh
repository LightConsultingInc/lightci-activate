#!/usr/bin/env bash
# QA proof for the "PRISM Local setup" requirement: tears the sandbox stack down, then follows
# PRISM.md "Step by step" sections 1-5 with the commands copied VERBATIM from the doc on a fresh
# Postgres data directory, and prints the health checks the acceptance criteria name.
# Leaves the stack running in mock mode. Run from the repo root; the output is the evidence —
# record it as a video with the terminal recorder (PRISM.md "Recording terminal evidence"):
#
#   node .prism/scripts/record-terminal.mjs .prism/scripts/qa-local-setup-verify.sh /tmp/evidence/local-setup.mp4
set -uo pipefail
export PAGER=cat PSQL_PAGER=cat   # script(1) gives psql a tty; keep it non-interactive
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
say() { printf '\n\033[1;36m### %s\033[0m  [%s]\n' "$*" "$(date -u +%H:%M:%S)"; }
run() { printf '\033[1;33m$ %s\033[0m\n' "$*"; "$@"; local rc=$?; printf '\033[2m(exit %d)\033[0m\n' "$rc"; return $rc; }

say "0. Preconditions: no Docker daemon, Postgres 16 binaries, stack down"
run docker info 2>&1 | tail -n 1 || true   # "Cannot connect to the Docker daemon" — no daemon in the sandbox
run ls /usr/lib/postgresql/16/bin/initdb /usr/lib/postgresql/16/bin/pg_ctl
run .prism/scripts/stack.sh down
sleep 2
run .prism/scripts/stack.sh status || true
if [[ -d /var/tmp/activate-pg ]]; then
  BAK="/var/tmp/activate-pg.bak-$(date -u +%Y%m%dT%H%M%S)"
  echo "moving existing data dir aside -> $BAK (fresh initdb per the doc)"
  run mv /var/tmp/activate-pg "$BAK"
fi

say "1. Postgres as a plain process (PRISM.md section 1, verbatim)"
PGBIN=/usr/lib/postgresql/16/bin
PGDATA=/var/tmp/activate-pg                    # anywhere outside the repo; db-data/ is gitignored too
run mkdir -p "$PGDATA" && run chown postgres:postgres "$PGDATA"
run sudo -u postgres $PGBIN/initdb -D "$PGDATA" -U postgres --auth=trust --auth-host=md5 -E UTF8 | tail -n 3
run sudo -u postgres $PGBIN/pg_ctl -D "$PGDATA" -o "-p 5439 -c listen_addresses=localhost" -l "$PGDATA/server.log" start
run sudo -u postgres $PGBIN/pg_isready -h localhost -p 5439 -U postgres   # "accepting connections"
run sudo -u postgres psql -p 5439 -U postgres -c "ALTER USER postgres PASSWORD 'postgres';"
run sudo -u postgres createdb -p 5439 -U postgres lightci_activate
run env PGPASSWORD=postgres psql -h localhost -p 5439 -U postgres -d lightci_activate -c 'select 1'
echo "C3 check: psql -h localhost -p 5439 -U postgres -d lightci_activate -c 'select 1' -> exit $?"
run env PGPASSWORD=postgres psql -w -h localhost -p 5439 -U postgres -c 'select version()' -tA
echo "data dir inside repo? $( [[ "$PGDATA" == "$ROOT"* ]] && echo YES || echo no ) ; git check-ignore db-data: $(git check-ignore db-data/ || echo 'not ignored')"

say "2. Install (PRISM.md section 2, verbatim, sequential)"
run bash -c '(cd api && yarn install --frozen-lockfile)' | tail -n 2
run bash -c '(cd frontend && yarn install --frozen-lockfile)' | tail -n 2
run bash -c '(cd mcp-app && yarn install --frozen-lockfile && yarn build)' | tail -n 3   # dist/app.html, served at /mcp
run bash -c '(cd e2e && yarn install --frozen-lockfile && npx playwright install --with-deps chromium)' | tail -n 3
run ls -la mcp-app/dist/app.html

say "3. Migrate and seed happen on boot (MIGRATIONS_RUN_ON_BOOT / SEED_ON_BOOT) — database is empty now"
run env PGPASSWORD=postgres psql -w -h localhost -p 5439 -U postgres -d lightci_activate -tAc "select 'tables='||count(*) from pg_tables where schemaname='public'"
run grep -nE '^(MIGRATIONS_RUN_ON_BOOT|SEED_ON_BOOT|AI_PROVIDER)=' api/.env.example

say "4. Boot the API (PRISM.md section 4, verbatim)"
cd api && AI_PROVIDER=mock setsid nohup yarn -s start:dev > /tmp/api.log 2>&1 &   # drop AI_PROVIDER=mock for live Claude
cd "$ROOT"
t0=$(date +%s)
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4310/api/ready || true)
  [[ "$code" == "200" ]] && break
  sleep 2
done
echo "api/ready reached http $code after $(( $(date +%s) - t0 )) s"
echo; echo "C6 checks:"
run curl -fsS -w '\nhttp %{http_code}\n' http://localhost:4310/api/health
run curl -fsS -w '\nhttp %{http_code}\n' http://localhost:4310/api/ready
run curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4310/docs
run curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4310/mcp
run env PGPASSWORD=postgres psql -w -h localhost -p 5439 -U postgres -d lightci_activate -tAc "select 'tables='||count(*) from pg_tables where schemaname='public'"
run env PGPASSWORD=postgres psql -w -h localhost -p 5439 -U postgres -d lightci_activate -tAc "select 'orgs='||count(*)||' users='||(select count(*) from people) from orgs"
run grep -nE 'seed|migration' /tmp/api.log | head -n 8
run pgrep -af 'nest start --watch|api/dist/main'

say "5. Boot the web app (PRISM.md section 5, verbatim)"
cd frontend && setsid nohup yarn -s dev > /tmp/frontend.log 2>&1 &
cd "$ROOT"
t0=$(date +%s)
for i in $(seq 1 45); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/login || true)
  [[ "$code" == "200" ]] && break
  sleep 2
done
echo "/login reached http $code after $(( $(date +%s) - t0 )) s"
echo; echo "C7 check:"
run curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/sign-in
run curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/
run curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/login
run curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/health   # through the web origin's /api proxy
run curl -s http://localhost:3000/api/health

say "Final: stack.sh status"
run .prism/scripts/stack.sh status
