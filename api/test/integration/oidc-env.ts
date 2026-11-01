/**
 * Environment for the OIDC-mode integration tests. Imported first so every module that
 * reads process.env at load time sees the OIDC configuration. Points at the Keycloak
 * realm started by test/keycloak/start.sh and the local Postgres from api/.env.
 */
import 'dotenv/config';

export const KEYCLOAK_URL = (
  process.env.KEYCLOAK_URL ?? 'http://localhost:8089'
).replace(/\/$/, '');
export const ISSUER = `${KEYCLOAK_URL}/realms/activate-test`;
export const API_ORIGIN = 'http://127.0.0.1:4399';
export const WEB_ORIGIN = 'http://localhost:3999';
export const KC_PASSWORD = 'Activate-oidc-2026!';

process.env.NODE_ENV = 'test';
process.env.AUTH_PROVIDER = 'oidc';
process.env.AUTH_OIDC_ISSUER = ISSUER;
process.env.AUTH_OIDC_CLIENT_ID = 'activate';
process.env.AUTH_OIDC_CLIENT_SECRET = 'activate-secret';
process.env.AUTH_GROUPS_CLAIM = 'groups';
process.env.PUBLIC_API_URL = API_ORIGIN;
process.env.WEB_URL = WEB_ORIGIN;
process.env.ACTIVATE_SECRETS_KEY =
  process.env.ACTIVATE_SECRETS_KEY ?? 'integration-test-secrets-key';
process.env.LEAD_EMAIL_DOMAINS = 'lightci.com';
process.env.ACTIVATE_ROLE = 'api';
process.env.AI_PROVIDER = 'mock';
process.env.MIGRATIONS_RUN_ON_BOOT = 'true';
delete process.env.MCP_DEV_USER_EMAIL;
delete process.env.SEED_ON_BOOT;
