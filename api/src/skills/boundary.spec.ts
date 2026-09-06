import type { ComplianceBoundary } from '../orgs/entities/org.entity';
import { boundaryBadge, checkBoundary, jaccard, mentionsWriteTo, textMentionsClass, triggerTokens, undeclaredForbiddenClasses } from './boundary';

const ORG: ComplianceBoundary = {
  allowedDataClasses: ['aggregated_client_summaries', 'internal_templates', 'public_regulation', 'calendar', 'crm_summary_export'],
  forbiddenDataClasses: ['client_pii_documents', 'account_numbers', 'ssn', 'statements_raw'],
  readOnlySystems: ['Salesforce', 'Orion', 'eMoney'],
  humanReviewPoints: ['before_send', 'before_crm_entry', 'before_client_meeting'],
};

const skill = (over: Partial<{ mayRead: string[]; mustNeverReceive: string[]; humanReview: string[]; skillMd: string; manifest: Record<string, unknown> | null; triggerLine: string }> = {}) => ({
  boundary: { mayRead: over.mayRead ?? ['calendar', 'internal_templates'], mustNeverReceive: over.mustNeverReceive ?? ['account_numbers', 'ssn'], humanReview: over.humanReview ?? [] },
  skillMd: over.skillMd ?? '# Skill\n\nBuild the brief from the calendar and the template.',
  manifest: over.manifest ?? null,
  triggerLine: over.triggerLine ?? 'Use when asked to prep a meeting.',
});

describe('boundaryBadge', () => {
  it('is green when nothing restricted is touched and there is no human review', () => {
    expect(boundaryBadge(skill(), ORG)).toBe('green');
  });

  it('is amber when human-review steps are declared', () => {
    expect(boundaryBadge(skill({ humanReview: ['before_send'] }), ORG)).toBe('amber');
  });

  it('is red when the skill declares it reads a forbidden class', () => {
    expect(boundaryBadge(skill({ mayRead: ['calendar', 'ssn'], humanReview: ['before_send'] }), ORG)).toBe('red');
  });

  it('is red when the manifest may_read touches a forbidden class even if the DB boundary does not', () => {
    expect(boundaryBadge(skill({ manifest: { boundary: { may_read: ['statements_raw'], must_never_receive: [], human_review: [] } } }), ORG)).toBe('red');
  });

  it('is red when no forbidden class is declared in mustNeverReceive but the text plainly handles one', () => {
    expect(boundaryBadge(skill({ mustNeverReceive: [], skillMd: 'Paste the account numbers from the statement and we will format them.' }), ORG)).toBe('red');
  });

  it('is not red when some forbidden classes are declared even if the text mentions another one (that is a boundary_gap, not red)', () => {
    const s = skill({ mustNeverReceive: ['ssn'], skillMd: 'Never paste account numbers into the memo.', humanReview: ['before_crm_entry'] });
    expect(boundaryBadge(s, ORG)).toBe('amber');
    expect(undeclaredForbiddenClasses(s, ORG)).toEqual(['account_numbers']);
  });

  it('never goes red without an org boundary; amber only from human review', () => {
    expect(boundaryBadge(skill({ mayRead: ['ssn'] }), null)).toBe('green');
    expect(boundaryBadge(skill({ mayRead: ['ssn'], humanReview: ['before_send'] }), { ...ORG, forbiddenDataClasses: [] })).toBe('amber');
  });
});

describe('textMentionsClass', () => {
  it('matches class tokens in prose, singular and plural, and known synonyms', () => {
    expect(textMentionsClass('do not paste account numbers', 'account_numbers')).toBe(true);
    expect(textMentionsClass('an account number appears', 'account_numbers')).toBe(true);
    expect(textMentionsClass('Social Security numbers stay out', 'ssn')).toBe(true);
    expect(textMentionsClass('raw custodial statements', 'statements_raw')).toBe(true);
    expect(textMentionsClass('ID copies from onboarding', 'client_pii_documents')).toBe(true);
    expect(textMentionsClass('the calendar entry', 'account_numbers')).toBe(false);
    expect(textMentionsClass(null, 'ssn')).toBe(false);
  });
});

describe('checkBoundary', () => {
  it('passes a complete declaration with no exposure', () => {
    const r = checkBoundary(skill({ mustNeverReceive: ['client_pii_documents', 'account_numbers', 'ssn', 'statements_raw'] }), ORG);
    expect(r.ok).toBe(true);
    expect(r.touchesRestrictedClasses).toEqual([]);
    expect(r.missingDeclarations).toEqual([]);
    expect(r.highExposure).toBe(false);
    expect(r.humanReviewRequired).toBe(false);
    expect(r.notes).toMatch(/No human-review points/);
  });

  it('reports missing declarations when the text handles an undeclared forbidden class', () => {
    const r = checkBoundary(skill({ mustNeverReceive: ['client_pii_documents', 'ssn', 'statements_raw'], skillMd: 'Never paste account numbers into the memo.', humanReview: ['before_crm_entry'] }), ORG);
    expect(r.ok).toBe(false);
    expect(r.missingDeclarations).toEqual(['account_numbers']);
    expect(r.notes).toMatch(/without declaring/);
  });

  it('is high exposure when a forbidden class is read', () => {
    const r = checkBoundary(skill({ mayRead: ['statements_raw'], mustNeverReceive: ['ssn'], humanReview: ['before_send'] }), ORG);
    expect(r.touchesRestrictedClasses).toEqual(['statements_raw']);
    expect(r.highExposure).toBe(true);
    expect(r.humanReviewRequired).toBe(true);
    expect(r.notes).toMatch(/compliance approval required/);
  });

  it('is high exposure when a human-review step touches CRM entry', () => {
    const r = checkBoundary(skill({ mustNeverReceive: ['client_pii_documents', 'account_numbers', 'ssn', 'statements_raw'], humanReview: ['before_crm_entry'] }), ORG);
    expect(r.touchesRestrictedClasses).toEqual([]);
    expect(r.highExposure).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('flags text that appears to write to a read-only system', () => {
    const r = checkBoundary(skill({ mustNeverReceive: ['client_pii_documents', 'account_numbers', 'ssn', 'statements_raw'], skillMd: 'Then update Salesforce with the note automatically.' }), ORG);
    expect(r.ok).toBe(false);
    expect(r.notes).toMatch(/read-only system/);
  });

  it('does not flag a negated boundary statement about a read-only system', () => {
    const md = '## Boundaries\n\n- **Human review:** the advisor reviews the summary before the client meeting; nothing here is sent to the client or entered into Salesforce by this skill.\n- The planner, not Claude, updates Orion afterwards.';
    const r = checkBoundary(skill({ mustNeverReceive: ['client_pii_documents', 'account_numbers', 'ssn', 'statements_raw'], humanReview: ['before_client_meeting'], skillMd: md }), ORG);
    expect(r.ok).toBe(true);
    expect(r.notes).not.toMatch(/read-only system/);
    expect(mentionsWriteTo('Push the note into eMoney when done.', 'emoney')).toBe(true);
    expect(mentionsWriteTo('Never push anything into eMoney.', 'emoney')).toBe(false);
  });
});

describe('trigger overlap', () => {
  it('computes Jaccard over words longer than three characters', () => {
    const a = triggerTokens('Write the follow-up email after a client review meeting from rough notes');
    const b = triggerTokens('Write the follow-up email after a client review meeting from the advisor notes');
    expect(jaccard(a, b)).toBeGreaterThan(0.6);
    expect(jaccard(a, triggerTokens('Summarise attestation responses for the CCO'))).toBeLessThan(0.2);
    expect(jaccard(new Set(), new Set())).toBe(0);
  });
});
