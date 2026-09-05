import { Injectable, Logger } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/** AES-256-GCM envelope for client credentials. Key from ACTIVATE_SECRETS_KEY (any string; hashed to 32 bytes). */
@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);
  private readonly key: Buffer;

  constructor() {
    const raw = process.env.ACTIVATE_SECRETS_KEY;
    if (!raw)
      this.logger.warn(
        'ACTIVATE_SECRETS_KEY not set; using a development-only key. Set it in production.',
      );
    this.key = createHash('sha256')
      .update(raw ?? 'activate-dev-only-secrets-key')
      .digest();
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
  }

  decrypt(payload: string): string {
    const [v, iv, tag, data] = payload.split('.');
    if (v !== 'v1') throw new Error('Unknown secret envelope version');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
