import { HttpStatus } from '@nestjs/common';
import type { Person } from '../orgs/entities/person.entity';
import {
  SIGN_IN_MESSAGES,
  emailOnDomains,
  newcomersMayJoin,
  phaseFromConnections,
  sessionAllowed,
} from './sign-in-policy';
import {
  SignInPolicyService,
  SignInRefusedException,
  type PolicyOrg,
} from './sign-in-policy.service';
import { WorkosGuard } from './workos.guard';

describe('sign-in phases', () => {
  it('is setup until a connection is active, sso after, and sso for good once recorded', () => {
    expect(phaseFromConnections(0)).toBe('setup');
    expect(phaseFromConnections(2)).toBe('sso');
    expect(phaseFromConnections(null)).toBe('unknown');
    expect(phaseFromConnections(0, '2026-11-06T00:00:00Z')).toBe('sso');
    expect(phaseFromConnections(null, '2026-11-06T00:00:00Z')).toBe('sso');
  });

  it('accepts only SSO (and WorkOS support impersonation) unless the company is setting up', () => {
    for (const phase of ['sso', 'unknown'] as const) {
      expect(sessionAllowed(phase, 'sso')).toBe(true);
      expect(sessionAllowed(phase, 'impersonation')).toBe(true);
      expect(sessionAllowed(phase, 'password')).toBe(false);
      expect(sessionAllowed(phase, 'magic_code')).toBe(false);
      // A session WorkOS cannot describe is refused: an outage never opens a door.
      expect(sessionAllowed(phase, null)).toBe(false);
    }
    expect(sessionAllowed('setup', 'password')).toBe(true);
    expect(sessionAllowed('setup', null)).toBe(true);
  });

  it('lets newcomers join on their own only once the company is on single sign-on', () => {
    expect(newcomersMayJoin('sso')).toBe(true);
    expect(newcomersMayJoin('setup')).toBe(false);
    expect(newcomersMayJoin('unknown')).toBe(false);
  });

  it('matches email domains exactly, ignoring case only', () => {
    expect(emailOnDomains('Daron@JTCgroup.com', ['jtcgroup.com'])).toBe(true);
    expect(emailOnDomains('a@mail.jtcgroup.com', ['jtcgroup.com'])).toBe(false);
    expect(emailOnDomains('a@jtcgroup.com.', ['jtcgroup.com'])).toBe(false);
    expect(emailOnDomains('a@evil-jtcgroup.com', ['jtcgroup.com'])).toBe(false);
    expect(emailOnDomains('a@jtcgroup.com', [])).toBe(false);
  });
});

describe('SignInPolicyService', () => {
  function build(
    counts: (number | null)[],
    sessions: Record<string, string> = {},
    ssoSince: string | null = null,
  ) {
    let call = 0;
    const workos = {
      countActiveConnections: jest.fn(() =>
        Promise.resolve(counts[Math.min(call++, counts.length - 1)]),
      ),
      sessionAuthMethod: jest.fn((_u: string, sid: string) =>
        Promise.resolve(sessions[sid] ?? null),
      ),
    };
    const row = {
      id: 'org-1',
      workosOrganizationId: 'org_w',
      isDemo: false,
      emailDomains: ['acme.com'],
      settings: { identity: ssoSince ? { ssoSince } : {} },
    };
    const orgs = {
      findOne: jest.fn(() => Promise.resolve(row)),
      query: jest.fn(() => Promise.resolve()),
    };
    const service = new SignInPolicyService(workos as never, orgs as never);
    let t = 0;
    service.now = () => t;
    return { service, workos, orgs, row, tick: (ms: number) => (t += ms) };
  }

  it('caches setup for a minute, then re-reads it', async () => {
    const { service, workos, tick } = build([0, 0, 1]);
    expect(await service.phase('org_w')).toBe('setup');
    expect(await service.phase('org_w')).toBe('setup');
    expect(workos.countActiveConnections).toHaveBeenCalledTimes(1);
    tick(60_000);
    expect(await service.phase('org_w')).toBe('setup');
    tick(60_000);
    expect(await service.phase('org_w')).toBe('sso');
  });

  it('records the move to single sign-on on the org and never leaves it', async () => {
    const { service, orgs, workos } = build([1, 0]);
    expect(await service.phase('org_w')).toBe('sso');
    expect(orgs.query).toHaveBeenCalledTimes(1);
    expect(String((orgs.query.mock.calls[0] as unknown[])[0])).toContain(
      'ssoSince',
    );
    // A webhook saying the connection went away does not reopen password sign-in.
    service.invalidate('org_w');
    expect(await service.phase('org_w')).toBe('sso');
    expect(workos.countActiveConnections).toHaveBeenCalledTimes(1);
  });

  it('reads a recorded move to single sign-on without asking WorkOS (survives outages and restarts)', async () => {
    const { service, workos } = build([null], {}, '2026-11-06T00:00:00Z');
    expect(await service.phase('org_w')).toBe('sso');
    expect(workos.countActiveConnections).not.toHaveBeenCalled();
  });

  it('keeps the last known phase when WorkOS cannot be asked, else says unknown', async () => {
    const { service, tick } = build([0, null]);
    expect(await service.phase('org_w')).toBe('setup');
    tick(60_000);
    expect(await service.phase('org_w')).toBe('setup');
    const fresh = build([null]);
    expect(await fresh.service.phase('org_w')).toBe('unknown');
  });

  it('re-reads at once after a webhook, and at most every ten seconds when a person refreshes', async () => {
    const { service, workos, tick } = build([0, 0, 0, 1]);
    await service.phase('org_w');
    service.invalidate('org_w');
    await service.phase('org_w');
    expect(workos.countActiveConnections).toHaveBeenCalledTimes(2);
    service.refresh('org_w');
    await service.phase('org_w');
    service.refresh('org_w');
    await service.phase('org_w');
    expect(workos.countActiveConnections).toHaveBeenCalledTimes(3);
    tick(10_000);
    service.refresh('org_w');
    expect(await service.phase('org_w')).toBe('sso');
  });

  it('asks WorkOS for a session method once, and never caches "unknown"', async () => {
    const { service, workos } = build([1], { sess_1: 'password' });
    expect(await service.sessionMethod('user_1', 'sess_1')).toBe('password');
    expect(await service.sessionMethod('user_1', 'sess_1')).toBe('password');
    expect(await service.sessionMethod('user_1', 'sess_x')).toBeNull();
    expect(await service.sessionMethod('user_1', 'sess_x')).toBeNull();
    expect(workos.sessionAuthMethod).toHaveBeenCalledTimes(3);
  });

  it('describes the company behind a WorkOS organisation, cached briefly', async () => {
    const { service, orgs } = build([0]);
    const org = await service.orgByWorkosId('org_w');
    expect(org).toEqual({
      id: 'org-1',
      isDemo: false,
      emailDomains: ['acme.com'],
      workosOrganizationId: 'org_w',
    });
    await service.orgByWorkosId('org_w');
    expect(orgs.findOne).toHaveBeenCalledTimes(1);
  });
});

describe('WorkosGuard sign-in policy', () => {
  const acme: PolicyOrg = {
    id: 'org-1',
    isDemo: false,
    emailDomains: ['acme.com'],
    workosOrganizationId: 'org_w',
  };
  const person = (over: Partial<Person> = {}): Person =>
    ({
      id: 'p1',
      email: 'daron@acme.com',
      roles: ['admin', 'learner'],
      orgId: 'org-1',
      status: 'active',
      ...over,
    }) as Person;

  function build(opts: {
    phase: 'setup' | 'sso' | 'unknown';
    method?: string | null;
    known?: Person | null;
    org?: PolicyOrg | null;
    profileEmail?: string;
  }) {
    const policy = {
      phase: jest.fn(() => Promise.resolve(opts.phase)),
      sessionMethod: jest.fn(() => Promise.resolve(opts.method ?? null)),
      orgById: jest.fn(() =>
        Promise.resolve(opts.org === undefined ? acme : opts.org),
      ),
    };
    const people = {
      findByEmail: jest.fn(() => Promise.resolve(opts.known ?? null)),
      provisionFromWorkos: jest.fn(() =>
        Promise.resolve(person({ status: 'active' })),
      ),
    };
    const workos = {
      getUser: jest.fn(() =>
        Promise.resolve({
          id: 'user_1',
          email: opts.profileEmail ?? 'new.person@acme.com',
        }),
      ),
    };
    const guard = new WorkosGuard(
      {} as never,
      people as never,
      workos as never,
      {} as never,
      policy as never,
    );
    return {
      guard: guard as unknown as {
        enforcePhase: (p: Person, u: string, s?: string) => Promise<void>;
        provision: (
          u: string,
          r: string[],
          o: string | null,
          org: PolicyOrg | null,
          s?: string,
        ) => Promise<Person>;
        checkExisting: (p: Person, org: PolicyOrg | null) => Promise<void>;
      },
      policy,
      people,
    };
  }

  async function refusal(
    p: Promise<unknown>,
  ): Promise<{ status: number; message: unknown }> {
    const err = await p.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(SignInRefusedException);
    const e = err as SignInRefusedException;
    return { status: e.getStatus(), message: e.getResponse() };
  }

  it('refuses a password session, a sessionless token and an undescribable session once on SSO', async () => {
    expect(
      await refusal(
        build({ phase: 'sso', method: 'password' }).guard.enforcePhase(
          person(),
          'user_1',
          'sess_1',
        ),
      ),
    ).toEqual({
      status: HttpStatus.UNAUTHORIZED,
      message: SIGN_IN_MESSAGES.ssoRequired,
    });
    await refusal(
      build({ phase: 'sso', method: 'sso' }).guard.enforcePhase(
        person(),
        'user_1',
        undefined,
      ),
    );
    await refusal(
      build({ phase: 'sso', method: null }).guard.enforcePhase(
        person(),
        'user_1',
        'sess_1',
      ),
    );
  });

  it('treats an unknown phase as strictly as SSO for sessions', async () => {
    await refusal(
      build({ phase: 'unknown', method: 'password' }).guard.enforcePhase(
        person(),
        'user_1',
        'sess_1',
      ),
    );
    await expect(
      build({ phase: 'unknown', method: 'sso' }).guard.enforcePhase(
        person(),
        'user_1',
        'sess_1',
      ),
    ).resolves.toBeUndefined();
  });

  it('lets an SSO session through, and any session while the company is setting up', async () => {
    await expect(
      build({ phase: 'sso', method: 'sso' }).guard.enforcePhase(
        person(),
        'user_1',
        'sess_1',
      ),
    ).resolves.toBeUndefined();
    await expect(
      build({ phase: 'setup', method: 'password' }).guard.enforcePhase(
        person(),
        'user_1',
        undefined,
      ),
    ).resolves.toBeUndefined();
  });

  it('never applies the company policy to leads or demo orgs', async () => {
    const lead = build({ phase: 'sso', method: 'password' });
    await expect(
      lead.guard.enforcePhase(
        person({ roles: ['lead'], orgId: null }),
        'user_1',
        'sess_1',
      ),
    ).resolves.toBeUndefined();
    expect(lead.policy.phase).not.toHaveBeenCalled();
    const demo = build({
      phase: 'sso',
      method: 'password',
      org: { ...acme, isDemo: true },
    });
    await expect(
      demo.guard.enforcePhase(person(), 'user_1', 'sess_1'),
    ).resolves.toBeUndefined();
  });

  it('refuses a first sign-in nobody invited while setting up, or while the phase is unknown', async () => {
    for (const phase of ['setup', 'unknown'] as const) {
      const { guard, people } = build({ phase, method: 'sso' });
      expect(
        (await refusal(guard.provision('user_1', [], 'org_w', acme, 'sess_1')))
          .status,
      ).toBe(HttpStatus.FORBIDDEN);
      expect(people.provisionFromWorkos).not.toHaveBeenCalled();
    }
  });

  it('does not count a deactivated person as invited', async () => {
    const { guard } = build({
      phase: 'setup',
      known: person({ status: 'inactive' }),
    });
    await refusal(guard.provision('user_1', [], 'org_w', acme, 'sess_1'));
  });

  it('checks the session before creating anyone once on SSO', async () => {
    const { guard, people } = build({ phase: 'sso', method: 'password' });
    expect(
      (await refusal(guard.provision('user_1', [], 'org_w', acme, 'sess_1')))
        .status,
    ).toBe(HttpStatus.UNAUTHORIZED);
    expect(people.provisionFromWorkos).not.toHaveBeenCalled();
  });

  it("refuses an address off the company's domains, or a LightCI lead's, through a company organisation", async () => {
    for (const email of ['someone@elsewhere.com', 'zain@lightci.com']) {
      const { guard, people } = build({
        phase: 'sso',
        method: 'sso',
        profileEmail: email,
      });
      expect(
        await refusal(guard.provision('user_1', [], 'org_w', acme, 'sess_1')),
      ).toEqual({
        status: HttpStatus.FORBIDDEN,
        message: SIGN_IN_MESSAGES.wrongDomain,
      });
      expect(people.provisionFromWorkos).not.toHaveBeenCalled();
    }
  });

  it('lets an invited person in during setup, anyone on the domain once on SSO, and demo orgs as before', async () => {
    await expect(
      build({
        phase: 'setup',
        known: person({ status: 'invited' }),
      }).guard.provision('user_1', [], 'org_w', acme, 'sess_1'),
    ).resolves.toBeTruthy();
    await expect(
      build({ phase: 'sso', method: 'sso' }).guard.provision(
        'user_1',
        [],
        'org_w',
        acme,
        'sess_1',
      ),
    ).resolves.toBeTruthy();
    await expect(
      build({ phase: 'setup' }).guard.provision(
        'user_1',
        [],
        'org_w',
        { ...acme, isDemo: true },
        undefined,
      ),
    ).resolves.toBeTruthy();
    await expect(
      build({ phase: 'setup' }).guard.provision(
        'user_1',
        [],
        null,
        null,
        undefined,
      ),
    ).resolves.toBeTruthy();
  });

  it('keeps a known person to their own company, their own domain, and out of leads', async () => {
    const { guard } = build({ phase: 'sso' });
    await expect(guard.checkExisting(person(), acme)).resolves.toBeUndefined();
    await refusal(guard.checkExisting(person({ orgId: 'org-2' }), acme));
    await refusal(
      guard.checkExisting(person({ email: 'x@elsewhere.com' }), acme),
    );
    await refusal(
      guard.checkExisting(
        person({ roles: ['lead'], orgId: null, email: 'zain@lightci.com' }),
        acme,
      ),
    );
    await expect(
      guard.checkExisting(person({ orgId: 'org-2' }), {
        ...acme,
        isDemo: true,
      }),
    ).resolves.toBeUndefined();
  });

  it('links someone first seen without a company only once it is on single sign-on', async () => {
    await refusal(
      build({ phase: 'setup' }).guard.checkExisting(
        person({ orgId: null }),
        acme,
      ),
    );
    await refusal(
      build({ phase: 'unknown' }).guard.checkExisting(
        person({ orgId: null }),
        acme,
      ),
    );
    await expect(
      build({ phase: 'sso' }).guard.checkExisting(
        person({ orgId: null }),
        acme,
      ),
    ).resolves.toBeUndefined();
  });
});
