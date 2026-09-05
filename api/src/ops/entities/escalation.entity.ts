import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('escalations')
export class Escalation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') orgId: string;
  @Column('text') sourceAgent:
    'coach' | 'builder' | 'interviewer' | 'promoter' | 'grader' | 'system';
  @Column('text') kind:
    'escalation' | 'approval' | 'stalled' | 'access_request';
  @Column('text') subjectType:
    'person' | 'exercise' | 'skill' | 'workflow' | 'promotion_request' | 'team';
  @Column('uuid', { nullable: true }) subjectId: string | null;
  @Column('text') reason: string;
  @Column('uuid', { nullable: true }) assigneePersonId: string | null;
  @Column('text', { default: 'open' }) state:
    'open' | 'in_progress' | 'resolved';
  @Column('timestamptz', { nullable: true }) slaDueAt: Date | null;
  @Column('text', { nullable: true }) resolution: string | null;
  @Column('timestamptz', { nullable: true }) resolvedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
