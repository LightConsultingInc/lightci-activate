import { DAY_MS } from '../common/dates';
import type { Exercise } from './entities/exercise.entity';
import type { Grade } from './entities/grade.entity';
import type { Revisit } from './entities/revisit.entity';
import { RevisitService } from './revisit.service';
import { FakeRepo, fakeAi } from './testing/fake-repo';

const now = new Date('2026-09-05T09:00:00.000Z');

function build(seed: Partial<Revisit>[] = []) {
  const repo = new FakeRepo<Revisit>(seed);
  const mastery = {
    snapshot: jest.fn(() => Promise.resolve([])),
    computeCompetencies: jest.fn(() =>
      Promise.resolve({ competencies: [], judgement: null, rung: 1 }),
    ),
  };
  const svc = new RevisitService(repo as any, fakeAi() as any, mastery as any);
  return { svc, repo, mastery };
}

describe('Leitner scheduler', () => {
  const { svc } = build();

  it('uses intervals [2, 7, 21, 60, 120] and advances one step on a pass (≥ 0.80)', () => {
    expect(svc.next(0, 0.8, now)).toMatchObject({ step: 1, days: 7 });
    expect(svc.next(1, 0.95, now)).toMatchObject({ step: 2, days: 21 });
    expect(svc.next(2, 0.81, now)).toMatchObject({ step: 3, days: 60 });
    expect(svc.next(3, 0.9, now)).toMatchObject({ step: 4, days: 120 });
    expect(svc.next(4, 0.9, now)).toMatchObject({ step: 4, days: 120 }); // caps at the last box
    expect(svc.next(0, 0.8, now).dueAt.getTime()).toBe(
      now.getTime() + 7 * DAY_MS,
    );
  });

  it('resets to step 0 (the 2-day interval) on a fail', () => {
    expect(svc.next(3, 0.79, now)).toMatchObject({ step: 0, days: 2 });
    expect(svc.next(0, 0.1, now)).toMatchObject({ step: 0, days: 2 });
  });
});

describe('scheduleAfterGrade', () => {
  it('seeds a step-0 revisit two days out for each competency of a passed exercise, once', async () => {
    const { svc, repo } = build();
    const exercise = {
      id: 'ex1',
      personId: 'p1',
      competencyCodes: ['L1.description', 'L1.discernment'],
      contextTag: 'meeting-prep',
      title: 'Draft the Monday pack',
    } as Exercise;
    const created = await svc.scheduleAfterGrade(
      exercise,
      { decision: 'pass' } as Grade,
      now,
    );
    expect(created).toHaveLength(2);
    expect(created[0].intervalStep).toBe(0);
    expect(created[0].dueAt.getTime()).toBe(now.getTime() + 2 * DAY_MS);
    expect(created[0].prompt).toContain('Draft the Monday pack');
    expect(created[0].answerKey).toContain('Description');
    const again = await svc.scheduleAfterGrade(
      exercise,
      { decision: 'pass' } as Grade,
      now,
    );
    expect(again).toHaveLength(0);
    expect(repo.rows).toHaveLength(2);
  });

  it('does nothing for a revise decision', async () => {
    const { svc } = build();
    expect(
      await svc.scheduleAfterGrade(
        {
          id: 'x',
          personId: 'p',
          competencyCodes: ['L1.description'],
        } as Exercise,
        { decision: 'revise' } as Grade,
        now,
      ),
    ).toEqual([]);
  });
});

describe('answer() via the grader.revisit mock', () => {
  it('grades, closes the revisit and schedules the follow-up at the next interval', async () => {
    const { svc, repo, mastery } = build([
      {
        personId: 'p1',
        competencyCode: 'L1.description',
        exerciseId: null,
        prompt: 'q',
        answerKey: 'k',
        intervalStep: 1,
        dueAt: now,
        doneAt: null,
      },
    ]);
    const revisit = repo.rows[0];
    const result = await svc.answer(
      revisit,
      'A long, specific answer that names the audience, the format and the constraint I check first before trusting the draft.',
      'org1',
      now,
    );
    expect(result.score).toBe(0.85);
    expect(result.intervalStep).toBe(2);
    expect(new Date(result.nextDueAt).getTime()).toBe(
      now.getTime() + 21 * DAY_MS,
    );
    expect(revisit.doneAt).toEqual(now);
    expect(repo.rows).toHaveLength(2);
    expect(repo.rows[1].prompt).not.toBe(revisit.prompt);
    expect(mastery.snapshot).toHaveBeenCalledWith('p1');
  });

  it('a short answer fails and resets to the 2-day box', async () => {
    const { svc, repo } = build([
      {
        personId: 'p1',
        competencyCode: 'L1.description',
        exerciseId: null,
        prompt: 'q',
        answerKey: 'k',
        intervalStep: 3,
        dueAt: now,
        doneAt: null,
      },
    ]);
    const result = await svc.answer(repo.rows[0], 'not sure', 'org1', now);
    expect(result.score).toBe(0.5);
    expect(result.intervalStep).toBe(0);
    expect(new Date(result.nextDueAt).getTime()).toBe(
      now.getTime() + 2 * DAY_MS,
    );
  });
});

describe('decay-triggered reassessment', () => {
  it('injects a due-now revisit when a mastered-then-decayed competency drops below 0.70', async () => {
    const { svc, repo, mastery } = build();
    mastery.computeCompetencies.mockResolvedValueOnce({
      competencies: [
        { code: 'L1.description', status: 'decayed', mastery: 0.55 },
        { code: 'L1.delegation', status: 'in_progress', mastery: 0.3 },
        { code: 'L2.selection', status: 'mastered', mastery: 0.9 },
      ],
      judgement: null,
      rung: 2,
    } as any);
    const injected = await svc.injectDecayRevisits('p1', now);
    expect(injected).toHaveLength(1);
    expect(injected[0].competencyCode).toBe('L1.description');
    expect(injected[0].dueAt).toEqual(now);
    expect(injected[0].prompt).toMatch(/^Reassessment/);
    expect(repo.rows).toHaveLength(1);
  });
});
