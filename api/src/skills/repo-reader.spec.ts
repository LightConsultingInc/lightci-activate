import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { diffSummary } from './git-repo.service';
import { composeSkillMd, isGitRepo, parseFrontmatter, readRepoSkills, readTree, resolveRepoPath } from './repo-reader';

/** The demo marketplace repo, two levels up from api/src/skills. */
export const MARKETPLACE_SRC = resolve(__dirname, '../../../marketplace');

/** Copy the real marketplace (including .git) into a temp dir so tests never touch the source. */
export function copyMarketplace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'activate-marketplace-'));
  cpSync(MARKETPLACE_SRC, dir, { recursive: true });
  // other agents may have uncommitted work in the source tree; test against committed HEAD of main
  execSync('git checkout -q main -- . && git clean -fdq', { cwd: dir, stdio: 'ignore' });
  return dir;
}

describe('parseFrontmatter', () => {
  it('splits YAML frontmatter from the body and keeps nested metadata', () => {
    const md = '---\nname: advisor-meeting-prep\ndescription: Build the brief. Use when asked. Do not use for prospects.\nmetadata:\n  activate-id: advisor-meeting-prep\n  activate-version: "2"\n  activate-owner: daniel.okafor@meridianwealth.demo\n---\n\n# Advisor meeting prep\n\nBody.';
    const fm = parseFrontmatter(md)!;
    expect(fm.data.name).toBe('advisor-meeting-prep');
    expect((fm.data.metadata as Record<string, string>)['activate-version']).toBe('2');
    expect(fm.body.trim()).toMatch(/^# Advisor meeting prep/);
  });

  it('returns null without fences or with invalid YAML', () => {
    expect(parseFrontmatter('# no frontmatter')).toBeNull();
    expect(parseFrontmatter('---\n: : :\n  - [\n---\nbody')).toBeNull();
    expect(parseFrontmatter('---\n- just a list\n---\nbody')).toBeNull();
  });

  it('composeSkillMd round-trips through parseFrontmatter', () => {
    const md = composeSkillMd({ name: 'x-skill', description: 'Use when X. Do not use for Y: it\'s "quoted".', metadata: { 'activate-id': 'x-skill', 'activate-version': '1', 'activate-owner': 'a@b.demo' } }, '# X\n\nBody');
    const fm = parseFrontmatter(md)!;
    expect(fm.data.name).toBe('x-skill');
    expect(fm.data.description).toBe('Use when X. Do not use for Y: it\'s "quoted".');
    expect((fm.data.metadata as Record<string, string>)['activate-owner']).toBe('a@b.demo');
    expect(fm.body.trim()).toBe('# X\n\nBody');
  });
});

describe('resolveRepoPath', () => {
  it('resolves relative paths against the api cwd and leaves absolute ones alone', () => {
    expect(resolveRepoPath('../marketplace', '/x/api')).toBe('/x/marketplace');
    expect(resolveRepoPath('/abs/repo', '/x/api')).toBe('/abs/repo');
    expect(resolveRepoPath(undefined)).toBeNull();
  });
});

describe('readRepoSkills against the demo marketplace', () => {
  let dir: string;
  beforeAll(() => {
    dir = copyMarketplace();
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('the demo repo exists and is a git repo', () => {
    expect(existsSync(join(dir, '.claude-plugin/marketplace.json'))).toBe(true);
    expect(isGitRepo(dir)).toBe(true);
  });

  it('reads every plugin and skill on main with frontmatter, manifest, boundary and cases', () => {
    const tree = readTree(dir);
    expect(tree.plugins.sort()).toEqual(['cso-operations', 'fp-meeting-prep', 'shared', 'wa-client-comms']);
    expect(tree.skills.map((s) => s.slug).sort()).toEqual([
      'advisor-meeting-prep', 'annual-review-deck-outline', 'attestation-summary', 'client-followup-notes', 'crm-note-cleanup',
      'ips-refresh-checklist', 'onboarding-packet-qa', 'proposal-assembly', 'rebalancing-exception-memo', 'rmd-letter-draft',
    ]);
    expect(tree.warnings).toEqual([]);
    for (const s of tree.skills) {
      expect(s.triggerLine).toMatch(/Use when/);
      expect(s.triggerLine).toMatch(/Do not use/);
      expect(s.manifest.id).toBe(s.slug);
      expect(s.ownerIdentity).toMatch(/@meridianwealth\.demo$/);
      expect(s.boundary.mayRead.length).toBeGreaterThan(0);
      expect(s.boundary.mustNeverReceive.length).toBeGreaterThan(0);
      expect(s.sampleCases).toHaveLength(4);
      expect(new Set(s.sampleCases.map((c) => c.shouldTrigger))).toEqual(new Set(['yes', 'no', 'ambiguous']));
      expect(s.repoPath).toBe(`plugins/${s.plugin}/skills/${s.slug}`);
    }
    const prep = tree.skills.find((s) => s.slug === 'advisor-meeting-prep')!;
    expect(prep.name).toBe('Advisor meeting prep');
    expect(prep.plugin).toBe('fp-meeting-prep');
    expect(prep.teamSlug).toBe('fp');
    expect(prep.family).toBe('meeting-prep');
    expect(prep.rungRequired).toBe(1);
    expect(prep.status).toBe('published');
    expect(prep.boundary.humanReview).toEqual(['before_client_meeting']);
    const deck = tree.skills.find((s) => s.slug === 'annual-review-deck-outline')!;
    expect(deck.rungRequired).toBe(2);
    const dep = tree.skills.find((s) => s.slug === 'crm-note-cleanup')!;
    expect(dep.status).toBe('deprecated');
    expect(dep.successor).toBe('client-followup-notes');
    expect(dep.plugin).toBe('shared');
    expect(dep.teamSlug).toBe('shared');
  });

  it('reads versions from <slug>@vN tags with commit sha, author and changelog', async () => {
    const read = await readRepoSkills(dir);
    expect(read.isGit).toBe(true);
    expect(read.branch).toBe('main');
    expect(read.head).toMatch(/^[0-9a-f]{40}$/);
    expect(read.dirty).toBe(false);
    const followup = read.skills.find((s) => s.slug === 'client-followup-notes')!;
    expect(followup.versions.map((v) => v.tag)).toEqual(['client-followup-notes@v1', 'client-followup-notes@v2']);
    expect(followup.versions[0].skillMd).not.toContain('SALESFORCE NOTE');
    expect(followup.versions[1].skillMd).toContain('SALESFORCE NOTE');
    expect(followup.versions[1].skillMd).toBe(followup.skillMd);
    expect(followup.versions[1].authorEmail).toBe('sofia.alvarez@meridianwealth.demo');
    expect(followup.versions[1].changelog).toMatch(/Salesforce activity note/);
    expect(followup.versions[1].manifest?.boundary.human_review).toEqual(['before_send', 'before_crm_entry']);
    expect(followup.versions[0].manifest?.boundary.human_review).toEqual(['before_send']);
    const rmd = read.skills.find((s) => s.slug === 'rmd-letter-draft')!;
    expect(rmd.versions).toHaveLength(1);
    expect(rmd.versions[0].commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(rmd.headSha).toBe(rmd.versions[0].commitSha);
    const dep = read.skills.find((s) => s.slug === 'crm-note-cleanup')!;
    expect(dep.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(dep.versions[0].manifest?.status).toBe('published');
    expect(dep.versions[1].manifest?.status).toBe('deprecated');
  });

  it('a non-git folder still reads as a tree', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'activate-plain-'));
    try {
      cpSync(join(dir, 'plugins'), join(plain, 'plugins'), { recursive: true });
      const read = await readRepoSkills(plain);
      expect(read.isGit).toBe(false);
      expect(read.skills).toHaveLength(10);
      expect(read.skills.every((s) => s.versions.length === 0)).toBe(true);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});

describe('diffSummary', () => {
  it('counts added and removed lines and names changed sections', () => {
    const prev = '# A\n\n## Steps\n\n1. one\n2. two\n\n## Boundaries\n\n- x\n';
    const cur = '# A\n\n## Steps\n\n1. one\n2. two\n3. three\n\n## Boundaries\n\n- y\n';
    const d = diffSummary(prev, cur);
    expect(d).toMatchObject({ filesChanged: 1, additions: 2, deletions: 1 });
    expect(d.summary).toMatch(/sections changed: Steps, Boundaries/);
    expect(diffSummary(cur, cur)).toMatchObject({ filesChanged: 0, additions: 0, deletions: 0, summary: 'No content changes.' });
    expect(diffSummary(null, cur).summary).toMatch(/^New skill/);
  });
});
