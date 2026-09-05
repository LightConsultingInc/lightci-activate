import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('readouts')
export class Readout {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') orgId: string;
  @Column('text') scopeType: 'org' | 'team' | 'person';
  @Column('uuid', { nullable: true }) scopeId: string | null;
  @Column('text') title: string;
  @Column('date') periodStart: string;
  @Column('date') periodEnd: string;
  @Column('jsonb') metrics: Record<string, unknown>;
  @Column('text') narrative: string;
  @Column('jsonb', { default: [] }) footnotes: {
    ref: string;
    source: string;
    baseline?: string;
  }[];
  @Column('timestamptz', { nullable: true }) exportedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) generatedAt: Date;
}
