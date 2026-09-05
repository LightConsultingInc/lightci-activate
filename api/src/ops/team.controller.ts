import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { isoDay } from '../common/dates';
import { CurrentUser, OrgId, Roles } from '../common/decorators';
import type { Person } from '../orgs/entities/person.entity';
import type { RubricScore } from '../learning/entities/grade.entity';
import { AuditorService } from './auditor.service';
import { addDaysIso } from './metrics.service';
import { TeamService } from './team.service';

class ChampionGradeDto {
  @IsArray() rubric: RubricScore[];
  @IsOptional() @IsString() feedback?: string;
  @IsIn(['pass', 'revise']) decision: 'pass' | 'revise';
}

@ApiTags('Team')
@Controller('team')
@Roles('champion', 'sponsor', 'admin')
export class TeamController {
  constructor(
    private readonly team: TeamService,
    private readonly auditor: AuditorService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Champion team view: roster, backlog, review queue, promotion queue, library, stats.',
  })
  view(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Query('teamId') teamId?: string,
  ) {
    return this.team.view(orgId, user, teamId || null);
  }

  @Post('reviews/:submissionId/grade')
  @ApiOperation({
    summary:
      'Champion grades a teammate submission (their own L5 exercise); records agreement with the Grader draft.',
  })
  grade(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('submissionId') submissionId: string,
    @Body() dto: ChampionGradeDto,
  ) {
    return this.team.gradeSubmission(orgId, user, submissionId, {
      rubric: dto.rubric,
      feedback: dto.feedback ?? '',
      decision: dto.decision,
    });
  }

  @Get('readout')
  @ApiOperation({
    summary:
      'Auditor readout for the team over the last 30 days (cached per day).',
  })
  async readout(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Query('teamId') teamId?: string,
  ) {
    const team = await this.team.resolveTeam(orgId, user, teamId || null);
    const end = isoDay();
    const start = addDaysIso(end, -29);
    const cached = await this.auditor.cachedToday(
      orgId,
      'team',
      team.id,
      start,
      end,
    );
    if (cached) return cached;
    return this.auditor.readout(
      orgId,
      'team',
      team.id,
      { start, end },
      user.id,
    );
  }
}
