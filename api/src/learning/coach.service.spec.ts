import type { ContextLayer } from '../context/entities/context-layer.entity';
import type { Person } from '../orgs/entities/person.entity';
import type { WorkflowMap } from '../workflows/entities/workflow-map.entity';
import { CoachService } from './coach.service';
import type { Exercise } from './entities/exercise.entity';
import { FakeRepo, fakeAi } from './testing/fake-repo';

function build(
  maps: Partial<WorkflowMap>[],
  layer: Partial<ContextLayer> | null,
  rung = 0,
) {
  const exercises = new FakeRepo<Exercise>();
  const layers = new FakeRepo<ContextLayer>(layer ? [layer] : []);
  const workflows = new FakeRepo<WorkflowMap>(maps);
  const empty = () => new FakeRepo<any>();
  const mastery = {
    report: jest.fn(() =>
      Promise.resolve({
        rung,
        nextRung: rung + 1,
        competencies: [],
        judgement: { score: 0 },
        progress: {},
        eligible: false,
      }),
    ),
  };
  const svc = new CoachService(
    exercises as any,
    empty() as any,
    empty() as any,
    empty() as any,
    empty() as any,
    layers as any,
    workflows as any,
    empty() as any,
    empty() as any,
    fakeAi() as any,
    mastery as any,
    {
      get: jest.fn(() =>
        Promise.resolve({
          summary: null,
          strengths: [],
          struggles: [],
          preferences: [],
          vocabulary: [],
          systems: [],
          anchorWorkflows: [],
          version: 0,
          updatedAt: null,
          lastEvents: [],
        }),
      ),
      record: jest.fn(() => Promise.resolve({ version: 0 })),
    } as any,
  );
  return { svc, exercises };
}

const person = {
  id: 'p1',
  orgId: 'org1',
  teamId: null,
  name: 'Priya',
  title: 'Financial planner',
  profile: { weeklyWorkflows: ['Meeting prep'] },
} as Person;

describe('CoachService rung 0: one real task', () => {
  it('builds a filled-in starter prompt for the most frequent workflow, in the app, no reading surface', async () => {
    const maps = [
      {
        id: 'wf-a',
        orgId: 'org1',
        ownerPersonId: 'p1',
        name: 'Monday client review pack',
        schema: {
          runsPerWeek: 1,
          inputs: [{ name: 'Last week notes', source: 'Drive' }],
          outputs: [{ name: 'Review pack', destination: 'Team' }],
          systems: ['Drive'],
        },
        updatedAt: new Date(),
      },
      {
        id: 'wf-b',
        orgId: 'org1',
        ownerPersonId: 'p1',
        name: 'RMD letters',
        schema: {
          runsPerWeek: 4,
          inputs: [
            { name: 'Household summary', source: 'CRM' },
            { name: 'Prior letter', source: 'Drive' },
          ],
          outputs: [{ name: 'Client letter', destination: 'Client' }],
          systems: ['CRM', 'Word'],
        },
        updatedAt: new Date(),
      },
    ];
    const { svc, exercises } = build(maps, {
      orgId: 'org1',
      layer: 'person',
      ownerId: 'p1',
      summary: 'Planner',
      anchorWorkflows: [],
      systems: [],
      vocabulary: [],
      sensitivities: [],
    });
    const ex = await svc.generateNextExercise(person, 'org1');
    expect(ex.rung).toBe(0);
    expect(ex.title).toBe('Do one real thing: RMD letters');
    expect(ex.title.length).toBeLessThanOrEqual(60);
    expect(ex.kind).toBe('artifact');
    expect(ex.workSurface).toBe('prompt');
    expect(ex.mode).toBe('in_app');
    expect(ex.workflowMapId).toBe('wf-b');
    expect(ex.brief).toBe(
      "Try one real thing: write what you'd ask Claude for RMD letters, then press Run.",
    );
    const practice = ex.starter.practice as {
      ask: string;
      kind: string;
      workflowName: string;
      prefill: { prompt: string };
    };
    expect(practice.kind).toBe('prompt');
    expect(practice.ask).toBe(ex.brief);
    expect(practice.workflowName).toBe('RMD letters');
    expect(practice.prefill.prompt).toContain('I am a Financial planner');
    expect(practice.prefill.prompt).toContain(
      'Household summary, Prior letter',
    );
    expect(practice.prefill.prompt).toContain('Client letter');
    expect(practice.prefill.prompt).toContain('CRM and Word');
    expect(ex.rationale).toContain('4 times a week');
    expect(ex.hints).toHaveLength(3);
    expect(ex.hints.every((h) => /^Try /.test(h))).toBe(true);
    expect(
      `${ex.title} ${ex.brief} ${ex.rationale} ${ex.hints.join(' ')}`,
    ).not.toMatch(
      /expectation|critique|competency|worked example|cold attempt|\bL[0-5]\b|policy|quiz/i,
    );
    expect(exercises.rows).toHaveLength(1);
  });

  it('falls back to the intake profile workflow when no map exists', async () => {
    const { svc } = build([], null);
    const ex = await svc.generateNextExercise(person, 'org1');
    expect(ex.title).toBe('Do one real thing: Meeting prep');
    expect(
      (ex.starter.practice as { prefill: { prompt: string } }).prefill.prompt,
    ).toContain('the notes I paste below');
    expect(ex.rationale).toContain('more than anything else');
  });
});

describe('CoachService rung 1+: practice v2 shape and Run per kind', () => {
  const wf = {
    id: 'wf-a',
    orgId: 'org1',
    ownerPersonId: 'p1',
    name: 'Monday client review pack',
    schema: {
      purpose: 'Prep the pack',
      runsPerWeek: 1,
      inputs: [{ name: 'Notes', source: 'Drive' }],
      steps: [{ order: 1, action: 'Read notes', actor: 'human' as const }],
      systems: ['Drive'],
    },
    updatedAt: new Date(),
  };

  it('generates an in_app prompt practice with a one-sentence ask and a pre-filled prompt', async () => {
    const { svc } = build([wf], null, 1);
    const ex = await svc.generateNextExercise(person, 'org1');
    expect(ex.mode).toBe('in_app');
    expect(ex.workSurface).toBe('prompt');
    const practice = ex.starter.practice as {
      ask: string;
      kind: string;
      workflowName: string;
      prefill: { prompt: string };
    };
    expect(practice.kind).toBe('prompt');
    expect(practice.ask).toBe(ex.brief);
    expect(ex.brief.split(/(?<=[.!?])\s+/).length).toBe(1);
    expect(practice.prefill.prompt).toContain('[');
    expect(ex.starter).not.toHaveProperty('notes');
  });

  it('runs prompt / project / skill / workflow kinds with their own bodies and records lastRun', async () => {
    const { svc, exercises } = build([wf], null, 2);
    const mk = (kind: string, prefill: Record<string, unknown>) =>
      ({
        id: `ex-${kind}`,
        personId: 'p1',
        status: 'queued',
        brief: 'ask',
        title: 't',
        workSurface: kind === 'prompt' ? 'prompt' : kind,
        starter: {
          practice: { ask: 'ask', kind, workflowName: 'Monday pack', prefill },
        },
        hints: [],
      }) as unknown as Exercise;
    const prompt = await svc.run(
      mk('prompt', { prompt: 'x' }),
      person,
      'org1',
      { prompt: 'Draft the Monday pack', material: 'notes here' },
    );
    expect(prompt).toMatchObject({ kind: 'prompt', model: 'mock' });
    expect((prompt as { output: string }).output).toContain(
      'Draft the Monday pack',
    );
    const project = await svc.run(mk('project', {}), person, 'org1', {
      instructions: 'Always three sections.',
      files: [{ name: 'template.md', content: '#' }],
      testTask: 'Draft the pack for Monday',
    });
    expect((project as { output: string }).output).toContain('template.md');
    const skillMd =
      "---\nname: monday-pack\ndescription: Use when a teammate asks for the Monday client review pack from last week's notes.\n---\n## When to use\nWhen the lead asks for the Monday pack.";
    const skill = await svc.run(mk('skill', {}), person, 'org1', {
      skillMd,
      sampleRequests: [
        'Can you draft the Monday pack from these notes?',
        'Write a birthday note for Sam.',
      ],
    });
    const results = (
      skill as {
        results: { request: string; fired: boolean; output: string }[];
      }
    ).results;
    expect(results).toHaveLength(2);
    expect(results[0].fired).toBe(true);
    expect(results[1].fired).toBe(false);
    const workflow = await svc.run(mk('workflow', {}), person, 'org1', {
      schema: wf.schema,
    });
    expect((workflow as { skillDraft: string }).skillDraft).toMatch(
      /^---\nname: /,
    );
    expect((workflow as { skillDraft: string }).skillDraft).toContain(
      '## Boundaries',
    );
    const saved = exercises.rows.find((e) => e.id === 'ex-prompt')!;
    expect(saved.status).toBe('active');
    expect(
      (saved.starter.lastRun as { kind: string; output: string }).kind,
    ).toBe('prompt');
  });

  it('rejects Run on a review practice and on a missing prompt', async () => {
    const { svc } = build([], null, 5);
    const review = {
      id: 'rv',
      personId: 'p1',
      status: 'active',
      brief: 'Review this.',
      title: 't',
      workSurface: 'review',
      starter: {
        practice: {
          ask: 'Review this.',
          kind: 'review',
          workflowName: 'x',
          prefill: { submissionId: 's9' },
        },
      },
      hints: [],
    } as unknown as Exercise;
    await expect(svc.run(review, person, 'org1', {})).rejects.toThrow(
      /no Run step/,
    );
    const prompt = {
      id: 'pr',
      personId: 'p1',
      status: 'active',
      brief: 'ask',
      title: 't',
      workSurface: 'prompt',
      starter: {},
      hints: [],
    } as unknown as Exercise;
    await expect(svc.run(prompt, person, 'org1', {})).rejects.toThrow(
      /prompt is required/,
    );
  });
});
