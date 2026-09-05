/**
 * Reads a marketplace repo (plugins/<plugin>/skills/<slug>/{SKILL.md,activate.yaml,cases/cases.json})
 * into plain records. Filesystem for the working tree, simple-git for tags/commits. No database.
 * Unit-tested against a temp copy of the demo `marketplace/` repo.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { simpleGit } from 'simple-git';
import { parse as parseYaml } from 'yaml';
import type {
  ActivateManifest,
  BoundaryDeclaration,
  SampleCase,
  SkillStatus,
} from './entities/skill.entity';
import { rungFromLabel } from './skills.types';

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  body: string;
}

/** YAML frontmatter between the first `---` fences. Returns null when absent or unparsable. */
export function parseFrontmatter(md: string): ParsedFrontmatter | null {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  try {
    const data = parseYaml(m[1]);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return { data: data as Record<string, unknown>, body: m[2] ?? '' };
  } catch {
    return null;
  }
}

/** Compose a SKILL.md from frontmatter + body (used when Activate writes skills back to the repo). */
export function composeSkillMd(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  const yaml = stringifyFrontmatter(frontmatter);
  return `---\n${yaml}---\n\n${body.replace(/^\s+/, '')}`;
}

function stringifyFrontmatter(data: Record<string, unknown>): string {
  // Small, predictable serialiser: strings quoted only when needed, nested maps one level.
  const q = (v: unknown): string => {
    const s = String(v);
    return /^[A-Za-z0-9 _.,:;()\/'@-]+$/.test(s) &&
      !/^\d/.test(s) &&
      !['true', 'false', 'null'].includes(s)
      ? s
      : JSON.stringify(s);
  };
  const lines: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) lines.push(`${k}: [${v.map(q).join(', ')}]`);
    else if (typeof v === 'object') {
      lines.push(`${k}:`);
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>))
        lines.push(`  ${k2}: ${q(v2)}`);
    } else lines.push(`${k}: ${q(v)}`);
  }
  return lines.join('\n') + '\n';
}

export type RepoManifest = ActivateManifest & { family?: string };

export interface RepoSkillVersion {
  version: number;
  tag: string;
  commitSha: string;
  skillMd: string;
  manifest: RepoManifest | null;
  changelog: string;
  authorEmail: string | null;
  authorName: string | null;
  committedAt: string;
}

export interface RepoSkill {
  slug: string;
  plugin: string;
  /** SKILL.md metadata.activate-version (the version the current content claims to be); 1 when absent. */
  declaredVersion: number;
  /** Path relative to the repo root, e.g. plugins/fp-meeting-prep/skills/advisor-meeting-prep */
  repoPath: string;
  name: string;
  triggerLine: string;
  skillMd: string;
  frontmatter: Record<string, unknown>;
  manifest: RepoManifest;
  boundary: BoundaryDeclaration;
  sampleCases: SampleCase[];
  ownerIdentity: string;
  teamSlug: string;
  family: string | null;
  rungRequired: number;
  status: SkillStatus;
  successor: string | null;
  versions: RepoSkillVersion[];
  headSha: string | null;
}

export interface RepoRead {
  repoPath: string;
  plugins: string[];
  skills: RepoSkill[];
  warnings: string[];
  isGit: boolean;
  branch: string | null;
  head: string | null;
  dirty: boolean;
}

export function resolveRepoPath(
  p: string | undefined | null,
  cwd = process.cwd(),
): string | null {
  if (!p) return null;
  return isAbsolute(p) ? p : resolve(cwd, p);
}

export function isGitRepo(path: string): boolean {
  return existsSync(join(path, '.git'));
}

export function manifestToBoundary(
  manifest: Partial<RepoManifest> | null | undefined,
): BoundaryDeclaration {
  const b = manifest?.boundary ?? {
    may_read: [],
    must_never_receive: [],
    human_review: [],
  };
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  return {
    mayRead: arr(b.may_read),
    mustNeverReceive: arr(b.must_never_receive),
    humanReview: arr(b.human_review),
  };
}

export function boundaryToManifest(
  b: Partial<BoundaryDeclaration> | null | undefined,
): RepoManifest['boundary'] {
  return {
    may_read: b?.mayRead ?? [],
    must_never_receive: b?.mustNeverReceive ?? [],
    human_review: b?.humanReview ?? [],
  };
}

/** `metadata.activate-version` as a positive integer, else 1. */
export function declaredVersion(meta: Record<string, unknown> | null | undefined): number {
  const n = Number.parseInt(String(meta?.['activate-version'] ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

const VALID_STATUS: SkillStatus[] = [
  'draft',
  'in_review',
  'published',
  'deprecated',
];

function readCases(dir: string, warnings: string[], rel: string): SampleCase[] {
  const p = join(dir, 'cases', 'cases.json');
  if (!existsSync(p)) return [];
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((c) => c && typeof c.input === 'string')
      .map((c) => ({
        input: c.input,
        shouldTrigger: ['yes', 'no', 'ambiguous'].includes(c.shouldTrigger)
          ? c.shouldTrigger
          : 'ambiguous',
        expected: String(c.expected ?? ''),
      }));
  } catch (e) {
    warnings.push(`${rel}: cases.json unparsable (${(e as Error).message})`);
    return [];
  }
}

/** Parse one skill directory from the working tree (no git). */
export function readSkillDir(
  repoPath: string,
  plugin: string,
  slug: string,
  warnings: string[],
): RepoSkill | null {
  const rel = `plugins/${plugin}/skills/${slug}`;
  const dir = join(repoPath, rel);
  const mdPath = join(dir, 'SKILL.md');
  const yPath = join(dir, 'activate.yaml');
  if (!existsSync(mdPath)) {
    warnings.push(`${rel}: missing SKILL.md`);
    return null;
  }
  const skillMd = readFileSync(mdPath, 'utf8');
  const fm = parseFrontmatter(skillMd);
  if (!fm) {
    warnings.push(`${rel}: SKILL.md has no parsable frontmatter`);
    return null;
  }
  if (!existsSync(yPath)) {
    warnings.push(`${rel}: no activate.yaml (not governed by Activate); skipped`);
    return null;
  }
  let manifest: RepoManifest;
  try {
    manifest = (parseYaml(readFileSync(yPath, 'utf8')) ?? {}) as RepoManifest;
  } catch (e) {
    warnings.push(`${rel}: activate.yaml unparsable (${(e as Error).message}); skipped`);
    return null;
  }
  const meta = (fm.data.metadata ?? {}) as Record<string, unknown>;
  const id = String(manifest.id ?? meta['activate-id'] ?? fm.data.name ?? slug);
  if (id !== slug)
    warnings.push(
      `${rel}: manifest id "${id}" differs from directory; using directory name`,
    );
  const status = VALID_STATUS.includes(manifest.status)
    ? manifest.status
    : 'draft';
  const owner = String(manifest.owner ?? meta['activate-owner'] ?? '');
  // Human name: the first H1 in the body (frontmatter `name` is the slug per the plugin spec).
  const h1 = fm.body.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
  const name = h1 || (typeof fm.data.name === 'string' && fm.data.name ? fm.data.name : slug);
  const triggerLine =
    typeof fm.data.description === 'string' ? fm.data.description.trim() : '';
  if (!triggerLine)
    warnings.push(`${rel}: frontmatter description (trigger line) is empty`);
  return {
    slug,
    plugin,
    repoPath: rel,
    name,
    triggerLine,
    skillMd,
    frontmatter: fm.data,
    manifest: {
      ...manifest,
      id: slug,
      owner,
      status,
      sample_cases: manifest.sample_cases ?? 'cases/',
    },
    boundary: manifestToBoundary(manifest),
    sampleCases: readCases(dir, warnings, rel),
    ownerIdentity: owner,
    teamSlug: String(
      manifest.team ?? (plugin === 'shared' ? 'shared' : plugin.split('-')[0]),
    ),
    family: typeof manifest.family === 'string' ? manifest.family : null,
    rungRequired: rungFromLabel(manifest.rung_required, 1),
    declaredVersion: declaredVersion(meta),
    status,
    successor:
      typeof manifest.successor === 'string' ? manifest.successor : null,
    versions: [],
    headSha: null,
  };
}

/** Working-tree read (no git history). */
export function readTree(
  repoPath: string,
): Omit<RepoRead, 'isGit' | 'branch' | 'head' | 'dirty'> {
  const warnings: string[] = [];
  const skills: RepoSkill[] = [];
  const pluginsDir = join(repoPath, 'plugins');
  const plugins = existsSync(pluginsDir)
    ? readdirSync(pluginsDir).filter(
        (d) =>
          !d.startsWith('.') && statSync(join(pluginsDir, d)).isDirectory(),
      )
    : [];
  for (const plugin of plugins) {
    const skillsDir = join(pluginsDir, plugin, 'skills');
    if (!existsSync(skillsDir)) continue;
    for (const slug of readdirSync(skillsDir).filter(
      (d) => !d.startsWith('.') && statSync(join(skillsDir, d)).isDirectory(),
    )) {
      const s = readSkillDir(repoPath, plugin, slug, warnings);
      if (s) skills.push(s);
    }
  }
  return { repoPath, plugins, skills, warnings };
}

/** Full read: working tree + versions from `<slug>@vN` tags. */
export async function readRepoSkills(repoPath: string): Promise<RepoRead> {
  const tree = readTree(repoPath);
  if (!isGitRepo(repoPath))
    return { ...tree, isGit: false, branch: null, head: null, dirty: false };
  const git = simpleGit(repoPath);
  const [branch, head, status, tagsRaw] = await Promise.all([
    git.revparse(['--abbrev-ref', 'HEAD']).catch(() => null),
    git.revparse(['HEAD']).catch(() => null),
    git.status().catch(() => null),
    git.tags().catch(() => ({ all: [] as string[] })),
  ]);
  const tagsBySlug = new Map<string, { version: number; tag: string }[]>();
  for (const tag of tagsRaw.all) {
    const m = tag.match(/^(.+)@v(\d+)$/);
    if (!m) continue;
    const l = tagsBySlug.get(m[1]) ?? [];
    l.push({ version: Number(m[2]), tag });
    tagsBySlug.set(m[1], l);
  }
  for (const skill of tree.skills) {
    skill.headSha =
      (
        await git
          .raw(['log', '-1', '--format=%H', '--', skill.repoPath])
          .catch(() => '')
      ).trim() || head;
    const tags = (tagsBySlug.get(skill.slug) ?? []).sort(
      (a, b) => a.version - b.version,
    );
    for (const t of tags) {
      try {
        const sha = (await git.raw(['rev-list', '-n', '1', t.tag])).trim();
        const meta = (
          await git.raw(['log', '-1', '--format=%ae%n%an%n%aI%n%s', sha])
        ).split('\n');
        const md = await git
          .show([`${sha}:${skill.repoPath}/SKILL.md`])
          .catch(() => null);
        if (md === null) {
          tree.warnings.push(
            `${skill.repoPath}: tag ${t.tag} does not contain SKILL.md`,
          );
          continue;
        }
        let manifest: RepoManifest | null = null;
        const y = await git
          .show([`${sha}:${skill.repoPath}/activate.yaml`])
          .catch(() => null);
        if (y) {
          try {
            manifest = parseYaml(y) as RepoManifest;
          } catch {
            manifest = null;
          }
        }
        skill.versions.push({
          version: t.version,
          tag: t.tag,
          commitSha: sha,
          skillMd: md,
          manifest,
          changelog: meta[3]?.trim() || `${skill.slug} v${t.version}`,
          authorEmail: meta[0]?.trim() || null,
          authorName: meta[1]?.trim() || null,
          committedAt: meta[2]?.trim() || new Date().toISOString(),
        });
      } catch (e) {
        tree.warnings.push(
          `${skill.repoPath}: could not read tag ${t.tag} (${(e as Error).message})`,
        );
      }
    }
  }
  return {
    ...tree,
    isGit: true,
    branch,
    head,
    dirty: status ? !status.isClean() : false,
  };
}
