import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('mastery_snapshots')
@Index(['personId', 'competencyCode', 'day'], { unique: true })
export class MasterySnapshot {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') personId: string;
  @Column('text') competencyCode: string;
  @Column('date') day: string;
  @Column('real') mastery: number;
  @Column('jsonb') components: {
    artifact: number;
    consistency: number;
    retention: number;
    judgement: number;
    contexts: number;
  };
  @CreateDateColumn({ type: 'timestamptz' }) computedAt: Date;
}
