/**
 * Drive Keycloak's login page without a browser: fetch the form, post the credentials with
 * the session cookies, and return the redirect back to the relying party. Real HTTP against
 * the real IdP; nothing here is simulated.
 */
export async function keycloakLogin(
  authorizeUrl: string,
  username: string,
  password: string,
): Promise<URL> {
  // Keycloak may bounce once or twice (session cookie, locale) before showing the form; keep the cookies.
  const jar = new Map<string, string>();
  const remember = (res: Response) => {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  };
  const cookieHeader = () =>
    [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  let url = authorizeUrl;
  let page: Response | null = null;
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: jar.size ? { Cookie: cookieHeader() } : {},
    });
    remember(res);
    if (res.status === 200) {
      page = res;
      break;
    }
    const next = res.headers.get('location');
    if (!next || ![301, 302, 303, 307].includes(res.status))
      throw new Error(
        `Keycloak login page returned ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    const nextUrl = new URL(next, url);
    // Keycloak sends errors back to the relying party instead of showing the form.
    if (
      nextUrl.origin !== new URL(url).origin &&
      nextUrl.searchParams.has('error')
    )
      throw new Error(
        `Keycloak refused the authorize request: ${nextUrl.searchParams.get('error')} ${nextUrl.searchParams.get('error_description') ?? ''}`,
      );
    url = nextUrl.toString();
  }
  if (!page)
    throw new Error(
      'Keycloak kept redirecting instead of showing the login form',
    );
  const cookies = cookieHeader();
  const html = await page.text();
  const action = html.match(
    /<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/,
  )?.[1];
  if (!action)
    throw new Error(
      `Keycloak login form not found in page:\n${html.slice(0, 500)}`,
    );
  const body = new URLSearchParams({
    username,
    password,
    credentialId: '',
  });
  const res = await fetch(action.replace(/&amp;/g, '&'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookies,
    },
    body: body.toString(),
    redirect: 'manual',
  });
  const location = res.headers.get('location');
  if (res.status !== 302 || !location)
    throw new Error(
      `Keycloak did not redirect after login (${res.status}): ${(await res.text()).slice(0, 300)}`,
    );
  return new URL(location);
}
