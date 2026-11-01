import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { Repository } from 'typeorm';
import { JobRegistry } from '../jobs/jobs.port';
import { Org } from '../orgs/entities/org.entity';
import { publicApiUrl } from '../config/env';
import { APP_VERSION, isNewer } from '../updates/version';
import { GitRepoService } from './git-repo.service';

export const COACH_PLUGIN_PATH = 'plugins/activate-coach';
const MANIFEST = '.claude-plugin/plugin.json';
const AUTHOR = { name: 'Activate', email: 'activate@lightci.com' };

export interface PluginUpdateResult {
  orgId: string;
  action: 'current' | 'proposed' | 'pending' | 'skipped';
  bundled: string;
  installed: string | null;
  branch?: string;
  pullRequest?: string | null;
  reason?: string;
}

/**
 * Keeps each organisation's Coach plugin current (T7.5). The plugin ships inside the server image;
 * when a customer's marketplace carries an older copy (or none), the worker pushes the new files on
 * `activate/coach-plugin-v<version>` and opens a pull request. Champions review and merge; nothing is
 * ever pushed to the default branch. Runs when a worker starts (so after every upgrade) and is
 * idempotent: an existing branch means the proposal is already out.
 */
@Injectable()
export class PluginUpdateService implements OnModuleInit {
  private readonly logger = new Logger(PluginUpdateService.name);

  constructor(
    private readonly registry: JobRegistry,
    private readonly git: GitRepoService,
    @InjectRepository(Org) private readonly orgs: Repository<Org>,
  ) {}

  onModuleInit() {
    this.registry.register({
      name: 'plugin.update',
      singleton: true,
      onBoot: { singletonKey: `boot-${APP_VERSION}` },
      retryLimit: 2,
      retryDelaySeconds: 300,
      expireInSeconds: 20 * 60,
      handler: async () => {
        await this.runAll();
      },
    });
  }

  /** Where the bundled plugin lives: the image path, or the repo checkout in development. */
  get bundledDir(): string {
    const explicit = process.env.COACH_PLUGIN_DIR;
    if (explicit) return resolve(explicit);
    const candidates = [
      '/app/plugins/activate-coach',
      resolve(process.cwd(), '..', 'marketplace', COACH_PLUGIN_PATH),
      resolve(process.cwd(), 'marketplace', COACH_PLUGIN_PATH),
    ];
    return (
      candidates.find((c) => existsSync(join(c, MANIFEST))) ?? candidates[0]
    );
  }

  bundledVersion(): string | null {
    try {
      const manifest = JSON.parse(
        readFileSync(join(this.bundledDir, MANIFEST), 'utf8'),
      ) as {
        version?: string;
      };
      return manifest.version ?? null;
    } catch {
      return null;
    }
  }

  /** Every file of the bundled plugin, keyed by its path inside the customer's repo. */
  bundledFiles(): Record<string, string> {
    const out: Record<string, string> = {};
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else
          out[`${COACH_PLUGIN_PATH}/${relative(this.bundledDir, full)}`] =
            readFileSync(full, 'utf8');
      }
    };
    walk(this.bundledDir);
    // The connector URL in the manifest is this installation's, not LightCI's.
    const manifestKey = `${COACH_PLUGIN_PATH}/${MANIFEST}`;
    if (out[manifestKey]) {
      const manifest = JSON.parse(out[manifestKey]) as {
        mcpServers?: Record<string, { type: string; url: string }>;
      };
      const base = publicApiUrl(process.env);
      if (manifest.mcpServers?.activate && base)
        manifest.mcpServers.activate.url = `${base.replace(/\/$/, '')}/mcp`;
      out[manifestKey] = JSON.stringify(manifest, null, 2) + '\n';
    }
    return out;
  }

  async runAll(): Promise<PluginUpdateResult[]> {
    const orgs = await this.orgs.find({ where: { isDemo: false } });
    const results: PluginUpdateResult[] = [];
    for (const org of orgs) results.push(await this.runFor(org.id));
    const proposed = results.filter((r) => r.action === 'proposed');
    if (proposed.length)
      this.logger.log(
        `Coach plugin ${this.bundledVersion()}: proposed to ${proposed.length} organisation(s)`,
      );
    return results;
  }

  async runFor(orgId: string): Promise<PluginUpdateResult> {
    const bundled = this.bundledVersion();
    if (!bundled)
      return {
        orgId,
        action: 'skipped',
        bundled: '?',
        installed: null,
        reason: 'no bundled plugin',
      };
    const repo = await this.git.repoFor(orgId);
    if (repo.mode !== 'clone')
      return {
        orgId,
        action: 'skipped',
        bundled,
        installed: null,
        reason: 'no marketplace remote',
      };
    if (!(await this.git.refresh(orgId)))
      return {
        orgId,
        action: 'skipped',
        bundled,
        installed: null,
        reason: repo.lastError ?? 'remote unreachable',
      };

    const current = await this.git.fileAt(
      orgId,
      repo.config.defaultBranch,
      `${COACH_PLUGIN_PATH}/${MANIFEST}`,
    );
    let installed: string | null = null;
    if (current) {
      try {
        installed =
          (JSON.parse(current) as { version?: string }).version ?? null;
      } catch {
        installed = null;
      }
    }
    if (installed && !isNewer(bundled, installed))
      return { orgId, action: 'current', bundled, installed };

    const branch = `activate/coach-plugin-v${bundled}`;
    if (await this.git.branchExists(orgId, branch))
      return { orgId, action: 'pending', bundled, installed, branch };

    const files = this.bundledFiles();
    const written = await this.git.writeFilesOnBranch(
      orgId,
      branch,
      files,
      installed
        ? `Coach plugin ${installed} → ${bundled}`
        : `Add the Activate Coach plugin ${bundled}`,
      AUTHOR,
      'coach-plugin',
    );
    if (!written)
      return {
        orgId,
        action: 'skipped',
        bundled,
        installed,
        branch,
        reason: repo.lastError ?? 'write failed',
      };

    let pullRequest: string | null = null;
    try {
      const pr = await this.git.openPullRequest(orgId, {
        head: branch,
        title: installed
          ? `Update the Activate Coach plugin to ${bundled}`
          : `Add the Activate Coach plugin (${bundled})`,
        body: [
          `This pull request comes from your Activate installation (version ${APP_VERSION}).`,
          '',
          installed
            ? `It updates the Coach plugin from ${installed} to ${bundled}.`
            : `It adds the Coach plugin, which lets people use Activate from inside Claude.`,
          '',
          'Review and merge it; Claude Enterprise picks the change up on its next sync. Nothing is changed on your default branch until you merge.',
        ].join('\n'),
      });
      pullRequest = pr?.url ?? null;
    } catch (e) {
      this.logger.warn(
        `Coach plugin branch pushed for ${orgId} but the pull request could not be opened: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return {
      orgId,
      action: 'proposed',
      bundled,
      installed,
      branch,
      pullRequest,
    };
  }
}
