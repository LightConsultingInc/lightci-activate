/**
 * Runs against the real WorkOS test environment configured in api/.env (T1.1, T1.2).
 * Creates a throwaway organisation, exercises the calls provisioning relies on, and
 * deletes it again. Skipped when WORKOS_API_KEY is not set.
 */
import 'dotenv/config';
import { WorkOS } from '@workos-inc/node';
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

  afterAll(async () => {
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
});
