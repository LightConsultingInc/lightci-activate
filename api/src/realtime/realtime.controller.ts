import {
  BadGatewayException,
  Body,
  Controller,
  ForbiddenException,
  Logger,
  NotFoundException,
  NotImplementedException,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { IsString } from 'class-validator';
import { Repository } from 'typeorm';
import { CurrentUser, OrgId } from '../common/decorators';
import { InterviewSession } from '../interviews/entities/interview-session.entity';
import {
  buildRealtimeInstructions,
  FINISH_INTERVIEW_TOOL,
  FINISH_INTERVIEW_TOOL_NAME,
} from '../interviews/interviewer.prompts';
import { Person } from '../orgs/entities/person.entity';

class RealtimeSessionDto {
  @IsString() interviewId: string;
}

export interface RealtimeSessionResponse {
  clientSecret: string;
  model: string;
  expiresAt: string;
  instructions: string;
  /** Name of the function tool the agent calls to end the interview; the client then flushes turns and POSTs /complete. */
  finishTool: string;
}

interface ClientSecretResponse {
  value: string;
  expires_at: number; // unix seconds
  session?: { model?: string };
}

export const REALTIME_CLIENT_SECRETS_URL =
  'https://api.openai.com/v1/realtime/client_secrets';

/**
 * Mints an OpenAI Realtime ephemeral client secret for a voice interview. In voice mode the Realtime
 * agent IS the interviewer (single brain): the session carries the persona, plan, scribe state and full
 * transcript as `instructions`, plus the `finish_interview` function tool. The browser connects to
 * OpenAI with the secret; transcripts come back through POST /interviews/:id/voice-transcript, which runs
 * scribe + checker only. Request shape verified against the Realtime API reference (session.type/model/
 * instructions/audio.output.voice; tools under session.tools with type 'function'; response {value, expires_at, session}).
 */
@ApiTags('Realtime')
@Controller('realtime')
export class RealtimeController {
  private readonly logger = new Logger(RealtimeController.name);

  constructor(
    @InjectRepository(InterviewSession)
    private readonly sessions: Repository<InterviewSession>,
  ) {}

  @Post('session')
  @ApiOperation({
    summary:
      'Mint an OpenAI Realtime ephemeral client secret carrying the Interviewer persona for this interview. 501 when OPENAI_API_KEY is absent.',
  })
  async session(
    @CurrentUser() user: Person,
    @OrgId() orgId: string,
    @Body() dto: RealtimeSessionDto,
  ): Promise<RealtimeSessionResponse> {
    const interview = await this.sessions.findOne({
      where: { id: dto.interviewId, orgId },
    });
    if (!interview) throw new NotFoundException('Interview not found');
    if (interview.personId !== user.id)
      throw new ForbiddenException(
        'Only the interviewee can open a voice session.',
      );
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
      throw new NotImplementedException(
        'Voice interviews are not enabled: OPENAI_API_KEY is not configured on the API. Use the text interview instead.',
      );
    const model = process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime';
    const instructions = buildRealtimeInstructions(interview);
    const res = await fetch(REALTIME_CLIENT_SECRETS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 600 },
        session: {
          type: 'realtime',
          model,
          instructions,
          tools: [FINISH_INTERVIEW_TOOL],
          tool_choice: 'auto',
          audio: { output: { voice: 'marin' } },
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(
        `Realtime client secret failed (${res.status}): ${body.slice(0, 500)}`,
      );
      throw new BadGatewayException(
        `OpenAI Realtime rejected the session request (${res.status}).`,
      );
    }
    const json = (await res.json()) as ClientSecretResponse;
    if (!json.value)
      throw new BadGatewayException(
        'OpenAI Realtime returned no client secret.',
      );
    if (!interview.voice) {
      interview.voice = true;
      await this.sessions.save(interview);
    }
    return {
      clientSecret: json.value,
      model: json.session?.model ?? model,
      expiresAt: new Date(
        (json.expires_at ?? Math.floor(Date.now() / 1000) + 600) * 1000,
      ).toISOString(),
      instructions,
      finishTool: FINISH_INTERVIEW_TOOL_NAME,
    };
  }
}
