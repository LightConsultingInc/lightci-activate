/** Pure helpers used by submit_skill (kept free of ESM-only imports so jest can load them). */

/** Pull `name:` / `description:` out of SKILL.md frontmatter when the model did not pass them explicitly. */
export function frontmatter(skillMd: string): {
  name?: string;
  description?: string;
} {
  const m = skillMd.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: { name?: string; description?: string } = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(name|description):\s*(.+)$/);
    if (kv)
      out[kv[1] as 'name' | 'description'] = kv[2]
        .trim()
        .replace(/^["']|["']$/g, '');
  }
  return out;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
