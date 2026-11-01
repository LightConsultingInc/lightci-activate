/**
 * k6 load profile (T2.9 / T5.9): learners browsing while a few submit practice work.
 *
 *   k6 run perf/learner-load.js
 *   API_URL=https://api.activate.example.com WORKOS_CLIENT_ID=… WORKOS_API_KEY=… \
 *     EMAIL=priya.nair@meridianwealth.demo PASSWORD=… BROWSERS=200 SUBMITTERS=20 DURATION=15m k6 run perf/learner-load.js
 *
 * Reads api/.env for the WorkOS credentials when the variables are not set (local runs).
 * Against a mock-AI stack the submit path measures everything but the model call.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const API = (__ENV.API_URL || 'http://localhost:4310').replace(/\/$/, '');
const DURATION = __ENV.DURATION || '2m';
const BROWSERS = Number(__ENV.BROWSERS || 50);
const SUBMITTERS = Number(__ENV.SUBMITTERS || 5);

const readLatency = new Trend('activate_read_ms', true);
const submitLatency = new Trend('activate_submit_ms', true);
const submitOk = new Rate('activate_submit_ok');

export const options = {
  scenarios: {
    browse: {
      executor: 'constant-vus',
      vus: BROWSERS,
      duration: DURATION,
      exec: 'browse',
    },
    submit: {
      executor: 'constant-vus',
      vus: SUBMITTERS,
      duration: DURATION,
      exec: 'submit',
      startTime: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    activate_read_ms: ['p(95)<500'],
    activate_submit_ms: ['p(95)<60000'],
    activate_submit_ok: ['rate>0.95'],
  },
};

function envFromDotenv() {
  try {
    const text = open('../api/.env');
    const out = {};
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/\s+#.*$/, '');
    }
    return out;
  } catch (_) {
    return {};
  }
}

// open() is only allowed in the init context, so read the local env file once at load time.
const DOTENV = envFromDotenv();

export function setup() {
  const dotenv = DOTENV;
  const clientId = __ENV.WORKOS_CLIENT_ID || dotenv.WORKOS_CLIENT_ID;
  const secret = __ENV.WORKOS_API_KEY || dotenv.WORKOS_API_KEY;
  const email = __ENV.EMAIL || 'priya.nair@meridianwealth.demo';
  const password = __ENV.PASSWORD || 'Activate-demo-2026!';
  if (!clientId || !secret) throw new Error('WORKOS_CLIENT_ID and WORKOS_API_KEY are required');
  const res = http.post(
    'https://api.workos.com/user_management/authenticate',
    JSON.stringify({ client_id: clientId, client_secret: secret, grant_type: 'password', email, password }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (res.status !== 200) throw new Error(`WorkOS password grant failed: ${res.status} ${res.body}`);
  return { token: JSON.parse(res.body).access_token };
}

function headers(token) {
  return { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
}

function timedGet(token, path) {
  const res = http.get(`${API}${path}`, headers(token));
  readLatency.add(res.timings.duration);
  check(res, { [`${path} 200`]: (r) => r.status === 200 });
  return res;
}

export function browse(data) {
  timedGet(data.token, '/api/auth/me');
  timedGet(data.token, '/api/ladder/me');
  timedGet(data.token, '/api/exercises');
  timedGet(data.token, '/api/library');
  timedGet(data.token, '/api/history');
  sleep(Math.random() * 2 + 1);
}

export function submit(data) {
  const list = http.get(`${API}/api/exercises`, headers(data.token));
  if (list.status !== 200) {
    submitOk.add(false);
    sleep(2);
    return;
  }
  const exercises = JSON.parse(list.body);
  const items = Array.isArray(exercises) ? exercises : exercises.items || exercises.exercises || [];
  const candidate = items.find((e) => e.status === 'active' || e.status === 'queued');
  if (!candidate) {
    sleep(2);
    return;
  }
  http.post(`${API}/api/exercises/${candidate.id}/start`, '{}', headers(data.token));
  // The exercise's own kind decides the artifact type; `text` is accepted for any practice except review.
  const kind = (candidate.practice && candidate.practice.kind) || candidate.kind || 'prompt';
  const type = kind === 'review' ? 'review' : kind === 'prompt' ? 'prompt_run' : ['project', 'skill', 'workflow'].includes(kind) ? kind : 'text';
  const body = JSON.stringify({
    artifact: {
      type,
      content:
        'Draft a clear request to Claude for the RMD letter, stating the client facts, the tone, and what a good answer must include. Then check the draft against the firm policy before sending.',
      output: 'Dear client, your required minimum distribution for this year is…',
      ...(type === 'review' ? { score10: 7, notes: 'Clear, but the deadline is missing.' } : {}),
    },
  });
  const res = http.post(`${API}/api/exercises/${candidate.id}/submit`, body, { ...headers(data.token), timeout: '120s' });
  submitLatency.add(res.timings.duration);
  const ok = res.status === 200 || res.status === 201;
  submitOk.add(ok);
  check(res, { 'submit 2xx': () => ok });
  sleep(3);
}
