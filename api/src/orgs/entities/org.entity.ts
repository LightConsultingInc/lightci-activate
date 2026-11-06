import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface ComplianceBoundary {
  allowedDataClasses: string[];
  forbiddenDataClasses: string[];
  readOnlySystems: string[];
  humanReviewPoints: string[];
}

/** How sign-ins from this org's identity provider become Activate roles (see auth/role-mapping.ts). */
export interface IdentitySettings {
  roleMapping?: Partial<Record<'admin' | 'sponsor' | 'champion', string[]>>;
  /** When the company was first seen on single sign-on; from then on only SSO sessions are accepted. */
  ssoSince?: string;
}

export interface OrgSettings {
  identity?: IdentitySettings;
  usagePolicy?: string;
  boundary?: ComplianceBoundary;
  leaderboardsEnabled?: boolean;
  stalledAfterDays?: number;
  baselineMethod?: 'time_diary' | 'interview_estimate';
  claudeAnalyticsConfigured?: boolean;
  claudeAdminConfigured?: boolean;
  claudeComplianceConfigured?: boolean;
  connectorVerifiedAt?: string | null;
}

export interface MarketplaceRepo {
  /** github: owner/repo with a token in integrations; git: any remote URL; local: the shared demo folder. */
  provider: 'github' | 'local' | 'git';
  owner?: string;
  repo?: string;
  url?: string;
  defaultBranch: string;
  autoSync: boolean;
  linkedAt?: string;
}

@Entity('orgs')
export class Org {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('text') name: string;
  @Index({ unique: true }) @Column('text') slug: string;
  @Index({ unique: true })
  @Column('text', { nullable: true })
  workosOrganizationId: string | null;
  /** Email domains that belong to this company; sign-in routes them to its SSO. */
  @Column('text', { array: true, default: '{}' }) emailDomains: string[];
  @Column('text', { default: 'lightci_hosted' }) residencyMode:
    'client_hosted' | 'lightci_hosted';
  @Column('text', { nullable: true }) industry: string | null;
  @Column('text', { nullable: true }) sponsorName: string | null;
  @Column('jsonb', { default: {} }) settings: OrgSettings;
  @Column('jsonb', { nullable: true }) marketplaceRepo: MarketplaceRepo | null;
  @Column('int', { default: 0 }) seats: number;
  @Column('int', { default: 0 }) premiumSeats: number;
  @Column('boolean', { default: false }) isDemo: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
