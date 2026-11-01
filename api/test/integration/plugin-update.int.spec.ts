/**
 * The Coach plugin update job against a real remote (T7.5): the first run pushes exactly one branch
 * with the plugin and the customer's connector URL; a second run adds nothing; merging the branch
 * makes the organisation current; a newer bundled version proposes again. The default branch is
 * never written. A bare repository stands in for the customer's Git host (no pull-request API there,
 * so the branch is the proposal).
 */
import 'dotenv/config';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { simpleGit } from 'simple-git';
import { DataSource, Repository } from 'typeorm';
import { JobRegistry } from '../../src/jobs/jobs.port';
import { Org } from '../../src/orgs/entities/org.entity';
import { GitRepoService } from '../../src/skills/git-repo.service';
import {
  COACH_PLUGIN_PATH,
  PluginUpdateService,
} from '../../src/skills/plugin-update.service';
import AppDataSource from '../../src/typeorm.config';

const BUNDLED = resolve(
  __dirname,
  '../../../marketplace/plugins/activate-coach',
);

describe('Coach plugin update against a customer remote', () => {
  const root = mkdtempSync(join(tmpdir(), 'activate-plugin-'));
  const bare = join(root, 'remote.git');
  const remoteUrl = `file://${bare}`;
  const ds = new DataSource({ ...AppDataSource.options, migrationsRun: false });
  const saved = { ...process.env };
  let git: GitRepoService;
  let service: PluginUpdateService;
  let orgs: Repository<Org>;
  let orgId: string;
  const bareGit = () => simpleGit(bare);
  const bundledVersion = () =>
    (
      JSON.parse(
        readFileSync(join(BUNDLED, '.claude-plugin/plugin.json'), 'utf8'),
      ) as { version: string }
    ).version;

  beforeAll(async () => {
    await ds.initialize();
    orgs = ds.getRepository(Org);
    await simpleGit().init(['--bare', '-b', 'main', bare]);
    // The customer's repo starts with content but no Coach plugin.
    const seed = join(root, 'seed');
    await simpleGit().clone(remoteUrl, seed);
    mkdirSync(join(seed, 'plugins', 'cso-operations'), { recursive: true });
    writeFileSync(join(seed, 'README.md'), '# Acme marketplace\n');
    writeFileSync(
      join(seed, 'plugins', 'cso-operations', 'README.md'),
      'existing plugin\n',
    );
    const g = simpleGit(seed);
    await g.addConfig('user.name', 'Seed', false, 'local');
    await g.addConfig('user.email', 'seed@example.com', false, 'local');
    await g.checkout(['-B', 'main']);
    await g.add(['-A']);
    await g.commit('Customer marketplace');
    await g.push(['-u', 'origin', 'main']);

    process.env.NODE_ENV = 'test';
    process.env.LIBRARY_PROVIDER = 'git';
    process.env.LIBRARY_REMOTE_URL = remoteUrl;
    process.env.LIBRARY_CLONES_DIR = join(root, 'clones');
    process.env.LIBRARY_WORK_DIR = join(root, 'unused-work');
    process.env.PUBLIC_API_URL = 'https://mcp.acme.test';
    process.env.COACH_PLUGIN_DIR = BUNDLED;
    delete process.env.LIBRARY_REPO_PATH;

    const org = await orgs.save(
      orgs.create({
        name: 'Acme Plugin',
        slug: `acme-plugin-${Date.now()}`,
        isDemo: false,
        marketplaceRepo: {
          provider: 'git',
          url: remoteUrl,
          defaultBranch: 'main',
          autoSync: true,
        },
      }),
    );
    orgId = org.id;
    git = new GitRepoService(orgs, undefined, ds);
    service = new PluginUpdateService(new JobRegistry(), git, orgs);
  }, 60_000);

  afterAll(async () => {
    if (orgId) await orgs.delete({ id: orgId });
    await ds.destroy();
    rmSync(root, { recursive: true, force: true });
    process.env = saved;
  });

  it("proposes the plugin on its own branch with this installation's connector URL; main is untouched", async () => {
    const result = await service.runFor(orgId);
    expect(result.action).toBe('proposed');
    expect(result.installed).toBeNull();
    const branch = `activate/coach-plugin-v${bundledVersion()}`;
    expect(result.branch).toBe(branch);
    expect(result.pullRequest).toBeNull(); // no GitHub API behind a bare repo

    const branches = (await bareGit().branch(['-a'])).all;
    expect(branches).toContain(branch);
    const manifest = JSON.parse(
      await bareGit().show([
        `${branch}:${COACH_PLUGIN_PATH}/.claude-plugin/plugin.json`,
      ]),
    ) as { version: string; mcpServers: { activate: { url: string } } };
    expect(manifest.version).toBe(bundledVersion());
    expect(manifest.mcpServers.activate.url).toBe('https://mcp.acme.test/mcp');
    expect(
      await bareGit().show([
        `${branch}:${COACH_PLUGIN_PATH}/skills/coach/SKILL.md`,
      ]),
    ).toContain('#');
    await expect(
      bareGit().show([`main:${COACH_PLUGIN_PATH}/.claude-plugin/plugin.json`]),
    ).rejects.toBeTruthy();
    expect((await bareGit().log(['main'])).total).toBe(1);
  }, 30_000);

  it('a second run proposes nothing new', async () => {
    const commitsBefore = (
      await bareGit().log([`activate/coach-plugin-v${bundledVersion()}`])
    ).total;
    const result = await service.runFor(orgId);
    expect(result.action).toBe('pending');
    expect(
      (await bareGit().log([`activate/coach-plugin-v${bundledVersion()}`]))
        .total,
    ).toBe(commitsBefore);
    expect(
      (await bareGit().branch(['-a'])).all.filter((b) =>
        b.includes('coach-plugin'),
      ),
    ).toHaveLength(1);
  }, 30_000);

  it('once the customer merges, the organisation is current', async () => {
    const work = join(root, 'merge');
    await simpleGit().clone(remoteUrl, work);
    const g = simpleGit(work);
    await g.addConfig('user.name', 'Champion', false, 'local');
    await g.addConfig('user.email', 'champion@example.com', false, 'local');
    await g.checkout('main');
    await g.merge([`origin/activate/coach-plugin-v${bundledVersion()}`]);
    await g.push(['origin', 'main']);
    const result = await service.runFor(orgId);
    expect(result.action).toBe('current');
    expect(result.installed).toBe(bundledVersion());
  }, 30_000);

  it('a newer bundled version is proposed again, on a new branch', async () => {
    const newer = join(root, 'bundled-next');
    cpSync(BUNDLED, newer, { recursive: true });
    const manifestPath = join(newer, '.claude-plugin/plugin.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      version: string;
    };
    const [a, b, c] = manifest.version.split('.').map(Number);
    manifest.version = `${a}.${b}.${c + 1}`;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    process.env.COACH_PLUGIN_DIR = newer;
    try {
      const result = await service.runFor(orgId);
      expect(result.action).toBe('proposed');
      expect(result.installed).toBe(bundledVersion());
      expect(result.branch).toBe(`activate/coach-plugin-v${manifest.version}`);
      expect(
        (await bareGit().branch(['-a'])).all.filter((b) =>
          b.includes('coach-plugin'),
        ),
      ).toHaveLength(2);
    } finally {
      process.env.COACH_PLUGIN_DIR = BUNDLED;
    }
  }, 30_000);

  it('an organisation without a remote is skipped, never written to', async () => {
    const local = await orgs.save(
      orgs.create({
        name: 'Local Org',
        slug: `local-${Date.now()}`,
        isDemo: false,
        marketplaceRepo: null,
      }),
    );
    try {
      process.env.LIBRARY_PROVIDER = 'local';
      process.env.LIBRARY_REPO_PATH = join(root, 'nowhere');
      const lonely = new PluginUpdateService(
        new JobRegistry(),
        new GitRepoService(orgs, undefined, ds),
        orgs,
      );
      const result = await lonely.runFor(local.id);
      expect(result.action).toBe('skipped');
    } finally {
      process.env.LIBRARY_PROVIDER = 'git';
      delete process.env.LIBRARY_REPO_PATH;
      await orgs.delete({ id: local.id });
    }
  });
});
