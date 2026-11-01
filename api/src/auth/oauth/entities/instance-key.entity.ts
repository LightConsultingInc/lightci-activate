import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Signing keys for tokens this installation issues (OIDC mode). The private half is
 * encrypted with ACTIVATE_SECRETS_KEY; the public half is served at /oauth/jwks.
 */
@Entity('instance_keys')
export class InstanceKey {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column('text') kid: string;
  @Column('text', { default: 'RS256' }) alg: string;
  @Column('jsonb') publicJwk: Record<string, unknown>;
  @Column('text') privateJwkEncrypted: string;
  @Column('timestamptz', { nullable: true }) retiredAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
