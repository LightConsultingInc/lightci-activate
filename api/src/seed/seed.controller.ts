import { Roles } from '../common/decorators';
import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SeedService } from './seed.service';

/**
 * Demo seed endpoints. Lead-only: `reset` truncates every tenant's tables, so a client
 * admin must never reach it. The whole module is left out unless `seedEnabled()` says
 * otherwise (cloud non-production, or ACTIVATE_ALLOW_SEED=true).
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('lead')
@Controller('admin/seed')
export class SeedController {
  constructor(private readonly seed: SeedService) {}

  @Post('reset')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Truncate every entity table and reseed the Meridian demo org.',
  })
  async reset(): Promise<{ ok: true; truncated: number; tables: string[] }> {
    const result = await this.seed.reset();
    return {
      ok: true,
      truncated: result.truncated.length,
      tables: result.truncated,
    };
  }

  @Post('populate/:orgId')
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Fill an existing org with the demo firm's teams, people, skills, usage and readouts, renamed for that firm. Touches nothing already in the org.",
  })
  async populate(
    @Param('orgId') orgId: string,
    @Body() body: { firmName?: string; shortName?: string; domain?: string },
  ): Promise<{ ok: true; rows: number; people: number; skills: number }> {
    const r = await this.seed.populateOrg(orgId, {
      firmName: body?.firmName ?? 'Demo Firm',
      shortName: body?.shortName ?? body?.firmName?.split(' ')[0] ?? 'Demo',
      domain: body?.domain ?? 'demo.local',
    });
    return { ok: true, ...r };
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Seed the demo org if it is not already present (idempotent).',
  })
  async run(): Promise<{ ok: true }> {
    await this.seed.run();
    return { ok: true };
  }
}
