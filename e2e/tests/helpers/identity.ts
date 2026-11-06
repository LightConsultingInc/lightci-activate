import { randomBytes } from "node:crypto"
import { writeFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readApiEnv } from "./workos"

/**
 * Plays the parts of a sign-in setup nobody at LightCI or the client should have to click
 * through by hand in a test: WorkOS (the test environment, through its REST API) and the
 * client's identity provider (the local Keycloak realm used by the OIDC suite, via its admin API).
 */

const env = () => readApiEnv()

export async function workos<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.workos.com${path}`, {
    method,
    headers: { authorization: `Bearer ${env().WORKOS_API_KEY}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`WorkOS ${method} ${path}: ${res.status} ${text.slice(0, 300)}`)
  try {
    return (text ? JSON.parse(text) : null) as T
  } catch {
    return text as T
  }
}

/** A throwaway password that satisfies WorkOS's strength rules. */
export const testPassword = () => `Lc-${randomBytes(12).toString("base64url")}!7`

/** Create a WorkOS user with a password; returns its id. */
export async function createWorkosUser(email: string, password: string): Promise<string> {
  const user = await workos<{ id: string }>("POST", "/user_management/users", { email, password, email_verified: true })
  return user.id
}

/**
 * An invited person setting up their first sign-in. WorkOS created an unverified user when it sent
 * the invitation; clicking the emailed link proves the mailbox, and they choose a password.
 */
export async function claimInvitedUser(email: string, password: string): Promise<string> {
  const users = await workos<{ data: { id: string }[] }>("GET", `/user_management/users?email=${encodeURIComponent(email)}`)
  const id = users.data[0]?.id
  if (!id) throw new Error(`WorkOS has no user for ${email}; was the invitation sent?`)
  await workos("PUT", `/user_management/users/${id}`, { password, email_verified: true })
  return id
}

/** Delete every WorkOS user whose address is on `domain` (test clean-up). */
export async function deleteWorkosUsersOnDomain(domain: string) {
  let after: string | undefined
  for (let page = 0; page < 20; page++) {
    const res = await workos<{ data: { id: string; email: string }[]; list_metadata: { after: string | null } }>(
      "GET",
      `/user_management/users?limit=100&order=desc${after ? `&after=${after}` : ""}`,
    )
    for (const u of res.data) if (u.email.endsWith(`@${domain}`)) await workos("DELETE", `/user_management/users/${u.id}`).catch(() => {})
    if (!res.list_metadata.after) break
    after = res.list_metadata.after
  }
}

/** WorkOS password sign-in, optionally accepting an invitation on the way. Returns the access token. */
export async function passwordSession(email: string, password: string, invitationToken?: string): Promise<{ accessToken: string; userId: string }> {
  const e = env()
  const body = await workos<{ access_token: string; user: { id: string } }>("POST", "/user_management/authenticate", {
    client_id: e.WORKOS_CLIENT_ID,
    client_secret: e.WORKOS_API_KEY,
    grant_type: "password",
    email,
    password,
    ...(invitationToken ? { invitation_token: invitationToken } : {}),
  })
  return { accessToken: body.access_token, userId: body.user.id }
}

/** How a WorkOS user's most recent session signed in ('sso', 'password', ...). */
export async function latestSessionMethod(userId: string): Promise<string | null> {
  const page = await workos<{ data: { auth_method: string; created_at: string }[] }>("GET", `/user_management/users/${userId}/sessions?limit=10&order=desc`)
  const latest = [...page.data].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  return latest?.auth_method ?? null
}

/** Mark the organisation's domains verified, as WorkOS does once the client's DNS record is found. */
export async function markDomainVerified(organizationId: string, domain: string) {
  await workos("PUT", `/organizations/${organizationId}`, { domain_data: [{ domain, state: "verified" }] })
}

// --- Keycloak: the client's identity provider -----------------------------------------------

export const KEYCLOAK = process.env.KEYCLOAK_URL ?? "http://localhost:8089"
export const REALM = "activate-test"

async function keycloakToken(): Promise<string> {
  const res = await fetch(`${KEYCLOAK}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", client_id: "admin-cli", username: "admin", password: "admin" }),
  })
  if (!res.ok) throw new Error(`Keycloak admin token: ${res.status} (is Keycloak running? api/test/keycloak/start.sh)`)
  return ((await res.json()) as { access_token: string }).access_token
}

async function keycloak<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${KEYCLOAK}/admin/realms/${REALM}${path}`, {
    method,
    headers: { authorization: `Bearer ${await keycloakToken()}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Keycloak ${method} ${path}: ${res.status} ${text.slice(0, 300)}`)
  return (text ? JSON.parse(text) : null) as T
}

export async function keycloakReachable(): Promise<boolean> {
  try {
    return (await fetch(`${KEYCLOAK}/realms/${REALM}/.well-known/openid-configuration`)).ok
  } catch {
    return false
  }
}

/**
 * What the client's IT admin does in Keycloak while following WorkOS's guide: a SAML client named
 * after WorkOS's SP entity id, posting to WorkOS's ACS URL, no client signature, and the id,
 * email, firstName and lastName attributes. Returns the Keycloak client's internal id.
 */
export async function createSamlClient(spEntityId: string, acsUrl: string): Promise<string> {
  await keycloak("POST", "/clients", {
    clientId: spEntityId,
    name: "LightCI Activate (lifecycle test)",
    protocol: "saml",
    enabled: true,
    frontchannelLogout: true,
    redirectUris: [acsUrl],
    attributes: {
      "saml_assertion_consumer_url_post": acsUrl,
      "saml.client.signature": "false",
      "saml.server.signature": "true",
      "saml.assertion.signature": "true",
      "saml_name_id_format": "email",
      "saml.force.name.id.format": "true",
    },
    protocolMappers: ["id", "email", "firstName", "lastName"].map((property) => ({
      name: property,
      protocol: "saml",
      protocolMapper: "saml-user-property-mapper",
      config: { "user.attribute": property === "id" ? "id" : property, "attribute.name": property, "attribute.nameformat": "Basic" },
    })),
  })
  const [client] = await keycloak<{ id: string }[]>("GET", `/clients?clientId=${encodeURIComponent(spEntityId)}`)
  return client.id
}

export async function deleteSamlClient(id: string) {
  await keycloak("DELETE", `/clients/${id}`).catch(() => {})
}

/** A person in the client's directory. Returns the Keycloak user id. */
export async function createKeycloakUser(email: string, password: string): Promise<string> {
  const username = email.split("@")[0]
  await keycloak("POST", "/users", {
    username,
    email,
    emailVerified: true,
    enabled: true,
    firstName: "Lifecycle",
    lastName: "Admin",
    credentials: [{ type: "password", value: password, temporary: false }],
  })
  const [user] = await keycloak<{ id: string }[]>("GET", `/users?username=${encodeURIComponent(username)}&exact=true`)
  return user.id
}

export async function deleteKeycloakUser(id: string) {
  await keycloak("DELETE", `/users/${id}`).catch(() => {})
}

/** The realm's SAML signing certificate as a PEM file (WorkOS's manual configuration takes an upload). */
export async function realmCertificateFile(): Promise<string> {
  const xml = await (await fetch(`${KEYCLOAK}/realms/${REALM}/protocol/saml/descriptor`)).text()
  const b64 = xml.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/)?.[1]
  if (!b64) throw new Error("No signing certificate in the Keycloak SAML descriptor")
  const pem = `-----BEGIN CERTIFICATE-----\n${b64.replace(/\s+/g, "").match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----\n`
  const file = join(mkdtempSync(join(tmpdir(), "activate-idp-")), "keycloak.pem")
  writeFileSync(file, pem)
  return file
}

export const SAML_SSO_URL = `${KEYCLOAK}/realms/${REALM}/protocol/saml`
export const SAML_ISSUER = `${KEYCLOAK}/realms/${REALM}`
