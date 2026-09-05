import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid', { nullable: true }) orgId: string | null;
  @Column('uuid', { nullable: true }) actorPersonId: string | null;
  @Column('text') action: string; // e.g. promotion.approved, skill.published, policy.updated
  @Column('text', { nullable: true }) subjectType: string | null;
  @Column('uuid', { nullable: true }) subjectId: string | null;
  @Column('jsonb', { default: {} }) meta: Record<string, unknown>;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
