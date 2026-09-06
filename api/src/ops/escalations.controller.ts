import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { IsString, IsUUID } from 'class-validator';
import { In, Repository } from 'typeorm';
import { CurrentUser, OrgId, Roles } from '../common/decorators';
import { hasAnyRole } from '../common/roles.guard';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { AuditLog } from './entities/audit-log.entity';
import { Escalation } from './entities/escalation.entity';

class ResolveDto {
  @IsString() resolution: string;
}
class AssignDto {
  @IsUUID() personId: string;
}

/**
 * Escalations raised by the agents (Coach, Builder, Interviewer, Promoter, Grader) for a
 * human. Org-scoped; champions see the ones in their team, sponsors/admins/leads all of them.
 */
@ApiTags('Escalations')
@Controller('escalations')
@Roles('champion', 'sponsor', 'admin')
export class EscalationsController {
  constructor(
    @InjectRepository(Escalation)
    private readonly escalations: Repository<Escalation>,
    @InjectRepository(Person) private readonly people: Repository<Person>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List escalations for the org. state=open|in_progress|resolved|all (default open+in_progress).',
  })
  async list(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Query('state') state?: string,
  ) {
    const states =
      state === 'all' ? undefined : state ? [state] : ['open', 'in_progress'];
    const rows = await this.escalations.find({
      where: states
        ? { orgId, state: In(states as Escalation['state'][]) }
        : { orgId },
      order: { createdAt: 'DESC' },
    });
    const scoped = hasAnyRole(user, ['sponsor', 'admin'])
      ? rows
      : await this.filterToTeam(orgId, user, rows);
    const personIds = new Set<string>();
    for (const e of scoped) {
      if (e.assigneePersonId) personIds.add(e.assigneePersonId);
      if (e.subjectType === 'person' && e.subjectId) personIds.add(e.subjectId);
    }
    const people = personIds.size
      ? await this.people.find({ where: { id: In([...personIds]) } })
      : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    return scoped.map((e) => ({
      ...e,
      assignee: e.assigneePersonId
        ? summarise(byId.get(e.assigneePersonId))
        : null,
      subject:
        e.subjectType === 'person' && e.subjectId
          ? summarise(byId.get(e.subjectId))
          : null,
    }));
  }

  private async filterToTeam(orgId: string, user: Person, rows: Escalation[]) {
    const championOf = await this.teams.find({
      where: { orgId, championPersonId: user.id },
    });
    const teamIds = new Set(
      [user.teamId, ...championOf.map((t) => t.id)].filter((x): x is string =>
        Boolean(x),
      ),
    );
    if (teamIds.size === 0)
      return rows.filter((e) => e.assigneePersonId === user.id);
    const members = await this.people.find({
      where: { orgId, teamId: In([...teamIds]) },
      select: { id: true },
    });
    const memberIds = new Set(members.map((m) => m.id));
    return rows.filter(
      (e) =>
        e.assigneePersonId === user.id ||
        (e.subjectType === 'person' &&
          e.subjectId &&
          memberIds.has(e.subjectId)) ||
        (e.subjectType === 'team' && e.subjectId && teamIds.has(e.subjectId)),
    );
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: 'Resolve an escalation with a written resolution.' })
  async resolve(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('id') id: string,
    @Body() dto: ResolveDto,
  ) {
    const e = await this.load(orgId, id);
    if (!dto.resolution?.trim())
      throw new BadRequestException('resolution is required');
    e.state = 'resolved';
    e.resolution = dto.resolution.trim();
    e.resolvedAt = new Date();
    if (!e.assigneePersonId) e.assigneePersonId = user.id;
    await this.escalations.save(e);
    await this.audit.save(
      this.audit.create({
        orgId,
        actorPersonId: user.id,
        action: 'escalation.resolved',
        subjectType: 'escalation',
        subjectId: e.id,
        meta: { resolution: e.resolution, kind: e.kind },
      }),
    );
    return e;
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Assign an escalation to a person in the org.' })
  async assign(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('id') id: string,
    @Body() dto: AssignDto,
  ) {
    const e = await this.load(orgId, id);
    const assignee = await this.people.findOne({ where: { id: dto.personId } });
    if (
      !assignee ||
      (assignee.orgId !== orgId && !assignee.roles.includes('lead'))
    )
      throw new ForbiddenException('Assignee must belong to this org');
    e.assigneePersonId = assignee.id;
    if (e.state === 'open') e.state = 'in_progress';
    await this.escalations.save(e);
    await this.audit.save(
      this.audit.create({
        orgId,
        actorPersonId: user.id,
        action: 'escalation.assigned',
        subjectType: 'escalation',
        subjectId: e.id,
        meta: { assigneePersonId: assignee.id },
      }),
    );
    return { ...e, assignee: summarise(assignee) };
  }

  private async load(orgId: string | null, id: string) {
    // Leads may act without an org selected; everyone else must match the org scope.
    const e = await this.escalations.findOne(orgId ? { where: { id, orgId } } : { where: { id } });
    if (!e) throw new NotFoundException('Escalation not found');
    return e;
  }
}

function summarise(p: Person | undefined) {
  return p
    ? {
        id: p.id,
        name: p.name,
        email: p.email,
        teamId: p.teamId,
        avatarUrl: p.avatarUrl,
      }
    : null;
}
