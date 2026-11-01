import {
  DEFAULT_ROLE_MAPPING,
  applyRoleMapping,
  initialRoles,
  parseRoleMapping,
  rolesFromIdp,
} from './role-mapping';

describe('role mapping (T1.4, T1.9)', () => {
  it('maps IdP slugs to Activate roles, case-insensitively', () => {
    expect(rolesFromIdp(['Activate-Admin'], DEFAULT_ROLE_MAPPING)).toEqual([
      'admin',
    ]);
    expect(
      rolesFromIdp(['member', 'activate-champion'], DEFAULT_ROLE_MAPPING),
    ).toEqual(['champion']);
    expect(rolesFromIdp(['member'], DEFAULT_ROLE_MAPPING)).toEqual([]);
  });

  it('with a mapping, the IdP is the source of truth for mapped roles', () => {
    // granted
    expect(
      applyRoleMapping(['learner'], ['activate-admin'], DEFAULT_ROLE_MAPPING),
    ).toEqual(['admin', 'learner']);
    // revoked on the next sign-in
    expect(
      applyRoleMapping(
        ['admin', 'sponsor', 'learner'],
        ['member'],
        DEFAULT_ROLE_MAPPING,
      ),
    ).toEqual(['learner']);
    // champion swapped for sponsor
    expect(
      applyRoleMapping(
        ['champion', 'learner'],
        ['activate-sponsor'],
        DEFAULT_ROLE_MAPPING,
      ),
    ).toEqual(['sponsor', 'learner']);
  });

  it('never grants or removes lead, and always keeps learner', () => {
    expect(
      applyRoleMapping(
        ['lead'],
        ['activate-admin', 'lead'],
        DEFAULT_ROLE_MAPPING,
      ),
    ).toEqual(['lead', 'admin', 'learner']);
    expect(applyRoleMapping([], [], DEFAULT_ROLE_MAPPING)).toEqual(['learner']);
  });

  it('without a mapping, manual grants stand', () => {
    expect(
      applyRoleMapping(['admin', 'learner'], ['member'], undefined),
    ).toEqual(['admin', 'learner']);
  });

  it('Entra-style object ids work as names', () => {
    const mapping = { admin: ['5b1c0f3e-aaaa-bbbb-cccc-000000000001'] };
    expect(
      rolesFromIdp(['5B1C0F3E-AAAA-BBBB-CCCC-000000000001'], mapping),
    ).toEqual(['admin']);
  });

  it('first-login roles: mapping when present, legacy admin rule otherwise', () => {
    expect(initialRoles(['activate-sponsor'], DEFAULT_ROLE_MAPPING)).toEqual([
      'sponsor',
      'learner',
    ]);
    expect(initialRoles(['admin'], undefined)).toEqual(['admin', 'sponsor']);
    expect(initialRoles(['member'], undefined)).toEqual(['learner']);
  });

  it('validates a mapping sent by an admin', () => {
    expect(parseRoleMapping({ admin: [' IT-Admins '], sponsor: [] })).toEqual({
      ok: true,
      mapping: { admin: ['IT-Admins'], sponsor: [] },
    });
    expect(parseRoleMapping({ lead: ['x'] })).toMatchObject({ ok: false });
    expect(parseRoleMapping({ admin: 'x' })).toMatchObject({ ok: false });
    expect(parseRoleMapping([])).toMatchObject({ ok: false });
    expect(parseRoleMapping(null)).toMatchObject({ ok: false });
  });
});
