import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { authProvider } from '../config/env';
import { OAuthService } from './oauth/oauth.service';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { IS_PUBLIC } from '../common/decorators';
import { currentStore, requestContext } from '../common/request-context';
import type { Person } from '../orgs/entities/person.entity';
import { PeopleService } from './people.service';
import { WorkosService } from './workos.service';

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** The Express request once the guard has run. */
export interface AuthedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: Person;
  orgId?: string | null;
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
    const existing = await this.people.findByWorkosId(workosUserId);
    if (existing) {
      if (
        !existing.lastSeenAt ||
        Date.now() - existing.lastSeenAt.getTime() > TOUCH_INTERVAL_MS
      ) {
        await this.people.touch(existing);
        // A fresh token means a fresh view of the person's IdP roles.
        await this.people.syncRoles(existing, idpRoles);
      }
      // A person provisioned before their company existed (or after a demo reset) is linked as soon as the org row appears.
      if (
        !existing.orgId &&
        payload.org_id &&
        !existing.roles.includes('lead')
      ) {
        const linked = await this.people.linkToWorkosOrg(
          existing,
          payload.org_id,
        );
        if (linked) return linked;
      }
      return existing;
    }
    const profile = await this.workos.getUser(workosUserId);
    return this.people.provisionFromWorkos(
      profile,
      payload.org_id ?? null,
      idpRoles,
    );
  }
}
