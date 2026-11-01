import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { LicenseService } from './license.service';

/** Writes that keep working when the license has lapsed: sign-in (OAuth and webhooks), health, and installing a new license. Reads always work. */
const ALWAYS_ALLOWED = [
  /^\/api\/health$/,
  /^\/api\/ready$/,
  /^\/api\/admin\/license/,
  /^\/oauth\//,
  /^\/\.well-known\//,
  /^\/api\/webhooks\//,
];

/**
 * Read-only mode after a self-hosted license has expired past its grace period: reads keep
 * working, writes are refused with a plain message, and an admin can always install the
 * renewed license. Nothing is deleted.
 */
@Injectable()
export class LicenseGuard implements CanActivate {
  constructor(private readonly license: LicenseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    const path = (req.originalUrl ?? req.url).split('?')[0];
    if (ALWAYS_ALLOWED.some((p) => p.test(path))) return true;
    const state = await this.license.state();
    if (!state.readOnly) return true;
    throw new ForbiddenException(
      'Activate is read-only because the license has expired. Your administrator needs to install the renewed license; nothing has been lost.',
    );
  }
}
