import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { simpleGit } from 'simple-git';
import { GitRepoService, diffSummary } from './git-repo.service';
import {
  composeSkillMd,
  isGitRepo,
  parseFrontmatter,
  readRepoSkills,
  readTree,
  resolveRepoPath,
} from './repo-reader';

/** The demo marketplace repo, two levels up from api/src/skills. */
export const MARKETPLACE_SRC = resolve(__dirname, '../../../marketplace');

/** The ten governed skills seeded on main plus the in-review draft (fee-change-comms). */
export const SEEDED_SLUGS = [
  'advisor-meeting-prep',
  'annual-review-deck-outline',
  'attestation-summary',
  'client-followup-notes',
  'crm-note-cleanup',
  'fee-change-comms',
  'ips-refresh-checklist',
  'onboarding-packet-qa',
  'proposal-assembly',
  'rebalancing-exception-memo',
  'rmd-letter-draft',
];

/** Warnings about skills Activate does not govern (e.g. the coach agent's plugin) are expected. */
export const governedWarnings = (w: string[]) =>
  w.filter((x) => !x.includes('activate-coach'));

/** Copy the plain-file marketplace (no .git in the monorepo) into a temp dir so tests never touch the source. */
export function copyMarketplace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'activate-marketplace-'));
  cpSync(MARKETPLACE_SRC, dir, {
    recursive: true,
    filter: (src) => !src.includes('/.git/') && !src.endsWith('/.git'),
  });
  return dir;
}

/** Any org id works for the shared local marketplace; specs use one constant. */
export const ORG = '00000000-0000-4000-8000-000000000001';

/** Point GitRepoService at a folder and let ensureRepo() initialise it. */
export async function repoFor(dir: string): Promise<GitRepoService> {
  process.env.LIBRARY_REPO_PATH = dir;
  delete process.env.GITHUB_TOKEN;
  delete process.env.LIBRARY_PROVIDER;
  const git = new GitRepoService();
  expect(await git.ensureRepo(ORG)).toBe(true);
  return git;
}

describe('parseFrontmatter', () => {
  it('splits YAML frontmatter from the body and keeps nested metadata', () => {
    const md =
      '---\nname: advisor-meeting-prep\ndescription: Build the brief. Use when asked. Do not use for prospects.\nmetadata:\n  activate-id: advisor-meeting-prep\n  activate-version: "2"\n  activate-owner: daniel.okafor@meridianwealth.demo\n---\n\n# Advisor meeting prep\n\nBody.';
    const fm = parseFrontmatter(md)!;
    expect(fm.data.name).toBe('advisor-meeting-prep');
    expect(
      (fm.data.metadata as Record<string, string>)['activate-version'],
    ).toBe('2');
    expect(fm.body.trim()).toMatch(/^# Advisor meeting prep/);
  });

  it('returns null without fences or with invalid YAML', () => {
    expect(parseFrontmatter('# no frontmatter')).toBeNull();
    expect(parseFrontmatter('---\n: : :\n  - [\n---\nbody')).toBeNull();
    expect(parseFrontmatter('---\n- just a list\n---\nbody')).toBeNull();
  });

  it('composeSkillMd round-trips through parseFrontmatter', () => {
    const md = composeSkillMd(
      {
        name: 'x-skill',
        description: 'Use when X. Do not use for Y: it\'s "quoted".',
        metadata: {
          'activate-id': 'x-skill',
          'activate-version': '1',
          'activate-owner': 'a@b.demo',
        },
      },
      '# X\n\nBody',
    );
    const fm = parseFrontmatter(md)!;
    expect(fm.data.name).toBe('x-skill');
    expect(fm.data.description).toBe(
      'Use when X. Do not use for Y: it\'s "quoted".',
    );
    expect((fm.data.metadata as Record<string, string>)['activate-owner']).toBe(
      'a@b.demo',
    );
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
  beforeAll(async () => {
    dir = copyMarketplace();
    expect(isGitRepo(dir)).toBe(false); // plain files in the monorepo
    await repoFor(dir);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('ensureRepo turns the plain folder into a repo on main with one import commit and a tag per skill; idempotent', async () => {
    expect(existsSync(join(dir, '.claude-plugin/marketplace.json'))).toBe(true);
    expect(isGitRepo(dir)).toBe(true);
    const g = simpleGit(dir);
    expect((await g.revparse(['--abbrev-ref', 'HEAD'])).trim()).toBe('main');
    expect((await g.status()).isClean()).toBe(true);
    const log = await g.log();
    expect(log.total).toBe(1);
    expect(log.latest?.message).toBe('Initial marketplace import');
    expect(log.latest?.author_email).toBe('activate@lightci.com');
    expect((await g.getConfig('user.name', 'local')).value).toBe(
      'Activate Bot',
    );
    const tags = (await g.tags()).all.sort();
    expect(tags).toEqual(
      expect.arrayContaining([
        'advisor-meeting-prep@v2',
        'client-followup-notes@v2',
        'crm-note-cleanup@v2',
        'fee-change-comms@v1',
        'rmd-letter-draft@v1',
      ]),
    );
    expect(
      tags.filter((t) => SEEDED_SLUGS.some((slug) => t.startsWith(`${slug}@`))),
    ).toHaveLength(11);
    const again = new GitRepoService();
    expect(await again.ensureRepo(ORG)).toBe(true);
    expect((await g.log()).total).toBe(1);
  });

  it('when the source folder is nested in another git work tree, ensureRepo mirrors to a work dir instead of nesting a repo', async () => {
    const outer = mkdtempSync(join(tmpdir(), 'activate-outer-'));
    const work = join(
      mkdtempSync(join(tmpdir(), 'activate-work-')),
      'marketplace-work',
    );
    try {
      await simpleGit(outer).init(['-b', 'main']);
      const source = join(outer, 'marketplace');
      cpSync(MARKETPLACE_SRC, source, {
        recursive: true,
        filter: (src) => !src.includes('/.git/') && !src.endsWith('/.git'),
      });
      process.env.LIBRARY_REPO_PATH = source;
      process.env.LIBRARY_WORK_DIR = work;
      const git = new GitRepoService();
      expect(await git.ensureRepo(ORG)).toBe(true);
      const repo = await git.repoFor(ORG);
      expect(repo.mode).toBe('nested');
      expect(repo.workDir).toBe(work);
      expect(repo.path).toBe(work);
      expect(isGitRepo(source)).toBe(false); // nothing initialised inside the outer work tree
      expect(isGitRepo(work)).toBe(true);
      expect((await simpleGit(work).tags()).all).toContain(
        'advisor-meeting-prep@v2',
      );
      expect(
        readTree(work)
          .skills.map((s) => s.slug)
          .sort(),
      ).toEqual(SEEDED_SLUGS);
      // a second instance reuses the work dir without re-mirroring (API-made commits persist)
      const res = await git.publish(
        ORG,
        'rmd-letter-draft',
        {
          'plugins/fp-meeting-prep/skills/rmd-letter-draft/NOTE.md':
            'persisted\n',
        },
        'test commit',
        { name: 'T', email: 't@x' },
        'rmd-letter-draft@v9',
      );
      expect(res?.sha).toMatch(/^[0-9a-f]{40}$/);
      const again = new GitRepoService();
      expect(await again.ensureRepo(ORG)).toBe(true);
      expect((await again.repoFor(ORG)).path).toBe(work);
      expect(
        existsSync(
          join(work, 'plugins/fp-meeting-prep/skills/rmd-letter-draft/NOTE.md'),
        ),
      ).toBe(true);
      expect(
        existsSync(
          join(
            source,
            'plugins/fp-meeting-prep/skills/rmd-letter-draft/NOTE.md',
          ),
        ),
      ).toBe(false);
    } finally {
      delete process.env.LIBRARY_WORK_DIR;
      process.env.LIBRARY_REPO_PATH = dir;
      rmSync(outer, { recursive: true, force: true });
      rmSync(dirname(work), { recursive: true, force: true });
    }
  });

  it('reads every plugin and skill on main with frontmatter, manifest, boundary and cases', () => {
    const tree = readTree(dir);
    expect(tree.plugins).toEqual(
      expect.arrayContaining([
        'cso-operations',
        'fp-meeting-prep',
        'shared',
        'wa-client-comms',
      ]),
    );
    expect(tree.skills.map((s) => s.slug).sort()).toEqual(SEEDED_SLUGS);
    expect(governedWarnings(tree.warnings)).toEqual([]);
    for (const s of tree.skills) {
      expect(s.triggerLine).toMatch(/Use when/);
      expect(s.triggerLine).toMatch(/Do not use/);
      expect(s.manifest.id).toBe(s.slug);
      expect(s.ownerIdentity).toMatch(/@meridianwealth\.demo$/);
      expect(s.boundary.mayRead.length).toBeGreaterThan(0);
      expect(s.boundary.mustNeverReceive.length).toBeGreaterThan(0);
      expect(s.sampleCases).toHaveLength(4);
      expect(new Set(s.sampleCases.map((c) => c.shouldTrigger))).toEqual(
        new Set(['yes', 'no', 'ambiguous']),
      );
      expect(s.repoPath).toBe(`plugins/${s.plugin}/skills/${s.slug}`);
    }
    const prep = tree.skills.find((s) => s.slug === 'advisor-meeting-prep')!;
    expect(prep.name).toBe('Advisor meeting prep');
    expect(prep.plugin).toBe('fp-meeting-prep');
    expect(prep.teamSlug).toBe('fp');
    expect(prep.family).toBe('meeting-prep');
    expect(prep.rungRequired).toBe(1);
    expect(prep.declaredVersion).toBe(2);
    expect(prep.status).toBe('published');
    expect(prep.boundary.humanReview).toEqual(['before_client_meeting']);
    expect(
      tree.skills.find((s) => s.slug === 'annual-review-deck-outline')!
        .rungRequired,
    ).toBe(2);
    expect(
      tree.skills.find((s) => s.slug === 'rmd-letter-draft')!.declaredVersion,
    ).toBe(1);
    const fee = tree.skills.find((s) => s.slug === 'fee-change-comms')!;
    expect(fee).toMatchObject({
      status: 'in_review',
      plugin: 'wa-client-comms',
      teamSlug: 'wa',
      ownerIdentity: 'marcus.reid@meridianwealth.demo',
      declaredVersion: 1,
    });
    const dep = tree.skills.find((s) => s.slug === 'crm-note-cleanup')!;
    expect(dep).toMatchObject({
      status: 'deprecated',
      successor: 'client-followup-notes',
      plugin: 'shared',
      teamSlug: 'shared',
      declaredVersion: 2,
    });
  });

  it('reads one version per skill from the import tags (<slug>@v<activate-version>)', async () => {
    const read = await readRepoSkills(dir);
    expect(read.isGit).toBe(true);
    expect(read.branch).toBe('main');
    expect(read.head).toMatch(/^[0-9a-f]{40}$/);
    expect(read.dirty).toBe(false);
    for (const s of read.skills) {
      expect(s.versions).toHaveLength(1);
      expect(s.versions[0]).toMatchObject({
        version: s.declaredVersion,
        tag: `${s.slug}@v${s.declaredVersion}`,
        skillMd: s.skillMd,
        authorEmail: 'activate@lightci.com',
        changelog: 'Initial marketplace import',
      });
      expect(s.versions[0].commitSha).toBe(read.head);
      expect(s.headSha).toBe(read.head);
    }
    const followup = read.skills.find(
      (s) => s.slug === 'client-followup-notes',
    )!;
    expect(followup.versions[0].tag).toBe('client-followup-notes@v2');
    expect(followup.versions[0].skillMd).toContain('SALESFORCE NOTE');
    expect(followup.versions[0].manifest?.boundary.human_review).toEqual([
      'before_send',
      'before_crm_entry',
    ]);
    expect(
      read.skills.find((s) => s.slug === 'crm-note-cleanup')!.versions[0]
        .manifest?.status,
    ).toBe('deprecated');
  });

  it('a non-git folder still reads as a tree (versions fall back to the declared activate-version)', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'activate-plain-'));
    try {
      cpSync(join(dir, 'plugins'), join(plain, 'plugins'), { recursive: true });
      const read = await readRepoSkills(plain);
      expect(read.isGit).toBe(false);
      expect(read.skills).toHaveLength(11);
      expect(read.skills.every((s) => s.versions.length === 0)).toBe(true);
      expect(
        read.skills.find((s) => s.slug === 'advisor-meeting-prep')!
          .declaredVersion,
      ).toBe(2);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});

describe('diffSummary', () => {
  it('counts added and removed lines and names changed sections', () => {
    const prev = '# A\n\n## Steps\n\n1. one\n2. two\n\n## Boundaries\n\n- x\n';
    const cur =
      '# A\n\n## Steps\n\n1. one\n2. two\n3. three\n\n## Boundaries\n\n- y\n';
    const d = diffSummary(prev, cur);
    expect(d).toMatchObject({ filesChanged: 1, additions: 2, deletions: 1 });
    expect(d.summary).toMatch(/sections changed: Steps, Boundaries/);
    expect(diffSummary(cur, cur)).toMatchObject({
      filesChanged: 0,
      additions: 0,
      deletions: 0,
      summary: 'No content changes.',
    });
    expect(diffSummary(null, cur).summary).toMatch(/^New skill/);
  });
});
