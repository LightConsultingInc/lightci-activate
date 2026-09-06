import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { cpSync, existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import { isGitRepo, readTree, resolveRepoPath } from './repo-reader';

export interface GitAuthor {
  name: string;
  email: string;
}

export interface GitWriteResult {
  sha: string;
  branch: string;
}

/**
 * The only place that mutates the marketplace working tree. All operations are serialised through
 * one promise chain (the working tree is shared state) and always leave the tree on `main`. Every
 * public method returns null instead of throwing when the repo is unavailable or git fails, so DB
 * writes never depend on git succeeding (DB is canonical; the repo is the published projection).
 */
@Injectable()
export class GitRepoService implements OnModuleInit {
  private readonly logger = new Logger(GitRepoService.name);
  /** Configured source folder (LIBRARY_REPO_PATH). */
  readonly sourcePath: string | null;
  /** Effective repo path for all git operations: the source folder, or the work dir when nested. */
  path: string | null;
  /** Set when the source sits inside another git work tree and a mirror work dir is used. */
  workDir: string | null = null;
  mode: 'in-place' | 'nested' = 'in-place';
  readonly defaultBranch = process.env.LIBRARY_DEFAULT_BRANCH ?? 'main';
  private queue: Promise<unknown> = Promise.resolve();
  private resolved = false;

  constructor() {
    this.sourcePath = resolveRepoPath(
      process.env.LIBRARY_REPO_PATH ?? '../marketplace',
    );
    this.path = this.sourcePath;
    if (!this.sourcePath || !existsSync(this.sourcePath))
      this.logger.warn(
        `Marketplace folder not found at ${this.sourcePath ?? '(unset)'}; library runs DB-only.`,
      );
  }

  /**
   * Decide where the repo lives. If the source folder is a plain directory inside another git work
   * tree (the monorepo), initialising there would create a nested repo the outer git treats as a
   * submodule; instead mirror the plain files (skipping any .git) into a work dir and operate there.
   * The mirror happens only when the work dir does not exist yet, so API-made commits persist across
   * restarts. In Docker (/marketplace, no parent repo) the repo is initialised in place.
   */
  private async resolveLocation(): Promise<void> {
    if (this.resolved || !this.sourcePath) return;
    this.resolved = true;
    if (isGitRepo(this.sourcePath)) {
      this.logger.log(`Marketplace repo mode: in-place (${this.sourcePath} is already a git repo)`);
      return;
    }
    let toplevel: string | null = null;
    try {
      toplevel = (await simpleGit(this.sourcePath).revparse(['--show-toplevel'])).trim() || null;
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
    const source = real(this.sourcePath);
    const nested = Boolean(toplevel) && real(toplevel!) !== source && source.startsWith(real(toplevel!) + sep);
    if (!nested) {
      this.logger.log(`Marketplace repo mode: in-place (${this.sourcePath})`);
      return;
    }
    const workDir = resolveRepoPath(process.env.LIBRARY_WORK_DIR ?? '.marketplace-work')!;
    if (!existsSync(workDir)) {
      cpSync(this.sourcePath, workDir, {
        recursive: true,
        filter: (src) => !src.endsWith(`${sep}.git`) && !src.includes(`${sep}.git${sep}`),
      });
      this.logger.log(`Marketplace repo mode: nested inside ${toplevel}; mirrored plain files to work dir ${workDir}`);
    } else {
      this.logger.log(`Marketplace repo mode: nested inside ${toplevel}; reusing existing work dir ${workDir}`);
    }
    this.mode = 'nested';
    this.workDir = workDir;
    this.path = workDir;
  }

  async onModuleInit() {
    await this.ensureRepo();
  }

  /** The folder exists and already is a git repo (sync check; use ensureRepo() before git work). */
  available(): boolean {
    return Boolean(this.path && existsSync(this.path) && isGitRepo(this.path));
  }

  /**
   * The marketplace is committed to the monorepo (and copied into the image) as plain files: no
   * nested .git. On first use, initialise a local repo in place: `main`, a local bot identity, one
   * "Initial marketplace import" commit, and a tag `<slug>@v<N>` per skill where N is the SKILL.md
   * `metadata.activate-version` (earlier versions only exist in the DB). Idempotent; never throws.
   * Resolves true when the folder is a usable git repo.
   */
  ensureRepo(): Promise<boolean> {
    if (!this.sourcePath || !existsSync(this.sourcePath)) return Promise.resolve(false);
    if (this.resolved && this.path && isGitRepo(this.path)) return Promise.resolve(true);
    return this.locked(async () => {
      await this.resolveLocation();
      // A nested work dir can be wiped at runtime (the demo seed reset does this): mirror it again.
      if (this.mode === 'nested' && this.workDir && !existsSync(this.workDir) && this.sourcePath) {
        cpSync(this.sourcePath, this.workDir, {
          recursive: true,
          filter: (src) => !src.endsWith(`${sep}.git`) && !src.includes(`${sep}.git${sep}`),
        });
        this.logger.log(`Re-mirrored marketplace plain files into ${this.workDir}`);
      }
      if (!this.path || !existsSync(this.path)) return false;
      if (isGitRepo(this.path)) return true;
      try {
        const git = simpleGit(this.path!);
        await git.init(['-b', this.defaultBranch]);
        await git.addConfig('user.name', 'Activate Bot', false, 'local');
        await git.addConfig('user.email', 'activate@lightci.com', false, 'local');
        await git.add(['-A']);
        await git.commit('Initial marketplace import\n\nImported from plain files by LightCI Activate GitRepoService.ensureRepo().', undefined, {
          '--author': 'Activate Bot <activate@lightci.com>',
        });
        const tree = readTree(this.path!);
        for (const skill of tree.skills) {
          const tag = `${skill.slug}@v${skill.declaredVersion}`;
          await git.addAnnotatedTag(tag, `${skill.slug} v${skill.declaredVersion} — imported as current content`);
        }
        this.logger.log(`Initialised marketplace repo at ${this.path} (${tree.skills.length} skills tagged)`);
        return true;
      } catch (e) {
        this.logger.error(`ensureRepo failed at ${this.path}: ${(e as Error).message}`);
        return isGitRepo(this.path!);
      }
    });
  }

  get githubMode(): boolean {
    return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
  }

  private git(): SimpleGit {
    return simpleGit(this.path!);
  }

  /** Serialise repo mutations. */
  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async ensureMain(git: SimpleGit) {
    const branch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
    if (branch !== this.defaultBranch) await git.checkout(this.defaultBranch);
  }

  private writeFiles(files: Record<string, string>) {
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(this.path!, rel);
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

  /**
   * Commit skill files on branch `skill/<slug>` (created from main when missing), then return to main.
   * Files are relative to the repo root.
   */
  async writeOnBranch(
    slug: string,
    files: Record<string, string>,
    message: string,
    author: GitAuthor,
  ): Promise<GitWriteResult | null> {
    if (!(await this.ensureRepo())) return null;
    const branch = `skill/${slug}`;
    return this.locked(async () => {
      const git = this.git();
      try {
        await this.ensureMain(git);
        const branches = await git.branchLocal();
        if (branches.all.includes(branch)) await git.checkout(branch);
        else await git.checkoutLocalBranch(branch);
        this.writeFiles(files);
        const sha = await this.commitAll(
          git,
          Object.keys(files),
          message,
          author,
        );
        await git.checkout(this.defaultBranch);
        return { sha, branch };
      } catch (e) {
        this.logger.warn(
          `writeOnBranch(${slug}) failed: ${(e as Error).message}`,
        );
        await git.checkout(this.defaultBranch).catch(() => undefined);
        return null;
      }
    });
  }

  /** Write the published content directly on main, commit and tag. */
  async publish(
    slug: string,
    files: Record<string, string>,
    message: string,
    author: GitAuthor,
    tag: string,
  ): Promise<GitWriteResult | null> {
    if (!(await this.ensureRepo())) return null;
    return this.locked(async () => {
      const git = this.git();
      try {
        await this.ensureMain(git);
        this.writeFiles(files);
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
        return { sha, branch: this.defaultBranch };
      } catch (e) {
        this.logger.warn(`publish(${slug}) failed: ${(e as Error).message}`);
        return null;
      }
    });
  }

  /** Push a branch to origin (GitHub PR mode). */
  async pushBranch(branch: string): Promise<boolean> {
    if (!(await this.ensureRepo())) return false;
    return this.locked(async () => {
      try {
        const remotes = await this.git().getRemotes();
        if (!remotes.some((r) => r.name === 'origin')) return false;
        await this.git().push(['-u', 'origin', branch]);
        return true;
      } catch (e) {
        this.logger.warn(
          `pushBranch(${branch}) failed: ${(e as Error).message}`,
        );
        return false;
      }
    });
  }

  async fileAt(ref: string, rel: string): Promise<string | null> {
    if (!(await this.ensureRepo())) return null;
    return this.git()
      .show([`${ref}:${rel}`])
      .catch(() => null);
  }

  async head(): Promise<{
    branch: string | null;
    head: string | null;
    dirty: boolean;
  }> {
    if (!(await this.ensureRepo())) return { branch: null, head: null, dirty: false };
    const git = this.git();
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
