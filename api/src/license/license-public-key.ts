import type { JWK } from 'jose';

/**
 * LightCI's license signing key (Ed25519, public half). Licenses are JWTs signed with the
 * matching private key, which lives in LightCI's secret store and is used only by
 * scripts/license-issue.mjs. Outside production, ACTIVATE_LICENSE_PUBLIC_KEY (a JWK) may
 * override this so tests can mint their own licenses.
 */
export const LIGHTCI_LICENSE_PUBLIC_KEY: JWK = {
  kty: 'OKP',
  crv: 'Ed25519',
  kid: 'lightci-license-2026',
  alg: 'EdDSA',
  x: '2hWPRTEUs__kQUIXiK1buUR68g3ZPA8VC9qXO68f15E',
};
