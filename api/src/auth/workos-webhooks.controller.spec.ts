import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { FakeRepo } from '../learning/testing/fake-repo';
import type { Org } from '../orgs/entities/org.entity';
import type { Person } from '../orgs/entities/person.entity';
import { PeopleService } from './people.service';
import { DEFAULT_ROLE_MAPPING } from './role-mapping';
import { WorkosWebhooksController } from './workos-webhooks.controller';
import { WorkosService } from './workos.service';

const SECRET = 'whsec_test_secret';

/** Sign exactly as WorkOS does: HMAC-SHA256 over `${timestamp}.${raw body}`, hex, in `t=…, v1=…`. */
function sign(raw: string, secret = SECRET, at = Date.now()): string {
  const v1 = createHmac('sha256', secret).update(`${at}.${raw}`).digest('hex');
  return `t=${at}, v1=${v1}`;
}

function build(opts: { secret?: string } = {}) {
  const saved = {
    key: process.env.WORKOS_API_KEY,
    client: process.env.WORKOS_CLIENT_ID,
    secret: process.env.WORKOS_WEBHOOK_SECRET,
  };
  process.env.WORKOS_API_KEY = 'sk_test_unit';
  process.env.WORKOS_CLIENT_ID = 'client_unit';
  if (opts.secret === undefined) delete process.env.WORKOS_WEBHOOK_SECRET;
  else process.env.WORKOS_WEBHOOK_SECRET = opts.secret;
  const workos = new WorkosService();
  process.env.WORKOS_API_KEY = saved.key;
  process.env.WORKOS_CLIENT_ID = saved.client;
  if (saved.secret === undefined) delete process.env.WORKOS_WEBHOOK_SECRET;
  else process.env.WORKOS_WEBHOOK_SECRET = saved.secret;

  const orgs = new FakeRepo<Org>([
    {
      id: 'org-1',
      settings: { identity: { roleMapping: DEFAULT_ROLE_MAPPING } },
    },
  ]);
  const people = new FakeRepo<Person>([
    {
      id: 'p-1',
      email: 'jane@acme.com',
      workosUserId: 'user_1',
      orgId: 'org-1',
      roles: ['admin', 'learner'],
      status: 'active',
    },
  ]);
  const peopleService = new PeopleService(people as never, orgs as never);
  const invalidated: string[] = [];
  const policy = {
    invalidate: (id: string) => invalidated.push(id),
  } as never;
  const controller = new WorkosWebhooksController(
    workos,
    peopleService,
    policy,
  );
  const request = (body: unknown, header: string | undefined) => {
    const raw = JSON.stringify(body);
    return controller.receive(
      { rawBody: Buffer.from(raw), body } as never,
      header,
    );
  };
  return {
    controller,
    request,
    people,
    invalidated,
    sign: (b: unknown) => sign(JSON.stringify(b)),
  };
}

const event = (type: string, data: Record<string, unknown>) => ({
  id: `event_${type}`,
  event: type,
  created_at: new Date().toISOString(),
  data,
});

describe('WorkOS webhooks (T1.5)', () => {
  it('is absent when no webhook secret is configured', async () => {
    const { request } = build();
    await expect(request({}, 't=1, v1=x')).rejects.toThrow(NotFoundException);
  });

  it('rejects a missing, forged or stale signature', async () => {
    const { request } = build({ secret: SECRET });
    const body = event('user.deleted', { id: 'user_1' });
    await expect(request(body, undefined)).rejects.toThrow(/Missing signature/);
    await expect(
      request(body, sign(JSON.stringify(body), 'wrong')),
    ).rejects.toThrow(BadRequestException);
    await expect(
      request(
        body,
        sign(JSON.stringify(body), SECRET, Date.now() - 10 * 60_000),
      ),
    ).rejects.toThrow(BadRequestException);
    // A body altered after signing is refused too.
    const tampered = event('user.deleted', { id: 'user_2' });
    await expect(request(tampered, sign(JSON.stringify(body)))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('deactivates a deleted user with a valid signature', async () => {
    const { request, people, sign } = build({ secret: SECRET });
    const body = event('user.deleted', { id: 'user_1' });
    await expect(request(body, sign(body))).resolves.toEqual({
      received: true,
      event: 'user.deleted',
      action: 'deactivated',
    });
    expect(people.rows[0].status).toBe('inactive');
  });

  it('deactivates on membership removal and on a directory deletion by primary email', async () => {
    const a = build({ secret: SECRET });
    const removed = event('organization_membership.deleted', {
      user_id: 'user_1',
      organization_id: 'org_x',
    });
    await expect(a.request(removed, a.sign(removed))).resolves.toMatchObject({
      action: 'deactivated',
    });

    const b = build({ secret: SECRET });
    const gone = event('dsync.user.deleted', {
      id: 'directory_user_1',
      emails: [{ primary: true, value: 'jane@acme.com' }],
    });
    await expect(b.request(gone, b.sign(gone))).resolves.toMatchObject({
      action: 'deactivated',
    });
    expect(b.people.rows[0].status).toBe('inactive');
  });

  it('applies a changed membership role at once', async () => {
    const { request, people, sign } = build({ secret: SECRET });
    const body = event('organization_membership.updated', {
      user_id: 'user_1',
      organization_id: 'org_x',
      status: 'active',
      role: { slug: 'activate-champion' },
    });
    await expect(request(body, sign(body))).resolves.toMatchObject({
      action: 'roles_synced',
    });
    expect(people.rows[0].roles).toEqual(['champion', 'learner']);
  });

  it('acknowledges unknown people and unrelated events without failing', async () => {
    const { request, sign } = build({ secret: SECRET });
    const unknown = event('user.deleted', { id: 'user_nobody' });
    await expect(request(unknown, sign(unknown))).resolves.toMatchObject({
      action: 'unknown_person',
    });
    const other = event('activate.unrelated_event', { id: 'x_1' });
    await expect(request(other, sign(other))).resolves.toMatchObject({
      action: 'ignored',
    });
  });

  it('re-reads a company sign-in phase as soon as a connection or directory changes', async () => {
    const { request, sign, invalidated } = build({ secret: SECRET });
    for (const type of [
      'connection.activated',
      'connection.deactivated',
      'dsync.activated',
    ]) {
      const body = event(type, { id: 'conn_1', organization_id: 'org_x' });
      await expect(request(body, sign(body))).resolves.toMatchObject({
        action: 'phase_refreshed',
      });
    }
    expect(invalidated).toEqual(['org_x', 'org_x', 'org_x']);
    const orphan = event('connection.activated', { id: 'conn_2' });
    await expect(request(orphan, sign(orphan))).resolves.toMatchObject({
      action: 'ignored',
    });
  });
});
