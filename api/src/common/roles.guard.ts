import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './decorators';
import type { Role } from './roles';
import type { Person } from '../orgs/entities/person.entity';

export function hasAnyRole(user: Person | undefined, roles: Role[]): boolean {
  if (!user) return false;
  if (user.roles.includes('lead')) return true; // LightCI leads see everything
  if (user.roles.includes('admin') && !roles.includes('lead')) return true;
  return roles.some((r) => user.roles.includes(r));
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;
    const req = context.switchToHttp().getRequest();
    if (!hasAnyRole(req.user, required)) {
      throw new ForbiddenException(`Requires one of: ${required.join(', ')}`);
    }
    return true;
  }
}
