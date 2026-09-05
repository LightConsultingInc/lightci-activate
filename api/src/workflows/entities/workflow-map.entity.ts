import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface WorkflowSchema {
  purpose: string;
  trigger: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'ad_hoc';
  minutesPerRun: number;
  runsPerWeek: number;
  inputs: { name: string; source: string; dataClass?: string }[];
  steps: {
    order: number;
    action: string;
    actor: 'human' | 'claude' | 'system';
    system?: string;
  }[];
  decisions: { point: string; rule: string }[];
  exceptions: { case: string; handling: string }[];
  systems: string[];
  mustNeverLeave: string[];
  outputs: { name: string; destination: string }[];
  humanReview: string[];
}

export interface WorkflowScore {
  value: number; // 0..1 business value
  hours: number; // hours/week at stake across the team
  readiness: number; // 0..1 automation readiness
  exposure: number; // 0..1 compliance exposure
  composite: number; // value × hours × readiness ÷ (1 + exposure), normalised 0..100
  rationale: string;
}

export type WorkflowStatus =
  'candidate' | 'scored' | 'in_build' | 'shipped' | 'measured';

@Entity('workflow_maps')
export class WorkflowMap {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') orgId: string;
  @Index() @Column('uuid', { nullable: true }) teamId: string | null;
  @Index() @Column('uuid', { nullable: true }) ownerPersonId: string | null;
  @Column('text') name: string;
  @Column('jsonb') schema: Partial<WorkflowSchema>;
  @Column('real', { default: 0 }) completeness: number; // 0..1 schema fields filled and verified
  @Column('boolean', { default: false }) championVerified: boolean;
  @Column('jsonb', { nullable: true }) score: WorkflowScore | null;
  @Column('text', { default: 'candidate' }) status: WorkflowStatus;
  @Column('text', { array: true, default: '{}' }) linkedSkillIds: string[];
  @Column('uuid', { nullable: true }) interviewSessionId: string | null;
  @Column('boolean', { default: false }) nextWave: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
