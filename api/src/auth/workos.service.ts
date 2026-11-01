import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DomainDataState, WorkOS } from '@workos-inc/node';
import { authProvider } from '../config/env';

export interface WorkosProfile {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  profilePictureUrl?: string | null;
}

export type PortalIntent = 'sso' | 'dsync';

/** A verified webhook event. `data` is whatever WorkOS sent for that event type. */
export interface WorkosWebhookEvent {
  id: string;
  event: string;
  data: Record<string, unknown>;
}

/**
 * Thin wrapper over the WorkOS SDK. Covers the cloud identity flow end to end:
 * profile lookup on first login, invitations, organisation provisioning, Admin
 * Portal links (customers connect their own SSO and directory), connection
 * status and webhook verification.
 */
@Injectable()
export class WorkosService {
  private readonly logger = new Logger(WorkosService.name);
  private readonly client: WorkOS | null;
  readonly clientId = process.env.WORKOS_CLIENT_ID ?? '';
  readonly webhookSecret = process.env.WORKOS_WEBHOOK_SECRET ?? '';

  constructor() {
    this.client = process.env.WORKOS_API_KEY
      ? new WorkOS(process.env.WORKOS_API_KEY)
      : null;
    if (!this.client && authProvider() === 'workos')
      this.logger.warn('WORKOS_API_KEY not set: sign-in is disabled.');
  }

  /** WorkOS is in play only in WorkOS identity mode; an OIDC install never provisions WorkOS organisations. */
  get enabled(): boolean {
    return authProvider() === 'workos' && Boolean(this.client && this.clientId);
  }

  private get workos(): WorkOS {
    if (!this.client)
      throw new BadRequestException(
        'WorkOS is not configured (WORKOS_API_KEY missing).',
      );
    return this.client;
  }

  async getUser(workosUserId: string): Promise<WorkosProfile> {
    const u = await this.workos.userManagement.getUser(workosUserId);
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      profilePictureUrl: u.profilePictureUrl,
    };
  }

  async getOrganizationName(organizationId: string): Promise<string | null> {
    try {
      const org =
        await this.workos.organizations.getOrganization(organizationId);
      return org.name;
    } catch {
      return null;
    }
  }

  /**
   * Create the customer's WorkOS organisation. Domains are registered as pending;
   * WorkOS verifies them when the customer connects SSO or a directory.
   */
  async createOrganization(
    name: string,
    domains: string[],
    externalId?: string,
  ): Promise<{ id: string; name: string }> {
    const org = await this.workos.organizations.createOrganization({
      name,
      externalId: externalId ?? null,
      domainData: domains.map((domain) => ({
        domain,
        state: DomainDataState.Pending,
      })),
    });
    return { id: org.id, name: org.name };
  }

  /**
   * A one-time Admin Portal link the customer's IT admin uses to connect their
   * identity provider (`sso`) or directory (`dsync`) without LightCI in the loop.
   */
  async portalLink(
    organizationId: string,
    intent: PortalIntent,
    returnUrl: string,
  ): Promise<string> {
    const { link } = await this.workos.adminPortal.generateLink({
      intent: intent,
      organization: organizationId,
      returnUrl,
    });
    return link;
  }

  /** Active SSO connections on the organisation; null when WorkOS cannot be asked. */
  async countActiveConnections(organizationId: string): Promise<number | null> {
    try {
      const page = await this.workos.sso.listConnections({ organizationId });
      return page.data.filter((c) => c.state === 'active').length;
    } catch (e) {
      this.logger.warn(
        `Could not list SSO connections for ${organizationId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return null;
    }
  }

  async sendInvitation(
    email: string,
    organizationId?: string | null,
    inviterUserId?: string | null,
  ) {
    return this.workos.userManagement.sendInvitation({
      email,
      ...(organizationId ? { organizationId } : {}),
      ...(inviterUserId ? { inviterUserId } : {}),
    });
  }

  /**
   * Verify a webhook signature over the raw request body and return the event, or throw.
   * The raw bytes are what WorkOS signed; re-serialising parsed JSON could differ.
   */
  constructWebhookEvent(
    rawBody: Buffer | string,
    signatureHeader: string,
  ): Promise<WorkosWebhookEvent> {
    if (!this.webhookSecret)
      throw new BadRequestException('WORKOS_WEBHOOK_SECRET is not configured');
    return this.workos.webhooks.constructEvent({
      payload: rawBody,
      sigHeader: signatureHeader,
      secret: this.webhookSecret,
    }) as unknown as Promise<WorkosWebhookEvent>;
  }
}
