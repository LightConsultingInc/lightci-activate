import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Org } from '../orgs/entities/org.entity';
import { Person } from '../orgs/entities/person.entity';
import type { Role } from '../common/roles';
import type { WorkosProfile } from './workos.service';
import { leadEmailDomains } from '../config/env';
import { emailDomain } from './email-domains';
import type { UpstreamIdentity } from './identity/upstream-oidc.service';
import {
  DEFAULT_ROLE_MAPPING,
  applyRoleMapping,
  initialRoles,
  parseRoleMapping,
  type IdentityRoleMapping,
} from './role-mapping';

@Injectable()
export class PeopleService {
  private readonly logger = new Logger(PeopleService.name);

  constructor(
    @InjectRepository(Person) private readonly people: Repository<Person>,
    @InjectRepository(Org) private readonly orgs: Repository<Org>,
  ) {}

  findByWorkosId(workosUserId: string) {
    return this.people.findOne({ where: { workosUserId } });
  }

  findByEmail(email: string) {
    return this.people.findOne({ where: { email: email.toLowerCase() } });
  }

  findByIdentity(issuer: string, subject: string) {
    return this.people.findOne({
      where: { identityIssuer: issuer, identitySubject: subject },
    });
  }

  /**
   * Sign-in through the customer's own IdP (OIDC mode). Match by issuer+subject, then by
   * email (pre-created admins and invited people get linked instead of duplicated). The org
   * is the one owning the email domain, or the only org of a single-tenant install. Roles
   * follow the IdP groups through the org's mapping, AUTH_ROLE_MAP, or the default mapping.
   */
  async provisionFromOidc(identity: UpstreamIdentity): Promise<Person> {
    return this.people.manager.transaction(async (em) => {
      await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `${identity.issuer}|${identity.subject}`,
      ]);
      const repo = em.getRepository(Person);
      const email = identity.email.toLowerCase();
      const domain = emailDomain(email);
      const isLead = leadEmailDomains().includes(domain);
      const person =
        (await repo.findOne({
          where: {
            identityIssuer: identity.issuer,
            identitySubject: identity.subject,
          },
        })) ?? (await repo.findOne({ where: { email } }));

      const orgs = em.getRepository(Org);
      let org: Org | null = null;
      if (!isLead) {
        if (person?.orgId)
          org = await orgs.findOne({ where: { id: person.orgId } });
        if (!org && domain)
          org = await orgs
            .createQueryBuilder('o')
            .where(':domain = ANY(o."emailDomains")', { domain })
            .getOne();
        if (!org) {
          const all = await orgs.find({ where: { isDemo: false }, take: 2 });
          if (all.length === 1) org = all[0];
        }
      }
      const mapping: IdentityRoleMapping =
        org?.settings?.identity?.roleMapping ?? envRoleMapping();

      if (!person) {
        const roles: Role[] = isLead
          ? ['lead']
          : applyRoleMapping([], identity.groups, mapping);
        const saved = await repo.save(
          repo.create({
            email,
            name: identity.name ?? email.split('@')[0],
            identityIssuer: identity.issuer,
            identitySubject: identity.subject,
            orgId: isLead ? null : (org?.id ?? null),
            roles,
            avatarUrl: identity.avatarUrl,
            status: 'active',
            lastSeenAt: new Date(),
            cohortWeek: new Date().toISOString().slice(0, 10),
          }),
        );
        this.logger.log(
          `Provisioned person ${saved.id} at ${domain} via ${identity.issuer} (${roles.join(',')})`,
        );
        return saved;
      }

      person.identityIssuer = person.identityIssuer ?? identity.issuer;
      person.identitySubject = person.identitySubject ?? identity.subject;
      if (identity.name && person.name === person.email.split('@')[0])
        person.name = identity.name;
      if (!person.avatarUrl && identity.avatarUrl)
        person.avatarUrl = identity.avatarUrl;
      if (isLead) {
        if (!person.roles.includes('lead'))
          person.roles = [...person.roles, 'lead'];
        person.orgId = null;
      } else {
        if (!person.orgId && org) person.orgId = org.id;
        // Pre-created initial admins keep admin whatever the groups say (break-glass).
        const keepAdmin =
          person.roles.includes('admin') && person.status === 'invited';
        person.roles = applyRoleMapping(person.roles, identity.groups, mapping);
        if (keepAdmin && !person.roles.includes('admin'))
          person.roles = ['admin', ...person.roles];
      }
      person.status = 'active';
      person.lastSeenAt = new Date();
      return repo.save(person);
    });
  }

  findById(id: string) {
    return this.people.findOne({ where: { id } });
  }

  /** Attach an org-less person to the Activate org mapped to their WorkOS organization, if it exists yet. */
  async linkToWorkosOrg(
    person: Person,
    workosOrganizationId: string,
  ): Promise<Person | null> {
    const org = await this.orgs.findOne({ where: { workosOrganizationId } });
    if (!org) return null;
    person.orgId = org.id;
    return this.people.save(person);
  }

  async touch(person: Person) {
    await this.people.update(person.id, {
      lastSeenAt: new Date(),
      status: 'active',
    });
  }

  /**
   * Re-apply the org's role mapping to an existing person on sign-in. No-op when the
   * org has no mapping (manual grants stand) or the person is a lead.
   */
  async syncRoles(person: Person, idpRoles: string[]): Promise<Person> {
    if (person.roles.includes('lead') || !person.orgId) return person;
    const org = await this.orgs.findOne({ where: { id: person.orgId } });
    const mapping = org?.settings?.identity?.roleMapping;
    if (!mapping) return person;
    const next = applyRoleMapping(person.roles, idpRoles, mapping);
    if (sameRoles(next, person.roles)) return person;
    this.logger.log(
      `Roles for person ${person.id} now ${next.join(',')} (was ${person.roles.join(',')})`,
    );
    person.roles = next;
    return this.people.save(person);
  }

  /** Mark a person inactive after their IdP removed them. Returns the row, or null if unknown. */
  async deactivate(
    by: { workosUserId?: string; email?: string },
    reason: string,
  ): Promise<Person | null> {
    const person = by.workosUserId
      ? await this.findByWorkosId(by.workosUserId)
      : by.email
        ? await this.findByEmail(by.email)
        : null;
    if (!person || person.status === 'inactive') return person;
    person.status = 'inactive';
    await this.people.save(person);
    this.logger.log(`Deactivated person ${person.id} (${reason})`);
    return person;
  }

  /**
   * Login upsert. Match by WorkOS id, then by email (invited or seeded people get
   * their WorkOS id attached instead of a duplicate row). Runs under an advisory
   * lock so a burst of first-login requests cannot create duplicates.
   */
  async provisionFromWorkos(
    profile: WorkosProfile,
    workosOrganizationId: string | null,
    workosRoles: string[],
  ): Promise<Person> {
    return this.people.manager.transaction(async (em) => {
      await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        profile.id,
      ]);
      return this.upsert(em, profile, workosOrganizationId, workosRoles);
    });
  }

  private async upsert(
    em: EntityManager,
    profile: WorkosProfile,
    workosOrganizationId: string | null,
    workosRoles: string[],
  ) {
    const repo = em.getRepository(Person);
    const email = profile.email.toLowerCase();
    let person =
      (await repo.findOne({ where: { workosUserId: profile.id } })) ??
      (await repo.findOne({ where: { email } }));
    const name =
      [profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
      email.split('@')[0];
    const domain = emailDomain(email);
    const isLead = leadEmailDomains().includes(domain);

    // LightCI leads are never bound to one client: they switch orgs per request (X-Activate-Org).
    let orgId: string | null = isLead ? null : (person?.orgId ?? null);
    let org: Org | null = null;
    if (!isLead && !orgId && workosOrganizationId) {
      org = await em
        .getRepository(Org)
        .findOne({ where: { workosOrganizationId } });
      orgId = org?.id ?? null;
    } else if (!isLead && orgId) {
      org = await em.getRepository(Org).findOne({ where: { id: orgId } });
    }
    const mapping = org?.settings?.identity?.roleMapping;

    if (!person) {
      const roles: Role[] = isLead
        ? ['lead']
        : initialRoles(workosRoles, mapping);
      person = repo.create({
        email,
        name,
        workosUserId: profile.id,
        orgId,
        roles,
        avatarUrl: profile.profilePictureUrl ?? null,
        status: 'active',
        lastSeenAt: new Date(),
        cohortWeek: new Date().toISOString().slice(0, 10),
      });
      const saved = await repo.save(person);
      // Log the row, not the address: addresses stay out of log pipelines.
      this.logger.log(
        `Provisioned person ${saved.id} at ${domain} (${roles.join(',')})`,
      );
      return saved;
    }

    person.workosUserId = person.workosUserId ?? profile.id;
    if (!person.avatarUrl && profile.profilePictureUrl)
      person.avatarUrl = profile.profilePictureUrl;
    if (isLead && !person.roles.includes('lead'))
      person.roles = [...person.roles, 'lead'];
    if (isLead) person.orgId = null;
    else if (!person.orgId && orgId) person.orgId = orgId;
    // The IdP is the source of truth for mapped roles on every sign-in, except that a person
    // pre-created as an admin keeps admin on their first sign-in (break-glass, as in OIDC mode):
    // they are usually the one about to connect the IdP that will grant it from then on.
    if (!isLead && mapping) {
      const keepAdmin =
        person.roles.includes('admin') && person.status === 'invited';
      person.roles = applyRoleMapping(person.roles, workosRoles, mapping);
      if (keepAdmin && !person.roles.includes('admin'))
        person.roles = ['admin', ...person.roles];
    }
    person.status = 'active';
    person.lastSeenAt = new Date();
    return repo.save(person);
  }
}

function sameRoles(a: readonly Role[], b: readonly Role[]): boolean {
  return a.length === b.length && a.every((r) => b.includes(r));
}

/** AUTH_ROLE_MAP (JSON) for installs that map IdP groups instance-wide; falls back to the default names. */
function envRoleMapping(): IdentityRoleMapping {
  const raw = process.env.AUTH_ROLE_MAP;
  if (!raw) return DEFAULT_ROLE_MAPPING;
  try {
    const parsed = parseRoleMapping(JSON.parse(raw));
    return parsed.ok ? parsed.mapping : DEFAULT_ROLE_MAPPING;
  } catch {
    return DEFAULT_ROLE_MAPPING;
  }
}
