import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ContextLayerKind } from './context-source.entity';

@Entity('context_layers')
@Index(['orgId', 'layer', 'ownerId'], { unique: true })
export class ContextLayer {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') orgId: string;
  @Column('text') layer: ContextLayerKind;
  @Column('uuid', { nullable: true }) ownerId: string | null;
  @Column('text', { nullable: true }) summary: string | null;
  @Column('jsonb', { default: [] }) vocabulary: {
    term: string;
    meaning: string;
  }[];
  @Column('jsonb', { default: [] }) anchorWorkflows: string[];
  @Column('jsonb', { default: [] }) sensitivities: string[];
  @Column('jsonb', { default: [] }) systems: string[];
  @Column('int', { default: 1 }) version: number;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
