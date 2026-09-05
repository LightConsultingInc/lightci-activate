import { mockResponder } from '../ai/mock-responders';
import { completeSchemaFor, turnSchemaFor } from './interviewer.schemas';
import type { InterviewMode } from './interviews.types';
import './interviewer.mocks';

const modes: InterviewMode[] = ['intake', 'champion', 'workflow'];

describe('interviewer mock responders satisfy the structured-output schemas', () => {
  it.each(modes)(
    '%s: interviewer.turn is schema-valid for turns 1..9 and completeness = min(1, turns/8)',
    (mode) => {
      let scribe: Record<string, unknown> = {};
      for (let turnCount = 1; turnCount <= 9; turnCount++) {
        const out = mockResponder<any>(
          {
            agent: 'interviewer',
            task: 'interviewer.turn',
            system: '',
            messages: [],
            mockSeed: {
              mode,
              turnCount,
              lastUser: 'Weekly report, meeting prep and client summaries',
              scribe,
            },
          },
          turnSchemaFor(mode),
        );
        expect(typeof out.nextQuestion).toBe('string');
        expect(out.nextQuestion.length).toBeGreaterThan(10);
        expect(out.completeness).toBeCloseTo(Math.min(1, turnCount / 8), 5);
        expect(out.proposeFinish).toBe(turnCount >= 7);
        scribe = {
          ...scribe,
          ...Object.fromEntries(
            Object.entries(out.scribeUpdate).filter(([, v]) => v !== null),
          ),
        };
      }
      expect(Object.keys(scribe).length).toBeGreaterThan(2);
    },
  );

  it.each(modes)('%s: interviewer.complete is schema-valid', (mode) => {
    const out = mockResponder<any>(
      {
        agent: 'interviewer',
        task: 'interviewer.complete',
        system: '',
        messages: [],
        mockSeed: {
          mode,
          turnCount: 8,
          scribe: {
            selfRatedComfort: 4,
            weeklyWorkflows: [
              {
                name: 'Weekly report',
                minutesPerRun: 60,
                runsPerWeek: 1,
                systems: ['Email'],
              },
            ],
          },
        },
      },
      completeSchemaFor(mode) as any,
    );
    if (mode === 'intake') {
      expect(out.workflowMaps.length).toBeGreaterThanOrEqual(2);
      expect(out.workflowMaps.length).toBeLessThanOrEqual(4);
      expect(out.placement.rung).toBe(2);
      expect(out.workflowMaps[0].schema.minutesPerRun).toBe(60);
    }
    if (mode === 'champion')
      expect(out.workflowMaps.length).toBeGreaterThanOrEqual(2);
    if (mode === 'workflow') expect(out.schema.purpose).toBeTruthy();
  });
});
