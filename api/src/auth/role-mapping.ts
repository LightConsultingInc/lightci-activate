import type { Role } from '../common/roles';

/**
 * How identity-provider roles or groups become Activate roles.
 *
 * Keys are the Activate roles an IdP may grant; values are the IdP role slugs
 * (WorkOS organization roles) or group names (direct OIDC) that grant them.
 * `lead` is never mapped: it is LightCI's cross-organisation role and comes only
 * from LEAD_EMAIL_DOMAINS. `learner` is implicit: everyone who can sign in is one.
 */
export type MappableRole = 'admin' | 'sponsor' | 'champion';
export type IdentityRoleMapping = Partial<Record<MappableRole, string[]>>;

export const MAPPABLE_ROLES: MappableRole[] = ['admin', 'sponsor', 'champion'];

/** What a newly provisioned organisation starts with. WorkOS's built-in `admin` slug keeps working. */
export const DEFAULT_ROLE_MAPPING: IdentityRoleMapping = {
  admin: ['activate-admin', 'admin'],
  sponsor: ['activate-sponsor'],
  champion: ['activate-champion'],
};

const norm = (s: string) => s.trim().toLowerCase();

/** Roles the IdP grants under this mapping (never lead, never learner). */
export function rolesFromIdp(
  idpRoles: readonly string[],
  mapping: IdentityRoleMapping,
): MappableRole[] {
  const have = new Set(idpRoles.map(norm));
  return MAPPABLE_ROLES.filter((role) =>
    (mapping[role] ?? []).some((slug) => have.has(norm(slug))),
  );
}

/**
 * Recompute a person's roles on sign-in.
 *
 * With a mapping, the IdP is the source of truth for admin, sponsor and champion:
 * those are replaced wholesale, so removing someone from a group takes effect at
 * their next sign-in. `lead` and `learner` are preserved. Without a mapping the
 * roles are left exactly as they were (manual grants stand).
 */
export function applyRoleMapping(
  existing: readonly Role[],
  idpRoles: readonly string[],
  mapping: IdentityRoleMapping | undefined,
): Role[] {
  if (!mapping) return [...existing];
  const managed = new Set<Role>(MAPPABLE_ROLES);
  const kept = existing.filter((r) => !managed.has(r));
  const granted = rolesFromIdp(idpRoles, mapping);
  const next = new Set<Role>([...kept, ...granted]);
  next.add('learner');
  return ['lead', 'admin', 'sponsor', 'champion', 'learner'].filter((r) =>
    next.has(r as Role),
  ) as Role[];
}

/** Roles for a person seen for the first time. */
export function initialRoles(
  idpRoles: readonly string[],
  mapping: IdentityRoleMapping | undefined,
): Role[] {
  if (mapping) return applyRoleMapping([], idpRoles, mapping);
  // Legacy behaviour for orgs without a mapping: WorkOS `admin` becomes admin and sponsor.
  return idpRoles.map(norm).includes('admin')
    ? ['admin', 'sponsor']
    : ['learner'];
}

/** Validate a mapping sent by an admin. Returns the clean mapping or the first problem. */
export function parseRoleMapping(
  input: unknown,
): { ok: true; mapping: IdentityRoleMapping } | { ok: false; error: string } {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    return { ok: false, error: 'roleMapping must be an object' };
  const mapping: IdentityRoleMapping = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!(MAPPABLE_ROLES as string[]).includes(key))
      return {
        ok: false,
        error: `roleMapping may only set ${MAPPABLE_ROLES.join(', ')} (got "${key}")`,
      };
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string'))
      return { ok: false, error: `roleMapping.${key} must be a list of names` };
    const names = (value as string[]).map((v) => v.trim()).filter(Boolean);
    if (names.length > 50)
      return { ok: false, error: `roleMapping.${key} lists too many names` };
    mapping[key as MappableRole] = names;
  }
  return { ok: true, mapping };
}
