import type { Person } from '../orgs/entities/person.entity';
import type { Exercise } from './entities/exercise.entity';
import type { LessonPersonalisation } from './entities/lesson-personalisation.entity';
import { InlineJobs, JobRegistry } from '../jobs/jobs.port';
import {
  ModulePrepService,
  moduleRung,
  type ModuleLesson,
} from './module-prep.service';
import { FakeRepo } from './testing/fake-repo';

const person = {
  id: 'p1',
  title: 'Planner',
  profile: { weeklyWorkflows: ['RMD letters'] },
} as Person;
const lesson = (slug: string): ModuleLesson => ({
  slug,
  rung: 1,
  title: slug,
  promise: 'p',
  body: 'b',
  keyPoints: [],
  example: { title: 't', text: 'x' },
  check: {
    question: 'q?',
    options: ['a', 'b', 'c'],
    answer: 0,
    explanation: 'e',
  },
});

function build(memoryVersion = 1) {
  const rows = new FakeRepo<LessonPersonalisation>();
  const exercises = new FakeRepo<Exercise>();
  const memory = {
    get: jest.fn(() => Promise.resolve({ version: memoryVersion })),
  };
  const lessons = {
    personalise: jest.fn(
      async (
        p: Person,
        _o: string,
        slug: string,
        _l: unknown,
        moduleCode: string,
      ) => {
        await new Promise((r) => setTimeout(r, 2));
        const existing = rows.rows.find(
          (r) => r.personId === p.id && r.lessonSlug === slug,
        );
        if (existing) Object.assign(existing, { memoryVersion, moduleCode });
        else
          await rows.save({
            personId: p.id,
            lessonSlug: slug,
            moduleCode,
            memoryVersion,
            example: {},
            check: {},
          });
        return { personalised: true };
      },
    ),
  };
  const coach = {
    generateNextExercise: jest.fn(
      async (
        p: Person,
        _o: string,
        opts: { rung: number; moduleCode: string },
      ) =>
        rows &&
        exercises.save({
          personId: p.id,
          rung: opts.rung,
          status: 'queued',
          starter: { practice: { moduleCode: opts.moduleCode } },
        }),
    ),
  };
  const people = new FakeRepo<Person>([person]);
  const registry = new JobRegistry();
  const jobs = new InlineJobs(registry);
  const svc = new ModulePrepService(
    rows as any,
    exercises as any,
    people as any,
    lessons as any,
    coach as any,
    memory as any,
    jobs,
    registry,
  );
  svc.onModuleInit();
  return { svc, rows, exercises, lessons, coach, memory, jobs };
}

describe('ModulePrepService', () => {
  it('reports preparing before any work, then ready after the background job; practice is generated once', async () => {
    const { svc, lessons, coach, exercises } = build();
    const before = await svc.prepare(
      person,
      'org1',
      'L1',
      ['a', 'b', 'c', 'd'].map(lesson),
    );
    expect(before).toMatchObject({
      status: 'preparing',
      lessons: { total: 4, ready: 0 },
      practice: { ready: false },
      memoryVersion: 1,
      inProgress: true,
    });
    await svc.whenIdle('p1', 'L1');
    const after = await svc.readiness(person, 'org1', 'L1');
    expect(after).toMatchObject({
      status: 'ready',
      lessons: { total: 4, ready: 4 },
      practice: { ready: true },
      inProgress: false,
    });
    expect(lessons.personalise).toHaveBeenCalledTimes(4);
    expect(coach.generateNextExercise).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1' }),
      'org1',
      { rung: 1, moduleCode: 'L1' },
    );
    expect(exercises.rows).toHaveLength(1);
  });

  it('does not double-run while a job is in flight and is idempotent afterwards', async () => {
    const { svc, lessons, coach } = build();
    const ls = ['a', 'b'].map(lesson);
    await svc.prepare(person, 'org1', 'L1', ls);
    await svc.prepare(person, 'org1', 'L1', ls);
    await svc.whenIdle('p1', 'L1');
    expect(lessons.personalise).toHaveBeenCalledTimes(2);
    const again = await svc.prepare(person, 'org1', 'L1', ls);
    expect(again.status).toBe('ready');
    await svc.whenIdle('p1', 'L1');
    expect(lessons.personalise).toHaveBeenCalledTimes(2);
    expect(coach.generateNextExercise).toHaveBeenCalledTimes(1);
  });

  it('a memory version change makes lessons stale; the next prepare refreshes only them and keeps the practice', async () => {
    const built = build();
    const { svc, lessons, coach, memory } = built;
    await svc.prepare(person, 'org1', 'L2', ['a', 'b'].map(lesson));
    await svc.whenIdle('p1', 'L2');
    memory.get.mockResolvedValue({ version: 2 });
    const stale = await svc.readiness(person, 'org1', 'L2');
    expect(stale).toMatchObject({
      status: 'preparing',
      lessons: { total: 2, ready: 0 },
      practice: { ready: true },
      memoryVersion: 2,
    });
    // personalise stub writes the version it was built with; emulate the new version being written
    lessons.personalise.mockImplementation(
      async (
        p: Person,
        _o: string,
        slug: string,
        _l: unknown,
        moduleCode: string,
      ) => {
        const existing = built.rows.rows.find(
          (r) => r.personId === p.id && r.lessonSlug === slug,
        );
        Object.assign(existing!, { memoryVersion: 2, moduleCode });
        return Promise.resolve({ personalised: true });
      },
    );
    await svc.prepare(person, 'org1', 'L2', ['a', 'b'].map(lesson));
    await svc.whenIdle('p1', 'L2');
    expect(lessons.personalise).toHaveBeenCalledTimes(4);
    expect(coach.generateNextExercise).toHaveBeenCalledTimes(1);
    expect((await svc.readiness(person, 'org1', 'L2')).status).toBe('ready');
    expect(await svc.preparedModules(person, 'org1')).toEqual(['L2']);
  });

  it('resolves module codes to rungs', () => {
    expect(moduleRung('L1')).toBe(1);
    expect(moduleRung('3')).toBe(3);
    expect(moduleRung('L3.trigger')).toBe(3);
    expect(moduleRung('nope')).toBeNull();
  });
});
