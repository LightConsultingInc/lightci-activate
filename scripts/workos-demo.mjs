// Idempotently creates the demo WorkOS organization and sign-in users used by the
// seed and the Playwright suite. Reads WORKOS_API_KEY from api/.env. Writes ids to
// api/src/seed/workos-demo.json. Run: node scripts/workos-demo.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../api/.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }),
);
const KEY = env.WORKOS_API_KEY;
if (!KEY) throw new Error('WORKOS_API_KEY missing in api/.env');
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const api = async (path, init) => {
  const r = await fetch(`https://api.workos.com${path}`, { ...init, headers: H });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${init?.method ?? 'GET'} ${path} -> ${r.status} ${JSON.stringify(j)}`);
  return j;
};

export const DEMO_PASSWORD = 'Activate-demo-2026!';
const ORG_NAME = 'Meridian Wealth Partners (Activate demo)';
const USERS = [
  { email: 'priya.nair@meridianwealth.demo', first: 'Priya', last: 'Nair', role: 'member' },        // learner, L2, Financial Planning
  { email: 'marcus.reid@meridianwealth.demo', first: 'Marcus', last: 'Reid', role: 'member' },      // learner, L1, Wealth Advisors
  { email: 'daniel.okafor@meridianwealth.demo', first: 'Daniel', last: 'Okafor', role: 'member' },  // champion, L5, Financial Planning
  { email: 'elena.marsh@meridianwealth.demo', first: 'Elena', last: 'Marsh', role: 'admin' },       // sponsor + company admin (COO)
  { email: 'zain+activate-lead@lightci.com', first: 'Zain', last: 'Lakhani', role: 'admin' },       // LightCI activation lead (cross-client)
];

const orgs = await api('/organizations?limit=100');
let org = orgs.data.find((o) => o.name === ORG_NAME);
if (!org) org = await api('/organizations', { method: 'POST', body: JSON.stringify({ name: ORG_NAME }) });
console.log('org', org.id);

const out = { organizationId: org.id, password: DEMO_PASSWORD, users: {} };
for (const u of USERS) {
  const found = await api(`/user_management/users?email=${encodeURIComponent(u.email)}`);
  let user = found.data[0];
  if (!user) {
    user = await api('/user_management/users', { method: 'POST', body: JSON.stringify({ email: u.email, password: DEMO_PASSWORD, email_verified: true, first_name: u.first, last_name: u.last }) });
    console.log('created', u.email);
  } else {
    await api(`/user_management/users/${user.id}`, { method: 'PUT', body: JSON.stringify({ password: DEMO_PASSWORD, email_verified: true, first_name: u.first, last_name: u.last }) }).catch((e) => console.warn('update failed', e.message));
  }
  const memberships = await api(`/user_management/organization_memberships?user_id=${user.id}&organization_id=${org.id}`);
  if (!memberships.data.length) {
    await api('/user_management/organization_memberships', { method: 'POST', body: JSON.stringify({ user_id: user.id, organization_id: org.id, role_slug: u.role }) });
    console.log('membership', u.email, u.role);
  }
  out.users[u.email] = user.id;
}
writeFileSync(new URL('../api/src/seed/workos-demo.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log('wrote api/src/seed/workos-demo.json');
