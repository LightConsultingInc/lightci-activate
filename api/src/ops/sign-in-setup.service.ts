import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { authProvider, leadEmailDomains } from '../config/env';
import { emailDomain } from '../auth/email-domains';
import type { SignInPhase } from '../auth/sign-in-policy';
import { SignInPolicyService } from '../auth/sign-in-policy.service';
import { WorkosService, type PortalIntent } from '../auth/workos.service';
import { Org } from '../orgs/entities/org.entity';
import { Person } from '../orgs/entities/person.entity';
import { AuditLog } from './entities/audit-log.entity';

/** WorkOS role given to invited admins, so the default mapping keeps them admin on every sign-in. */
const ADMIN_ROLE_SLUG = 'admin';

export interface SignInStatus {
  /** `workos`: cloud, the company connects its IdP here. `oidc`: self-hosted, set in the install. */
  provider: 'workos' | 'oidc';
  /** `none`: no WorkOS organisation linked yet (a LightCI lead creates it). */
  phase: SignInPhase | 'none';
  /** Active single sign-on connections; null when WorkOS could not be asked. */
  ssoConnections: number | null;
  directories: { type: string; state: string }[] | null;
  domains: { domain: string; state: string }[] | null;
  emailDomains: string[];
  admins: {
    id: string;
    name: string;
    email: string;
    status: string;
    lastSeenAt: string | null;
  }[];
}

/**
 * Self-serve sign-in setup for a company: its status, the links that send an admin straight
 * into WorkOS to connect their identity provider or directory, and inviting the admins who
 * will do it. Used by the company's own admins and by LightCI leads.
 */
@Injectable()
export class SignInSetupService {
  constructor(
    private readonly workos: WorkosService,
    private readonly policy: SignInPolicyService,
    @InjectRepository(Org) private readonly orgs: Repository<Org>,
    @InjectRepository(Person) private readonly people: Repository<Person>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
  ) {}

  private async org(orgId: string | null | undefined): Promise<Org> {
    // A lead with no company picked has no org to act in; never fall through to "any org".
    if (!orgId) throw new BadRequestException('Pick a company first.');
    const org = await this.orgs.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Org not found');
    return org;
  }

  async status(
    orgId: string,
    opts: { fresh?: boolean } = {},
  ): Promise<SignInStatus> {
    const org = await this.org(orgId);
    const admins = (
      await this.people.find({ where: { orgId }, order: { name: 'ASC' } })
    )
      .filter((p) => p.roles.includes('admin'))
      .map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        status: p.status,
        lastSeenAt: p.lastSeenAt ? p.lastSeenAt.toISOString() : null,
      }));
    const base = {
      emailDomains: org.emailDomains ?? [],
      admins,
    };
    if (authProvider() === 'oidc')
      return {
        ...base,
        provider: 'oidc',
        phase: 'sso',
        ssoConnections: null,
        directories: null,
        domains: null,
      };
    const workosOrgId = org.workosOrganizationId;
    if (!workosOrgId || !this.workos.enabled)
      return {
        ...base,
        provider: 'workos',
        phase: 'none',
        ssoConnections: null,
        directories: null,
        domains: null,
      };
    // Back from WorkOS: ask again instead of trusting a minute-old answer.
    if (opts.fresh) this.policy.refresh(workosOrgId);
    const [ssoConnections, directories, domains, phase] = await Promise.all([
      this.workos.countActiveConnections(workosOrgId),
      this.workos.listDirectories(workosOrgId),
      this.workos.organizationDomains(workosOrgId),
      this.policy.phase(workosOrgId),
    ]);
    return {
      ...base,
      provider: 'workos',
      phase,
      ssoConnections,
      directories:
        directories?.map((d) => ({ type: d.type, state: d.state })) ?? null,
      domains,
    };
  }

  /**
   * Just the phase, from the policy's cache: cheap enough for the home page and the banner, which
   * ask on every load. `none` when the company has no WorkOS organisation; `sso` in OIDC mode.
   */
  async phase(orgId: string): Promise<{ phase: SignInStatus['phase'] }> {
    const org = await this.org(orgId);
    if (authProvider() === 'oidc') return { phase: 'sso' };
    if (!org.workosOrganizationId || !this.workos.enabled)
      return { phase: 'none' };
    return { phase: await this.policy.phase(org.workosOrganizationId) };
  }

  /**
   * A WorkOS setup link, made at the moment someone clicks so it cannot expire on the way:
   * the browser is sent straight to it. WorkOS returns them to `returnUrl` when done.
   */
  async setupLink(
    actor: Person,
    orgId: string,
    intent: PortalIntent,
    returnUrl: string,
  ): Promise<{ url: string; intent: PortalIntent }> {
    const org = await this.org(orgId);
    if (authProvider() === 'oidc')
      throw new BadRequestException(
        'This installation signs in through the identity provider set up when it was installed.',
      );
    if (!org.workosOrganizationId)
      throw new BadRequestException(
        'This company has no identity organisation yet. Ask LightCI to finish creating it.',
      );
    if (!this.workos.enabled)
      throw new BadRequestException('WorkOS is not configured on this server.');
    const url = await this.workos.portalLink(
      org.workosOrganizationId,
      intent,
      returnUrl,
    );
    await this.audit.save(
      this.audit.create({
        orgId: org.id,
        actorPersonId: actor.id ?? null,
        action: 'identity.setup_link',
        subjectType: 'org',
        subjectId: org.id,
        meta: { intent },
      }),
    );
    return { url, intent };
  }

  /**
   * Invite an admin who will connect the company's sign-in. They are pre-created as an admin
   * (kept on their first sign-in, whatever the IdP says) and WorkOS emails them the invitation;
   * accepting it is their first sign-in, before single sign-on exists.
   */
  async inviteAdmin(
    actor: Person,
    orgId: string,
    input: { email: string; name?: string | null },
  ): Promise<{
    person: { id: string; email: string; status: string };
    invitation: 'sent' | 'skipped' | 'failed';
    detail?: string;
  }> {
    const org = await this.org(orgId);
    const email = (input.email ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      throw new BadRequestException('Enter a valid email address.');
    const domain = emailDomain(email);
    if (leadEmailDomains().includes(domain))
      throw new BadRequestException(
        `${domain} addresses are LightCI leads and cannot be a company's admin.`,
      );
    if (!(org.emailDomains ?? []).includes(domain))
      throw new BadRequestException(
        `${email} is not on one of ${org.name}'s email domains (${(org.emailDomains ?? []).join(', ') || 'none set'}).`,
      );
    let person = await this.people.findOne({ where: { email } });
    if (person && person.orgId && person.orgId !== org.id)
      throw new ConflictException('That person belongs to another company.');
    if (!person) {
      person = await this.people.save(
        this.people.create({
          email,
          name: input.name?.trim() || email.split('@')[0],
          orgId: org.id,
          roles: ['admin', 'sponsor', 'learner'],
          status: 'invited',
        }),
      );
    } else if (!person.roles.includes('admin') || !person.orgId) {
      // An existing person (a learner, or someone first seen without a company) becomes an admin of this one.
      if (!person.roles.includes('admin'))
        person.roles = ['admin', ...person.roles];
      person.orgId = org.id;
      if (input.name?.trim() && person.name === email.split('@')[0])
        person.name = input.name.trim();
      person = await this.people.save(person);
    }
    let invitation: 'sent' | 'skipped' | 'failed' = 'skipped';
    let detail: string | undefined;
    if (this.workos.enabled && org.workosOrganizationId) {
      try {
        await this.workos.sendInvitation(
          email,
          org.workosOrganizationId,
          null,
          ADMIN_ROLE_SLUG,
        );
        invitation = 'sent';
      } catch (e) {
        invitation = 'failed';
        detail = e instanceof Error ? e.message : String(e);
      }
    }
    await this.audit.save(
      this.audit.create({
        orgId: org.id,
        actorPersonId: actor.id ?? null,
        action: 'identity.admin_invited',
        subjectType: 'person',
        subjectId: person.id,
        meta: { invitation },
      }),
    );
    return {
      person: { id: person.id, email: person.email, status: person.status },
      invitation,
      ...(detail ? { detail } : {}),
    };
  }
}
