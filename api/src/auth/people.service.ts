import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Org } from '../orgs/entities/org.entity';
import { Person } from '../orgs/entities/person.entity';
import type { Role } from '../common/roles';
import type { WorkosProfile } from './workos.service';

const LEAD_DOMAINS = (process.env.LEAD_EMAIL_DOMAINS ?? 'lightci.com')
  .split(',')
  .map((d) => d.trim().toLowerCase());

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

  async touch(person: Person) {
    await this.people.update(person.id, {
      lastSeenAt: new Date(),
      status: 'active',
    });
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
    const domain = email.split('@')[1] ?? '';
    const isLead = LEAD_DOMAINS.includes(domain);

    let orgId: string | null = person?.orgId ?? null;
    if (!orgId && workosOrganizationId) {
      const org = await em
        .getRepository(Org)
        .findOne({ where: { workosOrganizationId } });
      orgId = org?.id ?? null;
    }

    if (!person) {
      const roles: Role[] = isLead
        ? ['lead']
        : workosRoles.includes('admin')
          ? ['admin', 'sponsor']
          : ['learner'];
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
      this.logger.log(`Provisioned ${email} (${roles.join(',')})`);
      return repo.save(person);
    }

    person.workosUserId = person.workosUserId ?? profile.id;
    if (!person.avatarUrl && profile.profilePictureUrl)
      person.avatarUrl = profile.profilePictureUrl;
    if (isLead && !person.roles.includes('lead'))
      person.roles = [...person.roles, 'lead'];
    if (!person.orgId && orgId) person.orgId = orgId;
    person.status = 'active';
    person.lastSeenAt = new Date();
    return repo.save(person);
  }
}
