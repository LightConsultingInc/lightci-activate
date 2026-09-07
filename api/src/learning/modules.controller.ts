import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray } from 'class-validator';
import { CurrentUser, OrgId } from '../common/decorators';
import { Person } from '../orgs/entities/person.entity';
import { ModulePrepService, type ModuleLesson, type ModuleReadiness } from './module-prep.service';

class PrepareModuleDto {
  @IsArray() lessons: ModuleLesson[];
}

@ApiTags('Learning')
@Controller('modules')
export class ModulesController {
  constructor(private readonly prep: ModulePrepService) {}

  @Post(':code/prepare')
  @ApiOperation({ summary: 'Prepare a module ahead of the learner: personalise its lessons and queue practice in the background. Returns readiness immediately.' })
  async prepare(@CurrentUser() user: Person, @OrgId() orgId: string, @Param('code') code: string, @Body() dto: PrepareModuleDto): Promise<ModuleReadiness> {
    const lessons = (Array.isArray(dto.lessons) ? dto.lessons : [])
      .filter((l) => l && typeof l === 'object' && typeof l.slug === 'string' && l.slug.trim())
      .map((l) => ({
        slug: l.slug.trim().slice(0, 120),
        rung: Number(l.rung ?? 0),
        title: String(l.title ?? l.slug),
        promise: String(l.promise ?? ''),
        body: String(l.body ?? ''),
        keyPoints: Array.isArray(l.keyPoints) ? l.keyPoints.map(String) : [],
        example: l.example && typeof l.example === 'object' ? l.example : { title: String(l.title ?? l.slug), text: '' },
        check: l.check && typeof l.check === 'object' ? l.check : { question: '', options: [], answer: 0, explanation: '' },
      }));
    return this.prep.prepare(user, orgId, code.slice(0, 40), lessons);
  }

  @Get(':code/readiness')
  @ApiOperation({ summary: 'Readiness of a prepared module without starting work.' })
  async readiness(@CurrentUser() user: Person, @OrgId() orgId: string, @Param('code') code: string): Promise<ModuleReadiness> {
    return this.prep.readiness(user, orgId, code.slice(0, 40));
  }
}
