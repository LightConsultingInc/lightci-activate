import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, OrgId } from '../common/decorators';
import { Person } from '../orgs/entities/person.entity';
import { MemoryService, type PersonMemory } from './memory.service';

export type MemoryView = Pick<
  PersonMemory,
  | 'summary'
  | 'strengths'
  | 'struggles'
  | 'preferences'
  | 'version'
  | 'updatedAt'
> & { anchorWorkflows: string[]; eventCount: number };

@ApiTags('Learning')
@Controller()
export class MemoryController {
  constructor(private readonly memory: MemoryService) {}

  @Get('memory/me')
  @ApiOperation({
    summary:
      'What Coach knows about you: summary, strengths, struggles, preferences, memory version.',
  })
  async me(
    @CurrentUser() user: Person,
    @OrgId() orgId: string,
  ): Promise<MemoryView> {
    const m = await this.memory.get(user.id, orgId);
    return {
      summary: m.summary,
      strengths: m.strengths,
      struggles: m.struggles,
      preferences: m.preferences,
      anchorWorkflows: m.anchorWorkflows,
      version: m.version,
      updatedAt: m.updatedAt,
      eventCount: m.lastEvents.length,
    };
  }

  @Get('modules/:code/why-me')
  @ApiOperation({
    summary:
      'One sentence on why this module matters for the caller (cached per memory version).',
  })
  async whyMe(
    @CurrentUser() user: Person,
    @OrgId() orgId: string,
    @Param('code') code: string,
  ): Promise<{ line: string }> {
    return this.memory.whyMe(user, orgId, code.slice(0, 40));
  }
}
