import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { CurrentUser, OrgId, Roles } from '../common/decorators';
import type { Person } from '../orgs/entities/person.entity';
import { SignInSetupService } from './sign-in-setup.service';

class SetupLinkDto {
  @IsIn(['sso', 'dsync', 'domain_verification']) intent:
    | 'sso'
    | 'dsync'
    | 'domain_verification';
}

class InviteAdminDto {
  @IsEmail() email: string;
  @IsOptional() @IsString() name?: string;
}

const webUrl = () =>
  (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** Company admins: connect the company's own sign-in, without LightCI in the loop. */
@ApiTags('Company admin')
@Controller('org/sign-in')
@Roles('admin')
export class SignInSetupController {
  constructor(private readonly setup: SignInSetupService) {}

  @Get()
  @ApiOperation({
    summary:
      'How the company signs in: setup or single sign-on, connections, directory, domains, admins. `fresh=1` re-asks WorkOS.',
  })
  status(@OrgId() orgId: string, @Query('fresh') fresh?: string) {
    return this.setup.status(orgId, {
      fresh: fresh === '1' || fresh === 'true',
    });
  }

  @Post('setup-link')
  @ApiOperation({
    summary:
      'A WorkOS setup link (identity provider or directory), made now so the browser goes straight to it.',
  })
  setupLink(
    @CurrentUser() actor: Person,
    @OrgId() orgId: string,
    @Body() dto: SetupLinkDto,
  ) {
    return this.setup.setupLink(
      actor,
      orgId,
      dto.intent,
      `${webUrl()}/admin/sign-in?returned=${dto.intent}`,
    );
  }

  @Post('admins')
  @ApiOperation({
    summary: 'Invite another admin by email; WorkOS sends the invitation.',
  })
  inviteAdmin(
    @CurrentUser() actor: Person,
    @OrgId() orgId: string,
    @Body() dto: InviteAdminDto,
  ) {
    return this.setup.inviteAdmin(actor, orgId, dto);
  }
}

/** LightCI leads: invite the admin who will connect a client's sign-in. */
@ApiTags('LightCI lead')
@Controller('lead/clients')
@Roles('lead')
export class LeadSignInController {
  constructor(private readonly setup: SignInSetupService) {}

  @Get(':id/sign-in')
  @ApiOperation({ summary: "A client's sign-in status and admins." })
  status(@Param('id') id: string, @Query('fresh') fresh?: string) {
    return this.setup.status(id, { fresh: fresh === '1' || fresh === 'true' });
  }

  @Post(':id/admins')
  @ApiOperation({
    summary:
      "Invite a client's admin by email; WorkOS sends the invitation, and they connect sign-in themselves.",
  })
  inviteAdmin(
    @CurrentUser() actor: Person,
    @Param('id') id: string,
    @Body() dto: InviteAdminDto,
  ) {
    return this.setup.inviteAdmin(actor, id, dto);
  }
}
