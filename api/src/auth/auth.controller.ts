import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';
import { Repository } from 'typeorm';
import { CurrentUser, OrgId, Public, Roles } from '../common/decorators';
import { RUNG_META } from '../common/roles';
import { Org } from '../orgs/entities/org.entity';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { Placement } from '../learning/entities/placement.entity';
import { PeopleService } from './people.service';
import { WorkosService } from './workos.service';

class ConsentDto {
  @IsBoolean() accepted: boolean;
}

class InviteDto {
  @IsEmail() email: string;
  @IsOptional() @IsString() teamId?: string;
}

export interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string;
    title: string | null;
    avatarUrl: string | null;
    roles: string[];
    orgId: string | null;
    teamId: string | null;
    consentAt: Date | null;
    onboardedAt: Date | null;
    rung: number;
    rungLabel: string;
  } | null;
  org: {
    id: string;
    name: string;
    slug: string;
    isDemo: boolean;
    settings: Org['settings'];
  } | null;
  team: { id: string; name: string; slug: string } | null;
  orgs: { id: string; name: string; slug: string }[]; // for leads switching orgs
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly people: PeopleService,
    private readonly workos: WorkosService,
    @InjectRepository(Org) private readonly orgs: Repository<Org>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(Placement)
    private readonly placements: Repository<Placement>,
  ) {}

  @Get('me')
  @Public()
  @ApiOperation({
    summary:
      'The signed-in person with org, team and rung; { user: null } when signed out.',
  })
  async me(
    @CurrentUser() user?: Person,
    @OrgId() scopedOrgId?: string | null,
  ): Promise<MeResponse> {
    if (!user) return { user: null, org: null, team: null, orgs: [] };
    const isLead = user.roles.includes('lead');
    const orgId = scopedOrgId ?? user.orgId;
    const org = orgId
      ? await this.orgs.findOne({ where: { id: orgId } })
      : null;
    const team = user.teamId
      ? await this.teams.findOne({ where: { id: user.teamId } })
      : null;
    const placement = await this.placements.findOne({
      where: { personId: user.id },
      order: { placedAt: 'DESC' },
    });
    const rung = placement?.rung ?? 0;
    const orgs = isLead
      ? await this.orgs.find({ order: { name: 'ASC' } })
      : org
        ? [org]
        : [];
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        title: user.title,
        avatarUrl: user.avatarUrl,
        roles: user.roles,
        orgId: user.orgId,
        teamId: user.teamId,
        consentAt: user.consentAt,
        onboardedAt: user.onboardedAt,
        rung,
        rungLabel: `${RUNG_META[rung as 0].code} ${RUNG_META[rung as 0].name}`,
      },
      org: org
        ? {
            id: org.id,
            name: org.name,
            slug: org.slug,
            isDemo: org.isDemo,
            settings: org.settings,
          }
        : null,
      team: team ? { id: team.id, name: team.name, slug: team.slug } : null,
      orgs: orgs.map((o) => ({ id: o.id, name: o.name, slug: o.slug })),
    };
  }

  @Post('consent')
  @ApiOperation({
    summary:
      'Record the learner consent (what Activate sees and does not see).',
  })
  async consent(@CurrentUser() user: Person, @Body() dto: ConsentDto) {
    if (!dto.accepted) return { ok: false };
    await this.people['people'].update(user.id, { consentAt: new Date() });
    return { ok: true };
  }

  @Post('invites')
  @Roles('champion', 'admin')
  @ApiOperation({
    summary: 'Invite a person by email via WorkOS (org-scoped).',
  })
  async invite(
    @CurrentUser() inviter: Person,
    @Body() dto: InviteDto,
    @OrgId() scopedOrgId?: string | null,
  ) {
    const orgId = scopedOrgId ?? inviter.orgId;
    const org = orgId
      ? await this.orgs.findOne({ where: { id: orgId } })
      : null;
    const email = dto.email.trim().toLowerCase();
    let person = await this.people.findByEmail(email);
    if (!person) {
      person = this.people['people'].create({
        email,
        name: email.split('@')[0],
        orgId,
        teamId: dto.teamId ?? null,
        roles: ['learner'],
        status: 'invited',
      });
      await this.people['people'].save(person);
    }
    if (this.workos.enabled) {
      try {
        await this.workos.sendInvitation(
          email,
          org?.workosOrganizationId ?? null,
          inviter.workosUserId,
        );
      } catch (e) {
        return {
          ok: true,
          personId: person.id,
          invitation: 'failed',
          detail: e instanceof Error ? e.message : String(e),
        };
      }
    }
    return {
      ok: true,
      personId: person.id,
      invitation: this.workos.enabled ? 'sent' : 'skipped',
    };
  }
}
