import { Injectable } from '@nestjs/common';
import { authProvider, type AuthProvider } from '../../config/env';
import type { Person } from '../../orgs/entities/person.entity';
import { OAuthService } from '../oauth/oauth.service';
import { WorkosGuard } from '../workos.guard';

/**
 * Who presented this bearer token? One answer for both identity modes:
 *   workos  a WorkOS access token (cloud), verified against WorkOS's JWKS
 *   oidc    an access token Activate's own OAuth server issued after the customer's IdP signed the person in
 */
@Injectable()
export class IdentityService {
  constructor(
    private readonly workos: WorkosGuard,
    private readonly oauth: OAuthService,
  ) {}

  get provider(): AuthProvider {
    return authProvider();
  }

  resolveBearer(token: string): Promise<Person | null> {
    return this.provider === 'oidc'
      ? this.oauth.resolveAccessToken(token)
      : this.workos.resolveUser(token);
  }
}
