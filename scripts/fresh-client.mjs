// Creates a brand-new WorkOS organization + admin user and provisions the matching Activate org
// through the lead API (the real provisioning path). Usage:
//   node scripts/fresh-client.mjs "Northgate Advisory" northgate zain@northgateadvisory.demo [API_URL]
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const [name, slug, email, apiUrl = 'http://localhost:4310'] = process.argv.slice(2);
if (!name || !slug || !email) throw new Error('usage: fresh-client.mjs <name> <slug> <email> [apiUrl]');
const env = Object.fromEntries(readFileSync(new URL('../api/.env', import.meta.url), 'utf8').split('\n').filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const H = { Authorization: `Bearer ${env.WORKOS_API_KEY}`, 'Content-Type': 'application/json' };
const wos = async (path, init) => { const r = await fetch(`https://api.workos.com${path}`, { ...init, headers: H }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${path} -> ${r.status} ${JSON.stringify(j)}`); return j; };
const PASSWORD = 'Activate-demo-2026!';

const orgs = await wos('/organizations?limit=100');
let org = orgs.data.find((o) => o.name === name) ?? (await wos('/organizations', { method: 'POST', body: JSON.stringify({ name }) }));
const found = await wos(`/user_management/users?email=${encodeURIComponent(email)}`);
let user = found.data[0] ?? (await wos('/user_management/users', { method: 'POST', body: JSON.stringify({ email, password: PASSWORD, email_verified: true, first_name: 'Zain', last_name: 'Lakhani' }) }));
const memberships = await wos(`/user_management/organization_memberships?user_id=${user.id}&organization_id=${org.id}`);
if (!memberships.data.length) await wos('/user_management/organization_memberships', { method: 'POST', body: JSON.stringify({ user_id: user.id, organization_id: org.id, role_slug: 'admin' }) });

// Provision the Activate org as the LightCI lead.
const token = execSync(`./scripts/token.sh zain+activate-lead@lightci.com`, { encoding: 'utf8' }).trim();
const api = async (path, init) => { const r = await fetch(`${apiUrl}/api${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${path} -> ${r.status} ${JSON.stringify(j)}`); return j; };
const clients = await api('/lead/clients');
let client = clients.find((c) => c.org.slug === slug);
if (!client) { const created = await api('/lead/clients', { method: 'POST', body: JSON.stringify({ name, slug, workosOrganizationId: org.id, industry: 'Wealth management', sponsorName: 'Zain Lakhani, COO', seats: 25 }) }); client = { org: created }; }
console.log(JSON.stringify({ workosOrg: org.id, workosUser: user.id, activateOrg: client.org.id ?? client.org, email, password: PASSWORD, signIn: apiUrl.includes('localhost') ? 'http://localhost:3000/login' : 'https://lightci-activate.lciventure.com/login' }, null, 2));
