import { Injectable, Logger } from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import { isGitRepo, resolveRepoPath } from './repo-reader';

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
export class GitRepoService {
  private readonly logger = new Logger(GitRepoService.name);
  readonly path: string | null;
  readonly defaultBranch = process.env.LIBRARY_DEFAULT_BRANCH ?? 'main';
  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    this.path = resolveRepoPath(
      process.env.LIBRARY_REPO_PATH ?? '../marketplace',
    );
    if (!this.available())
      this.logger.warn(
        `Marketplace repo not found at ${this.path ?? '(unset)'}; library runs DB-only.`,
      );
  }

  available(): boolean {
    return Boolean(this.path && existsSync(this.path) && isGitRepo(this.path));
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
  writeOnBranch(
    slug: string,
    files: Record<string, string>,
    message: string,
    author: GitAuthor,
  ): Promise<GitWriteResult | null> {
    if (!this.available()) return Promise.resolve(null);
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
  publish(
    slug: string,
    files: Record<string, string>,
    message: string,
    author: GitAuthor,
    tag: string,
  ): Promise<GitWriteResult | null> {
    if (!this.available()) return Promise.resolve(null);
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
  pushBranch(branch: string): Promise<boolean> {
    if (!this.available()) return Promise.resolve(false);
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
    if (!this.available()) return null;
    return this.git()
      .show([`${ref}:${rel}`])
      .catch(() => null);
  }

  async head(): Promise<{
    branch: string | null;
    head: string | null;
    dirty: boolean;
  }> {
    if (!this.available()) return { branch: null, head: null, dirty: false };
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
