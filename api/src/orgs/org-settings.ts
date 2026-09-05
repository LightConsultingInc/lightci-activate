import type { Org, OrgSettings } from './entities/org.entity';

/**
 * Governance bookkeeping stored inside `org.settings` (the entity is fixed; the JSON column
 * is not). Versions bump on every policy/boundary change and are what /mc/governance reports.
 */
export interface GovernedOrgSettings extends OrgSettings {
  policyVersion?: number;
  policyUpdatedAt?: string | null;
  boundaryVersion?: number;
  boundaryUpdatedAt?: string | null;
  lastAnalyticsSyncAt?: string | null;
}

export function settingsOf(org: Pick<Org, 'settings'>): GovernedOrgSettings {
  return org.settings ?? {};
}
