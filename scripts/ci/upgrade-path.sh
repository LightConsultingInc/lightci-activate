#!/usr/bin/env bash
# Two-version upgrade and rollback (T7.2), with Docker only:
#   schema at N-2  --migrate-->  N-1  --migrate-->  N (the candidate), then the N-1 image boots against
#   the N schema and serves /api/ready (what a rollback looks like), then N boots and serves too.
#
#   scripts/ci/upgrade-path.sh <candidate image> <previous image> [<previous-previous image>]
# Images are full references (ghcr.io/lightconsultinginc/activate/server@sha256:... or :1.2.0). With one previous
# image only the N-1 → N step runs. Exits 0 when there is no previous release at all.
set -euo pipefail
CANDIDATE="${1:?candidate image}"; PREV="${2:-}"; PREV2="${3:-}"
[[ -n "$PREV" ]] || { echo "no previous release: nothing to upgrade from"; exit 0; }
NET="activate-upgrade-$$"
PG="activate-upgrade-pg-$$"
cleanup() { docker rm -f "$PG" activate-upgrade-api >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; }
trap cleanup EXIT
step() { printf '\n==> %s\n' "$*"; }

docker network create "$NET" >/dev/null
docker run -d --name "$PG" --network "$NET" -e POSTGRES_USER=activate -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=activate postgres:16 >/dev/null
for _ in $(seq 1 30); do docker exec "$PG" pg_isready -U activate >/dev/null 2>&1 && break; sleep 2; done

ENV=(-e NODE_ENV=production -e ACTIVATE_EDITION=cloud -e ACTIVATE_ROLE=api -e DB_HOST="$PG" -e DB_PORT=5432 -e DB_USERNAME=activate -e DB_PASSWORD=pw -e DB_DATABASE=activate -e DB_SSL_MODE=disable -e DB_SSL_ALLOW_PLAINTEXT=true
     -e WEB_URL=http://web.test -e PUBLIC_API_URL=http://api.test -e ACTIVATE_SECRETS_KEY=upgrade-path-secrets-key -e AUTH_PROVIDER=workos -e WORKOS_API_KEY=sk_test_unused -e WORKOS_CLIENT_ID=client_unused
     -e LIBRARY_PROVIDER=local -e LIBRARY_ALLOW_LOCAL=true -e AI_PROVIDER=live -e ANTHROPIC_API_KEY=sk-ant-unused -e MIGRATIONS_RUN_ON_BOOT=false -e UPDATE_CHECK_ENABLED=false -e METRICS_ENABLED=false)
migrate() { step "activate migrate with $1"; docker run --rm --network "$NET" "${ENV[@]}" "$1" activate migrate; }
boot() {
  step "boot $1 against the current schema"
  docker rm -f activate-upgrade-api >/dev/null 2>&1 || true
  docker run -d --name activate-upgrade-api --network "$NET" "${ENV[@]}" -p 127.0.0.1:14310:3000 "$1" >/dev/null
  for _ in $(seq 1 45); do curl -fsS http://127.0.0.1:14310/api/ready >/dev/null 2>&1 && { echo "ready"; return 0; }; sleep 2; done
  echo "image $1 did not become ready against the current schema" >&2; docker logs activate-upgrade-api | tail -40 >&2; return 1
}

[[ -n "$PREV2" ]] && migrate "$PREV2"
migrate "$PREV"
migrate "$CANDIDATE"
boot "$PREV"       # rollback: the previous release serves on the new, additive schema
boot "$CANDIDATE"  # and the candidate serves too
echo
echo "UPGRADE PATH PASSED: ${PREV2:+$PREV2 → }$PREV → $CANDIDATE, rollback to $PREV serves"
