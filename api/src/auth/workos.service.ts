import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { WorkOS } from '@workos-inc/node';

export interface WorkosProfile {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  profilePictureUrl?: string | null;
}

/** Thin wrapper over the WorkOS SDK: profile lookup on first login, invitations, org membership. */
@Injectable()
export class WorkosService {
  private readonly logger = new Logger(WorkosService.name);
  private readonly client: WorkOS | null;
  readonly clientId = process.env.WORKOS_CLIENT_ID ?? '';

  constructor() {
    this.client = process.env.WORKOS_API_KEY
      ? new WorkOS(process.env.WORKOS_API_KEY)
      : null;
    if (!this.client)
      this.logger.warn('WORKOS_API_KEY not set: sign-in is disabled.');
  }

  get enabled(): boolean {
    return Boolean(this.client && this.clientId);
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
}
