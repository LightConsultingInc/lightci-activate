import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CurrentUser, OrgId, Roles } from '../common/decorators';
import type { MarketplaceRepo } from './entities/org.entity';
import type { Person } from './entities/person.entity';
import type { GovernedOrgSettings } from './org-settings';
import { OrgService } from './org.service';

class OrgPatchDto {
  @IsOptional() @IsObject() settings?: Partial<GovernedOrgSettings>;
  @IsOptional() @IsInt() @Min(0) seats?: number;
  @IsOptional() @IsInt() @Min(0) premiumSeats?: number;
  @IsOptional() marketplaceRepo?: MarketplaceRepo | null;
  @IsOptional() @IsString() name?: string;
  @IsOptional() industry?: string | null;
  @IsOptional() sponsorName?: string | null;
}

class IntegrationDto {
  @IsString() secret: string;
  @IsOptional() @IsObject() config?: Record<string, string>;
}

class TeamCreateDto {
  @IsString() name: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() championPersonId?: string | null;
  @IsOptional() @IsBoolean() inProgram?: boolean;
  @IsOptional() pluginName?: string | null;
  @IsOptional() rbacGroupId?: string | null;
  @IsOptional() purpose?: string | null;
  @IsOptional() programStartedOn?: string | null;
}

class TeamPatchDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() championPersonId?: string | null;
  @IsOptional() @IsBoolean() inProgram?: boolean;
  @IsOptional() pluginName?: string | null;
  @IsOptional() rbacGroupId?: string | null;
  @IsOptional() purpose?: string | null;
  @IsOptional() programStartedOn?: string | null;
}

class PersonPatchDto {
  @IsOptional() teamId?: string | null;
  @IsOptional() @IsArray() roles?: string[];
  @IsOptional() title?: string | null;
  @IsOptional() @IsIn(['invited', 'active', 'inactive']) status?:
    'invited' | 'active' | 'inactive';
  @IsOptional() @IsBoolean() premiumSeat?: boolean;
}

@ApiTags('Company admin')
@Controller('org')
@Roles('sponsor', 'admin')
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get()
  @ApiOperation({
    summary: 'The org: settings, marketplace repo, seats, counts.',
  })
  get(@OrgId() orgId: string) {
    return this.org.get(orgId);
  }

  @Patch()
  @Roles('admin')
  @ApiOperation({
    summary:
      'Update settings (usage policy, boundary with version bump), seats, marketplace repo.',
  })
  patch(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Body() dto: OrgPatchDto,
  ) {
    return this.org.patch(orgId, user, dto);
  }

  @Get('setup')
  @ApiOperation({
    summary:
      'Provisioning checklist: keys, SSO, groups, context, governance, repo, connector, baseline.',
  })
  setup(@OrgId() orgId: string) {
    return this.org.setup(orgId);
  }

  @Get('integrations')
  @ApiOperation({ summary: 'Integration summaries (never the secret).' })
  integrations(@OrgId() orgId: string) {
    return this.org.listIntegrations(orgId);
  }

  @Put('integrations/:kind')
  @Roles('admin')
  @ApiOperation({
    summary:
      'Store a client credential and verify it (anthropic, claude_analytics, claude_admin, claude_compliance, github).',
  })
  putIntegration(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('kind') kind: string,
    @Body() dto: IntegrationDto,
  ) {
    return this.org.putIntegration(orgId, user, kind, dto.secret, dto.config);
  }

  @Delete('integrations/:kind')
  @Roles('admin')
  deleteIntegration(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('kind') kind: string,
  ) {
    return this.org.deleteIntegration(orgId, user, kind);
  }

  @Post('integrations/:kind/verify')
  @Roles('admin')
  @ApiOperation({ summary: 'Re-verify a stored credential.' })
  verifyIntegration(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('kind') kind: string,
  ) {
    return this.org.verifyIntegration(orgId, user, kind);
  }
}

@ApiTags('Company admin')
@Controller('teams')
@Roles('champion', 'sponsor', 'admin')
export class TeamsController {
  constructor(private readonly org: OrgService) {}

  @Get()
  list(@OrgId() orgId: string) {
    return this.org.listTeams(orgId);
  }

  @Post()
  @Roles('sponsor', 'admin')
  create(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Body() dto: TeamCreateDto,
  ) {
    return this.org.createTeam(orgId, user, dto);
  }

  @Patch(':id')
  @Roles('sponsor', 'admin')
  patch(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('id') id: string,
    @Body() dto: TeamPatchDto,
  ) {
    return this.org.patchTeam(orgId, user, id, dto);
  }

  @Post('import-groups')
  @Roles('admin')
  @ApiOperation({
    summary:
      'Import Claude RBAC groups as teams via the Admin API (501 when no admin key is configured).',
  })
  importGroups(@OrgId() orgId: string, @CurrentUser() user: Person) {
    return this.org.importGroups(orgId, user);
  }
}

@ApiTags('Company admin')
@Controller('people')
@Roles('champion', 'sponsor', 'admin')
export class PeopleController {
  constructor(private readonly org: OrgService) {}

  @Get()
  list(@OrgId() orgId: string, @Query('teamId') teamId?: string) {
    return this.org.listPeople(orgId, teamId || null);
  }

  @Patch(':id')
  @Roles('sponsor', 'admin')
  patch(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('id') id: string,
    @Body() dto: PersonPatchDto,
  ) {
    return this.org.patchPerson(orgId, user, id, dto);
  }
}
