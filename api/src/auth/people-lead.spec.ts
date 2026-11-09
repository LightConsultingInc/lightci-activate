import type { Person } from '../orgs/entities/person.entity';
import { PeopleService } from './people.service';

describe('PeopleService.ensureLead', () => {
  const saved: Person[] = [];
  const repo = {
    save: jest.fn((p: Person) => (saved.push(p), Promise.resolve(p))),
  };
  const service = new PeopleService(repo as never, {} as never);
  const person = (over: Partial<Person>): Person =>
    ({
      id: 'p1',
      email: 'zain+activate-lead@lightci.com',
      roles: ['learner'],
      orgId: null,
      ...over,
    }) as Person;
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    repo.save.mockClear();
  });

  it('makes someone on a lead domain a lead and unbinds them from any company', async () => {
    process.env.LEAD_EMAIL_DOMAINS = 'lightci.com';
    const p = await service.ensureLead(person({ orgId: 'org-x' }));
    expect(p.roles).toEqual(['lead', 'learner']);
    expect(p.orgId).toBeNull();
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('leaves everyone else, and existing leads, untouched', async () => {
    process.env.LEAD_EMAIL_DOMAINS = 'lightci.com';
    await service.ensureLead(person({ email: 'daron@jtcgroup.com' }));
    await service.ensureLead(person({ roles: ['lead'] }));
    process.env.LEAD_EMAIL_DOMAINS = '';
    await service.ensureLead(person({}));
    expect(repo.save).not.toHaveBeenCalled();
  });
});
