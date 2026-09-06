import { mockResponder } from '../ai/mock-responders';
import {
  NextExerciseSchema,
  RevisitGradeSchema,
  SkillGradeSchema,
  SkillRunSchema,
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
    expect(out.brief).toBe("For your monday pack, write the prompt you'd give Claude.");
    expect(out.workflowName).toBe('Monday pack');
    expect(out.prefillPrompt).toContain('[');
    expect(out.prefillSkillMd).toBeNull();
    const skill = mockResponder<any>(
      call('coach.next-exercise', {
        rung: 3,
        workSurface: 'skill',
        allowedCodes: ['L3.trigger'],
      }),
      NextExerciseSchema,
    );
    expect(skill.workedExample).toContain('description:');
    expect(skill.prefillSkillMd).toContain('description:');
    expect(skill.prefillSampleRequests).toHaveLength(3);
  });

  it('grader.submission follows the documented heuristic (0.86 vs 0.62)', () => {
    expect(mockArtifactScore('x'.repeat(300) + ' expected')).toBe(0.86);
    expect(mockArtifactScore('short expected')).toBe(0.62);
    expect(mockArtifactScore('y'.repeat(300))).toBe(0.62);
    const out = mockResponder<any>(
      call('grader.submission', {
        criteria: [{ criterion: 'a.b', label: 'B' }],
        artifactText: 'short',
        kind: 'prompt',
        workflowName: 'Monday pack',
      }),
      SubmissionGradeSchema,
    );
    expect(out.rubric[0].criterion).toBe('a.b');
    expect(out.worked).toBeTruthy();
    expect(out.change).toContain('B');
    expect(out.tryNext).toContain('monday pack');
    expect(out).not.toHaveProperty('critiqueQuality');
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

  it('coach.run.* responders are deterministic per kind', () => {
    const prompt = mockResponder<{ text: string }>(call('coach.run.prompt#text', { prompt: 'Draft the Monday pack' }), undefined);
    expect(prompt.text).toContain('Draft the Monday pack');
    const project = mockResponder<{ text: string }>(call('coach.run.project#text', { instructions: 'Three sections.', files: ['sop.md'], testTask: 'Draft it' }), undefined);
    expect(project.text).toContain('sop.md');
    const fired = mockResponder<any>(call('coach.run.skill', { skillMd: 'description: Use when preparing the Monday pack from notes.', request: 'Prepare the Monday pack please' }), SkillRunSchema);
    expect(fired.fired).toBe(true);
    const notFired = mockResponder<any>(call('coach.run.skill', { skillMd: 'description: Use when preparing the Monday pack from notes.', request: 'Write a limerick' }), SkillRunSchema);
    expect(notFired.fired).toBe(false);
    const wf = mockResponder<{ text: string }>(call('coach.run.workflow#text', { workflowName: 'RMD letters', schema: { inputs: [{ name: 'RMD row', source: 'Orion' }], humanReview: ['planner sign-off'] } }), undefined);
    expect(wf.text).toContain('name: rmd-letters');
    expect(wf.text).toContain('human_review: planner sign-off');
  });
});
