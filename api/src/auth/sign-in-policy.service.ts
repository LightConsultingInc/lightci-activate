import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Org } from '../orgs/entities/org.entity';
import { phaseFromConnections, type SignInPhase } from './sign-in-policy';
import { WorkosService } from './workos.service';

const PHASE_TTL_MS = 60_000;
const ORG_TTL_MS = 60_000;
const SESSION_CACHE_MAX = 5_000;

/** A sign-in the policy refuses. The guard lets it through untouched so the person sees why. */
export class SignInRefusedException extends HttpException {
  constructor(message: string, status: HttpStatus) {
    // A string body: the error filter passes it through as the problem detail.
    super(message, status);
  }
}

/**
 * Remembers each company's sign-in phase and each session's sign-in method, so the guard does
 * not call WorkOS on every request. A phase is re-read after a minute, or at once when a
 * connection webhook arrives; a session's method never changes, so it is kept until evicted.
 */
@Injectable()
export class SignInPolicyService {
  private readonly logger = new Logger(SignInPolicyService.name);
  private readonly phases = new Map<
    string,
    { phase: SignInPhase; at: number }
  >();
  private readonly methods = new Map<string, string>();
  private readonly orgLinks = new Map<
    string,
    { workosOrganizationId: string | null; isDemo: boolean; at: number }
  >();
  /** Overridable in tests. */
  now: () => number = () => Date.now();

  constructor(
    private readonly workos: WorkosService,
    @InjectRepository(Org) private readonly orgs: Repository<Org>,
  ) {}

  /** The company's phase. A failed WorkOS call keeps the last known phase. */
  async phase(workosOrganizationId: string): Promise<SignInPhase> {
    const cached = this.phases.get(workosOrganizationId);
    if (cached && this.now() - cached.at < PHASE_TTL_MS) return cached.phase;
    const phase = phaseFromConnections(
      await this.workos.countActiveConnections(workosOrganizationId),
    );
    if (phase === 'unknown') return cached?.phase ?? 'unknown';
    if (cached && cached.phase !== phase)
      this.logger.log(
        `Sign-in phase for ${workosOrganizationId} is now ${phase} (was ${cached.phase})`,
      );
    this.phases.set(workosOrganizationId, { phase, at: this.now() });
    return phase;
  }

  /** Forget a company's phase, so the next request asks WorkOS (connection webhooks). */
  invalidate(workosOrganizationId: string) {
    this.phases.delete(workosOrganizationId);
  }

  /**
   * The WorkOS organisation an Activate org is linked to, cached briefly (asked on every request).
   * Demo orgs report none: they sign in with demo passwords on purpose, so the policy skips them.
   */
  async workosOrganizationFor(orgId: string): Promise<string | null> {
    const cached = this.orgLinks.get(orgId);
    if (cached && this.now() - cached.at < ORG_TTL_MS)
      return cached.isDemo ? null : cached.workosOrganizationId;
    const org = await this.orgs.findOne({
      where: { id: orgId },
      select: { id: true, workosOrganizationId: true, isDemo: true },
    });
    const entry = {
      workosOrganizationId: org?.workosOrganizationId ?? null,
      isDemo: Boolean(org?.isDemo),
      at: this.now(),
    };
    this.orgLinks.set(orgId, entry);
    return entry.isDemo ? null : entry.workosOrganizationId;
  }

  /** The Activate org linked to a WorkOS organisation, if any. */
  findOrgByWorkosId(workosOrganizationId: string) {
    return this.orgs.findOne({ where: { workosOrganizationId } });
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
