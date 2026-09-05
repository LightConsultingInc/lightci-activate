import { Roles } from '../common/decorators';
import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SeedService } from './seed.service';

/**
 * Admin seed endpoints. Authentication is handled by the global guard; the orchestrator
 * adds a role check (lead/admin) on top of this controller.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
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
