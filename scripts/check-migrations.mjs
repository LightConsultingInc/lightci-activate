#!/usr/bin/env node
/**
 * Within a major version, migrations are additive only, so the previous minor runs against the
 * newer schema and a rollback never needs a database restore. This check fails a change that
 * drops or renames tables or columns, or adds NOT NULL without a default, unless the pull request
 * carries the `major-release` label (passed as --allow-destructive).
 *
 *   node scripts/check-migrations.mjs [--base origin/main] [--allow-destructive]
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const base = opt('base', 'origin/main');
const allowDestructive = flag('allow-destructive');

const DESTRUCTIVE = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bRENAME\s+(COLUMN|TO)\b/i,
  /\bALTER\s+COLUMN\s+"?\w+"?\s+SET\s+NOT\s+NULL\b/i,
  /\bALTER\s+COLUMN\s+"?\w+"?\s+TYPE\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
];
// `ADD "col" type NOT NULL` without DEFAULT breaks existing rows; with DEFAULT it is fine.
const ADD_NOT_NULL = /\bADD\s+"?\w+"?\s+[^,;]*?\bNOT\s+NULL\b(?![^;]*\bDEFAULT\b)/i;

let changed;
try {
  changed = execSync(`git diff --name-only --diff-filter=AM ${base}...HEAD -- api/src/database/migrations`, { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
} catch (e) {
  console.error(`could not diff against ${base}: ${e.message}`);
  process.exit(2);
}

const problems = [];
for (const file of changed) {
  const text = readFileSync(file, 'utf8');
  // Only the `up` migration matters; `down` is allowed to be destructive.
  const upStart = text.indexOf('async up(');
  const downStart = text.indexOf('async down(');
  const up = upStart >= 0 ? text.slice(upStart, downStart > upStart ? downStart : undefined) : text;
  for (const re of [...DESTRUCTIVE, ADD_NOT_NULL]) {
    const m = up.match(re);
    if (m) problems.push({ file, statement: m[0].slice(0, 80) });
  }
}

if (problems.length === 0) {
  console.log(`check-migrations: ${changed.length} migration file(s) changed, all additive`);
  process.exit(0);
}
for (const p of problems) console.error(`${allowDestructive ? 'allowed' : 'blocked'}: ${p.file}: ${p.statement}`);
if (allowDestructive) {
  console.log('check-migrations: destructive statements allowed for a major release');
  process.exit(0);
}
console.error('\nDestructive migrations break rollback within a major. Add a DEFAULT, keep the old column, or label the PR `major-release`.');
process.exit(1);
