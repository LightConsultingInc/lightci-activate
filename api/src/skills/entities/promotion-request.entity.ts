import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export interface BoundaryCheck {
  ok: boolean;
  touchesRestrictedClasses: string[];
  missingDeclarations: string[];
  humanReviewRequired: boolean;
  notes: string;
}

export type PromotionDecision =
  'pending' | 'approved' | 'sent_back' | 'merged' | 'withdrawn';

@Entity('promotion_requests')
export class PromotionRequest {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') orgId: string;
  @Index() @Column('uuid') skillId: string;
  @Column('uuid') skillVersionId: string;
  @Column('uuid') requestedByPersonId: string;
  @Column('int', { nullable: true }) prNumber: number | null;
  @Column('text', { nullable: true }) prUrl: string | null;
  @Column('text', { nullable: true }) branch: string | null;
  @Column('uuid', { nullable: true }) gradeId: string | null;
  @Column('jsonb') boundaryCheck: BoundaryCheck;
  @Column('jsonb', { default: {} }) diffSummary: {
    filesChanged: number;
    additions: number;
    deletions: number;
    summary: string;
  };
  @Column('jsonb', { default: [] }) approvals: {
    personId: string;
    role: string;
    decision: 'approve' | 'send_back';
    note?: string;
    at: string;
  }[];
  @Column('text', { array: true, default: '{}' })
  requiredApproverRoles: string[]; // champion, compliance
  @Column('text', { default: 'pending' }) decision: PromotionDecision;
  @Column('timestamptz', { nullable: true }) decidedAt: Date | null;
  @Column('text', { nullable: true }) testResults: string | null;
  @Column('boolean', { default: false }) highExposure: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
