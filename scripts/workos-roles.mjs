#!/usr/bin/env node
// Creates the WorkOS environment roles that Activate's default role mapping understands, so a
// customer's IT admin can assign their own groups to them while connecting a directory or SSO.
// Idempotent: existing roles are kept. Run once per WorkOS environment (each cell has its own).
//
//   WORKOS_API_KEY=sk_… node scripts/workos-roles.mjs
//
// WorkOS's built-in `admin` and `member` roles stay; `admin` also maps to Activate admin.
const key = process.env.WORKOS_API_KEY;
if (!key) {
  console.error('WORKOS_API_KEY is required');
  process.exit(1);
}

const ROLES = [
  { slug: 'activate-admin', name: 'Activate admin', description: 'Runs Activate for the company: sign-in, teams, policy, keys.' },
  { slug: 'activate-sponsor', name: 'Activate sponsor', description: 'Sees company-wide adoption and results.' },
  { slug: 'activate-champion', name: 'Activate champion', description: 'Supports a team: progress, coaching and skill approvals.' },
];

const api = async (method, path, body) => {
  const res = await fetch(`https://api.workos.com${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

const existing = new Set((await api('GET', '/authorization/roles')).data.map((r) => r.slug));
for (const role of ROLES) {
  if (existing.has(role.slug)) {
    console.log(`kept    ${role.slug}`);
    continue;
  }
  await api('POST', '/authorization/roles', role);
  console.log(`added   ${role.slug}`);
}
