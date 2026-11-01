import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Refresh tokens (stored hashed), rotated on every use. */
@Entity('oauth_refresh_tokens')
export class OAuthRefreshToken {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column('text') tokenHash: string;
  @Column('text') clientId: string;
  @Index() @Column('uuid') personId: string;
  @Column('text', { default: 'openid profile email' }) scope: string;
  @Column('timestamptz') expiresAt: Date;
  @Column('timestamptz', { nullable: true }) revokedAt: Date | null;
  @Column('uuid', { nullable: true }) replacedById: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
