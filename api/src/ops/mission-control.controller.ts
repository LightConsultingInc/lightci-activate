import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';
import { CurrentUser, OrgId, Roles } from '../common/decorators';
import type { Person } from '../orgs/entities/person.entity';
import { AuditorService } from './auditor.service';
import {
  MissionControlService,
  type PeopleSort,
} from './mission-control.service';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

class CostInputsDto {
  @IsOptional() @IsNumber() @Min(0) seatPriceMonthly?: number;
  @IsOptional() @IsNumber() @Min(0) premiumSeatPriceMonthly?: number;
  @IsOptional() @IsNumber() @Min(0) loadedHourlyRate?: number;
  @IsOptional() @IsNumber() @Min(0) lightciFeesMonthly?: number;
  @IsOptional() @IsNumber() @Min(0) championHoursPerMonth?: number;
}

class CreateReadoutDto {
  @IsIn(['org', 'team', 'person']) scopeType: 'org' | 'team' | 'person';
  @IsOptional() @IsUUID() scopeId?: string;
  @IsString() @Matches(DAY_RE) periodStart: string;
  @IsString() @Matches(DAY_RE) periodEnd: string;
}

@ApiTags('Mission Control')
@Controller('mc')
@Roles('sponsor', 'admin')
export class MissionControlController {
  constructor(
    private readonly mc: MissionControlService,
    private readonly auditor: AuditorService,
  ) {}

  @Get('adoption')
  @ApiOperation({
    summary:
      'Active on real work (WAU headline), depth, funnel, inactive seats, by team.',
  })
  @ApiQuery({ name: 'teamId', required: false })
  @ApiQuery({ name: 'range', required: false, enum: ['30d', '90d'] })
  adoption(
    @OrgId() orgId: string,
    @Query('teamId') teamId?: string,
    @Query('range') range?: string,
  ) {
    return this.mc.adoption(orgId, {
      teamId: teamId || null,
      range: range === '90d' ? '90d' : '30d',
    });
  }

  @Get('people')
  @ApiOperation({
    summary:
      'Ranked people with activation score components, rising/stalled/champion-candidate flags.',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: [
      'score',
      'rung',
      'hoursBack',
      'skillsPublished',
      'influence',
      'gradeQuality',
      'activeDays',
      'name',
    ],
  })
  people(@OrgId() orgId: string, @Query('sort') sort?: string) {
    return this.mc.people(orgId, (sort as PeopleSort) || 'score');
  }

  @Get('people/:id')
  @ApiOperation({
    summary:
      'Person page: ladder, journey timeline, baselines, measurements, usage series, coach notes, escalations.',
  })
  person(@OrgId() orgId: string, @Param('id') id: string) {
    return this.mc.person(orgId, id);
  }

  @Get('journey')
  @ApiOperation({
    summary:
      'Rung heatmap by team, cohorts by onboarding week, time-in-rung with stuck people, revisit compliance.',
  })
  journey(@OrgId() orgId: string) {
    return this.mc.journey(orgId);
  }

  @Get('groups')
  @ApiOperation({
    summary:
      'Group table: active %, rung mix, hours back per person, skills, promotion throughput, rework rate, queue age.',
  })
  groups(@OrgId() orgId: string) {
    return this.mc.groups(orgId);
  }

  @Get('groups/compare')
  @ApiOperation({
    summary:
      'Two groups side by side, normalised for size and program start date.',
  })
  compare(
    @OrgId() orgId: string,
    @Query('a') a?: string,
    @Query('b') b?: string,
  ) {
    if (!a || !b) throw new BadRequestException('a and b are required');
    return this.mc.compare(orgId, a, b);
  }

  @Get('skills')
  @ApiOperation({
    summary:
      'Library health rollup: flags, most/least used, by team, unowned, re-grade queue.',
  })
  skills(@OrgId() orgId: string, @CurrentUser() user: Person) {
    return this.mc.skills(orgId, user.id);
  }

  @Get('governance')
  @ApiOperation({
    summary:
      'Policy/boundary versions, promotion log, compliance-touch skills, assignment drift, events (Compliance API or audit log).',
  })
  governance(@OrgId() orgId: string, @CurrentUser() user: Person) {
    return this.mc.governance(orgId, user.id);
  }

  @Get('governance/export')
  @ApiOperation({
    summary: 'Audit export rows (promotion log + events) as JSON.',
  })
  governanceExport(@OrgId() orgId: string) {
    return this.mc.governanceExport(orgId);
  }

  @Get('backlog')
  @ApiOperation({
    summary:
      'Org-wide workflow backlog ranked by Scorer, per-team totals and SOW export rows.',
  })
  backlog(@OrgId() orgId: string, @CurrentUser() user: Person) {
    return this.mc.backlog(orgId, user.id);
  }

  @Get('cost')
  @ApiOperation({
    summary:
      'Seat, premium, program cost and return (every ROI figure carries its baseline refs).',
  })
  cost(@OrgId() orgId: string) {
    return this.mc.cost(orgId);
  }

  @Put('cost/inputs')
  @ApiOperation({
    summary:
      'Update client-entered cost inputs (seat prices, loaded hourly rate, fees, champion hours).',
  })
  costInputs(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Body() dto: CostInputsDto,
  ) {
    return this.mc.updateCostInputs(orgId, user, dto);
  }

  @Get('readouts')
  @ApiOperation({ summary: 'Readouts generated for this org, newest first.' })
  readouts(@OrgId() orgId: string) {
    return this.auditor.list(orgId);
  }

  @Post('readouts')
  @ApiOperation({
    summary:
      'Generate a footnoted readout for org/team/person over a period (Auditor).',
  })
  createReadout(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Body() dto: CreateReadoutDto,
  ) {
    if (dto.periodEnd < dto.periodStart)
      throw new BadRequestException('periodEnd must not be before periodStart');
    if (dto.scopeType !== 'org' && !dto.scopeId)
      throw new BadRequestException(
        'scopeId is required for team/person readouts',
      );
    return this.auditor.readout(
      orgId,
      dto.scopeType,
      dto.scopeType === 'org' ? null : dto.scopeId!,
      { start: dto.periodStart, end: dto.periodEnd },
      user.id,
    );
  }

  @Get('readouts/:id')
  readout(@OrgId() orgId: string, @Param('id') id: string) {
    return this.auditor.get(orgId, id);
  }
}
