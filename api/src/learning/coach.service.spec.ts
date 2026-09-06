import type { ContextLayer } from '../context/entities/context-layer.entity';
import type { Person } from '../orgs/entities/person.entity';
import type { WorkflowMap } from '../workflows/entities/workflow-map.entity';
import { CoachService } from './coach.service';
import type { Exercise } from './entities/exercise.entity';
import { FakeRepo, fakeAi } from './testing/fake-repo';

function build(maps: Partial<WorkflowMap>[], layer: Partial<ContextLayer> | null, rung = 0) {
  const exercises = new FakeRepo<Exercise>();
  const layers = new FakeRepo<ContextLayer>(layer ? [layer] : []);
  const workflows = new FakeRepo<WorkflowMap>(maps);
  const empty = () => new FakeRepo<any>();
  const mastery = { report: jest.fn(() => Promise.resolve({ rung, nextRung: rung + 1, competencies: [], judgement: { score: 0 }, progress: {}, eligible: false })) };
  const svc = new CoachService(exercises as any, empty() as any, empty() as any, empty() as any, empty() as any, layers as any, workflows as any, empty() as any, empty() as any, fakeAi() as any, mastery as any, { get: jest.fn(() => Promise.resolve({ summary: null, strengths: [], struggles: [], preferences: [], vocabulary: [], systems: [], anchorWorkflows: [], version: 0, updatedAt: null, lastEvents: [] })), record: jest.fn(() => Promise.resolve({ version: 0 })) } as any);
  return { svc, exercises };
}

const person = { id: 'p1', orgId: 'org1', teamId: null, name: 'Priya', title: 'Financial planner', profile: { weeklyWorkflows: ['Meeting prep'] } } as Person;

describe('CoachService rung 0: one real task', () => {
  it('builds a filled-in starter prompt for the most frequent workflow, in Claude, no reading surface', async () => {
    const maps = [
      { id: 'wf-a', orgId: 'org1', ownerPersonId: 'p1', name: 'Monday client review pack', schema: { runsPerWeek: 1, inputs: [{ name: 'Last week notes', source: 'Drive' }], outputs: [{ name: 'Review pack', destination: 'Team' }], systems: ['Drive'] }, updatedAt: new Date() },
      { id: 'wf-b', orgId: 'org1', ownerPersonId: 'p1', name: 'RMD letters', schema: { runsPerWeek: 4, inputs: [{ name: 'Household summary', source: 'CRM' }, { name: 'Prior letter', source: 'Drive' }], outputs: [{ name: 'Client letter', destination: 'Client' }], systems: ['CRM', 'Word'] }, updatedAt: new Date() },
    ];
    const { svc, exercises } = build(maps, { orgId: 'org1', layer: 'person', ownerId: 'p1', summary: 'Planner', anchorWorkflows: [], systems: [], vocabulary: [], sensitivities: [] });
    const ex = await svc.generateNextExercise(person, 'org1');
    expect(ex.rung).toBe(0);
    expect(ex.title).toBe('Do one real thing: RMD letters');
    expect(ex.title.length).toBeLessThanOrEqual(60);
    expect(ex.kind).toBe('artifact');
    expect(ex.workSurface).toBe('prompt');
    expect(ex.mode).toBe('in_claude');
    expect(ex.workflowMapId).toBe('wf-b');
    expect(ex.brief).toContain('I am a Financial planner');
    expect(ex.brief).toContain('Household summary, Prior letter');
    expect(ex.brief).toContain('Client letter');
    expect(ex.brief).toContain('CRM and Word');
    expect(ex.rationale).toContain('4 times a week');
    expect(ex.hints).toHaveLength(3);
    expect(ex.hints.every((h) => /^Try /.test(h))).toBe(true);
    expect(`${ex.title} ${ex.brief} ${ex.rationale} ${ex.hints.join(' ')}`).not.toMatch(/expectation|critique|competency|worked example|cold attempt|\bL[0-5]\b|policy|quiz/i);
    expect(exercises.rows).toHaveLength(1);
  });

  it('falls back to the intake profile workflow when no map exists', async () => {
    const { svc } = build([], null);
    const ex = await svc.generateNextExercise(person, 'org1');
    expect(ex.title).toBe('Do one real thing: Meeting prep');
    expect(ex.brief).toContain('the notes I paste below');
    expect(ex.rationale).toContain('more than anything else');
  });
});
