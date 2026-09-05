import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('measurements')
export class Measurement {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') personId: string;
  @Column('uuid', { nullable: true }) workflowMapId: string | null;
  @Column('uuid', { nullable: true }) baselineId: string | null;
  @Column('text') task: string;
  @Column('real') minutesPerWeek: number;
  @Column('real', { default: 0 }) reworkMinutesPerWeek: number;
  @Column('date') periodStart: string;
  @Column('date') periodEnd: string;
  @Column('text') method: 'time_diary' | 'interview_estimate';
  @Column('text', { default: 'self' }) source: 'self' | 'auditor';
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
