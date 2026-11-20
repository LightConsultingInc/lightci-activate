#!/usr/bin/env bash
# Local stack for the PRISM sandbox (no Docker daemon): Postgres as a plain process (:5439),
# API (:4310) and web (:3000) in the background with logs under /tmp. See PRISM.md.
#
#   .prism/scripts/stack.sh up [mock|live]   start everything (mock = AI_PROVIDER=mock, what e2e/ expects)
#   .prism/scripts/stack.sh down             stop api, web and postgres
#   .prism/scripts/stack.sh status           print health of each piece
#
# Expects api/.env and frontend/.env.local to be in place already (never committed).
# Overrides (env): PGBIN, PGDATA (default /var/tmp/activate-pg), DB_PORT (5439), DB_DATABASE, PRISM_LOG_DIR (/tmp).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-/var/tmp/activate-pg}"
DB_PORT="${DB_PORT:-5439}"
DB_NAME="${DB_DATABASE:-lightci_activate}"
LOGS="${PRISM_LOG_DIR:-/tmp}"
CMD="${1:-up}"
MODE="${2:-mock}"

as_pg() { if [[ "$(id -u)" == "0" ]]; then sudo -u postgres "$@"; else "$@"; fi; }

pg_up() { as_pg "$PGBIN/pg_isready" -q -h localhost -p "$DB_PORT" -U postgres; }

start_postgres() {
  if pg_up; then echo "==> postgres already up on :$DB_PORT"; return; fi
  if [[ ! -f "$PGDATA/PG_VERSION" ]]; then
    echo "==> initdb $PGDATA"
    mkdir -p "$PGDATA"
    [[ "$(id -u)" == "0" ]] && chown postgres:postgres "$PGDATA"
    as_pg "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust --auth-host=md5 -E UTF8 >"$LOGS/initdb.log" 2>&1
  fi
  echo "==> postgres on :$DB_PORT"
  as_pg "$PGBIN/pg_ctl" -D "$PGDATA" -o "-p $DB_PORT -c listen_addresses=localhost" -l "$PGDATA/server.log" start >/dev/null
  for _ in $(seq 1 30); do pg_up && break; sleep 1; done
  pg_up || { echo "postgres did not start; see $PGDATA/server.log" >&2; exit 1; }
  # Password auth for TCP clients (the API connects over localhost with DB_PASSWORD=postgres).
  as_pg psql -q -p "$DB_PORT" -U postgres -c "ALTER USER postgres PASSWORD 'postgres';"
  as_pg psql -q -p "$DB_PORT" -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
    || as_pg createdb -p "$DB_PORT" -U postgres "$DB_NAME"
}

install_deps() {
  # Sequential on purpose: parallel yarn installs race on the shared yarn cache and fail with ENOENT.
  for pkg in api frontend mcp-app e2e; do
    [[ -d "$ROOT/$pkg/node_modules" ]] || { echo "==> yarn install ($pkg)"; (cd "$ROOT/$pkg" && yarn install --frozen-lockfile >"$LOGS/install-$pkg.log" 2>&1); }
  done
  [[ -f "$ROOT/mcp-app/dist/app.html" ]] || { echo "==> build mcp-app"; (cd "$ROOT/mcp-app" && yarn -s build >"$LOGS/mcp-build.log" 2>&1); }
}

wait_for() { # url, tries, [expected http codes regex]
  local url="$1" tries="$2" ok="${3:-200}"
  for _ in $(seq 1 "$tries"); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$url" || true)
    [[ "$code" =~ ^($ok)$ ]] && return 0
    sleep 2
  done
  return 1
}

start_api() {
  # A running API is left alone whatever its mode; `down` then `up <mode>` switches between mock and live.
  if wait_for http://localhost:4310/api/health 1; then echo "==> api already up on :4310 (mode unchanged)"; return; fi
  echo "==> api on :4310 ($MODE)"
  local env=()
  [[ "$MODE" == "mock" ]] && env=(AI_PROVIDER=mock)
  # setsid: detach from the calling terminal, or the forked node server dies with it (nohup only covers yarn).
  (cd "$ROOT/api" && env "${env[@]}" setsid nohup yarn -s start:dev >"$LOGS/api.log" 2>&1 &)
  # First boot compiles with nest --watch, runs migrations and seeds the demo org: ~40-60s.
  wait_for http://localhost:4310/api/ready 60 || { echo "api did not become ready; see $LOGS/api.log" >&2; tail -n 40 "$LOGS/api.log" >&2; exit 1; }
}

start_web() {
  if wait_for http://localhost:3000/login 1 '200|302|307'; then echo "==> web already up on :3000"; return; fi
  echo "==> web on :3000"
  (cd "$ROOT/frontend" && setsid nohup yarn -s dev >"$LOGS/frontend.log" 2>&1 &)
  wait_for http://localhost:3000/login 45 '200|302|307' || { echo "web did not come up; see $LOGS/frontend.log" >&2; exit 1; }
}

status() {
  pg_up && echo "postgres  :$DB_PORT  ok" || echo "postgres  :$DB_PORT  DOWN"
  echo "api       :4310  $(curl -s http://localhost:4310/api/ready || echo DOWN)"
  echo "web       :3000  http $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/login || echo DOWN)"
}

stop_all() {
  # Only this checkout's processes: the nest watcher and the server it forks (node api/dist/main),
  # the next dev wrapper, and whatever still holds :4310 / :3000 (next-server carries no path in argv).
  pkill -f "$ROOT/api/node_modules/.bin/nest start" 2>/dev/null || true
  pkill -f "$ROOT/api/dist/main" 2>/dev/null || true
  pkill -f "$ROOT/frontend/node_modules/.bin/next dev" 2>/dev/null || true
  fuser -k -TERM 4310/tcp 3000/tcp >/dev/null 2>&1 || true
  if pg_up; then as_pg "$PGBIN/pg_ctl" -D "$PGDATA" stop -m fast >/dev/null; fi
  echo "stack stopped"
}

case "$CMD" in
  up) start_postgres; install_deps; start_api; start_web; echo; status ;;
  down) stop_all ;;
  status) status ;;
  *) echo "usage: $0 up [mock|live] | down | status" >&2; exit 2 ;;
esac
