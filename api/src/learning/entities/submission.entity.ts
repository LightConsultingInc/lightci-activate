import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export interface Artifact {
  type: 'prompt_run' | 'project' | 'skill' | 'workflow' | 'text' | 'review';
  content: string; // the primary artifact text (prompt, SKILL.md, project instructions, workflow JSON, review notes)
  output?: string; // Claude's output from the last Run (prompt / project / workflow skill draft)
  files?: { name: string; content: string }[];
  rationale?: string; // L2 include/exclude rationale
  // practice v2 extras
  material?: string; // prompt kind: pasted material
  testTask?: string; // project kind
  sampleRequests?: string[]; // skill kind
  results?: { request: string; fired: boolean; output: string }[]; // skill kind: last Run
  schema?: Record<string, unknown>; // workflow kind
  score10?: number; // review kind: the learner's score out of 10
  notes?: string; // review kind: the learner's feedback to the author
  sampleCases?: {
    input: string;
    shouldTrigger: 'yes' | 'no' | 'ambiguous';
    expected: string;
  }[];
  boundary?: Record<string, string[]>;
}

@Entity('submissions')
export class Submission {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') exerciseId: string;
  @Index() @Column('uuid') personId: string;
  @Column('int', { default: 1 }) attempt: number;
  @Column('text') expectationText: string; // legacy (pre-v2); '' for new submissions
  @Column('real') expectationConfidence: number; // legacy (pre-v2); 0.5 for new submissions
  @Column('jsonb') artifact: Artifact;
  @Column('text', { nullable: true }) critiqueText: string | null; // legacy (pre-v2); null for new submissions
  @Column('boolean', { default: false }) coldAttempt: boolean; // legacy; true on a first attempt
  @CreateDateColumn({ type: 'timestamptz' }) submittedAt: Date;
}
