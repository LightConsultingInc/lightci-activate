import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, OrgId, Roles } from '../common/decorators';
import type { Person } from '../orgs/entities/person.entity';
import { BuilderService } from './builder.service';
import type { WorkflowStatus } from './entities/workflow-map.entity';
import { ScorerService } from './scorer.service';
import { WorkflowsService } from './workflows.service';
import type {
  BaselineInput,
  CreateWorkflowInput,
  MeasurementInput,
  PatchWorkflowInput,
  WorkflowFilters,
} from './workflows.types';

/**
 * Workflows routes (docs/api-contract.md). Anyone in the org reads; learners and above create and edit
 * their own maps (champions edit any in their team); scoring, rescoring and building require the
 * owner or a champion; the backlog is readable by everyone in the org.
 */
@ApiTags('Workflows')
@Controller()
export class WorkflowsController {
  constructor(
    private readonly workflows: WorkflowsService,
    private readonly scorer: ScorerService,
    private readonly builder: BuilderService,
  ) {}

  @Get('workflows')
  @ApiOperation({ summary: 'List workflow maps (ranked by composite score).' })
  list(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Query('teamId') teamId?: string,
    @Query('status') status?: WorkflowStatus,
    @Query('nextWave') nextWave?: string,
    @Query('mine') mine?: string,
  ) {
    const filters: WorkflowFilters = {};
    if (teamId) filters.teamId = teamId;
    if (status) filters.status = status;
    if (nextWave !== undefined && nextWave !== '')
      filters.nextWave = nextWave === 'true' || nextWave === '1';
    if (mine === 'true' || mine === '1') filters.ownerPersonId = user.id;
    return this.workflows.list(orgId, filters, user.id);
  }

  @Get('backlog')
  @ApiOperation({
    summary:
      'Scored backlog with totals (hours at stake, candidates, in build, shipped, next wave).',
  })
  backlog(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Query('teamId') teamId?: string,
  ) {
    return this.workflows.backlog(orgId, teamId || undefined, user.id);
  }

  @Get('workflows/:id')
  @ApiOperation({
    summary: 'Workflow detail with schema, baselines and measurements.',
  })
  detail(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('id') id: string,
  ) {
    return this.workflows.getDetail(orgId, id, user.id);
  }

  @Post('workflows')
  @Roles('learner', 'champion', 'sponsor')
  @ApiOperation({ summary: 'Create a workflow map (candidate).' })
  create(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Body() body: CreateWorkflowInput,
  ) {
    return this.workflows.create(orgId, user, body);
  }

  @Patch('workflows/:id')
  @Roles('learner', 'champion', 'sponsor')
  @ApiOperation({
    summary:
      'Edit a workflow map (owner or champion). nextWave is champion-only.',
  })
  patch(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('id') id: string,
    @Body() body: PatchWorkflowInput,
  ) {
    return this.workflows.patch(orgId, user, id, body);
  }

  @Post('workflows/:id/score')
  @Roles('learner', 'champion', 'sponsor')
  @ApiOperation({
    summary:
      'Scorer: score this workflow (task scorer.workflow) and renormalise the org backlog.',
  })
  async score(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('id') id: string,
  ) {
    const map = await this.workflows.find(orgId, id);
    if (!(await this.workflows.canEdit(user, map)))
      throw new ForbiddenException(
        'Only the owner or a champion may score this workflow',
      );
    await this.scorer.score(map.id, user.id);
    return this.workflows.getDetail(orgId, map.id, user.id);
  }

  @Post('workflows/rescore')
  @Roles('champion', 'sponsor')
  @ApiOperation({
    summary:
      'Scorer: rescore every candidate (completeness ≥ 0.6), optionally for one team.',
  })
  rescore(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Query('teamId') teamId?: string,
  ) {
    return this.scorer.rescoreAll(orgId, teamId || undefined, user.id);
  }

  @Post('workflows/:id/build')
  @Roles('learner', 'champion', 'sponsor')
  @ApiOperation({
    summary:
      'Builder: draft a skill from this workflow (task builder.skill); owner = caller; workflow → in_build.',
  })
  async build(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('id') id: string,
  ) {
    const map = await this.workflows.find(orgId, id);
    if (!(await this.workflows.canEdit(user, map)))
      throw new ForbiddenException(
        'Only the owner or a champion may build from this workflow',
      );
    return this.builder.build(map.id, user);
  }

  @Post('workflows/:id/baseline')
  @Roles('learner', 'champion', 'sponsor')
  @ApiOperation({
    summary: 'Record a baseline (minutes/week, rework) for this workflow.',
  })
  baseline(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('id') id: string,
    @Body() body: BaselineInput,
  ) {
    return this.workflows.addBaseline(orgId, user, id, body);
  }

  @Post('workflows/:id/measurements')
  @Roles('learner', 'champion', 'sponsor')
  @ApiOperation({
    summary:
      'Record a measurement for a period; hoursBackPerWeek = (baseline − measured − rework) / 60.',
  })
  measurement(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('id') id: string,
    @Body() body: MeasurementInput,
  ) {
    return this.workflows.addMeasurement(orgId, user, id, body);
  }
}
