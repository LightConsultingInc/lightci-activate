import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Org } from '../orgs/entities/org.entity';
import { phaseFromConnections, type SignInPhase } from './sign-in-policy';
import { WorkosService } from './workos.service';

const PHASE_TTL_MS = 60_000;
const ORG_TTL_MS = 60_000;
const REFRESH_MIN_INTERVAL_MS = 10_000;
const SESSION_CACHE_MAX = 5_000;

/** A sign-in the policy refuses. The guard lets it through untouched so the person sees why. */
export class SignInRefusedException extends HttpException {
  constructor(message: string, status: HttpStatus) {
    // A string body: the error filter passes it through as the problem detail.
    super(message, status);
  }
}

/** What the guard needs to know about the company behind a WorkOS organisation. */
export interface PolicyOrg {
  id: string;
  isDemo: boolean;
  emailDomains: string[];
  workosOrganizationId: string;
}

/**
 * Remembers each company's sign-in phase and each session's sign-in method, so the guard does not
 * call WorkOS on every request. A phase is re-read after a minute, or at once when a connection
 * webhook arrives on this replica; a session's method never changes, so it is kept until evicted.
 * The first time a company is seen on single sign-on it is recorded on the org (`ssoSince`), which
 * makes the move one-way and survives restarts and WorkOS outages.
 */
@Injectable()
export class SignInPolicyService {
  private readonly logger = new Logger(SignInPolicyService.name);
  private readonly phases = new Map<
    string,
    { phase: SignInPhase; at: number }
  >();
  private readonly refreshedAt = new Map<string, number>();
  private readonly methods = new Map<string, string>();
  private readonly byWorkosId = new Map<
    string,
    { org: PolicyOrg | null; at: number }
  >();
  private readonly byOrgId = new Map<
    string,
    { org: PolicyOrg | null; at: number }
  >();
  /** Overridable in tests. */
  now: () => number = () => Date.now();

  constructor(
    private readonly workos: WorkosService,
    @InjectRepository(Org) private readonly orgs: Repository<Org>,
  ) {}

  private toPolicyOrg(org: Org | null): PolicyOrg | null {
    if (!org?.workosOrganizationId) return null;
    return {
      id: org.id,
      isDemo: Boolean(org.isDemo),
      emailDomains: org.emailDomains ?? [],
      workosOrganizationId: org.workosOrganizationId,
    };
  }

  /** The company behind a WorkOS organisation (null when Activate has none), cached briefly. */
  async orgByWorkosId(workosOrganizationId: string): Promise<PolicyOrg | null> {
    const cached = this.byWorkosId.get(workosOrganizationId);
    if (cached && this.now() - cached.at < ORG_TTL_MS) return cached.org;
    const org = this.toPolicyOrg(
      await this.orgs.findOne({ where: { workosOrganizationId } }),
    );
    this.byWorkosId.set(workosOrganizationId, { org, at: this.now() });
    return org;
  }

  /** The company an Activate org id belongs to, if it signs in through WorkOS; cached briefly. */
  async orgById(orgId: string): Promise<PolicyOrg | null> {
    const cached = this.byOrgId.get(orgId);
    if (cached && this.now() - cached.at < ORG_TTL_MS) return cached.org;
    const org = this.toPolicyOrg(
      await this.orgs.findOne({ where: { id: orgId } }),
    );
    this.byOrgId.set(orgId, { org, at: this.now() });
    return org;
  }

  /** The company's phase. A failed WorkOS call keeps the last known phase; `sso` is never left. */
  async phase(workosOrganizationId: string): Promise<SignInPhase> {
    const cached = this.phases.get(workosOrganizationId);
    if (cached?.phase === 'sso') return 'sso';
    if (cached && this.now() - cached.at < PHASE_TTL_MS) return cached.phase;
    const ssoSince = await this.ssoSince(workosOrganizationId);
    const phase = phaseFromConnections(
      ssoSince
        ? null
        : await this.workos.countActiveConnections(workosOrganizationId),
      ssoSince,
    );
    if (phase === 'unknown') return cached?.phase ?? 'unknown';
    if (phase === 'sso' && !ssoSince)
      await this.recordSso(workosOrganizationId);
    if (cached && cached.phase !== phase)
      this.logger.log(
        `Sign-in phase for ${workosOrganizationId} is now ${phase} (was ${cached.phase})`,
      );
    this.phases.set(workosOrganizationId, { phase, at: this.now() });
    return phase;
  }

  private async ssoSince(workosOrganizationId: string): Promise<string | null> {
    const org = await this.orgs.findOne({
      where: { workosOrganizationId },
      select: { id: true, settings: true },
    });
    return org?.settings?.identity?.ssoSince ?? null;
  }

  /** Remember, on the org itself, that the company moved to single sign-on. */
  private async recordSso(workosOrganizationId: string) {
    await this.orgs.query(
      `UPDATE "orgs"
          SET "settings" = jsonb_set(
                coalesce("settings", '{}'::jsonb),
                '{identity}',
                coalesce("settings"->'identity', '{}'::jsonb) || jsonb_build_object('ssoSince', $1::text))
        WHERE "workosOrganizationId" = $2`,
      [new Date(this.now()).toISOString(), workosOrganizationId],
    );
    this.logger.log(`${workosOrganizationId} moved to single sign-on`);
  }

  /** Forget a company's phase, so the next request asks WorkOS (connection webhooks). */
  invalidate(workosOrganizationId: string) {
    if (this.phases.get(workosOrganizationId)?.phase === 'sso') return;
    this.phases.delete(workosOrganizationId);
  }

  /** `invalidate`, at most once every few seconds per company: for a person pressing refresh. */
  refresh(workosOrganizationId: string) {
    const last = this.refreshedAt.get(workosOrganizationId);
    if (last !== undefined && this.now() - last < REFRESH_MIN_INTERVAL_MS)
      return;
    this.refreshedAt.set(workosOrganizationId, this.now());
    this.invalidate(workosOrganizationId);
  }

  /** How a session signed in, or null when WorkOS cannot say. */
  async sessionMethod(
    workosUserId: string,
    sessionId: string,
  ): Promise<string | null> {
    const known = this.methods.get(sessionId);
    if (known) return known;
    const method = await this.workos.sessionAuthMethod(workosUserId, sessionId);
    if (method) {
      if (this.methods.size >= SESSION_CACHE_MAX) this.methods.clear();
      this.methods.set(sessionId, method);
    }
    return method;
  }
}
