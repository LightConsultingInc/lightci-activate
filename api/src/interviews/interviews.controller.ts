import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { CurrentUser, OrgId, Roles } from '../common/decorators';
import { Person } from '../orgs/entities/person.entity';
import type { WorkflowSchema } from '../workflows/entities/workflow-map.entity';
import { InterviewerService } from './interviewer.service';
import type {
  InterviewCompleteResponse,
  InterviewMode,
  InterviewView,
} from './interviews.types';

class StartDto {
  @IsIn(['intake', 'champion', 'workflow']) mode: InterviewMode;
  @IsOptional() @IsString() workflowMapId?: string;
  @IsOptional() @IsString() teamId?: string;
  @IsOptional() @IsBoolean() voice?: boolean;
}

class TurnDto {
  @IsString() @IsNotEmpty() content: string;
}

class VerifyDto {
  @IsBoolean() approved: boolean;
  @IsOptional() @IsObject() corrections?: Partial<WorkflowSchema>;
}

class VoiceTranscriptDto {
  @IsArray() @ArrayNotEmpty() turns: {
    role: 'user' | 'interviewer';
    content: string;
  }[];
}

@ApiTags('Interviews')
@Controller('interviews')
export class InterviewsController {
  constructor(private readonly interviewer: InterviewerService) {}

  @Post()
  @ApiOperation({
    summary: 'Start an Interviewer session (intake | champion | workflow).',
  })
  async start(
    @CurrentUser() user: Person,
    @OrgId() orgId: string,
    @Body() dto: StartDto,
  ): Promise<InterviewView> {
    if (!orgId) {
      throw new BadRequestException(
        user.roles.includes('lead')
          ? 'Choose a client first (the switcher in the Lead Console) before starting an interview.'
          : 'Your account is not linked to a company yet. Ask your LightCI lead to add you to a client.',
      );
    }
    const session = await this.interviewer.start(user, orgId, {
      mode: dto.mode,
      workflowMapId: dto.workflowMapId ?? null,
      teamId: dto.teamId ?? null,
      voice: dto.voice,
    });
    return this.interviewer.view(session);
  }

  @Get(':id')
  async get(
    @CurrentUser() user: Person,
    @OrgId() orgId: string,
    @Param('id') id: string,
  ): Promise<InterviewView> {
    const session = await this.interviewer.load(id, orgId);
    await this.interviewer.assertCanView(session, user);
    return this.interviewer.view(session);
  }

  @Post(':id/turns')
  @ApiOperation({
    summary:
      'One answer from the person; returns the next question, scribe and checker state (task interviewer.turn).',
  })
  async turn(
    @CurrentUser() user: Person,
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Body() dto: TurnDto,
  ): Promise<InterviewView> {
    const session = await this.interviewer.load(id, orgId);
    if (session.personId !== user.id)
      throw new ForbiddenException('Only the interviewee can answer.');
    return this.interviewer.view(
      await this.interviewer.turn(session, dto.content),
    );
  }

  @Post(':id/voice-transcript')
  @ApiOperation({
    summary:
      'Append voice turns from a Realtime session and re-run scribe/checker.',
  })
  async voiceTranscript(
    @CurrentUser() user: Person,
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Body() dto: VoiceTranscriptDto,
  ): Promise<InterviewView> {
    const session = await this.interviewer.load(id, orgId);
    if (session.personId !== user.id)
      throw new ForbiddenException(
        'Only the interviewee can append to their transcript.',
      );
    const turns = dto.turns.filter(
      (t) =>
        t &&
        (t.role === 'user' || t.role === 'interviewer') &&
        typeof t.content === 'string',
    );
    return this.interviewer.view(
      await this.interviewer.appendVoiceTranscript(session, turns),
    );
  }

  @Post(':id/complete')
  @ApiOperation({
    summary:
      'Close the interview: intake → context layer, workflow maps, diagnostic placement, first exercise; champion → team context + seed maps; workflow → filled map.',
  })
  async complete(
    @CurrentUser() user: Person,
    @OrgId() orgId: string,
    @Param('id') id: string,
  ): Promise<InterviewCompleteResponse> {
    const session = await this.interviewer.load(id, orgId);
    await this.interviewer.assertCanView(session, user);
    return this.interviewer.complete(session, user, orgId);
  }

  @Post(':id/verify')
  @Roles('champion', 'sponsor', 'admin', 'lead')
  @ApiOperation({
    summary:
      'Champion verifies (or rejects) the maps produced by this interview, optionally with corrections.',
  })
  async verify(
    @CurrentUser() user: Person,
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Body() dto: VerifyDto,
  ): Promise<InterviewView> {
    const session = await this.interviewer.load(id, orgId);
    await this.interviewer.assertCanView(session, user);
    return this.interviewer.view(
      await this.interviewer.verify(
        session,
        user,
        dto.approved,
        dto.corrections,
      ),
    );
  }
}
