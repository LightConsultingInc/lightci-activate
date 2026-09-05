#!/usr/bin/env node
/**
 * Marketplace validator. Run from the repo root: `node scripts/validate.mjs [--strict]`.
 *
 * Checks, per plugins/<plugin>/skills/<slug>/:
 *   - SKILL.md exists, has YAML frontmatter with `name` (== dir), a `description` that says
 *     when to use AND when not to, and governance `metadata` (activate-id/version/owner).
 *   - activate.yaml validates against schema/activate.schema.json (small built-in validator,
 *     no dependencies) and agrees with the frontmatter (id, owner).
 *   - Published skills carry a promotion block with grade_ref and >= 1 approver; skills that
 *     touch a restricted class carry a `compliance:` approver.
 *   - cases/cases.json has >= 3 cases covering yes / no / ambiguous.
 *   - Body sections: When to use, Inputs, Steps, Output format, Boundaries, Examples.
 *   - No bundled scripts, hidden files or prompt-injection patterns inside a skill dir.
 * Repo-level: marketplace.json lists every plugin dir, plugin.json exists for each.
 * Exits 1 on any error. Warnings never fail the run unless --strict.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parse as parseYaml } from './mini-yaml.mjs';

const ROOT = process.cwd();
const STRICT = process.argv.includes('--strict');
const RESTRICTED = ['client_pii_documents', 'account_numbers', 'ssn', 'statements_raw'];
const REQUIRED_SECTIONS = ['## When to use', '## Inputs', '## Steps', '## Output format', '## Boundaries', '## Examples'];
/** Plugins shipped by Activate itself (not authored through the promotion queue): SKILL.md is linted, no manifest or cases required. */
const ACTIVATE_OWNED_PLUGINS = ['activate-coach'];
const DENY_KEYS = ['hooks', 'allowed-tools', 'api_key', 'apiKey', 'secret', 'token', 'password'];
const INJECTION = [/ignore (all )?previous instructions/i, /disregard (the )?system prompt/i, /<\s*script/i, /\bcurl\s+https?:\/\//i];

const errors = [];
const warnings = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warnings.push(`${f}: ${m}`);

// ---------- tiny JSON-schema validator (subset: type, required, properties, additionalProperties,
// enum, const, pattern, minLength, minItems, uniqueItems, items, $ref (#/$defs), allOf, if/then, format:date-time)
function validate(schema, value, path, root, out) {
  if (schema.$ref) {
    const target = schema.$ref.replace('#/', '').split('/').reduce((o, k) => o?.[k], root);
    return validate(target, value, path, root, out);
  }
  if (schema.type) {
    const t = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    if (t !== schema.type) { out.push(`${path}: expected ${schema.type}, got ${t}`); return; }
  }
  if (schema.enum && !schema.enum.includes(value)) out.push(`${path}: "${value}" not in [${schema.enum.join(', ')}]`);
  if (schema.const !== undefined && value !== schema.const) out.push(`${path}: expected ${schema.const}`);
  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) out.push(`${path}: "${value}" does not match ${schema.pattern}`);
  if (schema.minLength && typeof value === 'string' && value.length < schema.minLength) out.push(`${path}: shorter than ${schema.minLength}`);
  if (schema.format === 'date-time' && typeof value === 'string' && Number.isNaN(Date.parse(value))) out.push(`${path}: not a date-time`);
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) out.push(`${path}: needs at least ${schema.minItems} items`);
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) out.push(`${path}: duplicate items`);
    if (schema.items) value.forEach((v, i) => validate(schema.items, v, `${path}[${i}]`, root, out));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const r of schema.required ?? []) if (!(r in value)) out.push(`${path}: missing required "${r}"`);
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties?.[k]) validate(schema.properties[k], v, `${path}.${k}`, root, out);
      else if (schema.additionalProperties === false && schema.properties) out.push(`${path}: unexpected key "${k}"`);
    }
  }
  for (const sub of schema.allOf ?? []) validate(sub, value, path, root, out);
  if (schema.if) {
    const probe = [];
    validate(schema.if, value, path, root, probe);
    if (probe.length === 0 && schema.then) validate(schema.then, value, path, root, out);
  }
}

function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  return { data: parseYaml(m[1]), body: m[2] };
}

const schema = JSON.parse(readFileSync(join(ROOT, 'schema/activate.schema.json'), 'utf8'));
const marketplace = JSON.parse(readFileSync(join(ROOT, '.claude-plugin/marketplace.json'), 'utf8'));
const listedPlugins = new Set(marketplace.plugins.map((p) => p.name));
const pluginsDir = join(ROOT, 'plugins');
const pluginDirs = readdirSync(pluginsDir).filter((d) => statSync(join(pluginsDir, d)).isDirectory());

let skillCount = 0;
const triggerLines = [];
for (const plugin of pluginDirs) {
  const pdir = join(pluginsDir, plugin);
  if (!listedPlugins.has(plugin)) err(`plugins/${plugin}`, 'not listed in .claude-plugin/marketplace.json');
  const activateOwned = ACTIVATE_OWNED_PLUGINS.includes(plugin);
  if (!existsSync(join(pdir, '.claude-plugin/plugin.json'))) (activateOwned ? warn : err)(`plugins/${plugin}`, 'missing .claude-plugin/plugin.json');
  else {
    const pj = JSON.parse(readFileSync(join(pdir, '.claude-plugin/plugin.json'), 'utf8'));
    if (pj.name !== plugin) err(`plugins/${plugin}/.claude-plugin/plugin.json`, `name "${pj.name}" != dir`);
  }
  const skillsDir = join(pdir, 'skills');
  if (!existsSync(skillsDir)) continue;
  for (const slug of readdirSync(skillsDir).filter((d) => statSync(join(skillsDir, d)).isDirectory())) {
    skillCount++;
    const sdir = join(skillsDir, slug);
    const rel = `plugins/${plugin}/skills/${slug}`;
    // hygiene
    for (const f of readdirSync(sdir)) {
      if (f.startsWith('.')) err(rel, `hidden file ${f} not allowed`);
      if (/\.(sh|py|js|mjs|ts|exe|bat|ps1)$/.test(f)) err(rel, `bundled script ${f} not allowed`);
    }
    const mdPath = join(sdir, 'SKILL.md');
    if (!existsSync(mdPath)) { err(rel, 'missing SKILL.md'); continue; }
    const md = readFileSync(mdPath, 'utf8');
    const fm = frontmatter(md);
    if (!fm) { err(rel, 'SKILL.md has no YAML frontmatter'); continue; }
    const { data, body } = fm;
    if (data.name !== slug) err(rel, `frontmatter name "${data.name}" != dir "${slug}"`);
    if (typeof data.description !== 'string' || data.description.length < 80) err(rel, 'description too short to be a trigger line');
    else {
      triggerLines.push({ rel, text: data.description });
      if (!/\bUse when\b/.test(data.description)) warn(rel, 'description should say when to use ("Use when ...")');
      if (!/\b(Do not use|Not for|Do not)\b/.test(data.description)) warn(rel, 'description should say when not to use ("Do not use ...")');
      if (data.description.length > 1024) warn(rel, 'description over 1024 chars (Anthropic upload limit)');
    }
    for (const k of Object.keys(data)) if (DENY_KEYS.includes(k)) err(rel, `frontmatter key "${k}" is denied`);
    for (const rx of INJECTION) if (rx.test(body)) err(rel, `injection pattern ${rx} in body`);
    if (activateOwned) {
      warn(rel, 'Activate-owned plugin: manifest and cases not required');
      continue;
    }
    const meta = data.metadata ?? {};
    if (meta['activate-id'] !== slug) err(rel, 'metadata.activate-id must equal the slug');
    if (!meta['activate-version']) err(rel, 'metadata.activate-version missing');
    if (!meta['activate-owner']) err(rel, 'metadata.activate-owner missing');
    for (const s of REQUIRED_SECTIONS) if (!body.includes(s)) err(rel, `body missing section "${s}"`);
    if (body.length > 12000) warn(rel, 'body over 12k chars; consider progressive disclosure (move references to linked files)');
    const exampleCount = (body.match(/^### Example/gm) ?? []).length;
    if (exampleCount < 2) warn(rel, `only ${exampleCount} canonical example(s); two expected`);
    if (exampleCount > 4) warn(rel, `${exampleCount} examples reads like an edge-case list`);

    const yPath = join(sdir, 'activate.yaml');
    if (!existsSync(yPath)) { err(rel, 'missing activate.yaml'); continue; }
    let manifest;
    try { manifest = parseYaml(readFileSync(yPath, 'utf8')); } catch (e) { err(rel, `activate.yaml unparsable: ${e.message}`); continue; }
    const out = [];
    validate(schema, manifest, 'activate.yaml', schema, out);
    out.forEach((m) => err(rel, m));
    if (manifest.id !== slug) err(rel, `activate.yaml id "${manifest.id}" != dir`);
    if (manifest.owner !== meta['activate-owner']) err(rel, 'activate.yaml owner != metadata.activate-owner');
    if (manifest.team !== 'shared' && !plugin.startsWith(manifest.team + '-') && plugin !== 'shared') warn(rel, `team "${manifest.team}" does not match plugin "${plugin}"`);
    const touches = (manifest.boundary?.may_read ?? []).filter((c) => RESTRICTED.includes(c));
    if (touches.length) {
      const approvers = manifest.promotion?.approved_by ?? [];
      if (manifest.status === 'published' && !approvers.some((a) => String(a).startsWith('compliance:'))) err(rel, `reads restricted classes [${touches}] without a compliance approver`);
    }
    const undeclared = RESTRICTED.filter((c) => !(manifest.boundary?.must_never_receive ?? []).includes(c) && body.toLowerCase().includes(c.replace(/_/g, ' ')));
    if (undeclared.length) warn(rel, `body mentions [${undeclared}] but must_never_receive does not declare them (boundary gap)`);
    if (manifest.status === 'deprecated' && manifest.successor) {
      const found = pluginDirs.some((p) => existsSync(join(pluginsDir, p, 'skills', manifest.successor)));
      if (!found) err(rel, `successor "${manifest.successor}" not found in any plugin`);
    }

    const cPath = join(sdir, 'cases/cases.json');
    if (!existsSync(cPath)) { err(rel, 'missing cases/cases.json'); continue; }
    let cases;
    try { cases = JSON.parse(readFileSync(cPath, 'utf8')); } catch (e) { err(rel, `cases.json unparsable: ${e.message}`); continue; }
    if (!Array.isArray(cases) || cases.length < 3) err(rel, 'cases.json needs at least 3 cases');
    else {
      const kinds = new Set(cases.map((c) => c.shouldTrigger));
      for (const k of ['yes', 'no', 'ambiguous']) if (!kinds.has(k)) err(rel, `cases.json missing a "${k}" case`);
      cases.forEach((c, i) => { if (!c.input || !c.expected) err(rel, `cases.json[${i}] needs input and expected`); });
    }
  }
}
// overlapping triggers (Jaccard on tokens)
const tok = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3));
for (let i = 0; i < triggerLines.length; i++) for (let j = i + 1; j < triggerLines.length; j++) {
  const a = tok(triggerLines[i].text), b = tok(triggerLines[j].text);
  const inter = [...a].filter((w) => b.has(w)).length;
  const jac = inter / (a.size + b.size - inter);
  if (jac > 0.6) warn(triggerLines[i].rel, `trigger overlaps ${triggerLines[j].rel} (Jaccard ${jac.toFixed(2)})`);
}
for (const p of listedPlugins) if (!pluginDirs.includes(p)) err('.claude-plugin/marketplace.json', `lists plugin "${p}" with no directory`);

console.log(`Checked ${pluginDirs.length} plugins, ${skillCount} skills.`);
warnings.forEach((w) => console.log(`WARN  ${w}`));
errors.forEach((e) => console.log(`ERROR ${e}`));
if (errors.length || (STRICT && warnings.length)) { console.log(`\n${errors.length} error(s), ${warnings.length} warning(s).`); process.exit(1); }
console.log(`OK. ${warnings.length} warning(s).`);
