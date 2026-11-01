/**
 * The marketplace against a real remote (T2.4, T2.5): a bare repository stands in for the
 * customer's Git host, two GitRepoService instances with separate clone folders stand in for
 * two replicas, and the local Postgres from api/.env provides the cross-process lock.
 */
import 'dotenv/config';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { simpleGit } from 'simple-git';
import { DataSource } from 'typeorm';
import { GitRepoService } from '../../src/skills/git-repo.service';
import AppDataSource from '../../src/typeorm.config';

const ORG = '00000000-0000-4000-8000-00000000a0a0';
const MARKETPLACE_SRC = resolve(__dirname, '../../../marketplace');
const SKILL_DIR = 'plugins/fp-meeting-prep/skills/rmd-letter-draft';
const author = { name: 'Test Author', email: 'author@example.com' };

function walk(dir: string, fn: (p: string) => void) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, fn);
    fn(p);
  }
}

describe('GitRepoService against a remote', () => {
  const root = mkdtempSync(join(tmpdir(), 'activate-remote-'));
  const bare = join(root, 'remote.git');
  const remoteUrl = `file://${bare}`;
  const ds = new DataSource({ ...AppDataSource.options, migrationsRun: false });
  const saved = { ...process.env };
  let a: GitRepoService;
  let b: GitRepoService;

  const bareGit = () => simpleGit(bare);
  const instance = (clonesDir: string) => {
    process.env.LIBRARY_PROVIDER = 'git';
    process.env.LIBRARY_REMOTE_URL = remoteUrl;
    process.env.LIBRARY_CLONES_DIR = clonesDir;
    process.env.LIBRARY_WORK_DIR = join(root, 'unused-work');
    delete process.env.LIBRARY_REPO_PATH;
    return new GitRepoService(undefined, undefined, ds);
  };

  beforeAll(async () => {
    await ds.initialize();
    await simpleGit().init(['--bare', '-b', 'main', bare]);
    // Seed the remote with the demo marketplace, as a customer's repo would already hold content.
    const seed = join(root, 'seed');
    await simpleGit().clone(remoteUrl, seed);
    cpSync(MARKETPLACE_SRC, seed, {
      recursive: true,
      filter: (src) => !src.includes('/.git/') && !src.endsWith('/.git'),
    });
    const g = simpleGit(seed);
    await g.addConfig('user.name', 'Seed', false, 'local');
    await g.addConfig('user.email', 'seed@example.com', false, 'local');
    await g.checkout(['-B', 'main']);
    await g.add(['-A']);
    await g.commit('Customer marketplace');
    await g.push(['-u', 'origin', 'main']);
    a = instance(join(root, 'clones-a'));
    b = instance(join(root, 'clones-b'));
  }, 60_000);

  afterAll(async () => {
    process.env = saved;
    await ds.destroy();
    rmSync(root, { recursive: true, force: true });
  });

  it('clones the customer remote on first use', async () => {
    expect(await a.ensureRepo(ORG)).toBe(true);
    const repo = await a.repoFor(ORG);
    expect(repo.mode).toBe('clone');
    expect(repo.path).toBe(join(root, 'clones-a', ORG));
    expect(existsSync(join(repo.path!, SKILL_DIR, 'SKILL.md'))).toBe(true);
    expect(repo.label).toBe(remoteUrl);
  });

  it('a draft written on one replica is pushed as a branch to the remote', async () => {
    const res = await a.writeOnBranch(
      ORG,
      'rmd-letter-draft',
      { [`${SKILL_DIR}/DRAFT.md`]: 'draft from a\n' },
      'draft from a',
      author,
    );
    expect(res?.branch).toBe('skill/rmd-letter-draft');
    expect(res?.sha).toMatch(/^[0-9a-f]{40}$/);
    const onRemote = await bareGit().show([
      `skill/rmd-letter-draft:${SKILL_DIR}/DRAFT.md`,
    ]);
    expect(onRemote).toBe('draft from a\n');
    // the working copy is back on main
    expect((await a.head(ORG)).branch).toBe('main');
  });

  it('a publish from the other replica lands on main with its tag, and the first replica converges', async () => {
    const res = await b.publish(
      ORG,
      'rmd-letter-draft',
      { [`${SKILL_DIR}/NOTE.md`]: 'published from b\n' },
      'rmd-letter-draft v9',
      author,
      'rmd-letter-draft@v9',
    );
    expect(res?.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(await bareGit().show([`main:${SKILL_DIR}/NOTE.md`])).toBe(
      'published from b\n',
    );
    expect((await bareGit().tags()).all).toContain('rmd-letter-draft@v9');

    expect(await a.refresh(ORG)).toBe(true);
    expect((await a.head(ORG)).head).toBe(res?.sha);
    expect(await a.fileAt(ORG, 'main', `${SKILL_DIR}/NOTE.md`)).toBe(
      'published from b\n',
    );
  });

  it('concurrent publishes from two replicas serialise through the database lock and both land', async () => {
    const [ra, rb] = await Promise.all([
      a.publish(
        ORG,
        'rmd-letter-draft',
        { [`${SKILL_DIR}/A.md`]: 'a\n' },
        'from a',
        author,
        'rmd-letter-draft@v10',
      ),
      b.publish(
        ORG,
        'rmd-letter-draft',
        { [`${SKILL_DIR}/B.md`]: 'b\n' },
        'from b',
        author,
        'rmd-letter-draft@v11',
      ),
    ]);
    expect(ra?.sha).toBeTruthy();
    expect(rb?.sha).toBeTruthy();
    expect(ra?.sha).not.toBe(rb?.sha);
    expect(await bareGit().show([`main:${SKILL_DIR}/A.md`])).toBe('a\n');
    expect(await bareGit().show([`main:${SKILL_DIR}/B.md`])).toBe('b\n');
    const tags = (await bareGit().tags()).all;
    expect(tags).toEqual(
      expect.arrayContaining(['rmd-letter-draft@v10', 'rmd-letter-draft@v11']),
    );
    // main is linear: one of the two commits is the parent of the other
    const log = await bareGit().log({ maxCount: 3 });
    expect(log.all.map((c) => c.hash)).toEqual(
      expect.arrayContaining([ra!.sha, rb!.sha]),
    );
  }, 30_000);

  it('a rejected push is reported, not swallowed, and the next write recovers', async () => {
    walk(bare, (p) => chmodSync(p, statSync(p).isDirectory() ? 0o555 : 0o444));
    try {
      const res = await a.publish(
        ORG,
        'rmd-letter-draft',
        { [`${SKILL_DIR}/FAIL.md`]: 'never\n' },
        'should fail',
        author,
        'rmd-letter-draft@v12',
      );
      expect(res).toBeNull();
      const repo = await a.repoFor(ORG);
      expect(repo.lastError).toMatch(/publish\(rmd-letter-draft\)/);
    } finally {
      walk(bare, (p) =>
        chmodSync(p, statSync(p).isDirectory() ? 0o755 : 0o644),
      );
    }
    const again = await a.publish(
      ORG,
      'rmd-letter-draft',
      { [`${SKILL_DIR}/OK.md`]: 'ok\n' },
      'recovered',
      author,
      'rmd-letter-draft@v13',
    );
    expect(again?.sha).toBeTruthy();
    expect((await a.repoFor(ORG)).lastError).toBeNull();
    expect(await bareGit().show([`main:${SKILL_DIR}/OK.md`])).toBe('ok\n');
    // the failed commit never reached the remote
    await expect(
      bareGit().show([`main:${SKILL_DIR}/FAIL.md`]),
    ).rejects.toBeTruthy();
  }, 30_000);
});
