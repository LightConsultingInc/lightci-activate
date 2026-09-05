import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface BoundaryDeclaration {
  mayRead: string[];
  mustNeverReceive: string[];
  humanReview: string[];
}

export interface SampleCase {
  input: string;
  shouldTrigger: 'yes' | 'no' | 'ambiguous';
  expected: string;
}

export interface ActivateManifest {
  id: string;
  owner: string; // email or Claude user_id
  team: string; // team slug
  rung_required: string; // L1..L5
  boundary: {
    may_read: string[];
    must_never_receive: string[];
    human_review: string[];
  };
  sample_cases: string; // relative dir
  baseline_task?: string;
  promotion?: {
    requested_by?: string;
    grade_ref?: string;
    approved_by?: string[];
    approved_at?: string;
  };
  status: 'draft' | 'in_review' | 'published' | 'deprecated';
  successor?: string;
}

export type SkillStatus = 'draft' | 'in_review' | 'published' | 'deprecated';

@Entity('skills')
@Index(['orgId', 'slug'], { unique: true })
export class Skill {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') orgId: string;
  @Column('text') slug: string;
  @Column('text') name: string;
  @Column('text') triggerLine: string; // one-line "use when"
  @Column('text') plugin: string; // plugin dir in the marketplace repo
  @Column('text', { nullable: true }) repoPath: string | null;
  @Index() @Column('uuid', { nullable: true }) ownerPersonId: string | null;
  @Index() @Column('uuid', { nullable: true }) teamId: string | null;
  @Column('text', { default: 'draft' }) status: SkillStatus;
  @Column('int', { default: 1 }) rungRequired: number;
  @Column('text') skillMd: string;
  @Column('jsonb') boundary: BoundaryDeclaration;
  @Column('jsonb', { default: [] }) sampleCases: SampleCase[];
  @Column('jsonb', { nullable: true }) manifest: ActivateManifest | null;
  @Column('text', { nullable: true }) workflowFamily: string | null;
  @Column('uuid', { nullable: true }) workflowMapId: string | null;
  @Column('uuid', { nullable: true }) latestGradeId: string | null;
  @Column('int', { default: 0 }) currentVersion: number;
  @Column('text', { nullable: true }) branch: string | null;
  @Column('uuid', { nullable: true }) successorSkillId: string | null;
  @Column('uuid', { nullable: true }) forkedFromSkillId: string | null;
  @Column('text', { default: 'builder' }) authoredBy:
    'learner' | 'builder' | 'champion';
  @Column('timestamptz', { nullable: true }) publishedAt: Date | null;
  @Column('timestamptz', { nullable: true }) lastRegradedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
