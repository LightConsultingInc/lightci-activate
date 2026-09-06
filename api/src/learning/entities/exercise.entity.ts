import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ExerciseStatus =
  | 'queued'
  | 'active'
  | 'submitted'
  | 'graded'
  | 'passed'
  | 'revise'
  | 'skipped';
export type WorkSurface =
  'orientation' | 'prompt' | 'project' | 'skill' | 'workflow' | 'review';

@Entity('exercises')
export class Exercise {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') personId: string;
  @Column('int') rung: number;
  @Column('text', { array: true, default: '{}' }) competencyCodes: string[];
  @Column('text') title: string;
  @Column('text') brief: string; // the task, in the learner's own vocabulary
  @Column('text') rationale: string; // why Coach chose this ("you run Monday prep every week...")
  @Column('text', { default: 'artifact' }) kind:
    'artifact' | 'revisit' | 'diagnostic' | 'adopt' | 'review';
  /** Always 'in_app' since practice v2. Legacy rows may still hold 'in_claude'; the mapper coerces. */
  @Column('text', { default: 'in_app' }) mode: 'in_app';
  @Column('text') workSurface: WorkSurface;
  @Column('text', { nullable: true }) contextTag: string | null; // distinct context for diversity (e.g. "meeting-prep")
  @Column('uuid', { nullable: true }) workflowMapId: string | null;
  @Column('uuid', { nullable: true }) skillId: string | null;
  @Column('jsonb', { default: [] }) hints: string[]; // progressive hints, revealed one at a time
  @Column('text', { nullable: true }) workedExample: string | null; // only after a cold attempt
  @Column('jsonb', { default: {} }) starter: Record<string, unknown>; // pre-filled surface state; `practice` = the v2 Practice object, `lastRun` = last Run result
  @Column('text', { default: 'queued' }) status: ExerciseStatus;
  @Column('int', { default: 20 }) estimatedMinutes: number;
  @Column('timestamptz', { nullable: true }) scheduledFor: Date | null;
  @Column('timestamptz', { nullable: true }) completedAt: Date | null;
  @Column('text', { default: 'coach' }) generatedBy:
    'coach' | 'seed' | 'champion' | 'adopt';
  @Column('int', { default: 0 }) hintsRevealed: number;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
