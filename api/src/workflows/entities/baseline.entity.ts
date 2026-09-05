import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('baselines')
export class Baseline {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') personId: string;
  @Column('uuid', { nullable: true }) workflowMapId: string | null;
  @Column('text') task: string;
  @Column('text') method: 'time_diary' | 'interview_estimate';
  @Column('real') minutesPerWeek: number;
  @Column('real', { default: 0 }) reworkMinutesPerWeek: number;
  @Column('uuid', { nullable: true }) approvedByPersonId: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) capturedAt: Date;
}
