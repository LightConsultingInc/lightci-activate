/**
 * How a company signs in, in two phases.
 *
 * `setup`: the company exists in WorkOS but no single sign-on connection is active yet. Only
 * people invited in advance (typically the IT admin who will connect the identity provider)
 * may get in, with whatever WorkOS's hosted sign-in offers them (a password or an emailed
 * code). Nobody else from the company can join on their own.
 *
 * `sso`: at least one connection is active. Every session must come through single sign-on;
 * a password or code session is refused even for people who used one during setup.
 *
 * `unknown` means WorkOS could not be asked and nothing was cached; callers decide how to fail.
 */
export type SignInPhase = 'setup' | 'sso' | 'unknown';

/** Session methods accepted once a company is on single sign-on. Impersonation is WorkOS support access. */
const SSO_PHASE_METHODS = new Set(['sso', 'impersonation']);

export function phaseFromConnections(active: number | null): SignInPhase {
  if (active === null) return 'unknown';
  return active > 0 ? 'sso' : 'setup';
}

/** Whether a session authenticated with `method` may act in a company in `phase`. */
export function sessionAllowed(
  phase: SignInPhase,
  method: string | null,
): boolean {
  if (phase !== 'sso') return true;
  // A session WorkOS cannot describe is not refused on that alone: the token is valid and
  // signed; refusing would lock everyone out whenever the sessions API is unreachable.
  if (method === null) return true;
  return SSO_PHASE_METHODS.has(method);
}

/** Why a sign-in was refused, in words a person can act on. */
export const SIGN_IN_MESSAGES = {
  ssoRequired:
    'Your company now signs in with its own single sign-on. Sign in again with your work account.',
  setupInviteOnly:
    'Your company is still setting up sign-in for Activate. Ask your administrator to invite you, or try again once they have finished.',
} as const;
