import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Single-use authorization codes (stored hashed). */
@Entity('oauth_codes')
export class OAuthCode {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column('text') codeHash: string;
  @Column('text') clientId: string;
  @Column('text') redirectUri: string;
  @Column('text') codeChallenge: string;
  @Column('text', { default: 'S256' }) codeChallengeMethod: string;
  @Column('uuid') personId: string;
  @Column('text', { default: 'openid profile email' }) scope: string;
  @Column('text', { nullable: true }) nonce: string | null;
  @Column('timestamptz') expiresAt: Date;
  @Column('timestamptz', { nullable: true }) usedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
