import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export interface InterviewTurn {
  role: 'interviewer' | 'user' | 'scribe' | 'checker';
  content: string;
  at: string;
}

@Entity('interview_sessions')
export class InterviewSession {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') orgId: string;
  @Index() @Column('uuid') personId: string;
  @Column('text') mode: 'intake' | 'champion' | 'workflow';
  @Column('uuid', { nullable: true }) workflowMapId: string | null;
  @Column('uuid', { nullable: true }) teamId: string | null;
  @Column('jsonb', { default: [] }) transcript: InterviewTurn[];
  @Column('jsonb', { default: {} }) scribe: Record<string, unknown>; // live draft of the schema being filled
  @Column('jsonb', { default: [] }) checkerFlags: {
    field: string;
    issue: string;
  }[];
  @Column('real', { default: 0 }) completeness: number;
  @Column('text', { default: 'active' }) status:
    'active' | 'complete' | 'abandoned';
  @Column('boolean', { default: false }) voice: boolean;
  @Column('int', { default: 0 }) turnCount: number;
  @Column('jsonb', { nullable: true }) result: Record<string, unknown> | null; // e.g. {workflowMapIds:[], placementRung, profile}
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @Column('timestamptz', { nullable: true }) completedAt: Date | null;
}
