import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../common/roles.guard';
import { Org } from '../orgs/entities/org.entity';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { Placement } from '../learning/entities/placement.entity';
import { IdentityService } from './identity/identity.service';
import { UpstreamOidcService } from './identity/upstream-oidc.service';
import { InstanceKey } from './oauth/entities/instance-key.entity';
import { OAuthClient } from './oauth/entities/oauth-client.entity';
import { OAuthCode } from './oauth/entities/oauth-code.entity';
import { OAuthLoginState } from './oauth/entities/oauth-login-state.entity';
import { OAuthRefreshToken } from './oauth/entities/oauth-refresh-token.entity';
import { KeysService } from './oauth/keys.service';
import { OAuthController } from './oauth/oauth.controller';
import { OAuthService } from './oauth/oauth.service';
import { AuthController } from './auth.controller';
import { LookupService } from './lookup.service';
import { PeopleService } from './people.service';
import { WorkosWebhooksController } from './workos-webhooks.controller';
import { WorkosGuard } from './workos.guard';
import { WorkosService } from './workos.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Person,
      Org,
      Team,
      Placement,
      InstanceKey,
      OAuthClient,
      OAuthCode,
      OAuthRefreshToken,
      OAuthLoginState,
    ]),
  ],
  controllers: [AuthController, WorkosWebhooksController, OAuthController],
  providers: [
    PeopleService,
    WorkosService,
    LookupService,
    KeysService,
    UpstreamOidcService,
    OAuthService,
    IdentityService,
    WorkosGuard,
    { provide: APP_GUARD, useExisting: WorkosGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [
    PeopleService,
    WorkosService,
    WorkosGuard,
    OAuthService,
    IdentityService,
    UpstreamOidcService,
  ],
})
export class AuthModule {}
