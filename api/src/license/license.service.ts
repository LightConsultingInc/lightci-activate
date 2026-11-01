import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { importJWK, jwtVerify, type JWK, type JWTPayload } from 'jose';
import { readFileSync } from 'node:fs';
import { In, Repository } from 'typeorm';
import { edition, isProduction } from '../config/env';
import { Person } from '../orgs/entities/person.entity';
import { InstanceSetting } from './entities/instance-setting.entity';
import { LIGHTCI_LICENSE_PUBLIC_KEY } from './license-public-key';

export const LICENSE_SETTING_KEY = 'license.jwt';
export const GRACE_DAYS = 14;
export const EXPIRY_WARNING_DAYS = 30;
export const SEAT_WARNING_RATIO = 0.9;
/** Allow for clock drift between LightCI's issuing machine and the customer's servers. */
const CLOCK_TOLERANCE_S = 5 * 60;

export interface LicenseClaims extends JWTPayload {
  /** Stable id for this license (also `jti`). */
  licenseId: string;
  org: { slug?: string; name: string };
  seats: number;
  premiumSeats?: number;
  features?: string[];
}

export type LicenseStatus =
  | 'n/a' // cloud edition: no license needed
  | 'valid'
  | 'expiring' // within EXPIRY_WARNING_DAYS of expiry
  | 'grace' // expired, within GRACE_DAYS: everything still works, loud banner
  | 'expired' // past grace: read-only
  | 'missing'
  | 'invalid';

export interface LicenseState {
  status: LicenseStatus;
  /** True when writes are blocked (expired past grace, self-hosted). */
  readOnly: boolean;
  org: string | null;
  licenseId: string | null;
  seats: number | null;
  seatsUsed: number | null;
  premiumSeats: number | null;
  features: string[];
  issuedAt: string | null;
  expiresAt: string | null;
  graceEndsAt: string | null;
  daysToExpiry: number | null;
  source: 'file' | 'env' | 'upload' | 'none';
  /** One plain sentence for admins; null when nothing needs saying. */
  message: string | null;
  error: string | null;
}

/**
 * Offline license verification for self-hosted installs. The license is a JWT signed by
 * LightCI (Ed25519). It is read from ACTIVATE_LICENSE_FILE, ACTIVATE_LICENSE, or an upload
 * stored in instance_settings, whichever expires latest. Cloud edition ignores all of this.
 */
@Injectable()
export class LicenseService implements OnModuleInit {
  private readonly logger = new Logger(LicenseService.name);
  private cached: { at: number; state: LicenseState } | null = null;

  constructor(
    @InjectRepository(InstanceSetting)
    private readonly settings: Repository<InstanceSetting>,
    @InjectRepository(Person) private readonly people: Repository<Person>,
  ) {}

  get required(): boolean {
    return edition() === 'self-hosted';
  }

  /** Self-hosted installs refuse to start without a verifiable license. */
  async onModuleInit(): Promise<void> {
    if (!this.required) return;
    const state = await this.state(true);
    if (state.status === 'missing' || state.status === 'invalid')
      throw new Error(
        `A valid license is required for a self-hosted install: ${state.error ?? state.status}. Set ACTIVATE_LICENSE_FILE to the license LightCI sent you.`,
      );
    this.logger.log(
      `License for ${state.org}: ${state.status}${state.expiresAt ? `, expires ${state.expiresAt.slice(0, 10)}` : ''}, ${state.seats} seats`,
    );
  }

  private publicKey(): Promise<CryptoKey | Uint8Array> {
    const override = !isProduction() && process.env.ACTIVATE_LICENSE_PUBLIC_KEY;
    const jwk: JWK = override
      ? (JSON.parse(override) as JWK)
      : LIGHTCI_LICENSE_PUBLIC_KEY;
    return importJWK(jwk, 'EdDSA');
  }

  /** Verify a license token. Returns the claims or throws with a plain reason. */
  async verify(token: string): Promise<LicenseClaims> {
    const key = await this.publicKey();
    const { payload } = await jwtVerify(token.trim(), key, {
      algorithms: ['EdDSA'],
      issuer: 'lightci',
      clockTolerance: CLOCK_TOLERANCE_S,
    });
    const claims = payload as LicenseClaims;
    if (!claims.org?.name) throw new Error('license has no organisation name');
    if (typeof claims.seats !== 'number' || claims.seats < 0)
      throw new Error('license has no seat count');
    if (!claims.exp) throw new Error('license has no expiry');
    claims.licenseId = claims.licenseId ?? claims.jti ?? 'unknown';
    return claims;
  }

  /** Candidate tokens in precedence order: upload, env, file. */
  private async candidates(): Promise<
    { source: LicenseState['source']; token: string }[]
  > {
    const out: { source: LicenseState['source']; token: string }[] = [];
    const uploaded = await this.settings
      .findOne({ where: { key: LICENSE_SETTING_KEY } })
      .catch(() => null);
    if (uploaded?.value) out.push({ source: 'upload', token: uploaded.value });
    if (process.env.ACTIVATE_LICENSE)
      out.push({ source: 'env', token: process.env.ACTIVATE_LICENSE });
    if (process.env.ACTIVATE_LICENSE_FILE) {
      try {
        out.push({
          source: 'file',
          token: readFileSync(process.env.ACTIVATE_LICENSE_FILE, 'utf8'),
        });
      } catch (e) {
        this.logger.warn(
          `ACTIVATE_LICENSE_FILE could not be read: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    return out;
  }

  /** Current state; cached for a minute unless `fresh`. */
  async state(fresh = false): Promise<LicenseState> {
    if (!fresh && this.cached && Date.now() - this.cached.at < 60_000)
      return this.cached.state;
    const state = await this.compute();
    this.cached = { at: Date.now(), state };
    return state;
  }

  private empty(partial: Partial<LicenseState>): LicenseState {
    return {
      status: 'missing',
      readOnly: false,
      org: null,
      licenseId: null,
      seats: null,
      seatsUsed: null,
      premiumSeats: null,
      features: [],
      issuedAt: null,
      expiresAt: null,
      graceEndsAt: null,
      daysToExpiry: null,
      source: 'none',
      message: null,
      error: null,
      ...partial,
    };
  }

  private async compute(): Promise<LicenseState> {
    if (!this.required) return this.empty({ status: 'n/a' });
    const candidates = await this.candidates();
    if (candidates.length === 0)
      return this.empty({
        status: 'missing',
        error: 'no license configured',
        message: 'No license is installed. Ask LightCI for your license file.',
      });
    // Verify every candidate; keep the one that expires latest (an uploaded renewal beats an old file).
    let best: { source: LicenseState['source']; claims: LicenseClaims } | null =
      null;
    let lastError: string | null = null;
    for (const c of candidates) {
      try {
        const claims = await this.verifyIgnoringExpiry(c.token);
        if (!best || (claims.exp ?? 0) > (best.claims.exp ?? 0))
          best = { source: c.source, claims };
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
    if (!best)
      return this.empty({
        status: 'invalid',
        error: lastError ?? 'license could not be verified',
        message:
          'The installed license could not be verified. Ask LightCI for a fresh copy.',
      });
    const { claims, source } = best;
    const now = Date.now();
    const expiresMs = (claims.exp ?? 0) * 1000;
    const graceEndsMs = expiresMs + GRACE_DAYS * 24 * 60 * 60 * 1000;
    const daysToExpiry = Math.ceil((expiresMs - now) / (24 * 60 * 60 * 1000));
    const seatsUsed = await this.people.count({
      where: { status: In(['active', 'invited']) },
    });
    let status: LicenseStatus = 'valid';
    let message: string | null = null;
    if (now > graceEndsMs) {
      status = 'expired';
      message = `Your license expired on ${new Date(expiresMs).toISOString().slice(0, 10)} and the ${GRACE_DAYS}-day grace period has ended. Activate is read-only until a new license is installed. Nothing has been deleted.`;
    } else if (now > expiresMs) {
      status = 'grace';
      message = `Your license expired on ${new Date(expiresMs).toISOString().slice(0, 10)}. Everything keeps working until ${new Date(graceEndsMs).toISOString().slice(0, 10)}; install the renewed license before then.`;
    } else if (daysToExpiry <= EXPIRY_WARNING_DAYS) {
      status = 'expiring';
      message = `Your license expires in ${daysToExpiry} day${daysToExpiry === 1 ? '' : 's'}. Ask LightCI for the renewal so nothing interrupts your teams.`;
    } else if (claims.seats > 0 && seatsUsed >= claims.seats) {
      message = `All ${claims.seats} licensed seats are in use. New people cannot be added until seats are freed or the license grows.`;
    } else if (
      claims.seats > 0 &&
      seatsUsed >= Math.ceil(claims.seats * SEAT_WARNING_RATIO)
    ) {
      message = `${seatsUsed} of ${claims.seats} licensed seats are in use.`;
    }
    return {
      status,
      readOnly: status === 'expired',
      org: claims.org.name,
      licenseId: claims.licenseId,
      seats: claims.seats,
      seatsUsed,
      premiumSeats: claims.premiumSeats ?? 0,
      features: claims.features ?? [],
      issuedAt: claims.iat ? new Date(claims.iat * 1000).toISOString() : null,
      expiresAt: new Date(expiresMs).toISOString(),
      graceEndsAt: new Date(graceEndsMs).toISOString(),
      daysToExpiry,
      source,
      message,
      error: null,
    };
  }

  /** Signature and shape checks without failing on `exp`, so grace and expiry can be reported rather than thrown. */
  private async verifyIgnoringExpiry(token: string): Promise<LicenseClaims> {
    const key = await this.publicKey();
    const { payload } = await jwtVerify(token.trim(), key, {
      algorithms: ['EdDSA'],
      issuer: 'lightci',
      clockTolerance: CLOCK_TOLERANCE_S,
      currentDate: new Date(0),
    }).catch(async (e: unknown) => {
      // A signature or issuer problem is a real failure; expiry alone is handled by compute().
      const message = e instanceof Error ? e.message : String(e);
      if (!/exp|expired/i.test(message)) throw new Error(message);
      return jwtVerify(token.trim(), key, {
        algorithms: ['EdDSA'],
        issuer: 'lightci',
        currentDate: new Date(0),
      });
    });
    const claims = payload as LicenseClaims;
    if (!claims.org?.name) throw new Error('license has no organisation name');
    if (typeof claims.seats !== 'number' || claims.seats < 0)
      throw new Error('license has no seat count');
    if (!claims.exp) throw new Error('license has no expiry');
    claims.licenseId = claims.licenseId ?? claims.jti ?? 'unknown';
    return claims;
  }

  /** Store a renewed license (admin upload). Verified first; an expired or forged token is refused. */
  async install(token: string): Promise<LicenseState> {
    const claims = await this.verifyIgnoringExpiry(token);
    if ((claims.exp ?? 0) * 1000 < Date.now())
      throw new Error(
        'That license has already expired. Ask LightCI for a current one.',
      );
    await this.settings.save(
      this.settings.create({ key: LICENSE_SETTING_KEY, value: token.trim() }),
    );
    this.cached = null;
    return this.state(true);
  }

  /** True when a new person may be added under the seat count. */
  async seatAvailable(): Promise<boolean> {
    const s = await this.state();
    if (s.status === 'n/a' || s.seats === null || s.seats === 0) return true;
    return (s.seatsUsed ?? 0) < s.seats;
  }
}
