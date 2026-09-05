import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export interface RubricScore {
  criterion: string;
  label: string;
  score: number;
  note: string;
}

@Entity('grades')
export class Grade {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid', { nullable: true }) submissionId: string | null;
  @Index() @Column('uuid', { nullable: true }) skillVersionId: string | null;
  @Index() @Column('uuid') personId: string;
  @Column('jsonb') rubric: RubricScore[];
  @Column('real') score: number; // 0..1 weighted
  @Column('text') feedback: string;
  @Column('text') decision: 'pass' | 'revise';
  @Column('real', { nullable: true }) critiqueQuality: number | null; // 0..1 how well the learner's critique found real issues
  @Column('real', { nullable: true }) expectationAccuracy: number | null; // 1 - brier
  @Column('jsonb', { default: [] }) securityFindings: {
    severity: 'low' | 'medium' | 'high';
    finding: string;
  }[];
  @Column('text', { nullable: true }) teachingMoment: string | null; // the just-in-time lesson Coach attaches
  @Column('text') graderVersion: string;
  @Column('text', { nullable: true }) model: string | null;
  @Column('uuid', { nullable: true }) gradedByPersonId: string | null; // champion grading (L5)
  @CreateDateColumn({ type: 'timestamptz' }) gradedAt: Date;
}
