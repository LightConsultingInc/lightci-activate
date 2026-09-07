import { BuilderOutputSchema, ScorerOutputSchema } from './ai-schemas';
import { mockBuild, mockScore } from './workflows.mocks';
import {
  hoursAtStake,
  hoursBackPerWeek,
  normaliseAll,
  normaliseComposite,
  rawComposite,
  schemaCompleteness,
} from './workflows.types';
import type { WorkflowSchema } from './entities/workflow-map.entity';

const FORBIDDEN = [
  'client_pii_documents',
  'account_numbers',
  'ssn',
  'statements_raw',
];

const SCHEMA: Partial<WorkflowSchema> = {
  purpose: 'Prepare the Monday client meeting brief',
  trigger: 'a review meeting is on the calendar',
  frequency: 'weekly',
  minutesPerRun: 45,
  runsPerWeek: 9,
  inputs: [
    { name: 'Calendar entry', source: 'Outlook', dataClass: 'calendar' },
    {
      name: 'Salesforce summary export',
      source: 'Salesforce',
      dataClass: 'crm_summary_export',
    },
  ],
  steps: [
    {
      order: 1,
      action: 'Pull the CRM summary',
      actor: 'human',
      system: 'Salesforce',
    },
    { order: 2, action: 'Draft the brief in the template', actor: 'claude' },
    { order: 3, action: 'Review before the meeting', actor: 'human' },
  ],
  decisions: [
    { point: 'Meeting type', rule: 'Only reviews with existing households' },
  ],
  exceptions: [
    {
      case: 'Prospect discovery call',
      handling: 'Use the discovery agenda instead',
    },
  ],
  systems: ['Salesforce', 'Outlook'],
  mustNeverLeave: ['account_numbers'],
  outputs: [{ name: 'Meeting brief', destination: 'advisor' }],
  humanReview: ['before_client_meeting'],
};

describe('composite score', () => {
  it('rawComposite is value × hours × readiness ÷ (1 + exposure) with clamped inputs', () => {
    expect(rawComposite(0.8, 10, 0.5, 0.25)).toBeCloseTo(
      (0.8 * 10 * 0.5) / 1.25,
    );
    expect(rawComposite(1.5, 10, 2, -1)).toBeCloseTo(10); // clamped to 1, 1, 0
    expect(rawComposite(0.5, -3, 0.5, 0)).toBe(0);
    expect(rawComposite(0.5, Number.NaN, 0.5, 0)).toBe(0);
  });

  it('normaliseComposite maps the org max to 100 and everything else proportionally', () => {
    expect(normaliseComposite(4, 4)).toBe(100);
    expect(normaliseComposite(2, 4)).toBe(50);
    expect(normaliseComposite(1, 3)).toBe(33.3);
    expect(normaliseComposite(0, 4)).toBe(0);
    expect(normaliseComposite(3, 0)).toBe(0);
    expect(normaliseComposite(7, 4)).toBe(100); // never above 100
  });

  it('normaliseAll ranks a set against its own max and leaves unscored items alone', () => {
    const items = [
      {
        id: 'a',
        score: {
          value: 0.9,
          hours: 8,
          readiness: 0.8,
          exposure: 0.2,
          composite: 0,
          rationale: '',
        },
      },
      {
        id: 'b',
        score: {
          value: 0.5,
          hours: 8,
          readiness: 0.8,
          exposure: 0.2,
          composite: 0,
          rationale: '',
        },
      },
      { id: 'c', score: null },
    ];
    const out = normaliseAll(items);
    expect(out[0].score!.composite).toBe(100);
    expect(out[1].score!.composite).toBeCloseTo(55.6, 1);
    expect(out[2].score).toBeNull();
    expect(items[0].score!.composite).toBe(0); // pure: input untouched
  });
});

describe('hours back', () => {
  it('is (baseline − measured − rework) / 60, rounded, never NaN', () => {
    expect(hoursBackPerWeek(405, 180, 30)).toBeCloseTo(3.25);
    expect(hoursBackPerWeek(100, 120, 0)).toBeCloseTo(-0.33, 2);
    expect(hoursBackPerWeek(null, 100, 0)).toBe(0);
    expect(hoursBackPerWeek(100, undefined, 0)).toBe(0);
    expect(hoursBackPerWeek(Number.NaN, 1, 1)).toBe(0);
  });

  it('hoursAtStake and schemaCompleteness read the schema defensively', () => {
    expect(hoursAtStake(SCHEMA)).toBeCloseTo(6.8, 1);
    expect(hoursAtStake({})).toBe(0);
    expect(schemaCompleteness(SCHEMA)).toBe(1);
    expect(schemaCompleteness({ purpose: 'x', steps: [] })).toBeCloseTo(
      0.08,
      2,
    );
    expect(schemaCompleteness(null)).toBe(0);
  });
});

describe('mock responders', () => {
  it('scorer.workflow output is schema-valid and derived from the map', () => {
    const out = mockScore({
      name: 'Monday meeting prep',
      schema: SCHEMA,
      completeness: 0.9,
      forbiddenDataClasses: FORBIDDEN,
      readOnlySystems: ['Salesforce'],
    });
    expect(ScorerOutputSchema.safeParse(out).success).toBe(true);
    expect(out.hoursPerWeek).toBeCloseTo(6.75);
    expect(out.exposure).toBeLessThan(0.5);
    expect(out.rationale).toMatch(/9×\/week/);
    const risky = mockScore({
      name: 'Statement reconciliation',
      schema: {
        ...SCHEMA,
        inputs: [
          { name: 'Statement', source: 'Schwab', dataClass: 'statements_raw' },
        ],
      },
      completeness: 0.9,
      forbiddenDataClasses: FORBIDDEN,
    });
    expect(risky.exposure).toBeGreaterThan(out.exposure);
    expect(mockScore({ name: 'Monday meeting prep', schema: SCHEMA })).toEqual(
      mockScore({ name: 'Monday meeting prep', schema: SCHEMA }),
    ); // deterministic
  });

  it('builder.skill output is schema-valid, has four cases of each kind, and inherits the firm boundary', () => {
    const out = mockBuild({
      name: 'Monday meeting prep',
      schema: SCHEMA,
      teamSlug: 'fp',
      plugin: 'fp-meeting-prep',
      ownerEmail: 'priya.nair@meridianwealth.demo',
      forbiddenDataClasses: FORBIDDEN,
      humanReviewPoints: ['before_send'],
    });
    expect(BuilderOutputSchema.safeParse(out).success).toBe(true);
    expect(out.slug).toBe('monday-meeting-prep');
    expect(out.sampleCases.map((c) => c.shouldTrigger).sort()).toEqual([
      'ambiguous',
      'no',
      'yes',
      'yes',
    ]);
    expect(out.boundary.mustNeverReceive).toEqual(
      expect.arrayContaining(FORBIDDEN),
    );
    expect(out.boundary.mayRead).toEqual(['calendar', 'crm_summary_export']);
    expect(out.skillMd).toMatch(/^---\nname: monday-meeting-prep\n/);
    for (const section of [
      '## When to use',
      '## Inputs',
      '## Steps',
      '## Output format',
      '## Boundaries',
      '## Examples',
    ])
      expect(out.skillMd).toContain(section);
    expect(out.confidence).toBeGreaterThanOrEqual(0.6);
    const thin = mockBuild({
      name: 'Something vague',
      schema: { purpose: 'unclear' },
      forbiddenDataClasses: FORBIDDEN,
    });
    expect(thin.confidence).toBeLessThan(0.6);
    expect(thin.openQuestions.length).toBeGreaterThan(0);
  });
});
