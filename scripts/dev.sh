#!/usr/bin/env bash
# Boots the whole local stack: Postgres (docker), API (:4310), web (:3000).
# Usage: ./scripts/dev.sh [mock]   — "mock" runs the API with AI_PROVIDER=mock (what the E2E suite expects)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export DB_PORT="${DB_PORT:-5439}"
MODE="${1:-live}"

echo "==> postgres on :$DB_PORT"
(cd "$ROOT" && docker compose up -d >/dev/null)
for _ in $(seq 1 30); do docker exec lightci-activate pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done

echo "==> api on :4310 ($MODE)"
(cd "$ROOT/api" && if [[ "$MODE" == "mock" ]]; then AI_PROVIDER=mock yarn -s start:dev; else yarn -s start:dev; fi) &
API_PID=$!

echo "==> web on :3000"
(cd "$ROOT/frontend" && yarn -s dev) &
WEB_PID=$!

trap 'kill $API_PID $WEB_PID 2>/dev/null || true' EXIT INT TERM
wait
