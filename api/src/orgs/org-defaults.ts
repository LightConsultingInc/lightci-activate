import { DEFAULT_ROLE_MAPPING } from '../auth/role-mapping';
import type { OrgSettings } from './entities/org.entity';

/** Settings every newly created organisation starts with (lead console and first-boot bootstrap). */
export function defaultOrgSettings(): OrgSettings {
  return {
    leaderboardsEnabled: false,
    stalledAfterDays: 14,
    baselineMethod: 'interview_estimate',
    // New orgs take roles from their identity provider from day one.
    identity: { roleMapping: { ...DEFAULT_ROLE_MAPPING } },
  };
}
