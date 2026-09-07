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
    competency:
      "What Claude is good for, what to keep out of it, and your firm's rules",
    artifact: 'First finished piece of real work in session one',
  },
  1: {
    code: 'L1',
    name: 'Conversational',
    competency:
      'Clear requests, and checking what comes back before you use it',
    artifact:
      'A graded draft on a real task with expectation and critique recorded',
  },
  2: {
    code: 'L2',
    name: 'Context',
    competency: 'A Project that remembers how you like a repeated task done',
    artifact:
      'A working Project that improves a repeated task, with a written rationale',
  },
  3: {
    code: 'L3',
    name: 'Skill',
    competency: 'A repeatable skill your team can pick up and reuse',
    artifact:
      'A skill that passes the Grader rubric, written cold before a worked example',
  },
  4: {
    code: 'L4',
    name: 'Workflow',
    competency: 'A whole workflow mapped, reviewed and published for the team',
    artifact:
      'A workflow promoted through the compliance queue with a measured baseline',
  },
  5: {
    code: 'L5',
    name: 'Champion',
    competency: "Reviewing others' work and running the team's queue",
    artifact: 'Reviews in the promotion queue; owns a team backlog',
  },
};
