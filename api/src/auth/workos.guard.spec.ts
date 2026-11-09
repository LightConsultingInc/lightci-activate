import {
  ForbiddenException,
  HttpStatus,
  type ExecutionContext,
} from '@nestjs/common';
import { SignInRefusedException } from './sign-in-policy.service';
import type { Person } from '../orgs/entities/person.entity';
import { WorkosGuard, resolveOrgId } from './workos.guard';

const person = (over: Partial<Person>): Person =>
  ({ id: 'p1', roles: ['learner'], orgId: 'org-a', ...over }) as Person;

describe('resolveOrgId (T0.4)', () => {
  it('binds everyone but leads to their own org', () => {
    expect(resolveOrgId(person({}), 'org-b')).toBe('org-a');
    expect(resolveOrgId(person({ roles: ['admin'] }), 'org-b')).toBe('org-a');
    expect(resolveOrgId(person({ orgId: null }), 'org-b')).toBeNull();
  });

  it('lets a lead switch orgs with the header', () => {
    expect(
      resolveOrgId(person({ roles: ['lead'], orgId: null }), 'org-b'),
    ).toBe('org-b');
    expect(
      resolveOrgId(person({ roles: ['lead'], orgId: null }), undefined),
    ).toBeNull();
    expect(resolveOrgId(person({ roles: ['lead'], orgId: 'home' }), '')).toBe(
      'home',
    );
  });

  it('ignores the header for anonymous requests', () => {
    expect(resolveOrgId(null, 'org-b')).toBeNull();
  });
});

describe('WorkosGuard.canActivate (T0.4)', () => {
  function build(
    user: Person | null | SignInRefusedException,
    isPublic = false,
  ) {
    const reflector = { getAllAndOverride: () => isPublic } as never;
    const people = { findByEmail: () => Promise.resolve(null) } as never;
    const workos = { enabled: false } as never;
    const moduleRef = { get: () => ({}) } as never;
    const policy = {} as never;
    const guard = new WorkosGuard(reflector, people, workos, moduleRef, policy);
    // Short-circuit token resolution: the JWT path is covered in WS1 identity tests.
    guard.resolveUser = () =>
      user instanceof SignInRefusedException
        ? Promise.reject(user)
        : Promise.resolve(user);
    const req: Record<string, unknown> = {
      headers: { authorization: 'Bearer t', 'x-activate-org': 'org-b' },
    };
    const ctx = {
      getType: () => 'http',
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    return { guard, ctx, req };
  }

  it('refuses an org-less non-lead on a protected route with a plain message', async () => {
    const { guard, ctx } = build(person({ orgId: null }));
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      /isn't set up in Activate yet/,
    );
  });

  it('lets an org-less non-lead through a public route with no org', async () => {
    const { guard, ctx, req } = build(person({ orgId: null }), true);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.orgId).toBeNull();
  });

  it('scopes a member to their own org regardless of the header', async () => {
    const { guard, ctx, req } = build(person({}));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.orgId).toBe('org-a');
  });

  it('scopes a lead to the header org', async () => {
    const { guard, ctx, req } = build(person({ roles: ['lead'], orgId: null }));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.orgId).toBe('org-b');
  });

  it('passes a sign-in policy refusal through on protected routes, so the person sees why', async () => {
    const refusal = new SignInRefusedException(
      'use SSO',
      HttpStatus.UNAUTHORIZED,
    );
    const { guard, ctx } = build(refusal);
    await expect(guard.canActivate(ctx)).rejects.toBe(refusal);
  });

  it('runs a public route anonymously on a refused token and keeps the refusal on the request', async () => {
    const refusal = new SignInRefusedException(
      'use SSO',
      HttpStatus.UNAUTHORIZED,
    );
    const { guard, ctx, req } = build(refusal, true);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toBeUndefined();
    expect(req.signInRefusal).toBe(refusal);
  });
});
