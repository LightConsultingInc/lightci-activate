import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export interface UsageMetrics {
  messages: number;
  codeSessions: number;
  coworkSessions: number;
  projectsUsed: number;
  filesUploaded: number;
  skillActivations: number;
  connectorsUsed: number;
  activeOnRealWork: boolean;
  codeSpendUsd?: number;
}

@Entity('usage_snapshots')
@Index(['personId', 'day'], { unique: true })
export class UsageSnapshot {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') orgId: string;
  @Column('uuid') personId: string;
  @Column('date') day: string;
  @Column('jsonb') metrics: UsageMetrics;
  @Column('text', { default: 'seed' }) source: 'analytics_api' | 'seed';
}
