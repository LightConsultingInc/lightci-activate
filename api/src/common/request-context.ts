import { AsyncLocalStorage } from 'node:async_hooks';
import type { Person } from '../orgs/entities/person.entity';

export interface RequestStore {
  user?: Person;
  orgId?: string | null; // effective org (leads may switch with X-Activate-Org)
  requestId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestStore>();

export function currentStore(): RequestStore {
  return requestContext.getStore() ?? {};
}
