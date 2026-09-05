import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { CurrentUser, OrgId, Roles } from '../common/decorators';
import type { Person } from '../orgs/entities/person.entity';
import type {
  ContextLayerKind,
  ContextSource,
} from './entities/context-source.entity';
import { ContextService, LAYERS, SOURCE_TYPES } from './context.service';

class CreateSourceDto {
  @IsIn(LAYERS) layer: ContextLayerKind;
  @IsOptional() ownerId?: string | null;
  @IsIn(SOURCE_TYPES) type: ContextSource['type'];
  @IsString() title: string;
  @IsOptional() uri?: string | null;
  @IsOptional() content?: string | null;
  @IsOptional() @IsObject() tags?: Record<string, string>;
}

class PatchSourceDto {
  @IsOptional()
  @IsIn(['pending', 'reviewed', 'rejected'])
  reviewState?: ContextSource['reviewState'];
  @IsOptional() @IsString() title?: string;
  @IsOptional() content?: string | null;
  @IsOptional() @IsObject() tags?: Record<string, string>;
}

/**
 * Three layers of context (company / team / person). Sources are reviewable evidence;
 * a layer is the AI-compiled summary the Coach, Interviewer and Builder read.
 */
@ApiTags('Context')
@Controller('context')
@Roles('champion', 'sponsor', 'admin')
export class ContextController {
  constructor(private readonly context: ContextService) {}

  @Get('sources')
  @ApiOperation({
    summary: 'List context sources, optionally by layer and owner.',
  })
  sources(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Query('layer') layer?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.context.listSources(
      orgId,
      user,
      layer || null,
      ownerId || null,
    );
  }

  @Post('sources')
  @ApiOperation({
    summary:
      'Add a source (transcript, proposal, org chart, SOP, policy, ...). Review before it is compiled.',
  })
  create(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Body() dto: CreateSourceDto,
  ) {
    return this.context.createSource(orgId, user, dto);
  }

  @Patch('sources/:id')
  @ApiOperation({
    summary:
      'Update review state (pending | reviewed | rejected), title, content or tags.',
  })
  patch(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('id') id: string,
    @Body() dto: PatchSourceDto,
  ) {
    return this.context.patchSource(orgId, user, id, dto);
  }

  @Get('layers')
  @ApiOperation({ summary: 'Compiled context layers with source counts.' })
  layers(@OrgId() orgId: string, @CurrentUser() user: Person) {
    return this.context.listLayers(orgId, user);
  }

  @Post('layers/:layer/:ownerId/rebuild')
  @ApiOperation({
    summary:
      'Re-summarise reviewed sources into the layer (task context.summarise). Use ownerId "company" for the company layer.',
  })
  rebuild(
    @OrgId() orgId: string,
    @CurrentUser() user: Person,
    @Param('layer') layer: string,
    @Param('ownerId') ownerId: string,
  ) {
    return this.context.rebuild(orgId, user, layer, ownerId);
  }
}
