#!/usr/bin/env bash
# The Compose evaluation install, end to end (T4.5): real images, the bundled Postgres, a real Keycloak
# over https behind a private CA, a real licence. Checks readiness, doctor, metrics, the web app, and that
# data survives `docker compose down && up`. Needs LICENSE_PRIVATE_KEY_FILE or LICENSE_SIGNING_KEY.
#   ACTIVATE_VERSION=smoke scripts/ci/compose-smoke.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export ACTIVATE_VERSION="${ACTIVATE_VERSION:-smoke}"
WEB_PORT="${SMOKE_WEB_PORT:-18080}"; API_PORT="${SMOKE_API_PORT:-18081}"
export SMOKE_DIR="$(mktemp -d)"
export SMOKE_REALM="$ROOT/api/test/keycloak/realm-activate-test.json"
PROJECT="activate-smoke"
COMPOSE=(docker compose -p "$PROJECT" -f "$ROOT/deploy/compose/docker-compose.yml" -f "$ROOT/scripts/ci/compose-smoke.override.yml" --env-file "$SMOKE_DIR/.env")
KEY_FILE="${LICENSE_PRIVATE_KEY_FILE:-}"
if [[ -z "$KEY_FILE" && -n "${LICENSE_SIGNING_KEY:-}" ]]; then KEY_FILE="$SMOKE_DIR/license.jwk.json"; printf '%s' "$LICENSE_SIGNING_KEY" > "$KEY_FILE"; fi
[[ -n "$KEY_FILE" ]] || { echo "LICENSE_PRIVATE_KEY_FILE or LICENSE_SIGNING_KEY is required" >&2; exit 2; }
cleanup() { if [[ "${KEEP:-0}" != "1" ]]; then "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true; fi; rm -rf "$SMOKE_DIR"; }
trap cleanup EXIT
step() { printf '\n==> %s\n' "$*"; }
fail() { echo "COMPOSE SMOKE FAILED: $*" >&2; "${COMPOSE[@]}" logs --tail=60 api worker migrate >&2 || true; exit 1; }

step "certificates for the identity provider"
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 2 -subj "/CN=compose-smoke-ca" \
  -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" -keyout "$SMOKE_DIR/ca.key" -out "$SMOKE_DIR/ca.pem" 2>/dev/null
openssl req -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -subj "/CN=keycloak" -keyout "$SMOKE_DIR/keycloak.key" -out "$SMOKE_DIR/keycloak.csr" 2>/dev/null
printf 'subjectAltName=DNS:keycloak\nextendedKeyUsage=serverAuth\n' > "$SMOKE_DIR/kc.ext"
openssl x509 -req -in "$SMOKE_DIR/keycloak.csr" -CA "$SMOKE_DIR/ca.pem" -CAkey "$SMOKE_DIR/ca.key" -CAcreateserial -days 2 -out "$SMOKE_DIR/keycloak.crt" -extfile "$SMOKE_DIR/kc.ext" 2>/dev/null
chmod 644 "$SMOKE_DIR"/*.pem "$SMOKE_DIR"/*.crt "$SMOKE_DIR"/*.key

step "the evaluator's .env"
EXPIRES=$(date -u -v+1y +%F 2>/dev/null || date -u -d '+1 year' +%F)
LICENSE=$(cd "$ROOT" && LICENSE_PRIVATE_KEY_FILE="$KEY_FILE" node scripts/license-issue.mjs --org "Acme Corp" --slug acme --seats 25 --expires "$EXPIRES" 2>/dev/null)
cat > "$SMOKE_DIR/.env" <<ENV
ACTIVATE_VERSION=$ACTIVATE_VERSION
ACTIVATE_LICENSE=$LICENSE
ACTIVATE_SECRETS_KEY=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -hex 24)
DB_PASSWORD=smoke-db-password
WEB_URL=http://localhost:$WEB_PORT
PUBLIC_API_URL=http://localhost:$API_PORT
WEB_PORT=$WEB_PORT
API_PORT=$API_PORT
AUTH_PROVIDER=oidc
AUTH_OIDC_ISSUER=https://keycloak:8443/realms/activate-test
AUTH_OIDC_CLIENT_ID=activate
AUTH_OIDC_CLIENT_SECRET=activate-secret
AUTH_GROUPS_CLAIM=groups
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-sk-ant-not-a-real-key}
LIBRARY_PROVIDER=local
ACTIVATE_ORG_NAME=Acme Corp
ACTIVATE_ORG_SLUG=acme
ACTIVATE_ORG_EMAIL_DOMAINS=acme.test
ACTIVATE_ORG_INITIAL_ADMINS=jane.doe@acme.test
UPDATE_CHECK_ENABLED=false
NODE_EXTRA_CA_CERTS=/etc/activate/ca.pem
SMOKE_DIR=$SMOKE_DIR
SMOKE_REALM=$SMOKE_REALM
ENV

step "docker compose up (migrate gates api and worker)"
"${COMPOSE[@]}" up -d --wait --wait-timeout 600 || fail "stack did not become healthy"
"${COMPOSE[@]}" ps

step "readiness, discovery, web"
curl -fsS http://localhost:$API_PORT/api/ready >/dev/null || fail "/api/ready"
curl -fsS http://localhost:$API_PORT/.well-known/oauth-authorization-server | grep -q authorization_endpoint || fail "OAuth discovery"
# /sign-in may redirect (OIDC mode goes to the email-first page, on the public WEB_URL host); follow the
# path on this port-forward and require a 200 page.
# OIDC mode: /sign-in sends the browser to the API's public origin to authorize (reachable from this host),
# which in turn sends it on to the identity provider; the email-first /login page renders itself.
loc=$(curl -s -o /dev/null -w '%{redirect_url}' http://localhost:$WEB_PORT/sign-in); echo "/sign-in -> $loc"
[[ "$loc" == http://localhost:$API_PORT/oauth/authorize?* ]] || fail "sign-in must redirect to PUBLIC_API_URL/oauth/authorize, got: $loc"
code=$(curl -s -o /dev/null -w '%{http_code}' "$loc"); [[ "$code" =~ ^30[1278]$ ]] || fail "authorize endpoint should redirect to the identity provider, got $code"
code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:$WEB_PORT/login); [[ "$code" == "200" ]] || fail "web /login returned $code"
code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:$WEB_PORT/api/ready); [[ "$code" == "401" ]] || fail "web /api proxy should refuse anonymous calls with 401, got $code"
curl -fsS http://localhost:$WEB_PORT/api/health >/dev/null || fail "web /api/health"

step "activate doctor in the worker (what the guide tells evaluators to run)"
set +e; DOCTOR=$("${COMPOSE[@]}" exec -T worker activate doctor 2>&1); DOCTOR_EXIT=$?; set -e
echo "$DOCTOR"
for name in database license identity; do grep -q "✓ ${name} " <<< "$DOCTOR" || fail "doctor: ${name} is not ✓"; done
echo "$DOCTOR" | grep -Eq "^(✓|!) marketplace " || fail "doctor: marketplace failed"
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then [[ $DOCTOR_EXIT -eq 0 ]] || fail "doctor exited $DOCTOR_EXIT with a real key"; fi

step "metrics on both server roles"
"${COMPOSE[@]}" exec -T api wget -qO- http://127.0.0.1:9464/metrics | grep -q '^activate_license_seats 25$' || fail "api metrics"
"${COMPOSE[@]}" exec -T worker wget -qO- http://127.0.0.1:9464/metrics | grep -q 'activate_jobs_queued{queue="nightly' || fail "worker metrics"

step "data survives down and up"
"${COMPOSE[@]}" down >/dev/null
"${COMPOSE[@]}" up -d --wait --wait-timeout 600 || fail "stack did not come back"
curl -fsS http://localhost:$API_PORT/api/ready >/dev/null || fail "/api/ready after restart"
AFTER=$("${COMPOSE[@]}" exec -T worker activate doctor 2>&1 || true)
echo "$AFTER"
if ! grep -q "✓ license .*1/25 seats" <<< "$AFTER"; then fail "bootstrap admin lost across restart"; fi
curl -fsS http://localhost:$API_PORT/api/ready | grep -q '"license":"valid"' || fail "readiness does not report the licence after restart"

echo; echo "COMPOSE SMOKE PASSED"
