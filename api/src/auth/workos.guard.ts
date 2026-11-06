import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { authProvider, leadEmailDomains } from '../config/env';
import { OAuthService } from './oauth/oauth.service';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { IS_PUBLIC } from '../common/decorators';
import { currentStore, requestContext } from '../common/request-context';
import type { Person } from '../orgs/entities/person.entity';
import { PeopleService } from './people.service';
import { emailDomain } from './email-domains';
import {
  SIGN_IN_MESSAGES,
  emailOnDomains,
  newcomersMayJoin,
  sessionAllowed,
  type SignInPhase,
} from './sign-in-policy';
import {
  SignInPolicyService,
  SignInRefusedException,
  type PolicyOrg,
} from './sign-in-policy.service';
import { WorkosService } from './workos.service';

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** The Express request once the guard has run. */
export interface AuthedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: Person;
  orgId?: string | null;
  /** A token the company's sign-in policy refused, on a public route (which then runs anonymously). */
  signInRefusal?: SignInRefusedException;
}

/**
 * The org a request acts in. Only leads may pick one with `X-Activate-Org`;
 * everyone else is bound to their own org, and the header is ignored.
 */
export function resolveOrgId(
  user: Person | null | undefined,
  header: unknown,
): string | null {
  const override = typeof header === 'string' && header ? header : null;
  if (!user) return null;
  if (user.roles.includes('lead')) return override ?? user.orgId ?? null;
  return user.orgId ?? null;
}

interface WorkosClaims extends JWTPayload {
  org_id?: string;
  /** WorkOS session id: tells the guard how this session signed in. */
  sid?: string;
  role?: string;
  roles?: string[];
  permissions?: string[];
}

/**
 * Identity gate. Every HTTP request must carry a WorkOS access token unless the
 * route is @Public(). A valid token resolves (and on first login provisions)
 * the Person row and binds it to the request context. Leads (LightCI) may act
 * inside any org by sending `X-Activate-Org: <orgId>`.
 */
@Injectable()
export class WorkosGuard implements CanActivate {
  private readonly logger = new Logger(WorkosGuard.name);
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(
    private readonly reflector: Reflector,
    private readonly people: PeopleService,
    private readonly workos: WorkosService,
    private readonly moduleRef: ModuleRef,
    private readonly policy: SignInPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    const authorization = req.headers.authorization;
    const token = this.extractToken(
      typeof authorization === 'string' ? authorization : undefined,
    );
    let user: Person | null = null;
    // Dev-only impersonation for local MCP clients (see mcp.service.ts / MCP_DEV_USER_EMAIL).
    const devUser =
      process.env.NODE_ENV !== 'production' && process.env.MCP_DEV_USER_EMAIL
        ? req.headers['x-activate-dev-user']
        : undefined;
    if (
      typeof devUser === 'string' &&
      devUser.toLowerCase() === process.env.MCP_DEV_USER_EMAIL?.toLowerCase()
    ) {
      user = await this.people.findByEmail(devUser);
    }
    if (!user && token) {
      try {
        user = await this.resolveBearer(token);
      } catch (error) {
        // A sign-in the company's policy refuses says why. Public routes run anonymously instead and
        // keep the refusal on the request: the connector's /mcp answers its own 401 with the OAuth
        // discovery header so Claude signs in again, and /auth/me reports it to the web app.
        if (error instanceof SignInRefusedException) {
          if (!isPublic) throw error;
          req.signInRefusal = error;
        }
        this.logger.debug(
          `Token rejected: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (!user && !isPublic) throw new UnauthorizedException('Sign in required');

    const orgId = resolveOrgId(user, req.headers['x-activate-org']);
    // Someone who signed in before their company was set up has no org to act in.
    // Say so plainly instead of letting the header pick one.
    if (user && !isPublic && !orgId && !user.roles.includes('lead'))
      throw new ForbiddenException(
        "Your company isn't set up in Activate yet. Ask your administrator to finish setup, then sign in again.",
      );
    req.user = user ?? undefined;
    req.orgId = orgId;
    requestContext.enterWith({
      ...currentStore(),
      user: user ?? undefined,
      orgId,
    });
    return true;
  }

  /** Resolve any bearer this installation accepts (WorkOS, or Activate-issued in OIDC mode). */
  async resolveBearer(token: string): Promise<Person | null> {
    if (authProvider() === 'oidc') {
      const oauth = this.moduleRef.get(OAuthService, { strict: false });
      return oauth.resolveAccessToken(token);
    }
    return this.resolveUser(token);
  }

  private extractToken(header: string | undefined): string | null {
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }

  async resolveUser(token: string): Promise<Person | null> {
    if (!this.workos.enabled) return null;
    const clientId = this.workos.clientId;
    this.jwks ??= createRemoteJWKSet(
      new URL(`https://api.workos.com/sso/jwks/${clientId}`),
    );
    const { payload } = await jwtVerify<WorkosClaims>(token, this.jwks, {
      issuer: `https://api.workos.com/user_management/${clientId}`,
    });
    const workosUserId = payload.sub;
    if (!workosUserId) return null;

    const idpRoles = [payload.role, ...(payload.roles ?? [])].filter(
      (r): r is string => Boolean(r),
    );
    const tokenOrg = payload.org_id
      ? await this.policy.orgByWorkosId(payload.org_id)
      : null;
    const existing = await this.people.findByWorkosId(workosUserId);
    let person: Person;
    if (existing) {
      await this.checkExisting(existing, tokenOrg);
      person = await this.refresh(existing, idpRoles, payload.org_id);
    } else {
      person = await this.provision(
        workosUserId,
        idpRoles,
        payload.org_id ?? null,
        tokenOrg,
        payload.sid,
      );
    }
    await this.enforcePhase(person, workosUserId, payload.sid);
    return person;
  }

  /**
   * A known person signing in through a company's WorkOS organisation. The token never acts as
   * someone from another company or as a LightCI lead, and someone first seen without a company is
   * linked to it only once it is on single sign-on.
   */
  private async checkExisting(
    existing: Person,
    tokenOrg: PolicyOrg | null,
  ): Promise<void> {
    if (!tokenOrg || tokenOrg.isDemo) return;
    if (
      (existing.orgId && existing.orgId !== tokenOrg.id) ||
      existing.roles.includes('lead') ||
      !emailOnDomains(existing.email, tokenOrg.emailDomains)
    )
      refuse(SIGN_IN_MESSAGES.wrongDomain, HttpStatus.FORBIDDEN);
    if (
      !existing.orgId &&
      !newcomersMayJoin(await this.policy.phase(tokenOrg.workosOrganizationId))
    )
      refuse(SIGN_IN_MESSAGES.setupInviteOnly, HttpStatus.FORBIDDEN);
  }

  private async refresh(
    existing: Person,
    idpRoles: string[],
    workosOrgId: string | undefined,
  ): Promise<Person> {
    if (
      !existing.lastSeenAt ||
      Date.now() - existing.lastSeenAt.getTime() > TOUCH_INTERVAL_MS
    ) {
      await this.people.touch(existing);
      // A fresh token means a fresh view of the person's IdP roles.
      await this.people.syncRoles(existing, idpRoles);
    }
    // A person provisioned before their company existed (or after a demo reset) is linked as soon as the org row appears.
    if (!existing.orgId && workosOrgId && !existing.roles.includes('lead')) {
      const linked = await this.people.linkToWorkosOrg(existing, workosOrgId);
      if (linked) return linked;
    }
    return existing;
  }

  /**
   * First sign-in. Everything is checked before a row is created: the address must be on the
   * company's domains; once the company is past setup the session must be single sign-on; while it
   * is setting up (or WorkOS cannot say) only people invited in advance get in.
   */
  private async provision(
    workosUserId: string,
    idpRoles: string[],
    workosOrgId: string | null,
    tokenOrg: PolicyOrg | null,
    sessionId: string | undefined,
  ): Promise<Person> {
    const profile = await this.workos.getUser(workosUserId);
    if (tokenOrg && !tokenOrg.isDemo) {
      if (
        leadEmailDomains().includes(emailDomain(profile.email)) ||
        !emailOnDomains(profile.email, tokenOrg.emailDomains)
      )
        refuse(SIGN_IN_MESSAGES.wrongDomain, HttpStatus.FORBIDDEN);
      const phase = await this.policy.phase(tokenOrg.workosOrganizationId);
      await this.requireSession(phase, workosUserId, sessionId);
      if (!newcomersMayJoin(phase)) {
        const invited = await this.people.findByEmail(profile.email);
        if (!invited || invited.status === 'inactive')
          refuse(SIGN_IN_MESSAGES.setupInviteOnly, HttpStatus.FORBIDDEN);
      }
    }
    return this.people.provisionFromWorkos(profile, workosOrgId, idpRoles);
  }

  /**
   * Once a company is past setup (or its phase cannot be read), a session that did not sign in with
   * single sign-on is refused: a password or emailed-code session from setup, a token without a
   * session, or one WorkOS cannot describe. Leads are LightCI's own staff and exempt.
   */
  private async enforcePhase(
    person: Person,
    workosUserId: string,
    sessionId: string | undefined,
  ): Promise<void> {
    if (!person.orgId || person.roles.includes('lead')) return;
    const org = await this.policy.orgById(person.orgId);
    if (!org || org.isDemo) return;
    await this.requireSession(
      await this.policy.phase(org.workosOrganizationId),
      workosUserId,
      sessionId,
    );
  }

  private async requireSession(
    phase: SignInPhase,
    workosUserId: string,
    sessionId: string | undefined,
  ): Promise<void> {
    if (phase === 'setup') return;
    const method = sessionId
      ? await this.policy.sessionMethod(workosUserId, sessionId)
      : null;
    if (!sessionAllowed(phase, method))
      refuse(SIGN_IN_MESSAGES.ssoRequired, HttpStatus.UNAUTHORIZED);
  }
}

function refuse(message: string, status: HttpStatus): never {
  throw new SignInRefusedException(message, status);
}
