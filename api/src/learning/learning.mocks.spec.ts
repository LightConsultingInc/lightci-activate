import { mockResponder } from '../ai/mock-responders';
import {
  NextExerciseSchema,
  RevisitGradeSchema,
  SkillGradeSchema,
  SubmissionGradeSchema,
} from './ai-schemas';
import { mockArtifactScore } from './learning.mocks';

const call = (task: string, mockSeed: Record<string, unknown>) => ({
  agent: 'x',
  task,
  system: '',
  messages: [],
  mockSeed,
});

describe('learning mock responders', () => {
  it('coach.next-exercise is schema-valid, targets the weakest competency and picks an unused context', () => {
    const out = mockResponder<any>(
      call('coach.next-exercise', {
        rung: 1,
        weakestCode: 'L1.description',
        weakestName: 'Description',
        workSurface: 'prompt',
        usedContexts: ['meeting-prep', 'client-summary'],
        workflows: [{ id: 'wf1', name: 'Monday pack' }],
        allowedCodes: ['L1.description'],
      }),
      NextExerciseSchema,
    );
    expect(out.competencyCodes).toEqual(['L1.description']);
    expect(out.contextTag).toBe('weekly-report');
    expect(out.hints).toHaveLength(3);
    expect(out.workflowMapId).toBe('wf1');
    expect(out.workedExample).toBeNull();
    const skill = mockResponder<any>(
      call('coach.next-exercise', {
        rung: 3,
        workSurface: 'skill',
        allowedCodes: ['L3.trigger'],
      }),
      NextExerciseSchema,
    );
    expect(skill.workedExample).toContain('description:');
  });

  it('grader.submission follows the documented heuristic (0.86 vs 0.62)', () => {
    expect(mockArtifactScore('x'.repeat(300) + ' expected')).toBe(0.86);
    expect(mockArtifactScore('short expected')).toBe(0.62);
    expect(mockArtifactScore('y'.repeat(300))).toBe(0.62);
    const out = mockResponder<any>(
      call('grader.submission', {
        criteria: [{ criterion: 'a.b', label: 'B' }],
        artifactText: 'short',
        critiqueText: '',
        expectationText: 'e',
      }),
      SubmissionGradeSchema,
    );
    expect(out.rubric[0].criterion).toBe('a.b');
    expect(out.critiqueQuality).toBe(0.4);
  });

  it('grader.skill and grader.revisit are schema-valid', () => {
    const skill = mockResponder<any>(
      call('grader.skill', {
        criteria: [{ criterion: 'skill.trigger_clarity', label: 'Trigger' }],
        skillMd: 'short',
        sampleCases: [{ input: 'i', shouldTrigger: 'yes', expected: 'e' }],
      }),
      SkillGradeSchema,
    );
    expect(skill.sampleCaseVerdicts).toHaveLength(1);
    expect(skill.rubric[0].score).toBeLessThan(0.7);
    const rev = mockResponder<any>(
      call('grader.revisit', { response: 'x'.repeat(80) }),
      RevisitGradeSchema,
    );
    expect(rev.score).toBe(0.85);
  });

  it('coach.run#text returns text derived from the prompt', () => {
    const out = mockResponder<{ text: string }>(
      { ...call('coach.run#text', { prompt: 'Draft the Monday pack' }) },
      undefined,
    );
    expect(out.text).toContain('Draft the Monday pack');
  });
});
