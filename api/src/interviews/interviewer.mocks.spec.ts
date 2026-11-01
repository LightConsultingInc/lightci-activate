import { mockResponder } from '../ai/mock-responders';
import {
  buildRealtimeInstructions,
  CLOSING_LINE,
  FINISH_INTERVIEW_TOOL,
  OPENING_INTRO,
  renderInterviewState,
} from './interviewer.prompts';
import {
  completeSchemaFor,
  scribeSchemaFor,
  turnSchemaFor,
} from './interviewer.schemas';
import type { InterviewMode } from './interviews.types';
import type {
  ChampionCompleteOutput,
  IntakeCompleteOutput,
  WorkflowCompleteOutput,
} from './interviewer.schemas';

type CompleteOutput =
  IntakeCompleteOutput | ChampionCompleteOutput | WorkflowCompleteOutput;
import './interviewer.mocks';

const modes: InterviewMode[] = ['intake', 'champion', 'workflow'];

describe('interviewer mock responders satisfy the structured-output schemas', () => {
  it.each(modes)(
    '%s: interviewer.turn is schema-valid for turns 1..9 and completeness = min(1, turns/8)',
    (mode) => {
      let scribe: Record<string, unknown> = {};
      for (let turnCount = 1; turnCount <= 9; turnCount++) {
        const out = mockResponder(
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

  it.each(modes)(
    '%s: interviewer.scribe is schema-valid, has no nextQuestion and matches the turn scribe body',
    (mode) => {
      for (let turnCount = 1; turnCount <= 8; turnCount++) {
        const seed = {
          mode,
          turnCount,
          lastUser: 'Weekly report, meeting prep and client summaries',
          scribe: {},
        };
        const scribe = mockResponder(
          {
            agent: 'interviewer',
            task: 'interviewer.scribe',
            system: '',
            messages: [],
            mockSeed: seed,
          },
          scribeSchemaFor(mode),
        );
        const turn = mockResponder(
          {
            agent: 'interviewer',
            task: 'interviewer.turn',
            system: '',
            messages: [],
            mockSeed: seed,
          },
          turnSchemaFor(mode),
        );
        // the scribe schema has no nextQuestion; check the parsed object, not the type
        expect(
          (scribe as Record<string, unknown>).nextQuestion,
        ).toBeUndefined();
        expect(scribe.scribeUpdate).toEqual(turn.scribeUpdate);
        expect(scribe.checkerFlags).toEqual(turn.checkerFlags);
        expect(scribe.completeness).toBeCloseTo(Math.min(1, turnCount / 8), 5);
      }
    },
  );

  it.each(modes)('%s: interviewer.complete is schema-valid', (mode) => {
    const out = mockResponder<CompleteOutput>(
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
      completeSchemaFor(mode),
    );
    if (mode === 'intake') {
      const intake = out as IntakeCompleteOutput;
      expect(intake.workflowMaps.length).toBeGreaterThanOrEqual(2);
      expect(intake.workflowMaps.length).toBeLessThanOrEqual(4);
      expect(intake.placement.rung).toBe(2);
      expect(intake.workflowMaps[0].minutesPerRun).toBe(60); // compact WorkflowMapOut (flat)
    }
    if (mode === 'champion')
      expect(
        (out as ChampionCompleteOutput).workflowMaps.length,
      ).toBeGreaterThanOrEqual(2);
    if (mode === 'workflow')
      expect((out as WorkflowCompleteOutput).schema.purpose).toBeTruthy();
  });
});

describe('realtime instructions and prompt state rendering', () => {
  const base = {
    mode: 'intake' as const,
    scribe: { role: 'Analyst' },
    checkerFlags: [{ field: 'weeklyWorkflows', issue: 'no runs per week' }],
    completeness: 0.3,
    turnCount: 2,
    transcript: [
      { role: 'interviewer' as const, content: 'What is your role?', at: 't0' },
      {
        role: 'user' as const,
        content: 'Analyst on the advisory desk',
        at: 't1',
      },
      { role: 'scribe' as const, content: '{"role":"Analyst"}', at: 't1' },
      {
        role: 'interviewer' as const,
        content: 'Which tasks repeat weekly?',
        at: 't2',
        via: 'voice' as const,
      },
      {
        role: 'user' as const,
        content: 'The Monday pack',
        at: 't3',
        via: 'voice' as const,
      },
    ],
  };

  it('builds single-brain instructions with plan, scribe state, transcript and finish tool guidance', () => {
    const text = buildRealtimeInstructions(base);
    expect(text).toContain('You are the only interviewer');
    expect(text).toContain('1. Role:');
    expect(text).toContain(CLOSING_LINE);
    expect(text).not.toMatch(
      /^\d+\. Sensitivities|Wrap-up|anything I have missed/m,
    ); // not asked in intake
    expect(FINISH_INTERVIEW_TOOL.description).toContain('endsCall: true');
    expect(FINISH_INTERVIEW_TOOL.description).toContain(CLOSING_LINE);
    expect(text).toContain('claude.ai chat, Projects, Claude Code, Cowork');
    expect(text).toContain('RESUMING');
    expect(text).toContain('Person: The Monday pack');
    expect(text).toContain('"role":"Analyst"');
    expect(text).toContain('weeklyWorkflows: no runs per week');
    expect(text).toContain(`\`${FINISH_INTERVIEW_TOOL.name}\``);
    expect(text).not.toContain(`Person: {"role"`); // scribe rows are not spoken turns
    expect(FINISH_INTERVIEW_TOOL.type).toBe('function');
    expect(FINISH_INTERVIEW_TOOL.parameters.required).toEqual(['summary']);
  });

  it('opens fresh when nothing has been answered', () => {
    const text = buildRealtimeInstructions({
      ...base,
      turnCount: 0,
      transcript: [base.transcript[0]],
    });
    expect(text).toContain('just started');
    expect(text).toContain(OPENING_INTRO.intake);
    expect(text).not.toContain('RESUMING');
  });

  it('renders compact state: voice markers, trimmed transcript, compact scribe JSON', () => {
    const text = renderInterviewState(base, 'Do it.');
    expect(text).toContain('Interviewer (voice): Which tasks repeat weekly?');
    expect(text).toContain(
      '# Scribe state (current draft of the schema, compact JSON)\n{"role":"Analyst"}',
    );
    const long = {
      ...base,
      transcript: Array.from({ length: 100 }, (_, i) => ({
        role: i % 2 ? ('user' as const) : ('interviewer' as const),
        content: `turn ${i}`,
        at: String(i),
      })),
    };
    const trimmed = renderInterviewState(long, 'Do it.', 40);
    expect(trimmed).toContain('first 60 turns omitted');
    expect(trimmed).not.toContain('turn 59\n');
    expect(trimmed).toContain('turn 99');
  });
});
