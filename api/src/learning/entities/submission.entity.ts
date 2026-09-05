import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export interface Artifact {
  type: 'prompt_run' | 'project' | 'skill' | 'workflow' | 'text' | 'review';
  content: string; // the primary artifact text (prompt+output, SKILL.md, project instructions…)
  output?: string; // Claude's output for prompt runs
  files?: { name: string; content: string }[];
  rationale?: string; // L2 include/exclude rationale
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
  @Column('text') expectationText: string;
  @Column('real') expectationConfidence: number; // 0..1, the learner's predicted probability of passing
  @Column('jsonb') artifact: Artifact;
  @Column('text', { nullable: true }) critiqueText: string | null;
  @Column('boolean', { default: false }) coldAttempt: boolean; // written before any worked example was shown
  @CreateDateColumn({ type: 'timestamptz' }) submittedAt: Date;
}
