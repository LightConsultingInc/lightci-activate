#!/usr/bin/env node
// Registers each cell's sign-in callback as an AuthKit redirect URI in a WorkOS environment, so the
// hosts in infra/cells.json can be reproduced without the dashboard. Idempotent: existing URIs are kept.
//
//   WORKOS_API_KEY=sk_… node scripts/workos-redirects.mjs            # all cells
//   WORKOS_API_KEY=sk_… node scripts/workos-redirects.mjs eu         # one cell (its own WorkOS environment)
//   WORKOS_API_KEY=sk_… node scripts/workos-redirects.mjs --extra http://localhost:3000/callback
//
// Webhook endpoints have no API and stay a dashboard step: POST <api>/api/webhooks/workos, events
// organization_membership.*, user.deleted, dsync.user.deleted; put the signing secret in
// activate-<cell>-workos-webhook and set workos_webhook_secret_name on the cell root.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const key = process.env.WORKOS_API_KEY;
if (!key) {
  console.error('WORKOS_API_KEY is required');
  process.exit(1);
}
const args = process.argv.slice(2);
const extra = [];
const cellsWanted = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--extra') extra.push(args[++i]);
  else cellsWanted.push(args[i]);
}

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, '..', 'infra', 'cells.json'), 'utf8'));
const cells = manifest.cells.filter((c) => cellsWanted.length === 0 || cellsWanted.includes(c.id));
const wanted = [...cells.map((c) => `${c.web}/callback`), ...extra];

const api = async (method, path, body) => {
  const res = await fetch(`https://api.workos.com${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
};

const existing = (await api('GET', '/user_management/redirect_uris')).data.map((r) => r.uri);
for (const uri of wanted) {
  if (existing.includes(uri)) {
    console.log(`kept    ${uri}`);
    continue;
  }
  await api('POST', '/user_management/redirect_uris', { uri });
  console.log(`added   ${uri}`);
}
console.log(`\nSign-in starts at ${cells.map((c) => `${c.web}/sign-in`).join(' and ')}; set that as the AuthKit sign-in endpoint if the dashboard asks for one.`);
