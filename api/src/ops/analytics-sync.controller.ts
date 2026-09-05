import { Controller, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrgId, Roles } from '../common/decorators';
import { AnalyticsSyncService } from './analytics-sync.service';

@ApiTags('Company admin')
@Controller('org')
@Roles('admin')
export class AnalyticsSyncController {
  constructor(private readonly sync: AnalyticsSyncService) {}

  @Post('sync-analytics')
  @ApiOperation({
    summary:
      'Run the Analytics API sync now for this org (last 3 days by default); returns counts. Skips when unconfigured.',
  })
  @ApiQuery({ name: 'days', required: false, description: '1..31, default 3' })
  run(@OrgId() orgId: string, @Query('days') days?: string) {
    const n = Math.min(31, Math.max(1, Number.parseInt(days ?? '3', 10) || 3));
    return this.sync.syncOrg(orgId, n);
  }
}
