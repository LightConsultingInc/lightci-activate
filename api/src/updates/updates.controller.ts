import { Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { UpdateCheckService, type UpdateStatus } from './update-check.service';

@ApiTags('admin')
@Controller('admin/updates')
@Roles('admin')
export class UpdatesController {
  constructor(private readonly updates: UpdateCheckService) {}

  @Get()
  @ApiOperation({
    summary:
      'Running version and whether a newer release is published (self-hosted; from the last daily check).',
  })
  status(): Promise<UpdateStatus> {
    return this.updates.status();
  }

  @Post('check')
  @ApiOperation({ summary: 'Check the release index now.' })
  check(): Promise<UpdateStatus> {
    return this.updates.check();
  }
}
