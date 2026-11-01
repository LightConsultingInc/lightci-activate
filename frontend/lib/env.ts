/**
 * Server-side runtime configuration. Nothing here is baked at build time, so one published
 * web image serves every deployment: the values come from the container's environment.
 *
 *   WEB_URL   public origin of this web app (redirect URIs are derived from it)
 *   API_URL   where the server, and the same-origin /api proxy, reach the Activate API
 */
export function webUrl(): string {
  const explicit = process.env.WEB_URL
  if (explicit) return explicit.replace(/\/$/, "")
  // Older deployments configured the callback URL directly.
  const legacy = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI
  if (legacy) {
    try {
      return new URL(legacy).origin
    } catch {
      /* fall through */
    }
  }
  return "http://localhost:3000"
}

/** The AuthKit callback registered with WorkOS. */
export function redirectUri(): string {
  return `${webUrl()}/callback`
}

/** The API as reached from the server (route handlers, server components, the /api proxy). */
export function apiUrl(): string {
  return (process.env.API_URL ?? "http://localhost:4310").replace(/\/$/, "")
}

/**
 * The API as reached from the person's browser: where OIDC sign-in sends them (the OAuth authorize
 * endpoint). In a cluster API_URL is an internal address, so deployments set PUBLIC_API_URL to the
 * API's public host. Defaults to API_URL for local development.
 */
export function publicApiUrl(): string {
  return (process.env.PUBLIC_API_URL ?? process.env.API_URL ?? "http://localhost:4310").replace(/\/$/, "")
}
