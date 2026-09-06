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

/** Tool-facing sample case (`expected` is the verdict) → REST `SampleCase` (`shouldTrigger` yes/no/ambiguous, `expected` is the free-text note). */
export function toRestSampleCases(
  cases: { input: string; expected?: string; note?: string }[] | undefined,
): {
  input: string;
  shouldTrigger: 'yes' | 'no' | 'ambiguous';
  expected: string;
}[] {
  const verdict = (e: string | undefined): 'yes' | 'no' | 'ambiguous' =>
    e === 'should_trigger' || e === 'yes'
      ? 'yes'
      : e === 'should_not_trigger' || e === 'no'
        ? 'no'
        : 'ambiguous';
  return (cases ?? [])
    .filter((c) => c && typeof c.input === 'string' && c.input.trim())
    .map((c) => ({
      input: c.input.trim(),
      shouldTrigger: verdict(c.expected),
      expected: (c.note ?? '').trim(),
    }));
}

/**
 * Tool-facing boundary (`readsDataClasses`, `systemsReadOnly`, …) → REST `BoundaryDeclaration`
 * (`mayRead`, `mustNeverReceive`, `humanReview`). Read-only systems are declared as readable classes;
 * `mayRead` is also accepted directly so a host that already speaks the REST shape is not lossy.
 */
export function toRestBoundary(
  b:
    | {
        readsDataClasses?: string[];
        mayRead?: string[];
        mustNeverReceive?: string[];
        humanReview?: string[];
        systemsReadOnly?: string[];
      }
    | null
    | undefined,
): { mayRead: string[]; mustNeverReceive: string[]; humanReview: string[] } {
  const arr = (v: unknown) =>
    Array.isArray(v)
      ? v.map((x) => String(x).trim()).filter(Boolean)
      : ([] as string[]);
  return {
    mayRead: [
      ...new Set([
        ...arr(b?.readsDataClasses),
        ...arr(b?.mayRead),
        ...arr(b?.systemsReadOnly),
      ]),
    ],
    mustNeverReceive: [...new Set(arr(b?.mustNeverReceive))],
    humanReview: [...new Set(arr(b?.humanReview))],
  };
}

const ARTIFACT_KIND_TO_TYPE: Record<string, string> = {
  text: 'text',
  prompt: 'prompt_run',
  project: 'project',
  skill: 'skill',
  document: 'text',
  link: 'text',
  workflow: 'workflow',
  review: 'review',
};

/**
 * Tool-facing artifact (`kind`, `content`, `url`, `title`) → REST `Artifact` (`type` ∈ prompt_run|project|
 * skill|workflow|text|review, `content` required). A link with no content puts the URL in `content` so
 * the REST validator accepts it; extra keys are kept (the column is jsonb).
 */
export function toRestArtifact(a: {
  kind?: string;
  type?: string;
  content?: string;
  url?: string;
  title?: string;
  [k: string]: unknown;
}): Record<string, unknown> & { type: string; content: string } {
  const { kind, type, content, url, ...rest } = a ?? {};
  const resolved =
    (type && Object.values(ARTIFACT_KIND_TO_TYPE).includes(type)
      ? type
      : undefined) ??
    ARTIFACT_KIND_TO_TYPE[kind ?? ''] ??
    'text';
  const text = (content ?? '').trim() || (url ? `Link: ${url}` : '');
  return {
    ...rest,
    ...(kind ? { kind } : {}),
    ...(url ? { url } : {}),
    type: resolved,
    content: text,
  };
}
