import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  accessSync,
  constants,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import { DataSource, Repository } from 'typeorm';
import { withAdvisoryLock } from '../common/pg-lock';
import { Org, type MarketplaceRepo } from '../orgs/entities/org.entity';
import { IntegrationsService } from '../orgs/integrations.service';
import { isGitRepo, readTree, resolveRepoPath } from './repo-reader';
import { marketplacePublishFailures } from '../metrics/registry';

export interface GitAuthor {
  name: string;
  email: string;
}

export interface GitWriteResult {
  sha: string;
  branch: string;
}

export type RepoProvider = 'local' | 'github' | 'git';

/** Where an organisation's marketplace lives and how to reach it. Tokens stay in memory. */
export interface RepoConfig {
  provider: RepoProvider;
  defaultBranch: string;
  /** Remote URL for github and git providers. */
  remoteUrl?: string;
  owner?: string;
  repo?: string;
  token?: string;
  /** Plain-files folder for the local provider. */
  localPath?: string | null;
}

/** One organisation's working copy. */
export interface OrgRepo {
  orgId: string;
  config: RepoConfig;
  /** Effective repo path for all git operations; null when no marketplace is available. */
  path: string | null;
  mode: 'in-place' | 'nested' | 'clone';
  /** Mirror work dir when a local source sits inside another git work tree. */
  workDir: string | null;
  /** Last git failure, for status pages and `activate doctor`. */
  lastError: string | null;
  /** Human label: owner/repo, the remote URL, or the folder. */
  label: string;
  githubMode: boolean;
}

export interface MarketplaceEnv {
  provider: RepoProvider | null;
  repository: string | null;
  remoteUrl: string | null;
  token: string | null;
  defaultBranch: string;
  localPath: string;
  workDir: string;
  clonesDir: string;
}

/** Instance-level marketplace settings from the environment (guide names first, old names as aliases). */
export function marketplaceEnv(
  env: Record<string, string | undefined> = process.env,
): MarketplaceEnv {
  const repository = env.LIBRARY_REPOSITORY ?? env.GITHUB_REPO ?? null;
  const token = env.LIBRARY_GIT_TOKEN ?? env.GITHUB_TOKEN ?? null;
  const remoteUrl = env.LIBRARY_REMOTE_URL ?? null;
  const explicit = env.LIBRARY_PROVIDER as RepoProvider | undefined;
  const provider: RepoProvider | null =
    explicit && ['local', 'github', 'git'].includes(explicit)
      ? explicit
      : remoteUrl
        ? 'git'
        : repository && token
          ? 'github'
          : null;
  const workDir = resolveRepoPath(env.LIBRARY_WORK_DIR ?? '.marketplace-work')!;
  return {
    provider,
    repository,
    remoteUrl,
    token,
    defaultBranch: env.LIBRARY_DEFAULT_BRANCH ?? 'main',
    localPath: env.LIBRARY_REPO_PATH ?? '../marketplace',
    workDir,
    clonesDir: resolveRepoPath(
      env.LIBRARY_CLONES_DIR ?? join(dirname(workDir), 'marketplace-clones'),
    )!,
  };
}

const LOCAL_KEY = '__local__';
/** Committer identity for commits Activate makes on its own behalf. */
const BOT_NAME = process.env.LIBRARY_BOT_NAME ?? 'Activate Bot';
const BOT_EMAIL = process.env.LIBRARY_BOT_EMAIL ?? 'activate@lightci.com';

/**
 * The only place that touches marketplace working trees.
 *
 * Each organisation resolves to a repo: its own remote (`Org.marketplaceRepo` plus a
 * GitHub token from its integrations), the instance-level remote from the environment
 * (self-hosted), or the shared local folder (development and demos). Remotes are the
 * source of truth: every write fetches first, commits on a fresh clone of the default
 * branch, and pushes before returning, under a database advisory lock so any number of
 * api or worker processes serialise their writes. Public methods return null instead of
 * throwing when git is unavailable (the database is canonical; the repo is the published
 * projection) and record the failure on the repo for status pages and `doctor`.
 */
@Injectable()
export class GitRepoService {
  private readonly logger = new Logger(GitRepoService.name);
  private readonly env: MarketplaceEnv;
  private readonly repos = new Map<string, OrgRepo>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly initialised = new Set<string>();

  constructor(
    @Optional() @InjectRepository(Org) private readonly orgs?: Repository<Org>,
    @Optional() private readonly integrations?: IntegrationsService,
    @Optional() @InjectDataSource() private readonly ds?: DataSource,
  ) {
    this.env = marketplaceEnv();
  }

  // ───────────────────────── configuration ─────────────────────────

  private async resolveConfig(orgId: string): Promise<RepoConfig> {
    const org = this.orgs
      ? await this.orgs.findOne({ where: { id: orgId } }).catch(() => null)
      : null;
    const mp: MarketplaceRepo | null = org?.marketplaceRepo ?? null;
    if (mp?.provider === 'github' && mp.owner && mp.repo) {
      const token =
        (await this.integrations?.resolve(orgId, 'github'))?.secret ??
        this.env.token ??
        undefined;
      return {
        provider: 'github',
        owner: mp.owner,
        repo: mp.repo,
        remoteUrl: `https://github.com/${mp.owner}/${mp.repo}.git`,
        token,
        defaultBranch: mp.defaultBranch || this.env.defaultBranch,
      };
    }
    if (mp?.provider === 'git' && mp.url) {
      return {
        provider: 'git',
        remoteUrl: mp.url,
        token:
          (await this.integrations?.resolve(orgId, 'github'))?.secret ??
          this.env.token ??
          undefined,
        defaultBranch: mp.defaultBranch || this.env.defaultBranch,
      };
    }
    if (
      mp?.provider === 'local' ||
      this.env.provider === 'local' ||
      !this.env.provider
    )
      return {
        provider: 'local',
        localPath: this.env.localPath,
        defaultBranch: this.env.defaultBranch,
      };
    if (this.env.provider === 'git' && this.env.remoteUrl)
      return {
        provider: 'git',
        remoteUrl: this.env.remoteUrl,
        token: this.env.token ?? undefined,
        defaultBranch: this.env.defaultBranch,
      };
    if (this.env.provider === 'github' && this.env.repository) {
      const [owner, repo] = this.env.repository.split('/');
      return {
        provider: 'github',
        owner,
        repo,
        remoteUrl: `https://github.com/${owner}/${repo}.git`,
        token: this.env.token ?? undefined,
        defaultBranch: this.env.defaultBranch,
      };
    }
    return {
      provider: 'local',
      localPath: this.env.localPath,
      defaultBranch: this.env.defaultBranch,
    };
  }

  /** The organisation's repo descriptor (cached; the clone itself is created by ensureRepo). */
  async repoFor(orgId: string): Promise<OrgRepo> {
    const config = await this.resolveConfig(orgId);
    const key = config.provider === 'local' ? LOCAL_KEY : orgId;
    const cached = this.repos.get(key);
    if (cached) {
      // Tokens and remotes may have been re-entered in Settings since we cached.
      cached.config = { ...cached.config, ...config };
      return cached;
    }
    const repo: OrgRepo =
      config.provider === 'local'
        ? this.localRepo(orgId, config)
        : {
            orgId,
            config,
            path: join(this.env.clonesDir, orgId),
            mode: 'clone',
            workDir: null,
            lastError: null,
            label:
              config.owner && config.repo
                ? `${config.owner}/${config.repo}`
                : (config.remoteUrl ?? '').replace(/\/\/[^@/]+@/, '//'),
            githubMode: config.provider === 'github' && Boolean(config.token),
          };
    this.repos.set(key, repo);
    return repo;
  }

  private localRepo(orgId: string, config: RepoConfig): OrgRepo {
    let sourcePath = resolveRepoPath(config.localPath ?? '../marketplace');
    // An empty folder (the release image ships /marketplace empty) counts as no marketplace.
    if (
      sourcePath &&
      existsSync(sourcePath) &&
      readdirSync(sourcePath).length === 0
    ) {
      this.logger.warn(
        `Marketplace folder ${sourcePath} is empty; the library runs from the database only until a remote is configured.`,
      );
      sourcePath = null;
    } else if (!sourcePath || !existsSync(sourcePath)) {
      this.logger.warn(
        `Marketplace folder not found at ${sourcePath ?? '(unset)'}; library runs DB-only.`,
      );
      sourcePath = null;
    }
    return {
      orgId,
      config: { ...config, localPath: sourcePath },
      path: sourcePath,
      mode: 'in-place',
      workDir: null,
      lastError: null,
      label: sourcePath ?? '(none)',
      githubMode: false,
    };
  }

  // ───────────────────────── locking ─────────────────────────

  /** Serialise work per repo: in-process, and across processes through the database when available. */
  private lockFor<T>(repo: OrgRepo, fn: () => Promise<T>): Promise<T> {
    const key = repo.mode === 'clone' ? repo.orgId : LOCAL_KEY;
    const inProcess = () => {
      const prev = this.queues.get(key) ?? Promise.resolve();
      const run = prev.then(fn, fn);
      this.queues.set(
        key,
        run.catch(() => undefined),
      );
      return run;
    };
    return this.ds
      ? withAdvisoryLock(this.ds, `marketplace:${key}`, inProcess)
      : inProcess();
  }

  // ───────────────────────── git plumbing ─────────────────────────

  /**
   * Environment for git subprocesses that talk to a remote. Deliberately minimal (not a copy of
   * process.env): nothing interactive, and the token travels as a header for this process only;
   * nothing is written to .git/config.
   */
  private authEnv(config: RepoConfig): Record<string, string> {
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      HOME: process.env.HOME ?? '/tmp',
      LANG: process.env.LANG ?? 'C.UTF-8',
      GIT_TERMINAL_PROMPT: '0',
      ...(process.env.SSL_CERT_FILE
        ? { SSL_CERT_FILE: process.env.SSL_CERT_FILE }
        : {}),
      ...(process.env.GIT_SSL_CAINFO
        ? { GIT_SSL_CAINFO: process.env.GIT_SSL_CAINFO }
        : {}),
    };
    if (config.token && config.remoteUrl?.startsWith('http')) {
      // Credentials travel as a header for this process only; nothing is written to .git/config.
      const basic = Buffer.from(`x-access-token:${config.token}`).toString(
        'base64',
      );
      env.GIT_CONFIG_COUNT = '1';
      env.GIT_CONFIG_KEY_0 = 'http.extraheader';
      env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${basic}`;
    }
    return env;
  }

  private git(repo: OrgRepo): SimpleGit {
    const git = simpleGit({ baseDir: repo.path! });
    return repo.mode === 'clone' ? git.env(this.authEnv(repo.config)) : git;
  }

  private fail(repo: OrgRepo, what: string, e: unknown): null {
    const message = e instanceof Error ? e.message : String(e);
    repo.lastError = `${what}: ${message.split('\n')[0]}`.slice(0, 500);
    this.logger.warn(`${what} failed for ${repo.label}: ${message}`);
    marketplacePublishFailures.labels(what.replace(/\(.*\)$/, '')).inc();
    return null;
  }

  private async hasCommits(git: SimpleGit): Promise<boolean> {
    return git
      .raw(['rev-parse', '--verify', 'HEAD'])
      .then(() => true)
      .catch(() => false);
  }

  private async remoteBranchExists(
    git: SimpleGit,
    branch: string,
  ): Promise<boolean> {
    return git
      .raw(['rev-parse', '--verify', `origin/${branch}`])
      .then(() => true)
      .catch(() => false);
  }

  /** Bring a clone's default branch in line with the remote. Holds nothing local back: the remote is the truth. */
  private async syncDefault(repo: OrgRepo): Promise<void> {
    const git = this.git(repo);
    const branch = repo.config.defaultBranch;
    await git.fetch(['origin', '--prune', '--tags', '--force']);
    if (await this.remoteBranchExists(git, branch)) {
      await git.checkout(['-B', branch, `origin/${branch}`]);
      await git.reset(['--hard', `origin/${branch}`]);
    } else if (!(await this.hasCommits(git))) {
      await git.checkout(['--orphan', branch]).catch(() => undefined);
    }
  }

  /**
   * Make the working copy usable. Local: initialise the plain folder as a repo (or mirror it
   * when it sits inside another work tree). Remote: clone on first use, then fetch. Idempotent;
   * never throws. Resolves true when the folder is a usable git repo.
   */
  async ensureRepo(orgId: string): Promise<boolean> {
    const repo = await this.repoFor(orgId);
    if (repo.mode === 'clone') return this.ensureClone(repo);
    return this.ensureLocal(repo);
  }

  private async ensureClone(repo: OrgRepo): Promise<boolean> {
    const path = repo.path!;
    if (isGitRepo(path) && this.initialised.has(path)) return true;
    return this.lockFor(repo, async () => {
      try {
        if (!isGitRepo(path)) {
          mkdirSync(dirname(path), { recursive: true });
          await simpleGit()
            .env(this.authEnv(repo.config))
            .clone(repo.config.remoteUrl!, path);
          const git = this.git(repo);
          await git.addConfig('user.name', BOT_NAME, false, 'local');
          await git.addConfig('user.email', BOT_EMAIL, false, 'local');
          this.logger.log(
            `Cloned marketplace ${repo.label} for org ${repo.orgId}`,
          );
        }
        await this.syncDefault(repo);
        this.initialised.add(path);
        repo.lastError = null;
        return true;
      } catch (e) {
        this.fail(repo, 'clone', e);
        return false;
      }
    });
  }

  /** Fetch the latest default branch (remotes); a no-op for local repos. Never throws. */
  async refresh(orgId: string): Promise<boolean> {
    const repo = await this.repoFor(orgId);
    if (repo.mode !== 'clone') return this.ensureLocal(repo);
    if (!(await this.ensureClone(repo))) return false;
    return this.lockFor(repo, async () => {
      try {
        await this.syncDefault(repo);
        repo.lastError = null;
        return true;
      } catch (e) {
        this.fail(repo, 'fetch', e);
        return false;
      }
    });
  }

  private async ensureLocal(repo: OrgRepo): Promise<boolean> {
    if (!repo.config.localPath || !existsSync(repo.config.localPath))
      return false;
    if (repo.path && isGitRepo(repo.path) && this.initialised.has(repo.path))
      return true;
    return this.lockFor(repo, async () => {
      await this.resolveLocalLocation(repo);
      // A nested work dir can be wiped at runtime (the demo seed reset does this): mirror it again.
      if (
        repo.mode === 'nested' &&
        repo.workDir &&
        !existsSync(repo.workDir) &&
        repo.config.localPath
      ) {
        cpSync(repo.config.localPath, repo.workDir, {
          recursive: true,
          filter: (src) =>
            !src.endsWith(`${sep}.git`) && !src.includes(`${sep}.git${sep}`),
        });
        this.logger.log(
          `Re-mirrored marketplace plain files into ${repo.workDir}`,
        );
      }
      if (!repo.path || !existsSync(repo.path)) return false;
      if (isGitRepo(repo.path)) {
        this.initialised.add(repo.path);
        return true;
      }
      try {
        const git = simpleGit(repo.path);
        await git.init(['-b', repo.config.defaultBranch]);
        await git.addConfig('user.name', BOT_NAME, false, 'local');
        await git.addConfig('user.email', BOT_EMAIL, false, 'local');
        await git.add(['-A']);
        await git.commit(
          'Initial marketplace import\n\nImported from plain files by LightCI Activate GitRepoService.ensureRepo().',
          undefined,
          { '--author': `${BOT_NAME} <${BOT_EMAIL}>` },
        );
        const tree = readTree(repo.path);
        for (const skill of tree.skills) {
          const tag = `${skill.slug}@v${skill.declaredVersion}`;
          await git.addAnnotatedTag(
            tag,
            `${skill.slug} v${skill.declaredVersion} — imported as current content`,
          );
        }
        this.logger.log(
          `Initialised marketplace repo at ${repo.path} (${tree.skills.length} skills tagged)`,
        );
        this.initialised.add(repo.path);
        return true;
      } catch (e) {
        this.fail(repo, 'init', e);
        return isGitRepo(repo.path);
      }
    });
  }

  /**
   * Decide where a local repo lives. If the source folder is a plain directory inside another git
   * work tree (the monorepo), initialising there would create a nested repo the outer git treats
   * as a submodule; instead mirror the plain files (skipping any .git) into a work dir and operate
   * there. The mirror happens only when the work dir does not exist yet, so API-made commits
   * persist across restarts. In Docker (/marketplace, no parent repo) the repo is initialised in place.
   */
  private async resolveLocalLocation(repo: OrgRepo): Promise<void> {
    const source = repo.config.localPath!;
    if (repo.mode === 'nested' || isGitRepo(source)) return;
    let toplevel: string | null = null;
    try {
      toplevel =
        (await simpleGit(source).revparse(['--show-toplevel'])).trim() || null;
    } catch {
      toplevel = null;
    }
    const real = (p: string) => {
      try {
        return realpathSync(p);
      } catch {
        return resolve(p);
      }
    };
    const src = real(source);
    const nested =
      Boolean(toplevel) &&
      real(toplevel!) !== src &&
      src.startsWith(real(toplevel!) + sep);
    // A read-only image (/marketplace on a read-only root filesystem) cannot hold the repo either:
    // the writable copy lives in the work dir on /data, the same way as the nested case.
    let writable = true;
    try {
      accessSync(source, constants.W_OK);
    } catch {
      writable = false;
    }
    if (!nested && writable) {
      this.logger.log(`Marketplace repo mode: in-place (${source})`);
      return;
    }
    const why = nested ? `nested inside ${toplevel}` : `${source} is read-only`;
    const workDir = this.env.workDir;
    if (!existsSync(workDir)) {
      cpSync(source, workDir, {
        recursive: true,
        filter: (s) =>
          !s.endsWith(`${sep}.git`) && !s.includes(`${sep}.git${sep}`),
      });
      this.logger.log(
        `Marketplace repo mode: ${why}; mirrored plain files to work dir ${workDir}`,
      );
    } else {
      this.logger.log(
        `Marketplace repo mode: ${why}; reusing existing work dir ${workDir}`,
      );
    }
    repo.mode = 'nested';
    repo.workDir = workDir;
    repo.path = workDir;
  }

  // ───────────────────────── writes ─────────────────────────

  private writeFiles(repo: OrgRepo, files: Record<string, string>) {
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(repo.path!, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, 'utf8');
    }
  }

  private async commitAll(
    git: SimpleGit,
    files: string[],
    message: string,
    author: GitAuthor,
  ): Promise<string> {
    await git.add(files);
    const status = await git.status();
    if (status.staged.length === 0 && status.files.length === 0)
      return (await git.revparse(['HEAD'])).trim();
    await git.commit(message, undefined, {
      '--author': `${author.name} <${author.email}>`,
    });
    return (await git.revparse(['HEAD'])).trim();
  }

  private async checkoutDefault(repo: OrgRepo, git: SimpleGit) {
    const branch = repo.config.defaultBranch;
    const current = (
      await git.revparse(['--abbrev-ref', 'HEAD']).catch(() => '')
    ).trim();
    if (current !== branch) await git.checkout(branch);
  }

  /**
   * Commit skill files on branch `skill/<slug>` (created from the default branch when missing),
   * push it when the repo has a remote, then return to the default branch. Files are repo-relative.
   */
  async writeOnBranch(
    orgId: string,
    slug: string,
    files: Record<string, string>,
    message: string,
    author: GitAuthor,
  ): Promise<GitWriteResult | null> {
    return this.writeFilesOnBranch(
      orgId,
      `skill/${slug}`,
      files,
      message,
      author,
      slug,
    );
  }

  /** Same as writeOnBranch for any branch name (the Coach plugin update uses `activate/coach-plugin-v<version>`). */
  async writeFilesOnBranch(
    orgId: string,
    branch: string,
    files: Record<string, string>,
    message: string,
    author: GitAuthor,
    label = branch,
  ): Promise<GitWriteResult | null> {
    if (!(await this.ensureRepo(orgId))) return null;
    const repo = await this.repoFor(orgId);
    return this.lockFor(repo, async () => {
      const git = this.git(repo);
      try {
        if (repo.mode === 'clone') {
          await this.syncDefault(repo);
          if (await this.remoteBranchExists(git, branch))
            await git.checkout(['-B', branch, `origin/${branch}`]);
          else await git.checkout(['-B', branch]);
        } else {
          await this.checkoutDefault(repo, git);
          const branches = await git.branchLocal();
          if (branches.all.includes(branch)) await git.checkout(branch);
          else await git.checkoutLocalBranch(branch);
        }
        this.writeFiles(repo, files);
        const sha = await this.commitAll(
          git,
          Object.keys(files),
          message,
          author,
        );
        if (repo.mode === 'clone') await git.push(['-u', 'origin', branch]);
        await git.checkout(repo.config.defaultBranch);
        repo.lastError = null;
        return { sha, branch };
      } catch (e) {
        this.fail(repo, `writeOnBranch(${label})`, e);
        await git.checkout(repo.config.defaultBranch).catch(() => undefined);
        return null;
      }
    });
  }

  /** Write the published content on the default branch, commit, tag, and push when there is a remote. */
  async publish(
    orgId: string,
    slug: string,
    files: Record<string, string>,
    message: string,
    author: GitAuthor,
    tag: string,
  ): Promise<GitWriteResult | null> {
    if (!(await this.ensureRepo(orgId))) return null;
    const repo = await this.repoFor(orgId);
    return this.lockFor(repo, async () => {
      const git = this.git(repo);
      try {
        if (repo.mode === 'clone') await this.syncDefault(repo);
        else await this.checkoutDefault(repo, git);
        this.writeFiles(repo, files);
        const sha = await this.commitAll(
          git,
          Object.keys(files),
          message,
          author,
        );
        const tags = await git.tags();
        if (!tags.all.includes(tag))
          await git.addAnnotatedTag(
            tag,
            `${slug} ${tag.split('@')[1]} — published via Activate promotion`,
          );
        if (repo.mode === 'clone')
          await git.push([
            'origin',
            repo.config.defaultBranch,
            '--follow-tags',
          ]);
        repo.lastError = null;
        return { sha, branch: repo.config.defaultBranch };
      } catch (e) {
        this.fail(repo, `publish(${slug})`, e);
        return null;
      }
    });
  }

  /** Push a branch to the remote (no-op false for local repos). */
  async pushBranch(orgId: string, branch: string): Promise<boolean> {
    if (!(await this.ensureRepo(orgId))) return false;
    const repo = await this.repoFor(orgId);
    if (repo.mode !== 'clone') return false;
    return this.lockFor(repo, async () => {
      try {
        await this.git(repo).push(['-u', 'origin', branch]);
        repo.lastError = null;
        return true;
      } catch (e) {
        this.fail(repo, `pushBranch(${branch})`, e);
        return false;
      }
    });
  }

  /** True when the remote already has this branch (a pull request is probably open). Local repos: local branch. */
  async branchExists(orgId: string, branch: string): Promise<boolean> {
    if (!(await this.ensureRepo(orgId))) return false;
    const repo = await this.repoFor(orgId);
    const git = this.git(repo);
    if (repo.mode === 'clone') return this.remoteBranchExists(git, branch);
    return (await git.branchLocal()).all.includes(branch);
  }

  /**
   * Open a pull request on GitHub for a branch already pushed. Returns null for non-GitHub remotes
   * (the branch is on the remote; the customer opens the review in their own tooling).
   */
  async openPullRequest(
    orgId: string,
    pr: { head: string; title: string; body: string },
  ): Promise<{ number: number; url: string } | null> {
    const repo = await this.repoFor(orgId);
    if (!repo.githubMode || !repo.config.owner || !repo.config.repo)
      return null;
    const res = await fetch(
      `https://api.github.com/repos/${repo.config.owner}/${repo.config.repo}/pulls`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${repo.config.token ?? ''}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'lightci-activate',
        },
        body: JSON.stringify({
          title: pr.title,
          head: pr.head,
          base: repo.config.defaultBranch,
          body: pr.body,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // 422 "A pull request already exists" is the idempotent case.
      if (res.status === 422 && /already exists/i.test(text)) return null;
      throw new Error(
        `GitHub pull request failed (${res.status}): ${text.slice(0, 200)}`,
      );
    }
    const json = (await res.json()) as { number: number; html_url: string };
    return { number: json.number, url: json.html_url };
  }

  async fileAt(
    orgId: string,
    ref: string,
    rel: string,
  ): Promise<string | null> {
    if (!(await this.ensureRepo(orgId))) return null;
    const repo = await this.repoFor(orgId);
    return this.git(repo)
      .show([`${ref}:${rel}`])
      .catch(() => null);
  }

  async head(orgId: string): Promise<{
    branch: string | null;
    head: string | null;
    dirty: boolean;
  }> {
    if (!(await this.ensureRepo(orgId)))
      return { branch: null, head: null, dirty: false };
    const git = this.git(await this.repoFor(orgId));
    const [branch, head, status] = await Promise.all([
      git.revparse(['--abbrev-ref', 'HEAD']).catch(() => null),
      git.revparse(['HEAD']).catch(() => null),
      git.status().catch(() => null),
    ]);
    return {
      branch: branch?.trim() ?? null,
      head: head?.trim() ?? null,
      dirty: status ? !status.isClean() : false,
    };
  }

  /** Repo-relative working-tree path for reads (null when unavailable). */
  async pathFor(orgId: string): Promise<string | null> {
    if (!(await this.ensureRepo(orgId))) return null;
    return (await this.repoFor(orgId)).path;
  }
}

/** Line-based diff summary between two texts (no repo needed). */
export function diffSummary(
  previous: string | null,
  current: string,
): {
  filesChanged: number;
  additions: number;
  deletions: number;
  summary: string;
} {
  const prev = (previous ?? '').split('\n');
  const cur = current.split('\n');
  if (previous === null)
    return {
      filesChanged: 1,
      additions: cur.length,
      deletions: 0,
      summary: `New skill: ${cur.length} lines.`,
    };
  const prevCount = new Map<string, number>();
  for (const l of prev) prevCount.set(l, (prevCount.get(l) ?? 0) + 1);
  let additions = 0;
  for (const l of cur) {
    const n = prevCount.get(l) ?? 0;
    if (n > 0) prevCount.set(l, n - 1);
    else additions++;
  }
  let deletions = 0;
  for (const n of prevCount.values()) deletions += n;
  const changedSections = sectionNames(cur).filter((s) => {
    const a = sectionBody(prev, s);
    const b = sectionBody(cur, s);
    return a !== b;
  });
  const summary =
    additions === 0 && deletions === 0
      ? 'No content changes.'
      : `+${additions} −${deletions} lines${changedSections.length ? `; sections changed: ${changedSections.join(', ')}` : ''}.`;
  return {
    filesChanged: additions || deletions ? 1 : 0,
    additions,
    deletions,
    summary,
  };
}

function sectionNames(lines: string[]): string[] {
  return lines
    .filter((l) => /^## /.test(l))
    .map((l) => l.replace(/^## /, '').trim());
}
function sectionBody(lines: string[], name: string): string {
  const start = lines.findIndex((l) => l.trim() === `## ${name}`);
  if (start < 0) return '';
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .trim();
}
