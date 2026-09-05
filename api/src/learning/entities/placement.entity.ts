import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('placements')
export class Placement {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') personId: string;
  @Column('int') rung: number;
  @Column('text') by: 'diagnostic' | 'promotion' | 'seed' | 'manual';
  @Column('jsonb', { default: {} }) evidence: Record<string, unknown>;
  @CreateDateColumn({ type: 'timestamptz' }) placedAt: Date;
}
