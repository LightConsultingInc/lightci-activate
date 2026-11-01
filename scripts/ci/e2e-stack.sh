#!/usr/bin/env bash
# Starts the API (:4310) and the web app (:3000) from built artifacts for the Playwright suite.
#   scripts/ci/e2e-stack.sh workos|oidc
# Expects Postgres reachable through DB_* and, for oidc, Keycloak at KEYCLOAK_URL (test/keycloak/start.sh).
# WorkOS mode expects WORKOS_API_KEY and WORKOS_CLIENT_ID. Logs land in $E2E_LOG_DIR (default ./e2e-logs).
set -euo pipefail
MODE="${1:?workos|oidc}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOGS="${E2E_LOG_DIR:-$ROOT/e2e-logs}"
mkdir -p "$LOGS"

export NODE_ENV="${NODE_ENV:-test}"
export AI_PROVIDER=mock
# The mock provider never calls Anthropic; the key only marks LightCI's platform key as configured, which
# the admin "Using LightCI's key" card and the lead console assert. CI passes the real secret when it has one.
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-sk-ant-e2e-platform-key-unused}"
export SEED_ON_BOOT=true
export MIGRATIONS_RUN_ON_BOOT=true
export PORT=4310
export WEB_URL="${WEB_URL:-http://localhost:3000}"
export PUBLIC_API_URL="${PUBLIC_API_URL:-http://localhost:4310}"
export API_URL="${API_URL:-http://localhost:4310}"
export LEAD_EMAIL_DOMAINS="${LEAD_EMAIL_DOMAINS:-lightci.com}"
export LIBRARY_REPO_PATH="${LIBRARY_REPO_PATH:-$ROOT/marketplace}"
export ACTIVATE_SECRETS_KEY="${ACTIVATE_SECRETS_KEY:-integration-test-secrets-key}"
export SESSION_SECRET="${SESSION_SECRET:-e2e-session-secret-with-at-least-32-chars}"
export WORKOS_COOKIE_PASSWORD="${WORKOS_COOKIE_PASSWORD:-$SESSION_SECRET}"

if [[ "$MODE" == "oidc" ]]; then
  export AUTH_PROVIDER=oidc
  export AUTH_OIDC_ISSUER="${KEYCLOAK_URL:-http://localhost:8089}/realms/activate-test"
  export AUTH_OIDC_CLIENT_ID=activate
  export AUTH_OIDC_CLIENT_SECRET=activate-secret
  export AUTH_GROUPS_CLAIM=groups
  unset WORKOS_API_KEY WORKOS_CLIENT_ID
else
  export AUTH_PROVIDER=workos
  : "${WORKOS_API_KEY:?WORKOS_API_KEY is required in workos mode}"
  : "${WORKOS_CLIENT_ID:?WORKOS_CLIENT_ID is required in workos mode}"
  export MCP_DEV_USER_EMAIL="${MCP_DEV_USER_EMAIL:-zain@northgateadvisory.demo}"
fi

echo "==> api ($MODE) on :4310"
(cd "$ROOT/api" && node dist/main.js > "$LOGS/api.log" 2>&1) &
echo $! > "$LOGS/api.pid"
for _ in $(seq 1 90); do
  curl -fsS http://localhost:4310/api/ready >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS http://localhost:4310/api/ready >/dev/null || { echo "api did not become ready" >&2; tail -50 "$LOGS/api.log" >&2; exit 1; }

echo "==> web ($MODE) on :3000"
(cd "$ROOT/frontend" && PORT=3000 HOSTNAME=0.0.0.0 node .next/standalone/server.js > "$LOGS/web.log" 2>&1) &
echo $! > "$LOGS/web.pid"
for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/sign-in || true)
  [[ "$code" == "200" || "$code" == "307" || "$code" == "302" ]] && break
  sleep 2
done
echo "stack up: api http://localhost:4310, web http://localhost:3000"
