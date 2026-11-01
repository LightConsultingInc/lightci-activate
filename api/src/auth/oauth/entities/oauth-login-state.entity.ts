import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** A sign-in in flight: the client's authorize request plus the PKCE/state/nonce used upstream. */
@Entity('oauth_login_states')
export class OAuthLoginState {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column('text') upstreamState: string;
  @Column('jsonb') request: {
    clientId: string;
    redirectUri: string;
    state: string | null;
    scope: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    nonce: string | null;
  };
  @Column('text') upstreamNonce: string;
  @Column('text') upstreamCodeVerifier: string;
  @Column('timestamptz') expiresAt: Date;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
