/** Normalise a comma- or space-separated list of email domains. Invalid entries are dropped. */
const DOMAIN =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function parseEmailDomains(input: unknown): string[] {
  const parts = Array.isArray(input)
    ? input.map(String)
    : typeof input === 'string'
      ? input.split(/[,\s]+/)
      : [];
  const out = new Set<string>();
  for (const raw of parts) {
    const d = raw.trim().toLowerCase().replace(/^@/, '');
    if (d && DOMAIN.test(d)) out.add(d);
  }
  return [...out];
}

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split('@')[1] ?? '';
}
