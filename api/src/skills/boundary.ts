/**
 * Pure boundary helpers shared by the library (badges, health flags) and the Promoter
 * (boundary check, exposure). No I/O; unit-tested in boundary.spec.ts.
 */
import type { ComplianceBoundary } from '../orgs/entities/org.entity';
import type { BoundaryCheck } from './entities/promotion-request.entity';
import type {
  BoundaryDeclaration,
  ActivateManifest,
} from './entities/skill.entity';
import type { BoundaryBadge } from './skills.types';

export interface BoundaryBadgeInput {
  boundary?: Partial<BoundaryDeclaration> | null;
  manifest?:
    Pick<ActivateManifest, 'boundary'> | Record<string, unknown> | null;
  skillMd?: string | null;
  triggerLine?: string | null;
}

export const EMPTY_BOUNDARY: ComplianceBoundary = {
  allowedDataClasses: [],
  forbiddenDataClasses: [],
  readOnlySystems: [],
  humanReviewPoints: [],
};

const norm = (s: string) => s.trim().toLowerCase();
const list = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string').map(norm)
    : [];
const intersect = (a: string[], b: string[]) => a.filter((x) => b.includes(x));

/** Class tokens that appear in prose: `account_numbers` → "account number(s)"; `ssn` → "ssn" / "social security". */
export function classMentionPatterns(dataClass: string): RegExp[] {
  const words = dataClass.toLowerCase().split('_').filter(Boolean);
  const phrase = words.join('[ _-]+');
  const patterns = [new RegExp(`\\b${phrase}\\b`, 'i')];
  // singular form of the last word ("account numbers" → "account number")
  const last = words[words.length - 1];
  if (last && last.endsWith('s'))
    patterns.push(
      new RegExp(
        `\\b${[...words.slice(0, -1), last.slice(0, -1)].join('[ _-]+')}\\b`,
        'i',
      ),
    );
  if (dataClass === 'ssn') patterns.push(/social security/i);
  if (dataClass === 'statements_raw')
    patterns.push(/\b(custodial|account|brokerage|raw) statements?\b/i);
  if (dataClass === 'client_pii_documents')
    patterns.push(
      /\b(identity documents?|id (copies|scans?)|driver'?s? licen[cs]es?|passports?)\b/i,
    );
  return patterns;
}

export function textMentionsClass(
  text: string | null | undefined,
  dataClass: string,
): boolean {
  if (!text) return false;
  return classMentionPatterns(dataClass).some((rx) => rx.test(text));
}

function manifestMayRead(manifest: BoundaryBadgeInput['manifest']): string[] {
  const b = (manifest as { boundary?: { may_read?: unknown } } | null)
    ?.boundary;
  return list(b?.may_read);
}

/** Forbidden classes the skill reads (declared mayRead or manifest may_read). */
export function restrictedClassesRead(
  skill: BoundaryBadgeInput,
  orgBoundary: ComplianceBoundary | null | undefined,
): string[] {
  const forbidden = list(orgBoundary?.forbiddenDataClasses);
  if (forbidden.length === 0) return [];
  const reads = [
    ...new Set([
      ...list(skill.boundary?.mayRead),
      ...manifestMayRead(skill.manifest),
    ]),
  ];
  return intersect(reads, forbidden);
}

/**
 * Forbidden classes the skill touches (reads or talks about) without listing them in
 * mustNeverReceive. This is the `boundary_gap` health flag and the Promoter's missingDeclarations.
 */
export function undeclaredForbiddenClasses(
  skill: BoundaryBadgeInput,
  orgBoundary: ComplianceBoundary | null | undefined,
): string[] {
  const forbidden = list(orgBoundary?.forbiddenDataClasses);
  const declared = list(skill.boundary?.mustNeverReceive);
  const reads = [
    ...list(skill.boundary?.mayRead),
    ...manifestMayRead(skill.manifest),
  ];
  return forbidden.filter(
    (c) =>
      !declared.includes(c) &&
      (reads.includes(c) ||
        textMentionsClass(skill.skillMd, c) ||
        textMentionsClass(skill.triggerLine, c)),
  );
}

/**
 * Contract: red if the skill reads a restricted class (declared or via manifest), or if it never
 * declares a restricted class it plainly touches; amber if humanReview is non-empty; green otherwise.
 */
export function boundaryBadge(
  skill: BoundaryBadgeInput,
  orgBoundary: ComplianceBoundary | null | undefined,
): BoundaryBadge {
  if (restrictedClassesRead(skill, orgBoundary).length > 0) return 'red';
  const forbidden = list(orgBoundary?.forbiddenDataClasses);
  const declaredForbidden = intersect(
    list(skill.boundary?.mustNeverReceive),
    forbidden,
  );
  if (
    forbidden.length > 0 &&
    declaredForbidden.length === 0 &&
    undeclaredForbiddenClasses(skill, orgBoundary).length > 0
  )
    return 'red';
  const humanReview = [
    ...list(skill.boundary?.humanReview),
    ...list(
      (skill.manifest as { boundary?: { human_review?: unknown } } | null)
        ?.boundary?.human_review,
    ),
  ];
  if (humanReview.length > 0) return 'amber';
  return 'green';
}

const WRITE_VERBS =
  '(write|writes|written|update|updates|updated|enter|enters|entered|post|posts|posted|push|pushes|pushed|log|logs|logged|save|saves|saved)';
const NEGATION =
  /\b(never|not|no|nothing|none|nor|without|cannot|can't|don't|doesn't|won't|isn't|aren't|must not|do not|does not|is not|are not|rather than|instead of|by a person|by the advisor|by a human)\b/i;

/**
 * True when the text appears to write to `system`: a write verb within 40 characters before the
 * system name, in a clause that is not negated ("never entered into Salesforce by this skill" is a
 * boundary statement, not a write).
 */
export function mentionsWriteTo(text: string, system: string): boolean {
  const rx = new RegExp(`\\b${WRITE_VERBS}[^.;\\n]{0,40}\\b${system}\\b`, 'gi');
  for (const m of text.matchAll(rx)) {
    const start = m.index ?? 0;
    const clauseStart = Math.max(
      0,
      text.lastIndexOf('.', start),
      text.lastIndexOf(';', start),
      text.lastIndexOf('\n', start),
    );
    const clause = text.slice(clauseStart, start + m[0].length + 20);
    if (!NEGATION.test(clause)) return true;
  }
  return false;
}

export interface BoundaryCheckResult extends BoundaryCheck {
  highExposure: boolean;
}

const CRM_ENTRY = /crm|entry|salesforce|system of record/i;

/**
 * Promoter's machine check of a skill against the org boundary. `highExposure` when the skill
 * reads any forbidden class, or has human-review steps that touch CRM/data entry.
 */
export function checkBoundary(
  skill: BoundaryBadgeInput,
  orgBoundary: ComplianceBoundary | null | undefined,
): BoundaryCheckResult {
  const touchesRestrictedClasses = restrictedClassesRead(skill, orgBoundary);
  const missingDeclarations = undeclaredForbiddenClasses(skill, orgBoundary);
  const humanReview = list(skill.boundary?.humanReview);
  const touchesEntry = humanReview.some((h) => CRM_ENTRY.test(h));
  const readOnlyMentioned = list(orgBoundary?.readOnlySystems).filter((sys) =>
    mentionsWriteTo(skill.skillMd ?? '', sys),
  );
  const humanReviewRequired =
    humanReview.length > 0 ||
    touchesRestrictedClasses.length > 0 ||
    touchesEntry;
  const highExposure = touchesRestrictedClasses.length > 0 || touchesEntry;
  const ok = missingDeclarations.length === 0 && readOnlyMentioned.length === 0;
  const notes: string[] = [];
  if (touchesRestrictedClasses.length)
    notes.push(
      `Reads restricted class(es): ${touchesRestrictedClasses.join(', ')} — compliance approval required.`,
    );
  if (missingDeclarations.length)
    notes.push(
      `Touches ${missingDeclarations.join(', ')} without declaring them in must_never_receive.`,
    );
  if (readOnlyMentioned.length)
    notes.push(
      `Text appears to write to read-only system(s): ${readOnlyMentioned.join(', ')}.`,
    );
  if (touchesEntry)
    notes.push('Human-review step touches CRM / system-of-record entry.');
  if (humanReview.length === 0 && touchesRestrictedClasses.length === 0)
    notes.push(
      'No human-review points declared; confirm output never leaves the firm unreviewed.',
    );
  if (notes.length === 0)
    notes.push(
      'Boundary declaration is complete and consistent with the firm boundary.',
    );
  return {
    ok,
    touchesRestrictedClasses,
    missingDeclarations,
    humanReviewRequired,
    notes: notes.join(' '),
    highExposure,
  };
}

/** Token set used for trigger-overlap detection (words > 3 chars, lowercase). */
export function triggerTokens(text: string | null | undefined): Set<string> {
  return new Set(
    (text ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export const TRIGGER_OVERLAP_THRESHOLD = 0.6;
