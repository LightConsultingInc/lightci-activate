#!/usr/bin/env bash
# Start (or reuse) a Keycloak dev instance with the activate-test realm on http://localhost:${KEYCLOAK_PORT:-8089}.
set -euo pipefail
PORT="${KEYCLOAK_PORT:-8089}"
NAME="${KEYCLOAK_CONTAINER:-activate-keycloak}"
HERE="$(cd "$(dirname "$0")" && pwd)"
if ! docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" -p "${PORT}:8080" \
    -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
    -e KC_HOSTNAME_STRICT=false -e KC_HTTP_ENABLED=true \
    -v "${HERE}/realm-activate-test.json:/opt/keycloak/data/import/realm-activate-test.json:ro" \
    quay.io/keycloak/keycloak:26.0 start-dev --import-realm >/dev/null
fi
for _ in $(seq 1 90); do
  if curl -fsS "http://localhost:${PORT}/realms/activate-test/.well-known/openid-configuration" >/dev/null 2>&1; then
    echo "keycloak ready: http://localhost:${PORT}/realms/activate-test"
    exit 0
  fi
  sleep 2
done
echo "keycloak did not become ready" >&2
docker logs "$NAME" 2>&1 | tail -20 >&2
exit 1
