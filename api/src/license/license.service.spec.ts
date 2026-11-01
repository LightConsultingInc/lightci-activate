import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { FakeRepo } from '../learning/testing/fake-repo';
import type { Person } from '../orgs/entities/person.entity';
import type { InstanceSetting } from './entities/instance-setting.entity';
import { LicenseService } from './license.service';

const DAY = 24 * 60 * 60;

/** A throwaway Ed25519 key pair standing in for LightCI's (tests only; production uses the embedded public key). */
async function keyPair() {
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', {
    crv: 'Ed25519',
    extractable: true,
  });
  const pub = await exportJWK(publicKey);
  return { pub: { ...pub, alg: 'EdDSA' }, privateKey };
}

async function mint(
  privateKey: CryptoKey,
  opts: {
    seats?: number;
    expiresInDays?: number;
    issuer?: string;
    org?: string;
  },
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    licenseId: 'lic-1',
    org: { name: opts.org ?? 'Acme Corp', slug: 'acme' },
    seats: opts.seats ?? 100,
    premiumSeats: 5,
    features: ['voice'],
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuer(opts.issuer ?? 'lightci')
    .setIssuedAt(now - 10 * DAY)
    .setExpirationTime(now + (opts.expiresInDays ?? 365) * DAY)
    .sign(privateKey);
}

function build(peopleCount: number) {
  const settings = new FakeRepo<InstanceSetting>();
  const people = new FakeRepo<Person>(
    Array.from({ length: peopleCount }, (_, i) => ({
      email: `p${i}@acme.test`,
      status: 'active',
    })),
  );
  // FakeRepo.count ignores `In`; emulate a status filter.
  (
    people as unknown as {
      count: (o?: { where?: { status?: unknown } }) => Promise<number>;
    }
  ).count = () =>
    Promise.resolve(
      people.rows.filter((p) => ['active', 'invited'].includes(p.status))
        .length,
    );
  return {
    svc: new LicenseService(settings as never, people as never),
    settings,
    people,
  };
}

const saved = { ...process.env };
beforeEach(() => {
  process.env.ACTIVATE_EDITION = 'self-hosted';
  process.env.NODE_ENV = 'test';
  delete process.env.ACTIVATE_LICENSE;
  delete process.env.ACTIVATE_LICENSE_FILE;
});
afterAll(() => {
  process.env = saved;
});

describe('LicenseService (T3.2)', () => {
  it('is not applicable in the cloud edition', async () => {
    process.env.ACTIVATE_EDITION = 'cloud';
    const { svc } = build(1);
    expect((await svc.state(true)).status).toBe('n/a');
    expect(svc.required).toBe(false);
    await expect(svc.seatAvailable()).resolves.toBe(true);
  });

  it('reports a missing license plainly and refuses to boot without one', async () => {
    const { svc } = build(1);
    const s = await svc.state(true);
    expect(s.status).toBe('missing');
    expect(s.message).toMatch(/No license is installed/);
    await expect(svc.onModuleInit()).rejects.toThrow(
      /valid license is required/,
    );
  });

  it('verifies a valid license and reports seats', async () => {
    const { pub, privateKey } = await keyPair();
    process.env.ACTIVATE_LICENSE_PUBLIC_KEY = JSON.stringify(pub);
    process.env.ACTIVATE_LICENSE = await mint(privateKey, { seats: 100 });
    const { svc } = build(12);
    const s = await svc.state(true);
    expect(s).toMatchObject({
      status: 'valid',
      readOnly: false,
      org: 'Acme Corp',
      seats: 100,
      seatsUsed: 12,
      source: 'env',
      features: ['voice'],
    });
    expect(s.message).toBeNull();
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
    await expect(svc.seatAvailable()).resolves.toBe(true);
  });

  it('rejects a forged, tampered or foreign-issuer license', async () => {
    const { pub } = await keyPair();
    const other = await keyPair();
    process.env.ACTIVATE_LICENSE_PUBLIC_KEY = JSON.stringify(pub);
    process.env.ACTIVATE_LICENSE = await mint(other.privateKey, {});
    const { svc } = build(1);
    expect((await svc.state(true)).status).toBe('invalid');

    process.env.ACTIVATE_LICENSE_PUBLIC_KEY = JSON.stringify(other.pub);
    process.env.ACTIVATE_LICENSE = await mint(other.privateKey, {
      issuer: 'someone-else',
    });
    expect((await svc.state(true)).status).toBe('invalid');

    const good = await mint(other.privateKey, {});
    const [h, p, sig] = good.split('.');
    const payload = JSON.parse(
      Buffer.from(p, 'base64url').toString(),
    ) as Record<string, unknown>;
    process.env.ACTIVATE_LICENSE = `${h}.${Buffer.from(JSON.stringify({ ...payload, seats: 100000 })).toString('base64url')}.${sig}`;
    expect((await svc.state(true)).status).toBe('invalid');
  });

  it('warns before expiry, keeps working in grace, then goes read-only', async () => {
    const { pub, privateKey } = await keyPair();
    process.env.ACTIVATE_LICENSE_PUBLIC_KEY = JSON.stringify(pub);
    const { svc } = build(1);

    process.env.ACTIVATE_LICENSE = await mint(privateKey, {
      expiresInDays: 10,
    });
    let s = await svc.state(true);
    expect(s.status).toBe('expiring');
    expect(s.readOnly).toBe(false);
    expect(s.message).toMatch(/expires in 10 days/);

    process.env.ACTIVATE_LICENSE = await mint(privateKey, {
      expiresInDays: -3,
    });
    s = await svc.state(true);
    expect(s.status).toBe('grace');
    expect(s.readOnly).toBe(false);
    expect(s.message).toMatch(/Everything keeps working until/);

    process.env.ACTIVATE_LICENSE = await mint(privateKey, {
      expiresInDays: -20,
    });
    s = await svc.state(true);
    expect(s.status).toBe('expired');
    expect(s.readOnly).toBe(true);
    expect(s.message).toMatch(/read-only/);
    // Expired is still a verifiable license: boot proceeds (read-only), it is not "invalid".
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
  });

  it('seat warnings at 90% and a full house block new people', async () => {
    const { pub, privateKey } = await keyPair();
    process.env.ACTIVATE_LICENSE_PUBLIC_KEY = JSON.stringify(pub);
    process.env.ACTIVATE_LICENSE = await mint(privateKey, { seats: 10 });
    const nine = build(9);
    expect((await nine.svc.state(true)).message).toMatch(
      /9 of 10 licensed seats/,
    );
    await expect(nine.svc.seatAvailable()).resolves.toBe(true);
    const ten = build(10);
    expect((await ten.svc.state(true)).message).toMatch(
      /All 10 licensed seats are in use/,
    );
    await expect(ten.svc.seatAvailable()).resolves.toBe(false);
  });

  it('an uploaded renewal beats an older file and an expired upload is refused', async () => {
    const { pub, privateKey } = await keyPair();
    process.env.ACTIVATE_LICENSE_PUBLIC_KEY = JSON.stringify(pub);
    process.env.ACTIVATE_LICENSE = await mint(privateKey, {
      expiresInDays: -3,
    });
    const { svc } = build(1);
    expect((await svc.state(true)).status).toBe('grace');
    const renewed = await svc.install(
      await mint(privateKey, { expiresInDays: 400 }),
    );
    expect(renewed).toMatchObject({ status: 'valid', source: 'upload' });
    await expect(
      svc.install(await mint(privateKey, { expiresInDays: -1 })),
    ).rejects.toThrow(/already expired/);
    const other = await keyPair();
    await expect(
      svc.install(await mint(other.privateKey, {})),
    ).rejects.toThrow();
  });
});
