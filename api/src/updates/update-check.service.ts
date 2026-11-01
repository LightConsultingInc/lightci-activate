import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { edition } from '../config/env';
import { InstanceSetting } from '../license/entities/instance-setting.entity';
import { APP_VERSION, compareVersions, isNewer } from './version';

export const UPDATE_INDEX_URL =
  'https://releases.lightci.com/activate/index.json';
const SETTING_KEY = 'updates.status';

/** The static index the release workflow publishes. */
export interface ReleaseIndex {
  product: string;
  latest: string;
  releases: {
    version: string;
    date: string;
    notes: string;
    advisory?: boolean;
    supported?: boolean;
  }[];
}

export interface UpdateStatus {
  /** false in the cloud edition or when UPDATE_CHECK_ENABLED=false. */
  enabled: boolean;
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  /** A release newer than ours carries a security advisory. */
  advisory: boolean;
  notesUrl: string | null;
  checkedAt: string | null;
  /** Set when the last check failed; the banner stays quiet, doctor shows it. */
  error: string | null;
  /** What an admin should read: one plain sentence, or null when there is nothing to say. */
  message: string | null;
}

type Stored = Omit<UpdateStatus, 'enabled' | 'current' | 'message'>;

/**
 * Tells an operator that a newer release exists (T7.4). One request a day to a static file, no
 * payload, nothing identifying; off entirely with UPDATE_CHECK_ENABLED=false for restricted
 * networks. The cloud edition is deployed by LightCI, so it never checks.
 */
@Injectable()
export class UpdateCheckService {
  private readonly logger = new Logger(UpdateCheckService.name);

  constructor(
    @InjectRepository(InstanceSetting)
    private readonly settings: Repository<InstanceSetting>,
  ) {}

  get enabled(): boolean {
    if (edition() !== 'self-hosted') return false;
    return process.env.UPDATE_CHECK_ENABLED !== 'false';
  }

  get indexUrl(): string {
    return process.env.UPDATE_INDEX_URL ?? UPDATE_INDEX_URL;
  }

  /** Fetch the index and store what it says. Returns the new status; never throws. */
  async check(): Promise<UpdateStatus> {
    if (!this.enabled) return this.status();
    let stored: Stored;
    try {
      const res = await fetch(this.indexUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`release index returned ${res.status}`);
      const index = (await res.json()) as ReleaseIndex;
      stored = this.evaluate(index);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn(`update check failed: ${message}`);
      const previous = await this.read();
      stored = {
        ...(previous ?? {
          latest: null,
          updateAvailable: false,
          advisory: false,
          notesUrl: null,
        }),
        checkedAt: new Date().toISOString(),
        error: message,
      };
    }
    await this.settings.save({
      key: SETTING_KEY,
      value: JSON.stringify(stored),
    });
    return this.status();
  }

  evaluate(index: ReleaseIndex): Stored {
    if (
      !index ||
      typeof index !== 'object' ||
      !Array.isArray(index.releases) ||
      typeof index.latest !== 'string'
    )
      throw new Error('release index has an unexpected shape');
    const newer = index.releases
      .filter(
        (r) => typeof r.version === 'string' && isNewer(r.version, APP_VERSION),
      )
      .sort((a, b) => compareVersions(b.version, a.version));
    const latest = newer[0] ?? null;
    return {
      latest: latest?.version ?? index.latest,
      updateAvailable: latest !== null,
      advisory: newer.some((r) => r.advisory === true),
      notesUrl: latest?.notes ?? null,
      checkedAt: new Date().toISOString(),
      error: null,
    };
  }

  async status(): Promise<UpdateStatus> {
    const stored = await this.read();
    const base: UpdateStatus = {
      enabled: this.enabled,
      current: APP_VERSION,
      latest: stored?.latest ?? null,
      updateAvailable: stored?.updateAvailable ?? false,
      advisory: stored?.advisory ?? false,
      notesUrl: stored?.notesUrl ?? null,
      checkedAt: stored?.checkedAt ?? null,
      error: stored?.error ?? null,
      message: null,
    };
    if (base.enabled && base.updateAvailable && base.latest)
      base.message = base.advisory
        ? `Activate ${base.latest} fixes a security issue. You are on ${base.current}; upgrade soon.`
        : `Activate ${base.latest} is available. You are on ${base.current}.`;
    return base;
  }

  private async read(): Promise<Stored | null> {
    const row = await this.settings.findOne({ where: { key: SETTING_KEY } });
    if (!row) return null;
    try {
      return JSON.parse(row.value) as Stored;
    } catch {
      return null;
    }
  }
}
