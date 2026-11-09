/**
 * How a company signs in, in two phases.
 *
 * `setup`: the company exists in WorkOS but no single sign-on connection has ever been active.
 * Only people invited in advance (typically the IT admin who will connect the identity provider)
 * may get in, with whatever WorkOS's hosted sign-in offers them (a password or an emailed code).
 * Nobody else from the company can join on their own.
 *
 * `sso`: a connection is, or once was, active. Every session must have signed in with single
 * sign-on; a password or code session is refused even for people who used one during setup.
 * The move is one-way: switching the connection off later does not reopen other sign-ins.
 *
 * `unknown`: WorkOS could not be asked and nothing is known. Treated as strictly as `sso` for
 * sessions and as strictly as `setup` for newcomers, so an outage never opens a door.
 */
export type SignInPhase = 'setup' | 'sso' | 'unknown';

/** Session methods accepted once a company is past setup. Impersonation is WorkOS support access. */
const SSO_PHASE_METHODS = new Set(['sso', 'impersonation']);

export function phaseFromConnections(
  active: number | null,
  ssoSince?: string | null,
): SignInPhase {
  if (ssoSince) return 'sso';
  if (active === null) return 'unknown';
  return active > 0 ? 'sso' : 'setup';
}

/** Whether a session that signed in with `method` (null: not known) may act in a company in `phase`. */
export function sessionAllowed(
  phase: SignInPhase,
  method: string | null,
): boolean {
  if (phase === 'setup') return true;
  return method !== null && SSO_PHASE_METHODS.has(method);
}

/** Whether someone Activate has never seen may join the company now (else only pre-invited people). */
export function newcomersMayJoin(phase: SignInPhase): boolean {
  return phase === 'sso';
}

/** Whether an address belongs to one of the company's email domains (exact, case-insensitive). */
export function emailOnDomains(
  email: string,
  domains: readonly string[],
): boolean {
  const domain = email.trim().toLowerCase().split('@').pop() ?? '';
  return domains.some((d) => d.trim().toLowerCase() === domain);
}

/** Why a sign-in was refused, in words a person can act on. */
export const SIGN_IN_MESSAGES = {
  ssoRequired:
    'Your company now signs in with its own single sign-on. Sign in again with your work account.',
  setupInviteOnly:
    'Your company is still setting up sign-in for Activate. Ask your administrator to invite you, or try again once they have finished.',
  deactivated:
    "Your access to Activate has been switched off. If you think that's a mistake, ask whoever runs Activate at your company.",
  wrongDomain:
    "This account isn't on your company's email domain, so it can't sign in to your company's Activate. Sign in with your work email address.",
} as const;
