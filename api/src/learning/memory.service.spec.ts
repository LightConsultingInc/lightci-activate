import type { ContextLayer } from '../context/entities/context-layer.entity';
import type { Person } from '../orgs/entities/person.entity';
import { MAX_EVENTS, MemoryService, describeModule } from './memory.service';
import { FakeRepo, fakeAi } from './testing/fake-repo';

function build(layer: Partial<ContextLayer> | null = null) {
  const layers = new FakeRepo<ContextLayer>(layer ? [layer] : []);
  const people = new FakeRepo<Person>([{ id: 'p1', title: 'Financial planner', profile: { weeklyWorkflows: ['RMD letters', 'Monday pack'], responsibilities: ['Client reviews'], systems: ['CRM'] } } as any]);
  const ai = fakeAi();
  const structured = jest.spyOn(ai, 'structured');
  const svc = new MemoryService(layers as any, people as any, ai as any);
  return { svc, layers, structured };
}

describe('MemoryService.record', () => {
  it('creates the person layer on first event and does not synthesise before three events', async () => {
    const { svc, layers, structured } = build();
    const m1 = await svc.record('p1', 'org1', { kind: 'submission_graded', note: 'Graded "Draft the RMD letter": 0.62 revise; missed: format.' });
    expect(layers.rows).toHaveLength(1);
    expect(layers.rows[0]).toMatchObject({ layer: 'person', ownerId: 'p1', orgId: 'org1', eventsSinceSynthesis: 1, version: 0 });
    expect(m1.lastEvents).toHaveLength(1);
    expect(structured).not.toHaveBeenCalled();
    await svc.record('p1', 'org1', { kind: 'lesson_checked', note: 'Lesson check "say-who": incorrect.' });
    expect(structured).not.toHaveBeenCalled();
  });

  it('synthesises after three events: summary, struggles from missed items, version bump, counter reset', async () => {
    const { svc, layers, structured } = build();
    await svc.record('p1', 'org1', { kind: 'submission_graded', note: 'Graded "Draft the RMD letter": 0.62 revise; missed: format, reader.' });
    await svc.record('p1', 'org1', { kind: 'exercise_skipped', note: 'Skipped "Monday pack" (blocked): no CRM access.' });
    const m = await svc.record('p1', 'org1', { kind: 'submission_graded', note: 'Graded "Draft the RMD letter": 0.88 pass.' });
    expect(structured).toHaveBeenCalledTimes(1);
    expect(m.version).toBe(1);
    expect(m.summary).toMatch(/Financial planner who does RMD letters and Monday pack/);
    expect(m.summary).not.toMatch(/\bL[0-5]\b/);
    expect(m.struggles).toEqual(expect.arrayContaining(['gets caught on format', 'gets caught on reader']));
    expect(m.strengths).toContain('finishes real work with Claude');
    expect(m.anchorWorkflows).toEqual(['RMD letters', 'Monday pack']);
    expect(layers.rows[0].eventsSinceSynthesis).toBe(0);
    expect(layers.rows[0].synthesisedAt).toBeInstanceOf(Date);
  });

  it('synthesises immediately on interview_completed and caps events at 40', async () => {
    const { svc, layers, structured } = build();
    const m = await svc.record('p1', 'org1', { kind: 'interview_completed', note: 'intake interview completed after 8 answers; 2 workflow map(s); placed at rung 1.' });
    expect(structured).toHaveBeenCalledTimes(1);
    expect(m.version).toBe(1);
    for (let i = 0; i < 45; i++) await svc.record('p1', 'org1', { kind: 'lesson_checked', note: `Lesson check "l${i}": correct.` });
    expect(layers.rows[0].lastEvents).toHaveLength(MAX_EVENTS);
    expect(layers.rows[0].lastEvents[MAX_EVENTS - 1].note).toContain('l44');
  });

  it('scrubs obvious PII from notes and ignores calls without an org', async () => {
    const { svc, layers } = build();
    await svc.record('p1', 'org1', { kind: 'skill_adopted', note: 'Adopted "RMD letter" for client 123456789 (jane@example.com).' });
    expect(layers.rows[0].lastEvents[0].note).toBe('Adopted "RMD letter" for client [number] ([email]).');
    const none = await svc.record('p1', null, { kind: 'skill_adopted', note: 'x' });
    expect(none.version).toBe(0);
    expect(layers.rows).toHaveLength(1);
  });
});

describe('MemoryService.whyMe', () => {
  it('generates one line from the memory and caches it per memory version', async () => {
    const { svc, layers, structured } = build({ orgId: 'org1', layer: 'person', ownerId: 'p1', summary: 'Planner.', vocabulary: [], anchorWorkflows: ['RMD letters'], sensitivities: [], systems: [], strengths: [], struggles: ['gets caught on format'], preferences: [], lastEvents: [], eventsSinceSynthesis: 0, synthesisedAt: null, moduleLines: {}, version: 3 });
    const person = { id: 'p1', title: 'Financial planner' } as Person;
    const first = await svc.whyMe(person, 'org1', 'L1.description');
    expect(first.line).toBe('Because you caught on format, Description is where you will get time back first.');
    expect(layers.rows[0].moduleLines['L1.description']).toEqual({ line: first.line, version: 3 });
    await svc.whyMe(person, 'org1', 'L1.description');
    expect(structured).toHaveBeenCalledTimes(1);
    layers.rows[0].version = 4;
    await svc.whyMe(person, 'org1', 'L1.description');
    expect(structured).toHaveBeenCalledTimes(2);
  });

  it('resolves rung codes and unknown codes gracefully', () => {
    expect(describeModule('L2').name).toBe('Context');
    expect(describeModule('3').name).toBe('Skill');
    expect(describeModule('L3.trigger').name).toBe('Trigger clarity and scope');
    expect(describeModule('whatever')).toEqual({ name: 'whatever', description: 'This module.' });
  });
});
