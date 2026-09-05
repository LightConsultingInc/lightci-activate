import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const INTEGRATION_KINDS = [
  'anthropic',
  'claude_compliance',
  'claude_analytics',
  'claude_admin',
  'github',
] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

/**
 * A client-supplied credential. Secrets are AES-256-GCM encrypted at rest with
 * ACTIVATE_SECRETS_KEY and never returned to the browser; only `last4` and
 * verification status are.
 */
@Entity('org_integrations')
@Index(['orgId', 'kind'], { unique: true })
export class OrgIntegration {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') orgId: string;
  @Column('text') kind: IntegrationKind;
  @Column('text') encryptedSecret: string;
  @Column('text') last4: string;
  @Column('text', { default: 'unverified' }) status:
    'unverified' | 'verified' | 'invalid';
  @Column('timestamptz', { nullable: true }) verifiedAt: Date | null;
  @Column('text', { nullable: true }) verificationDetail: string | null;
  @Column('jsonb', { default: {} }) config: Record<string, string>; // e.g. github repo, default model
  @Column('uuid', { nullable: true }) addedByPersonId: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
