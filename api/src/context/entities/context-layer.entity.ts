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
  // ── Person memory (learning loop): rewritten by MemoryService.synthesise, versioned by `version`. ──
  @Column('jsonb', { default: [] }) strengths: string[];
  @Column('jsonb', { default: [] }) struggles: string[];
  @Column('jsonb', { default: [] }) preferences: string[];
  @Column('jsonb', { default: [] }) lastEvents: {
    at: string;
    kind: string;
    note: string;
  }[];
  @Column('int', { default: 0 }) eventsSinceSynthesis: number;
  @Column('timestamptz', { nullable: true }) synthesisedAt: Date | null;
  /** Cached one-line "why this module matters for you", per module code, tagged with the memory version. */
  @Column('jsonb', { default: {} }) moduleLines: Record<
    string,
    { line: string; version: number }
  >;
  @Column('int', { default: 1 }) version: number;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
