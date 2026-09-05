import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SecretsService } from '../common/secrets.service';
import {
  IntegrationKind,
  OrgIntegration,
} from './entities/org-integration.entity';

export interface IntegrationSummary {
  kind: IntegrationKind;
  configured: boolean;
  source: 'org' | 'platform' | 'none';
  last4: string | null;
  status: OrgIntegration['status'] | null;
  verifiedAt: Date | null;
  verificationDetail: string | null;
  config: Record<string, string>;
}

const PLATFORM_ENV: Record<IntegrationKind, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  claude_compliance: 'CLAUDE_COMPLIANCE_API_KEY',
  claude_analytics: 'CLAUDE_ANALYTICS_API_KEY',
  claude_admin: 'CLAUDE_ADMIN_API_KEY',
  github: 'GITHUB_TOKEN',
};

/** Only the Anthropic key falls back to LightCI's platform key. Enterprise keys are strictly per client. */
const PLATFORM_FALLBACK: Record<IntegrationKind, boolean> = {
  anthropic: true,
  claude_compliance: false,
  claude_analytics: false,
  claude_admin: false,
  github: true,
};

@Injectable()
export class IntegrationsService {
  constructor(
    @InjectRepository(OrgIntegration)
    private readonly repo: Repository<OrgIntegration>,
    private readonly secrets: SecretsService,
  ) {}

  /** Resolve the secret to use for an org: the org's own key, else the platform key where allowed, else null. */
  async resolve(
    orgId: string | null | undefined,
    kind: IntegrationKind,
  ): Promise<{ secret: string; source: 'org' | 'platform' } | null> {
    if (orgId) {
      const row = await this.repo.findOne({ where: { orgId, kind } });
      if (row && row.status !== 'invalid')
        return {
          secret: this.secrets.decrypt(row.encryptedSecret),
          source: 'org',
        };
    }
    if (
      PLATFORM_FALLBACK[kind] ||
      process.env.ALLOW_PLATFORM_ENTERPRISE_KEYS === 'true'
    ) {
      const env = process.env[PLATFORM_ENV[kind]];
      if (env) return { secret: env, source: 'platform' };
    }
    return null;
  }

  async list(orgId: string): Promise<IntegrationSummary[]> {
    const rows = await this.repo.find({ where: { orgId } });
    const byKind = new Map(rows.map((r) => [r.kind, r]));
    const kinds: IntegrationKind[] = [
      'anthropic',
      'claude_compliance',
      'claude_analytics',
      'claude_admin',
      'github',
    ];
    return kinds.map((kind) => {
      const row = byKind.get(kind);
      if (row) {
        return {
          kind,
          configured: row.status !== 'invalid',
          source: 'org',
          last4: row.last4,
          status: row.status,
          verifiedAt: row.verifiedAt,
          verificationDetail: row.verificationDetail,
          config: row.config,
        };
      }
      const platform =
        (PLATFORM_FALLBACK[kind] ||
          process.env.ALLOW_PLATFORM_ENTERPRISE_KEYS === 'true') &&
        Boolean(process.env[PLATFORM_ENV[kind]]);
      return {
        kind,
        configured: platform,
        source: platform ? 'platform' : 'none',
        last4: null,
        status: null,
        verifiedAt: null,
        verificationDetail: null,
        config: {},
      };
    });
  }

  async upsert(
    orgId: string,
    kind: IntegrationKind,
    secret: string,
    addedByPersonId: string | null,
    config: Record<string, string> = {},
  ) {
    const trimmed = secret.trim();
    const existing = await this.repo.findOne({ where: { orgId, kind } });
    const row = existing ?? this.repo.create({ orgId, kind });
    row.encryptedSecret = this.secrets.encrypt(trimmed);
    row.last4 = trimmed.slice(-4);
    row.status = 'unverified';
    row.verifiedAt = null;
    row.verificationDetail = null;
    row.config = { ...(existing?.config ?? {}), ...config };
    row.addedByPersonId = addedByPersonId;
    return this.repo.save(row);
  }

  async markVerification(
    orgId: string,
    kind: IntegrationKind,
    ok: boolean,
    detail: string,
  ) {
    await this.repo.update(
      { orgId, kind },
      {
        status: ok ? 'verified' : 'invalid',
        verifiedAt: ok ? new Date() : null,
        verificationDetail: detail,
      },
    );
  }

  async remove(orgId: string, kind: IntegrationKind) {
    await this.repo.delete({ orgId, kind });
  }
}
