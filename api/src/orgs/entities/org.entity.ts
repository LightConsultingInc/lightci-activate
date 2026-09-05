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

export interface OrgSettings {
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
  provider: 'github' | 'local';
  owner?: string;
  repo?: string;
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
