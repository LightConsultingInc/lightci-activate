import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ContextLayerKind = 'company' | 'team' | 'person';

@Entity('context_sources')
export class ContextSource {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') orgId: string;
  @Column('text') layer: ContextLayerKind;
  @Index() @Column('uuid', { nullable: true }) ownerId: string | null; // teamId or personId
  @Column('text') type:
    | 'transcript'
    | 'proposal'
    | 'org_chart'
    | 'sop'
    | 'confluence'
    | 'drive'
    | 'interview'
    | 'intake'
    | 'policy';
  @Column('text') title: string;
  @Column('text', { nullable: true }) uri: string | null;
  @Column('text', { nullable: true }) content: string | null;
  @Column('text', { default: 'pending' }) reviewState:
    'pending' | 'reviewed' | 'rejected';
  @Column('jsonb', { default: {} }) tags: Record<string, string>;
  @CreateDateColumn({ type: 'timestamptz' }) ingestedAt: Date;
}
