import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  importJWK,
  jwtVerify,
  type JWK,
  type JWTPayload,
} from 'jose';

/** A private key usable for signing (jose v6 returns CryptoKey or KeyObject). */
type SigningKey = Exclude<Awaited<ReturnType<typeof importJWK>>, Uint8Array>;
import { randomBytes } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { SecretsService } from '../../common/secrets.service';
import { InstanceKey } from './entities/instance-key.entity';

/**
 * The installation's token signing key (OIDC mode). One active RS256 key, created on
 * first use and stored with its private half encrypted under ACTIVATE_SECRETS_KEY.
 * Retired keys stay in the JWKS until their tokens have expired.
 */
@Injectable()
export class KeysService {
  private readonly logger = new Logger(KeysService.name);
  private active: { kid: string; privateKey: SigningKey } | null = null;
  private jwks: { keys: JWK[] } | null = null;

  constructor(
    @InjectRepository(InstanceKey)
    private readonly keys: Repository<InstanceKey>,
    private readonly secrets: SecretsService,
  ) {}

  /** The active key, creating it on first use. Safe across replicas: a race leaves two usable keys. */
  private async activeKey(): Promise<{ kid: string; privateKey: SigningKey }> {
    if (this.active) return this.active;
    let row = await this.keys.findOne({
      where: { retiredAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (!row) {
      const { publicKey, privateKey } = await generateKeyPair('RS256', {
        modulusLength: 2048,
        extractable: true,
      });
      const kid = randomBytes(8).toString('hex');
      const publicJwk = {
        ...(await exportJWK(publicKey)),
        kid,
        alg: 'RS256',
        use: 'sig',
      };
      const privateJwk = {
        ...(await exportJWK(privateKey)),
        kid,
        alg: 'RS256',
      };
      row = await this.keys.save(
        this.keys.create({
          kid,
          alg: 'RS256',
          publicJwk,
          privateJwkEncrypted: this.secrets.encrypt(JSON.stringify(privateJwk)),
        }),
      );
      this.logger.log(`Created token signing key ${kid}`);
    }
    let privateJwk: JWK;
    try {
      privateJwk = JSON.parse(
        this.secrets.decrypt(row.privateJwkEncrypted),
      ) as JWK;
    } catch (e) {
      // Almost always ACTIVATE_SECRETS_KEY changed without ACTIVATE_SECRETS_KEY_PREVIOUS.
      this.logger.error(
        `Token signing key ${row.kid} cannot be decrypted with the configured ACTIVATE_SECRETS_KEY (${
          e instanceof Error ? e.message : String(e)
        }). Set ACTIVATE_SECRETS_KEY_PREVIOUS to the old key and run \`activate secrets rotate\`, or retire the key.`,
      );
      throw new ServiceUnavailableException(
        'Sign-in is unavailable: the token signing key cannot be read. An administrator needs to check the encryption key configuration.',
      );
    }
    const privateKey = (await importJWK(privateJwk, 'RS256')) as SigningKey;
    this.active = { kid: row.kid, privateKey };
    this.jwks = null;
    return this.active;
  }

  /** Public keys, active and retired, for /oauth/jwks. */
  async publicJwks(): Promise<{ keys: JWK[] }> {
    if (this.jwks) return this.jwks;
    await this.activeKey();
    const rows = await this.keys.find({ order: { createdAt: 'DESC' } });
    this.jwks = { keys: rows.map((r) => r.publicJwk as JWK) };
    return this.jwks;
  }

  async sign(
    payload: JWTPayload,
    opts: { issuer: string; audience: string; expiresInSeconds: number },
  ): Promise<string> {
    const { kid, privateKey } = await this.activeKey();
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid, typ: 'at+jwt' })
      .setIssuer(opts.issuer)
      .setAudience(opts.audience)
      .setIssuedAt()
      .setExpirationTime(`${opts.expiresInSeconds}s`)
      .setJti(randomBytes(16).toString('hex'))
      .sign(privateKey);
  }

  async verify(
    token: string,
    opts: { issuer: string; audience: string },
  ): Promise<JWTPayload> {
    const jwks = await this.publicJwks();
    const { payload } = await jwtVerify(token, createLocalJWKSet(jwks), {
      issuer: opts.issuer,
      audience: opts.audience,
      algorithms: ['RS256'],
    });
    return payload;
  }

  /** Forget cached material so a rotated key is picked up (tests and `secrets rotate`). */
  reset(): void {
    this.active = null;
    this.jwks = null;
  }
}
