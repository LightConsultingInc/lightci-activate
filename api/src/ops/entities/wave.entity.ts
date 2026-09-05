import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('waves')
export class Wave {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') orgId: string;
  @Column('text') name: string;
  @Column('int') number: number;
  @Column('text', { array: true, default: '{}' }) teamIds: string[];
  @Column('date') startsOn: string;
  @Column('date') endsOn: string;
  @Column('jsonb') targets: {
    skillsShipped: number;
    activePct: number;
    baselineCoveragePct: number;
    hoursBackPerPerson: number;
  };
  @Column('text', { default: 'planned' }) status:
    'planned' | 'active' | 'complete';
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
