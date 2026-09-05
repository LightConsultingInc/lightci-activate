export const ROLES = [
  'learner',
  'champion',
  'sponsor',
  'admin',
  'lead',
] as const;
export type Role = (typeof ROLES)[number];

export const RUNGS = [0, 1, 2, 3, 4, 5] as const;
export type Rung = (typeof RUNGS)[number];

export const RUNG_META: Record<
  Rung,
  { code: string; name: string; competency: string; artifact: string }
> = {
  0: {
    code: 'L0',
    name: 'Orientation',
    competency: 'Which surface for what; usage policy; the 4D frame',
    artifact: 'First finished piece of real work in session one',
  },
  1: {
    code: 'L1',
    name: 'Conversational',
    competency: 'Prompting and discernment; predict-then-critique on every run',
    artifact:
      'A graded draft on a real task with expectation and critique recorded',
  },
  2: {
    code: 'L2',
    name: 'Context',
    competency:
      'Context engineering for one person: Projects, what to include and leave out',
    artifact:
      'A working Project that improves a repeated task, with a written rationale',
  },
  3: {
    code: 'L3',
    name: 'Skill',
    competency:
      'Context engineering for reuse: progressive disclosure, minimal triggers, canonical examples',
    artifact:
      'A skill that passes the Grader rubric, written cold before a worked example',
  },
  4: {
    code: 'L4',
    name: 'Workflow',
    competency: 'Map a workflow and ship it governed',
    artifact:
      'A workflow promoted through the compliance queue with a measured baseline',
  },
  5: {
    code: 'L5',
    name: 'Champion',
    competency: 'Grade and review others',
    artifact: 'Reviews in the promotion queue; owns a team backlog',
  },
};
