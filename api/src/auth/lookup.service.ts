import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Org } from '../orgs/entities/org.entity';
import { emailDomain } from './email-domains';
import type { SignInPhase } from './sign-in-policy';
import { SignInPolicyService } from './sign-in-policy.service';

/**
 * `sso`: the company's own single sign-on. `setup`: the company is still connecting it, so
 * the people it invited sign in on WorkOS's hosted page instead. `password`: demo orgs.
 */
export type SignInMode = 'sso' | 'setup' | 'password' | 'unknown';

export interface SignInLookup {
  mode: SignInMode;
  /** WorkOS organisation to start SSO against (`sso` and `setup`). */
  organizationId?: string;
  /** Whether the password form may be shown alongside. */
  passwordAllowed: boolean;
}

/** The subset of Org the lookup needs; keeps the pure function testable without a database. */
export type LookupOrg = Pick<Org, 'workosOrganizationId' | 'isDemo'>;

/**
 * Decide how a person signs in from their email alone. Reveals only the sign-in
 * method for a domain, never whether a particular address exists.
 */
export function decideSignIn(
  org: LookupOrg | null,
  opts: { passwordLogin: boolean },
  phase: SignInPhase = 'sso',
): SignInLookup {
  if (org?.isDemo) return { mode: 'password', passwordAllowed: true };
  if (org?.workosOrganizationId)
    return {
      // When WorkOS cannot be asked, keep sending people to SSO as before.
      mode: phase === 'setup' ? 'setup' : 'sso',
      organizationId: org.workosOrganizationId,
      passwordAllowed: opts.passwordLogin,
    };
  return { mode: 'unknown', passwordAllowed: true };
}

/** Fixed-window limiter, per key. Small and in-process: it guards a public endpoint from bulk probing. */
export class RateLimiter {
  private readonly hits = new Map<
    string,
    { count: number; windowStart: number }
  >();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** True when the call is allowed. */
  take(key: string): boolean {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || t - entry.windowStart >= this.windowMs) {
      this.hits.set(key, { count: 1, windowStart: t });
      if (this.hits.size > 10_000) this.sweep(t);
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  private sweep(t: number) {
    for (const [k, v] of this.hits)
      if (t - v.windowStart >= this.windowMs) this.hits.delete(k);
  }
}

@Injectable()
export class LookupService {
  readonly limiter = new RateLimiter(30, 60_000);

  constructor(
    @InjectRepository(Org) private readonly orgs: Repository<Org>,
    private readonly policy: SignInPolicyService,
  ) {}

  async lookup(email: string): Promise<SignInLookup> {
    const domain = emailDomain(email);
    const org = domain
      ? await this.orgs
          .createQueryBuilder('o')
          .where(':domain = ANY(o."emailDomains")', { domain })
          .getOne()
      : null;
    const phase =
      org?.workosOrganizationId && !org.isDemo
        ? await this.policy.phase(org.workosOrganizationId)
        : 'sso';
    return decideSignIn(
      org,
      { passwordLogin: process.env.AUTH_PASSWORD_LOGIN === 'true' },
      phase,
    );
  }
}
