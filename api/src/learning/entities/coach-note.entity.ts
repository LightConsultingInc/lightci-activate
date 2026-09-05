import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('coach_notes')
export class CoachNote {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') personId: string;
  @Column('text') note: string;
  @Column('text', { array: true, default: '{}' }) tags: (
    | 'blocked'
    | 'no_time'
    | 'tool_issue'
    | 'progress'
    | 'escalated'
    | 'calibration'
  )[];
  @Column('text', { default: 'coach' }) author: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
