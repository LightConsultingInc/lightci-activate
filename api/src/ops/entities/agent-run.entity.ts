import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('agent_runs')
export class AgentRun {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid', { nullable: true }) orgId: string | null;
  @Index() @Column('text') agent: string;
  @Column('text') task: string;
  @Column('uuid', { nullable: true }) personId: string | null;
  @Column('jsonb', { default: {} }) input: Record<string, unknown>;
  @Column('jsonb', { nullable: true }) output: unknown;
  @Column('text', { nullable: true }) model: string | null;
  @Column('int', { default: 0 }) inputTokens: number;
  @Column('int', { default: 0 }) outputTokens: number;
  @Column('int', { default: 0 }) durationMs: number;
  @Column('text', { default: 'ok' }) status:
    'ok' | 'error' | 'refused' | 'mock';
  @Column('text', { nullable: true }) error: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
