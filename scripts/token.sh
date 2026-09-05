#!/usr/bin/env bash
# Prints a WorkOS access token for a demo user: ./scripts/token.sh priya.nair@meridianwealth.demo
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY=$(grep '^WORKOS_API_KEY=' "$ROOT/api/.env" | cut -d= -f2-)
CID=$(grep '^WORKOS_CLIENT_ID=' "$ROOT/api/.env" | cut -d= -f2-)
curl -s -X POST https://api.workos.com/user_management/authenticate -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d "{\"client_id\":\"$CID\",\"client_secret\":\"$KEY\",\"grant_type\":\"password\",\"email\":\"$1\",\"password\":\"${2:-Activate-demo-2026!}\"}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])'
