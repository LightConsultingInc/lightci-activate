import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export interface RubricCriterion {
  key: string;
  label: string;
  description: string;
  weight: number;
}

@Entity('competencies')
export class Competency {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column('text') code: string; // e.g. L1.description
  @Column('int') rung: number;
  @Column('text') name: string;
  @Column('text') description: string;
  @Column('jsonb', { default: [] }) rubric: RubricCriterion[];
  @Column('int', { default: 0 }) orderIndex: number;
  @Column('int', { default: 2 }) minContexts: number;
  @Column('real', { default: 0.8 }) masteryThreshold: number;
}
