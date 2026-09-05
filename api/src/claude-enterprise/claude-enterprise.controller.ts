import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ClaudeEnterpriseService, addDays } from './claude-enterprise.service';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Thin admin endpoints over the LightCI fallback keys (env). Per-client keys are exercised by
 * the orchestrator through ClaudeEnterpriseService directly. Auth is provided by the global
 * guard; role restrictions can be layered on by the orchestrator when wiring the module.
 */
@ApiTags('Integrations: Claude Enterprise')
@Controller('integrations/claude')
export class ClaudeEnterpriseController {
  constructor(private readonly claude: ClaudeEnterpriseService) {}

  @Get('probe')
  @ApiOperation({
    summary:
      'Check which Claude Enterprise APIs the configured (env) keys can reach.',
  })
  probe() {
    return this.claude.probe();
  }

  @Get('members')
  @ApiOperation({
    summary:
      'Organisation members (Admin API, falling back to the Compliance directory).',
  })
  members() {
    return this.claude.listMembers();
  }

  @Get('groups')
  @ApiOperation({
    summary: 'RBAC groups (Admin API, falling back to the Compliance API).',
  })
  groups() {
    return this.claude.listGroups();
  }

  @Get('usage')
  @ApiOperation({
    summary:
      'Per-user daily usage metrics from the Analytics API. Defaults to the last 7 available days.',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'YYYY-MM-DD inclusive',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'YYYY-MM-DD inclusive',
  })
  @ApiQuery({
    name: 'groupId',
    required: false,
    description: 'rbac_group_... to scope the query',
  })
  usage(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupId') groupId?: string,
  ) {
    // Analytics data lags ~1 day; the most recent reliably available day is two days ago.
    const today = new Date().toISOString().slice(0, 10);
    const end = to ?? addDays(today, -2);
    const start = from ?? addDays(end, -6);
    if (!DAY_RE.test(start) || !DAY_RE.test(end))
      throw new BadRequestException('from/to must be YYYY-MM-DD');
    if (end < start)
      throw new BadRequestException('to must not be before from');
    if (Date.parse(end) - Date.parse(start) > 31 * 86_400_000)
      throw new BadRequestException('range must be 31 days or fewer');
    return this.claude.dailyUserMetrics(undefined, {
      from: start,
      to: end,
      groupId: groupId || undefined,
    });
  }
}
