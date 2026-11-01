import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../common/decorators';
import { PeopleService } from './people.service';
import { WorkosService, type WorkosWebhookEvent } from './workos.service';

export interface WebhookOutcome {
  received: true;
  event: string;
  action: 'deactivated' | 'roles_synced' | 'ignored' | 'unknown_person';
}

/**
 * WorkOS webhooks keep Activate in step with the customer's IdP between sign-ins:
 * someone removed from the directory or the organisation stops being able to act,
 * and a changed membership role is applied at once. Signature-verified; unknown
 * events are acknowledged and ignored so WorkOS does not retry them.
 */
@ApiExcludeController()
@Public()
@Controller('webhooks/workos')
export class WorkosWebhooksController {
  private readonly logger = new Logger(WorkosWebhooksController.name);

  constructor(
    private readonly workos: WorkosService,
    private readonly people: PeopleService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('workos-signature') signature: string | undefined,
  ): Promise<WebhookOutcome> {
    if (!this.workos.webhookSecret) throw new NotFoundException();
    if (!signature) throw new BadRequestException('Missing signature');
    // main.ts enables rawBody so the signature is checked over the bytes WorkOS sent.
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    let event: WorkosWebhookEvent;
    try {
      event = await this.workos.constructWebhookEvent(raw, signature);
    } catch (e) {
      this.logger.warn(
        `Rejected webhook: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw new BadRequestException('Invalid signature');
    }
    // The SDK's deserialiser drops fields it does not model (directory users keep only
    // their id). The body is verified at this point, so read those from the raw JSON.
    let rawData: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(raw.toString()) as { data?: unknown };
      if (parsed.data && typeof parsed.data === 'object')
        rawData = parsed.data as Record<string, unknown>;
    } catch {
      rawData = {};
    }
    return this.handle(event, rawData);
  }

  async handle(
    event: WorkosWebhookEvent,
    rawData: Record<string, unknown> = {},
  ): Promise<WebhookOutcome> {
    const data = event.data ?? {};
    const outcome = (action: WebhookOutcome['action']): WebhookOutcome => ({
      received: true,
      event: event.event,
      action,
    });
    switch (event.event) {
      case 'user.deleted': {
        const person = await this.people.deactivate(
          { workosUserId: str(data.id) },
          event.event,
        );
        return outcome(person ? 'deactivated' : 'unknown_person');
      }
      case 'organization_membership.deleted': {
        const person = await this.people.deactivate(
          { workosUserId: str(data.userId) },
          event.event,
        );
        return outcome(person ? 'deactivated' : 'unknown_person');
      }
      case 'organization_membership.updated': {
        const userId = str(data.userId);
        const person = userId ? await this.people.findByWorkosId(userId) : null;
        if (!person) return outcome('unknown_person');
        if (str(data.status) === 'inactive') {
          await this.people.deactivate({ workosUserId: userId }, event.event);
          return outcome('deactivated');
        }
        const role = (data.role as { slug?: string } | undefined)?.slug;
        await this.people.syncRoles(person, role ? [role] : []);
        return outcome('roles_synced');
      }
      case 'dsync.user.deleted': {
        const source = Array.isArray(data.emails) ? data : rawData;
        const emails = Array.isArray(source.emails)
          ? (source.emails as { primary?: boolean; value?: string }[])
          : [];
        const primary =
          emails.find((e) => e.primary)?.value ??
          emails[0]?.value ??
          str(source.email) ??
          str(data.email);
        const person = primary
          ? await this.people.deactivate({ email: primary }, event.event)
          : null;
        return outcome(person ? 'deactivated' : 'unknown_person');
      }
      default:
        return outcome('ignored');
    }
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}
