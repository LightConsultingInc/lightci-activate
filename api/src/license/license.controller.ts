import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { Roles } from '../common/decorators';
import { LicenseService, type LicenseState } from './license.service';

class InstallLicenseDto {
  @IsString() @MaxLength(20_000) license: string;
}

@ApiTags('admin')
@Controller('admin/license')
@Roles('admin')
export class LicenseController {
  constructor(private readonly license: LicenseService) {}

  @Get()
  @ApiOperation({
    summary:
      'License status for this installation (seats, expiry, read-only state).',
  })
  status(): Promise<LicenseState> {
    return this.license.state(true);
  }

  @Post()
  @ApiOperation({
    summary:
      'Install a renewed license (the JWT LightCI sent). Verified before it is stored.',
  })
  async install(@Body() dto: InstallLicenseDto): Promise<LicenseState> {
    try {
      return await this.license.install(dto.license);
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'That license could not be verified.',
      );
    }
  }
}
