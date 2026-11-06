import { HttpStatus } from '@nestjs/common';
import type { Person } from '../orgs/entities/person.entity';
import {
  SIGN_IN_MESSAGES,
  phaseFromConnections,
  sessionAllowed,
} from './sign-in-policy';
import {
  SignInPolicyService,
  SignInRefusedException,
} from './sign-in-policy.service';
import { WorkosGuard } from './workos.guard';

describe('sign-in phases', () => {
  it('is setup until a connection is active, sso after, unknown when WorkOS cannot say', () => {
    expect(phaseFromConnections(0)).toBe('setup');
    expect(phaseFromConnections(2)).toBe('sso');
    expect(phaseFromConnections(null)).toBe('unknown');
  });

  it('accepts only SSO (and WorkOS support impersonation) once a company is on SSO', () => {
    expect(sessionAllowed('sso', 'sso')).toBe(true);
    expect(sessionAllowed('sso', 'impersonation')).toBe(true);
    expect(sessionAllowed('sso', 'password')).toBe(false);
    expect(sessionAllowed('sso', 'magic_code')).toBe(false);
    expect(sessionAllowed('setup', 'password')).toBe(true);
    expect(sessionAllowed('unknown', 'password')).toBe(true);
    // An undescribable session is not refused on that alone (sessions API down).
    expect(sessionAllowed('sso', null)).toBe(true);
  });
});

describe('SignInPolicyService', () => {
  function build(counts: (number | null)[], sessions: Record<string, string>) {
    let call = 0;
    const workos = {
      countActiveConnections: jest.fn(() =>
        Promise.resolve(counts[Math.min(call++, counts.length - 1)]),
      ),
      sessionAuthMethod: jest.fn((_u: string, sid: string) =>
        Promise.resolve(sessions[sid] ?? null),
      ),
    };
    const orgs = {
      findOne: jest.fn(() =>
        Promise.resolve({ id: 'org-1', workosOrganizationId: 'org_w' }),
      ),
    };
    const service = new SignInPolicyService(workos as never, orgs as never);
    let t = 0;
    service.now = () => t;
    return { service, workos, orgs, tick: (ms: number) => (t += ms) };
  }

  it('caches a phase for a minute, then re-reads it', async () => {
    const { service, workos, tick } = build([0, 1], {});
    expect(await service.phase('org_w')).toBe('setup');
    expect(await service.phase('org_w')).toBe('setup');
    expect(workos.countActiveConnections).toHaveBeenCalledTimes(1);
    tick(60_000);
    expect(await service.phase('org_w')).toBe('sso');
  });

  it('re-reads at once after invalidate (connection webhooks)', async () => {
    const { service } = build([0, 1], {});
    expect(await service.phase('org_w')).toBe('setup');
    service.invalidate('org_w');
    expect(await service.phase('org_w')).toBe('sso');
  });

  it('keeps the last known phase when WorkOS cannot be asked', async () => {
    const { service, tick } = build([1, null], {});
    expect(await service.phase('org_w')).toBe('sso');
    tick(60_000);
    expect(await service.phase('org_w')).toBe('sso');
    const fresh = build([null], {});
    expect(await fresh.service.phase('org_w')).toBe('unknown');
  });

  it('reports no WorkOS organisation for a demo org, so the policy skips it', async () => {
    const { service, orgs } = build([0], {});
    orgs.findOne.mockResolvedValueOnce({
      id: 'org-d',
      workosOrganizationId: 'org_d',
      isDemo: true,
    } as never);
    await expect(service.workosOrganizationFor('org-d')).resolves.toBeNull();
    await expect(service.workosOrganizationFor('org-1')).resolves.toBe('org_w');
  });

  it('asks WorkOS for a session method once', async () => {
    const { service, workos } = build([1], { sess_1: 'password' });
    expect(await service.sessionMethod('user_1', 'sess_1')).toBe('password');
    expect(await service.sessionMethod('user_1', 'sess_1')).toBe('password');
    expect(workos.sessionAuthMethod).toHaveBeenCalledTimes(1);
  });
});

describe('WorkosGuard sign-in policy', () => {
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
    demo?: boolean;
  }) {
    const policy = {
      phase: jest.fn(() => Promise.resolve(opts.phase)),
      sessionMethod: jest.fn(() => Promise.resolve(opts.method ?? null)),
      workosOrganizationFor: jest.fn(() => Promise.resolve('org_w')),
      findOrgByWorkosId: jest.fn(() =>
        Promise.resolve({
          id: 'org-1',
          workosOrganizationId: 'org_w',
          isDemo: opts.demo ?? false,
        }),
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
        Promise.resolve({ id: 'user_1', email: 'new.person@acme.com' }),
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
        ) => Promise<Person>;
      },
      policy,
      people,
    };
  }

  it('refuses a password session once the company is on single sign-on', async () => {
    const { guard } = build({ phase: 'sso', method: 'password' });
    const err = await guard
      .enforcePhase(person(), 'user_1', 'sess_1')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SignInRefusedException);
    expect((err as SignInRefusedException).getStatus()).toBe(
      HttpStatus.UNAUTHORIZED,
    );
    expect(
      JSON.stringify((err as SignInRefusedException).getResponse()),
    ).toContain(SIGN_IN_MESSAGES.ssoRequired);
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
        'sess_1',
      ),
    ).resolves.toBeUndefined();
  });

  it('never applies the company policy to LightCI leads', async () => {
    const { guard, policy } = build({ phase: 'sso', method: 'password' });
    await expect(
      guard.enforcePhase(person({ roles: ['lead'] }), 'user_1', 'sess_1'),
    ).resolves.toBeUndefined();
    expect(policy.phase).not.toHaveBeenCalled();
  });

  it('refuses a first sign-in nobody invited while the company is setting up', async () => {
    const { guard, people } = build({ phase: 'setup' });
    const err = await guard
      .provision('user_1', [], 'org_w')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SignInRefusedException);
    expect((err as SignInRefusedException).getStatus()).toBe(
      HttpStatus.FORBIDDEN,
    );
    expect(people.provisionFromWorkos).not.toHaveBeenCalled();
  });

  it('leaves demo companies alone: their people join with demo passwords', async () => {
    const { guard } = build({ phase: 'setup', demo: true });
    await expect(guard.provision('user_1', [], 'org_w')).resolves.toBeTruthy();
  });

  it('lets an invited person in during setup, and anyone once on SSO', async () => {
    const invited = build({
      phase: 'setup',
      known: person({ status: 'invited' }),
    });
    await expect(
      invited.guard.provision('user_1', [], 'org_w'),
    ).resolves.toBeTruthy();
    const sso = build({ phase: 'sso' });
    await expect(
      sso.guard.provision('user_1', [], 'org_w'),
    ).resolves.toBeTruthy();
  });
});
