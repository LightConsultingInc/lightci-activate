import { Injectable, Logger } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { isProduction } from '../config/env';

const DEV_ONLY_KEY = 'activate-dev-only-secrets-key';

/**
 * AES-256-GCM envelope for client credentials.
 *
 * Key material comes from ACTIVATE_SECRETS_KEY (any string; hashed to 32 bytes).
 * In production the key is required: without it the process refuses to start,
 * because credentials written with the development key would be readable by anyone.
 * ACTIVATE_SECRETS_KEY_PREVIOUS (comma-separated) lets decrypt fall back to older
 * keys during rotation; `needsRotation` tells callers which rows still use one.
 */
@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);
  private readonly key: Buffer;
  private readonly previous: Buffer[];

  constructor() {
    const env = process.env;
    const raw = env.ACTIVATE_SECRETS_KEY;
    if (!raw) {
      if (isProduction(env))
        throw new Error(
          'ACTIVATE_SECRETS_KEY is required in production: stored credentials are encrypted with it.',
        );
      this.logger.warn(
        'ACTIVATE_SECRETS_KEY not set; using a development-only key. Set it in production.',
      );
    }
    this.key = SecretsService.derive(raw ?? DEV_ONLY_KEY);
    this.previous = (env.ACTIVATE_SECRETS_KEY_PREVIOUS ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
      .map((k) => SecretsService.derive(k));
  }

  private static derive(raw: string): Buffer {
    return createHash('sha256').update(raw).digest();
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
  }

  decrypt(payload: string): string {
    return this.open(payload).plain;
  }

  /** True when the payload was written with a previous key and should be re-encrypted. */
  needsRotation(payload: string): boolean {
    return this.open(payload).keyIndex > 0;
  }

  /** Re-encrypt with the current key. Returns the same payload when it is already current. */
  reencrypt(payload: string): string {
    const opened = this.open(payload);
    return opened.keyIndex === 0 ? payload : this.encrypt(opened.plain);
  }

  private open(payload: string): { plain: string; keyIndex: number } {
    const [v, iv, tag, data] = payload.split('.');
    if (v !== 'v1') throw new Error('Unknown secret envelope version');
    const keys = [this.key, ...this.previous];
    let lastError: unknown;
    for (let i = 0; i < keys.length; i++) {
      try {
        const decipher = createDecipheriv(
          'aes-256-gcm',
          keys[i],
          Buffer.from(iv, 'base64url'),
        );
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        const plain = Buffer.concat([
          decipher.update(Buffer.from(data, 'base64url')),
          decipher.final(),
        ]).toString('utf8');
        return { plain, keyIndex: i };
      } catch (e) {
        lastError = e;
      }
    }
    throw new Error(
      `Stored credential could not be decrypted with the current or previous keys${
        lastError instanceof Error ? `: ${lastError.message}` : ''
      }`,
    );
  }
}
