/**
 * Wire shapes for the "Skills & Library" section of docs/api-contract.md. `PersonRef` and
 * `GradeView` are shared with the learning module (single definition); `SkillCard` here is the
 * canonical, strictly typed one (structurally assignable to the learning module's minimal copy).
 */
import type { PersonRef, GradeView } from '../learning/learning.types';
import type {
  BoundaryDeclaration,
  SampleCase,
  ActivateManifest,
  SkillStatus,
} from './entities/skill.entity';
import type {
  BoundaryCheck,
  PromotionDecision,
} from './entities/promotion-request.entity';
import type { WorkflowSummary } from '../workflows/workflows.types';
import type { ComplianceBoundary } from '../orgs/entities/org.entity';

export type { PersonRef, GradeView };

export type BoundaryBadge = 'green' | 'amber' | 'red';

export type HealthFlag =
  | 'unused_30d'
  | 'grade_below_threshold'
  | 'boundary_gap'
  | 'owner_left'
  | 'overlapping_trigger'
  | 'pending_review';

export interface SkillCard {
  id: string;
  slug: string;
  name: string;
  triggerLine: string;
  plugin: string;
  team: { id: string; name: string } | null;
  owner: PersonRef | null;
  status: SkillStatus;
  rungRequired: number;
  version: number;
  grade: { score: number; decision: 'pass' | 'revise' } | null;
  boundaryBadge: BoundaryBadge;
  activeUsers30d: number;
  runs30d: number;
  adoptedByMe: boolean;
  publishedAt: string | null;
  updatedAt: string;
  health: HealthFlag[];
}

export interface SkillVersionView {
  id: string;
  version: number;
  tag: string | null;
  commitSha: string | null;
  changelog: string;
  author: PersonRef | null;
  gradeScore: number | null;
  approvers: PersonRef[];
  createdAt: string;
}

export interface SkillCommentView {
  id: string;
  person: PersonRef;
  body: string;
  kind: 'feedback' | 'grader' | 'system';
  createdAt: string;
}

export interface PromotionView {
  id: string;
  skill: SkillCard;
  /** The promoted draft version. Once merged, the published version is `mergedVersion` (tag `mergedTag`). */
  version: number;
  mergedTag: string | null;
  mergedVersion: number | null;
  requestedBy: PersonRef;
  prNumber: number | null;
  prUrl: string | null;
  branch: string | null;
  grade: GradeView | null;
  boundaryCheck: BoundaryCheck;
  diffSummary: {
    filesChanged: number;
    additions: number;
    deletions: number;
    summary: string;
  };
  approvals: {
    person: PersonRef | null;
    personId: string;
    role: string;
    decision: 'approve' | 'send_back';
    note?: string;
    at: string;
  }[];
  requiredApproverRoles: string[];
  decision: PromotionDecision;
  highExposure: boolean;
  testResults: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface PromotionDetail extends PromotionView {
  skillMd: string;
  previousSkillMd: string | null;
}

export interface SkillDetail extends SkillCard {
  skillMd: string;
  boundary: BoundaryDeclaration;
  /** The org's compliance boundary, so the Boundary tab can show conflicts without a second call. */
  orgBoundary: ComplianceBoundary;
  sampleCases: SampleCase[];
  manifest: ActivateManifest | null;
  workflow: WorkflowSummary | null;
  versions: SkillVersionView[];
  grades: GradeView[];
  usageByTeam: {
    teamId: string | null;
    teamName: string;
    activations30d: number;
  }[];
  usageSeries: { day: string; activations: number }[];
  adopters: PersonRef[];
  comments: SkillCommentView[];
  promotion: PromotionView | null;
  successor: SkillCard | null;
}

export interface LibraryFacets {
  teams: { id: string; name: string; count: number }[];
  families: { name: string; count: number }[];
  rungs: { rung: number; count: number }[];
  statuses: { status: SkillStatus; count: number }[];
}

export interface LibraryResponse {
  skills: SkillCard[];
  facets: LibraryFacets;
}

export interface LibraryFilters {
  team?: string;
  family?: string;
  rung?: number;
  status?: SkillStatus;
  q?: string;
  sort?: 'usage' | 'grade' | 'updated' | 'name';
  /** Caller, for `adoptedByMe`. */
  personId?: string;
}

export interface CreateSkillInput {
  name: string;
  slug?: string;
  plugin?: string;
  teamId?: string | null;
  triggerLine: string;
  skillMd: string;
  boundary: Partial<BoundaryDeclaration>;
  sampleCases?: SampleCase[];
  workflowMapId?: string | null;
  forkedFromSkillId?: string | null;
  rungRequired?: number;
  workflowFamily?: string | null;
  authoredBy?: 'learner' | 'builder' | 'champion';
}

export interface PatchSkillInput {
  skillMd?: string;
  triggerLine?: string;
  boundary?: Partial<BoundaryDeclaration>;
  sampleCases?: SampleCase[];
  name?: string;
  rungRequired?: number;
}

export interface AssignmentView {
  plugin: string;
  team: { id: string; name: string };
  intendedMode: 'hidden' | 'available' | 'auto';
  observedMode: 'hidden' | 'available' | 'auto' | null;
  drift: boolean;
}

export interface MarketplaceStatus {
  repo: string | null;
  branch: string | null;
  head: string | null;
  dirty: boolean;
  pluginCount: number;
  skillCount: number;
  lastSyncAt: string | null;
  /** Effective repo path when the source folder is nested in another git work tree; null otherwise. */
  workDir: string | null;
  mode: 'local' | 'local-nested' | 'github';
}

export interface SyncResult {
  created: number;
  updated: number;
  deprecated: number;
  versions: number;
  skills: string[];
  warnings: string[];
  syncedAt: string;
}

/** `L1` → 1, `2` → 2, garbage → fallback. */
export function rungFromLabel(
  label: string | number | null | undefined,
  fallback = 1,
): number {
  if (typeof label === 'number' && Number.isFinite(label))
    return Math.max(0, Math.min(5, Math.round(label)));
  const m = String(label ?? '').match(/(\d)/);
  return m ? Math.max(0, Math.min(5, Number(m[1]))) : fallback;
}

export function rungLabel(rung: number): string {
  return `L${Math.max(0, Math.min(5, Math.round(rung)))}`;
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'skill'
  );
}

export const iso = (d: Date | string | null | undefined): string | null =>
  d ? new Date(d).toISOString() : null;
