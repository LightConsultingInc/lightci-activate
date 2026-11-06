/**
 * Runs against the real WorkOS test environment configured in api/.env (T1.1, T1.2).
 * Creates a throwaway organisation, exercises the calls provisioning relies on, and
 * deletes it again. Skipped when WORKOS_API_KEY is not set.
 */
import 'dotenv/config';
import { WorkOS } from '@workos-inc/node';
import { randomBytes } from 'node:crypto';
import { decodeJwt } from 'jose';
import { SignInPolicyService } from '../../src/auth/sign-in-policy.service';
import { WorkosService } from '../../src/auth/workos.service';

const KEY = process.env.WORKOS_API_KEY;
const describeLive =
  KEY && process.env.WORKOS_CLIENT_ID ? describe : describe.skip;

describeLive('WorkOS provisioning against the test environment', () => {
  const service = new WorkosService();
  const sdk = new WorkOS(KEY);
  const stamp = Date.now();
  const domain = `activate-it-${stamp}.example`;
  let orgId: string | null = null;

  let userId: string | null = null;
  let invitationId: string | null = null;

  afterAll(async () => {
    if (invitationId)
      await sdk.userManagement.revokeInvitation(invitationId).catch(() => {});
    if (userId) await sdk.userManagement.deleteUser(userId).catch(() => {});
    if (orgId) await sdk.organizations.deleteOrganization(orgId);
  });

  it('creates an organisation with pending domains', async () => {
    const created = await service.createOrganization(
      `Activate integration ${stamp}`,
      [domain],
      `activate-it-${stamp}`,
    );
    orgId = created.id;
    expect(created.id).toMatch(/^org_/);
    const fetched = await sdk.organizations.getOrganization(created.id);
    expect(fetched.domains.map((d) => d.domain)).toContain(domain);
    expect(fetched.externalId).toBe(`activate-it-${stamp}`);
  }, 30_000);

  it('reports no active SSO connection on a fresh organisation', async () => {
    expect(orgId).toBeTruthy();
    await expect(service.countActiveConnections(orgId as string)).resolves.toBe(
      0,
    );
  }, 30_000);

  it('issues Admin Portal links for SSO and directory setup', async () => {
    expect(orgId).toBeTruthy();
    const sso = await service.portalLink(
      orgId as string,
      'sso',
      'https://example.com/done',
    );
    const dsync = await service.portalLink(
      orgId as string,
      'dsync',
      'https://example.com/done',
    );
    expect(sso).toMatch(/^https:\/\//);
    expect(dsync).toMatch(/^https:\/\//);
    expect(sso).not.toBe(dsync);
  }, 30_000);

  it('describes a company that is still setting up: no directory, domain pending, phase setup', async () => {
    expect(orgId).toBeTruthy();
    await expect(service.listDirectories(orgId as string)).resolves.toEqual([]);
    const domains = await service.organizationDomains(orgId as string);
    expect(domains).toEqual([{ domain, state: 'pending' }]);
    const policy = new SignInPolicyService(service, {} as never);
    await expect(policy.phase(orgId as string)).resolves.toBe('setup');
  }, 30_000);

  it('tells how a session signed in (a password session is not SSO)', async () => {
    expect(orgId).toBeTruthy();
    const email = `it-${stamp}@${domain}`;
    const password = `It-${randomBytes(12).toString('base64url')}!9`;
    const user = await sdk.userManagement.createUser({
      email,
      password,
      emailVerified: true,
    });
    userId = user.id;
    await sdk.userManagement.createOrganizationMembership({
      userId: user.id,
      organizationId: orgId as string,
    });
    const auth = await sdk.userManagement.authenticateWithPassword({
      clientId: process.env.WORKOS_CLIENT_ID,
      email,
      password,
    });
    const sid = decodeJwt(auth.accessToken).sid as string;
    expect(sid).toMatch(/^session_/);
    await expect(service.sessionAuthMethod(user.id, sid)).resolves.toBe(
      'password',
    );
    await expect(
      service.sessionAuthMethod(user.id, 'session_unknown'),
    ).resolves.toBeNull();
  }, 60_000);

  it('invites an admin into the organisation with the admin role', async () => {
    expect(orgId).toBeTruthy();
    const invitation = await service.sendInvitation(
      `admin-${stamp}@${domain}`,
      orgId,
      null,
      'admin',
    );
    invitationId = invitation.id;
    expect(invitation.organizationId).toBe(orgId);
    expect(invitation.state).toBe('pending');
  }, 30_000);
});
