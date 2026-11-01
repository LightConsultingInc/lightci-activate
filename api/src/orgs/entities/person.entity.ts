import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../common/roles';

@Entity('people')
export class Person {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid', { nullable: true }) orgId: string | null;
  @Index() @Column('uuid', { nullable: true }) teamId: string | null;
  @Index({ unique: true }) @Column('text') email: string;
  @Column('text') name: string;
  @Column('text', { nullable: true }) title: string | null;
  @Index({ unique: true }) @Column('text', { nullable: true }) workosUserId:
    string | null;
  /** Direct-OIDC identity (self-hosted): the upstream issuer and subject. WorkOS sign-ins use workosUserId. */
  @Column('text', { nullable: true }) identityIssuer: string | null;
  @Column('text', { nullable: true }) identitySubject: string | null;
  @Column('text', { nullable: true }) claudeUserId: string | null;
  @Column('text', { array: true, default: '{learner}' }) roles: Role[];
  @Column('text', { nullable: true }) avatarUrl: string | null;
  @Column('text', { default: 'invited' }) status:
    'invited' | 'active' | 'inactive';
  @Column('timestamptz', { nullable: true }) onboardedAt: Date | null;
  @Column('timestamptz', { nullable: true }) consentAt: Date | null;
  @Column('timestamptz', { nullable: true }) lastActiveAt: Date | null;
  @Column('timestamptz', { nullable: true }) lastSeenAt: Date | null;
  @Column('boolean', { default: false }) premiumSeat: boolean;
  @Column('date', { nullable: true }) cohortWeek: string | null;
  @Column('jsonb', { default: {} }) profile: {
    responsibilities?: string[];
    weeklyWorkflows?: string[];
    claudeUseToday?: string;
    selfRatedComfort?: number;
    systems?: string[];
  };
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
