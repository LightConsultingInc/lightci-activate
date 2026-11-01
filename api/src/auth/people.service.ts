import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Org } from '../orgs/entities/org.entity';
import { Person } from '../orgs/entities/person.entity';
import type { Role } from '../common/roles';
import type { WorkosProfile } from './workos.service';
import { leadEmailDomains } from '../config/env';
import { emailDomain } from './email-domains';
import { applyRoleMapping, initialRoles } from './role-mapping';

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
    // The IdP is the source of truth for mapped roles on every sign-in.
    if (!isLead && mapping)
      person.roles = applyRoleMapping(person.roles, workosRoles, mapping);
    person.status = 'active';
    person.lastSeenAt = new Date();
    return repo.save(person);
  }
}

function sameRoles(a: readonly Role[], b: readonly Role[]): boolean {
  return a.length === b.length && a.every((r) => b.includes(r));
}
