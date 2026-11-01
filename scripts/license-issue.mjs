#!/usr/bin/env node
/**
 * LightCI-internal: mint a self-hosted license.
 *
 *   LICENSE_PRIVATE_KEY_FILE=~/lightci-license-private.jwk.json \
 *   node scripts/license-issue.mjs --org "Acme Corp" --slug acme --seats 500 --premium-seats 50 \
 *     --expires 2027-12-31 --features voice,bedrock > acme-license.jwt
 *
 * The private key (Ed25519 JWK) never lives in this repository; it is kept in LightCI's secret
 * store. The matching public key is embedded in api/src/license/license-public-key.ts.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SignJWT, importJWK } = require('../api/node_modules/jose');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const keyFile = process.env.LICENSE_PRIVATE_KEY_FILE;
if (!keyFile) {
  console.error('LICENSE_PRIVATE_KEY_FILE is required (path to the Ed25519 private JWK).');
  process.exit(2);
}
const org = arg('org');
const seats = Number(arg('seats'));
const expires = arg('expires');
if (!org || !Number.isFinite(seats) || !expires) {
  console.error('Usage: --org "Name" --slug slug --seats N [--premium-seats N] --expires YYYY-MM-DD [--features a,b]');
  process.exit(2);
}
const privateJwk = JSON.parse(readFileSync(keyFile, 'utf8'));
const key = await importJWK(privateJwk, 'EdDSA');
const licenseId = randomUUID();
const jwt = await new SignJWT({
  licenseId,
  org: { name: org, ...(arg('slug') ? { slug: arg('slug') } : {}) },
  seats,
  premiumSeats: Number(arg('premium-seats', '0')),
  features: (arg('features', '') || '').split(',').map((s) => s.trim()).filter(Boolean),
})
  .setProtectedHeader({ alg: 'EdDSA', kid: privateJwk.kid ?? 'lightci-license-2026', typ: 'JWT' })
  .setIssuer('lightci')
  .setSubject(arg('slug') ?? org)
  .setJti(licenseId)
  .setIssuedAt()
  .setExpirationTime(new Date(`${expires}T23:59:59Z`))
  .sign(key);
process.stdout.write(jwt + '\n');
console.error(`issued ${licenseId} for ${org}: ${seats} seats, expires ${expires}`);
