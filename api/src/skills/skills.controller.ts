import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, OrgId, Roles } from '../common/decorators';
import { GraderService } from '../learning/grader.service';
import { toExerciseSummary, toGradeView } from '../learning/mappers';
import type { Person } from '../orgs/entities/person.entity';
import type { AssignmentMode } from './entities/skill-assignment.entity';
import type { SkillStatus } from './entities/skill.entity';
import { LibraryService } from './library.service';
import { PromoterService } from './promoter.service';
import type {
  CreateSkillInput,
  LibraryFilters,
  PatchSkillInput,
} from './skills.types';

/**
 * Skills & Library routes (docs/api-contract.md). Anyone in the org reads the library; learners and
 * above author; champions approve; admins manage assignments and sync. RolesGuard lets admin/lead
 * through every @Roles gate, so "champion+" is expressed as @Roles('champion', 'sponsor').
 */
@ApiTags('Skills & Library')
@Controller()
export class SkillsController {
  constructor(
    private readonly library: LibraryService,
    private readonly promoter: PromoterService,
    private readonly grader: GraderService,
  ) {}

  // ───────────────────────── library ─────────────────────────

  @Get('library')
  @ApiOperation({
    summary: 'Browse the skill library with facets, usage and health flags.',
  })
  browse(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Query('team') team?: string,
    @Query('family') family?: string,
    @Query('rung') rung?: string,
    @Query('status') status?: SkillStatus,
    @Query('q') q?: string,
    @Query('sort') sort?: LibraryFilters['sort'],
  ) {
    const filters: LibraryFilters = { personId: user.id };
    if (team) filters.team = team;
    if (family) filters.family = family;
    if (rung !== undefined && rung !== '')
      filters.rung = Number(String(rung).replace(/^L/i, ''));
    if (status) filters.status = status;
    if (q) filters.q = q;
    if (sort) filters.sort = sort;
    return this.library.listLibrary(orgId, filters);
  }

  @Get('skills/:slug')
  @ApiOperation({ summary: 'Skill detail by slug or id.' })
  detail(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('slug') slug: string,
  ) {
    return this.library.getDetail(orgId, slug, user.id);
  }

  @Post('skills')
  @Roles('learner', 'champion', 'sponsor')
  @ApiOperation({
    summary:
      'Create a draft skill (branch skill/<slug> in the marketplace repo when available).',
  })
  create(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Body() body: CreateSkillInput,
  ) {
    return this.library.create(orgId, user, body);
  }

  @Patch('skills/:id')
  @Roles('learner', 'champion', 'sponsor')
  @ApiOperation({
    summary:
      'Edit a skill (owner or champion). New SkillVersion when content changed.',
  })
  patch(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('id') id: string,
    @Body() body: PatchSkillInput,
  ) {
    return this.library.patch(orgId, user, id, body);
  }

  @Post('skills/:id/grade')
  @Roles('learner', 'champion', 'sponsor')
  @ApiOperation({
    summary:
      'Grade the skill text with the Grader (rubric + security review); writes a grader comment.',
  })
  async grade(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('id') id: string,
  ) {
    const skill = await this.library.findSkill(orgId, id);
    const boundary = await this.library.orgBoundary(orgId);
    const draft = await this.grader.gradeSkillText(
      orgId,
      skill.ownerPersonId ?? user.id,
      skill.skillMd,
      skill.sampleCases,
      skill.boundary,
      boundary,
    );
    const grade = await this.library.recordSkillGrade(
      orgId,
      skill,
      user,
      draft,
    );
    return {
      grade: toGradeView(grade),
      skill: await this.library.getDetail(orgId, skill.id, user.id),
    };
  }

  @Post('skills/:id/adopt')
  @Roles('learner', 'champion', 'sponsor')
  @ApiOperation({
    summary:
      'Adopt a skill: records the adoption and queues an "adopt on your own case" exercise.',
  })
  async adopt(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('id') id: string,
  ) {
    const { adoption, exercise } = await this.library.adopt(orgId, user, id);
    return { adoption, exercise: toExerciseSummary(exercise) };
  }

  @Post('skills/:id/fork')
  @Roles('learner', 'champion', 'sponsor')
  @ApiOperation({
    summary: 'Fork a skill into a new draft owned by the caller.',
  })
  fork(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('id') id: string,
    @Body() body: Partial<CreateSkillInput> = {},
  ) {
    return this.library.fork(orgId, user, id, body ?? {});
  }

  @Post('skills/:id/comments')
  @ApiOperation({
    summary: 'Comment on a skill (feeds the Grader on the next revision).',
  })
  comment(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('id') id: string,
    @Body() body: { body: string },
  ) {
    return this.library.comment(orgId, user, id, body?.body);
  }

  @Post('skills/:id/deprecate')
  @Roles('learner', 'champion', 'sponsor')
  @ApiOperation({
    summary:
      'Deprecate a skill (owner or champion), optionally naming a successor.',
  })
  deprecate(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('id') id: string,
    @Body() body: { successorSkillId?: string | null } = {},
  ) {
    return this.library.deprecate(
      orgId,
      user,
      id,
      body?.successorSkillId ?? null,
    );
  }

  @Post('skills/:id/promotion-requests')
  @Roles('learner', 'champion', 'sponsor')
  @ApiOperation({
    summary:
      'Promoter: package the skill for approval (requires a passing grade); opens the PR.',
  })
  requestPromotion(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('id') id: string,
  ) {
    return this.promoter.package(orgId, id, user);
  }

  @Get('skills/:id/regrade-check')
  @ApiOperation({
    summary: 'Previous vs current grade for the scheduled re-grade helper.',
  })
  regradeCheck(@OrgId() orgId: string, @Param('id') id: string) {
    return this.library.regradeCheck(orgId, id);
  }

  // ───────────────────────── promotions ─────────────────────────

  @Get('promotions')
  @Roles('champion', 'sponsor')
  @ApiOperation({ summary: 'Promotion queue.' })
  promotions(
    @OrgId() orgId: string,
    @Query('state') state?: 'pending' | 'all',
  ) {
    return this.promoter.list(orgId, state === 'all' ? 'all' : 'pending');
  }

  @Get('promotions/:id')
  @Roles('champion', 'sponsor')
  @ApiOperation({
    summary:
      'One-screen approval: promotion with current and previous SKILL.md.',
  })
  promotion(@OrgId() orgId: string, @Param('id') id: string) {
    return this.promoter.get(orgId, id);
  }

  @Post('promotions/:id/approve')
  @Roles('champion', 'sponsor')
  @ApiOperation({
    summary:
      'Approve as champion and/or compliance; merges when every required role has approved.',
  })
  approve(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('id') id: string,
    @Body() body: { note?: string } = {},
  ) {
    return this.promoter.approve(orgId, id, user, body?.note);
  }

  @Post('promotions/:id/send-back')
  @Roles('champion', 'sponsor')
  @ApiOperation({ summary: 'Send a promotion back to the author with a note.' })
  sendBack(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('id') id: string,
    @Body() body: { note: string },
  ) {
    return this.promoter.sendBack(orgId, id, user, body?.note);
  }

  // ───────────────────────── assignments & marketplace ─────────────────────────

  @Get('assignments')
  @Roles('admin')
  @ApiOperation({
    summary: 'Plugin ↔ team assignments (intended vs observed, drift).',
  })
  assignments(@OrgId() orgId: string, @Query('teamId') teamId?: string) {
    return this.library.listAssignments(orgId, teamId || undefined);
  }

  @Put('assignments')
  @Roles('admin')
  @ApiOperation({
    summary: 'Set the intended assignment mode of a plugin for a team.',
  })
  putAssignment(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Body()
    body: { plugin: string; teamId: string; intendedMode: AssignmentMode },
  ) {
    return this.library.putAssignment(orgId, user, body);
  }

  @Get('marketplace/status')
  @ApiOperation({
    summary: 'Marketplace repo status (branch, head, counts, last sync).',
  })
  marketplaceStatus(@OrgId() orgId: string) {
    return this.library.status(orgId);
  }

  @Post('marketplace/sync')
  @Roles('admin')
  @ApiOperation({
    summary:
      'Re-read the marketplace repo into the library (repo is source of truth for published skills).',
  })
  sync(@OrgId() orgId: string, @CurrentUser() user: Person) {
    return this.library.sync(orgId, user.id);
  }
}
