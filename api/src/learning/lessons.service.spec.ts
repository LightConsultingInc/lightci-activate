import type { ContextLayer } from '../context/entities/context-layer.entity';
import type { Person } from '../orgs/entities/person.entity';
import type { WorkflowMap } from '../workflows/entities/workflow-map.entity';
import type { LessonPersonalisation } from './entities/lesson-personalisation.entity';
import { LessonsService, type GenericLesson } from './lessons.service';
import { FakeRepo, fakeAi } from './testing/fake-repo';

const lesson: GenericLesson = {
  rung: 1,
  title: 'Say who it is for',
  promise: 'Drafts land first time when the reader is named.',
  body: 'Claude writes for the reader you name. When you do not name one, it writes for nobody in particular and the draft goes generic.',
  keyPoints: ['Name the reader', 'Say what they will do with it'],
  example: { title: 'A status note', text: 'Compare a note written for "someone" with one written for the ops lead who has to sign off by Friday.' },
  check: { question: 'What is the first thing to add to a vague prompt?', options: ['More adjectives', 'Who will read it and what they need to decide', 'A longer output limit'], answer: 1, explanation: 'The reader sets the standard the draft is judged by.' },
};

function build(personProfile: Person['profile'] = {}, maps: Partial<WorkflowMap>[] = [], layer: Partial<ContextLayer> | null = null) {
  const rows = new FakeRepo<LessonPersonalisation>();
  const layers = new FakeRepo<ContextLayer>(layer ? [layer] : []);
  const workflows = new FakeRepo<WorkflowMap>(maps);
  const ai = fakeAi();
  const structured = jest.spyOn(ai, 'structured');
  const memoryState = { version: 1 };
  const memory = { get: jest.fn(() => Promise.resolve({ summary: 'Planner who does RMD letters most weeks.', strengths: [], struggles: ['gets caught on format'], preferences: [], vocabulary: [], systems: [], anchorWorkflows: [], version: memoryState.version, updatedAt: null, lastEvents: [] })), record: jest.fn(() => Promise.resolve({ version: memoryState.version })) };
  const svc = new LessonsService(rows as any, layers as any, workflows as any, ai as any, memory as any);
  const person = { id: 'p1', title: 'Financial planner', profile: personProfile } as Person;
  return { svc, rows, person, structured, memoryState, memory };
}

describe('LessonsService.personalise', () => {
  it('returns the generic content with personalised=false when nothing is known about the person', async () => {
    const { svc, rows, structured } = build();
    const out = await svc.personalise({ id: 'p1', title: null, profile: {} } as Person, 'org1', 'say-who-it-is-for', lesson);
    expect(out).toEqual({ example: lesson.example, check: lesson.check, personalised: false });
    expect(structured).not.toHaveBeenCalled();
    expect(rows.rows).toHaveLength(0);
  });

  it('rewrites the example around the most frequent workflow and caches the row', async () => {
    const maps = [
      { id: 'wf-a', orgId: 'org1', ownerPersonId: 'p1', name: 'Monday client review pack', schema: { runsPerWeek: 1, inputs: [{ name: 'Last week notes', source: 'Drive' }], outputs: [{ name: 'Pack', destination: 'Team' }] }, updatedAt: new Date() },
      { id: 'wf-b', orgId: 'org1', ownerPersonId: 'p1', name: 'RMD letters', schema: { runsPerWeek: 4, outputs: [{ name: 'Letter', destination: 'Client' }] }, updatedAt: new Date() },
    ];
    const { svc, rows, person, structured, memoryState } = build({ responsibilities: ['Client reviews'] }, maps);
    const first = await svc.personalise(person, 'org1', 'say-who-it-is-for', lesson);
    expect(first.personalised).toBe(true);
    expect(first.example.title).toBe('RMD letters: A status note');
    expect(first.check.question).toMatch(/^In your RMD letters, /);
    expect(first.check.options).toEqual(lesson.check.options);
    expect(first.check.answer).toBe(1);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].lessonSlug).toBe('say-who-it-is-for');
    expect(structured).toHaveBeenCalledTimes(1);

    const second = await svc.personalise(person, 'org1', 'say-who-it-is-for', lesson);
    expect(second).toEqual(first);
    expect(structured).toHaveBeenCalledTimes(1); // cache hit, no second Claude call

    memoryState.version = 2;
    const third = await svc.personalise(person, 'org1', 'say-who-it-is-for', lesson);
    expect(third.personalised).toBe(true);
    expect(structured).toHaveBeenCalledTimes(2); // memory moved on → regenerated
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].memoryVersion).toBe(2);
  });

  it('checked() records a lesson_checked event', async () => {
    const { svc, person, memory } = build({ responsibilities: ['x'] });
    const out = await svc.checked(person, 'org1', 'say-who-it-is-for', false);
    expect(out).toEqual({ ok: true, memoryVersion: 1 });
    expect(memory.record).toHaveBeenCalledWith('p1', 'org1', expect.objectContaining({ kind: 'lesson_checked', data: { lessonSlug: 'say-who-it-is-for', correct: false } }));
  });

  it('uses the intake profile when there is no workflow map yet', async () => {
    const { svc, person } = build({ weeklyWorkflows: ['Quarterly performance summaries'], responsibilities: ['Reporting'] });
    const out = await svc.personalise(person, 'org1', 'x', lesson);
    expect(out.personalised).toBe(true);
    expect(out.example.title).toBe('Quarterly performance summaries: A status note');
  });
});
