import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CurrentUser, Roles } from '../common/decorators';
import type { Person } from '../orgs/entities/person.entity';
import { LeadService } from './lead.service';

class CreateClientDto {
  @IsString() name: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() workosOrganizationId?: string | null;
  @IsOptional() industry?: string | null;
  @IsOptional() sponsorName?: string | null;
  @IsInt() @Min(0) seats: number;
  @IsOptional() @IsInt() @Min(0) premiumSeats?: number;
  @IsOptional() @IsIn(['client_hosted', 'lightci_hosted']) residencyMode?:
    'client_hosted' | 'lightci_hosted';
}

/** LightCI activation-lead console. Cross-org; lead role only (admins are not leads). */
@ApiTags('LightCI lead')
@Controller('lead')
@Roles('lead')
export class LeadController {
  constructor(private readonly lead: LeadService) {}

  @Get('queue')
  @ApiOperation({
    summary:
      'One queue across clients: escalations, approvals, stalled, wave status.',
  })
  queue() {
    return this.lead.queue();
  }

  @Get('clients')
  @ApiOperation({ summary: 'All client orgs with headline adoption numbers.' })
  clients() {
    return this.lead.clients();
  }

  @Post('clients')
  @ApiOperation({
    summary:
      'Create a client org (with default cost inputs and optional WorkOS org link).',
  })
  create(@CurrentUser() user: Person, @Body() dto: CreateClientDto) {
    return this.lead.createClient(user, dto);
  }

  @Get('clients/:id')
  @ApiOperation({
    summary:
      'Client detail with setup checklist, integrations summary, teams and waves.',
  })
  client(@Param('id') id: string) {
    return this.lead.client(id);
  }
}
