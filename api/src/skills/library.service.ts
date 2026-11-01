import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { stringify as stringifyYaml } from 'yaml';
import { daysAgo, isoDay } from '../common/dates';
import type { Role } from '../common/roles';
import { Exercise } from '../learning/entities/exercise.entity';
import { Grade } from '../learning/entities/grade.entity';
import { SKILL_PASS_THRESHOLD } from '../learning/grader.service';
import { toGradeView } from '../learning/mappers';
import { PersonRefService } from '../learning/person-ref.service';
import { AuditLog } from '../ops/entities/audit-log.entity';
import { type ComplianceBoundary, Org } from '../orgs/entities/org.entity';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { Baseline } from '../workflows/entities/baseline.entity';
import { Measurement } from '../workflows/entities/measurement.entity';
import { WorkflowMap } from '../workflows/entities/workflow-map.entity';
import {
  toWorkflowSummary,
  type WorkflowSummary,
} from '../workflows/workflows.types';
import {
  EMPTY_BOUNDARY,
  TRIGGER_OVERLAP_THRESHOLD,
  boundaryBadge,
  jaccard,
  triggerTokens,
  undeclaredForbiddenClasses,
} from './boundary';
import { PromotionRequest } from './entities/promotion-request.entity';
import { SkillAdoption } from './entities/skill-adoption.entity';
import { SkillAssignment } from './entities/skill-assignment.entity';
import { SkillComment } from './entities/skill-comment.entity';
import { SkillUsage } from './entities/skill-usage.entity';
import { SkillVersion } from './entities/skill-version.entity';
import {
  type ActivateManifest,
  type BoundaryDeclaration,
  type SampleCase,
  Skill,
  type SkillStatus,
} from './entities/skill.entity';
import { GitRepoService } from './git-repo.service';
import {
  type RepoManifest,
  type RepoSkill,
  boundaryToManifest,
  composeSkillMd,
  parseFrontmatter,
  readRepoSkills,
} from './repo-reader';
import {
  type AssignmentView,
  type CreateSkillInput,
  type HealthFlag,
  type LibraryFacets,
  type LibraryFilters,
  type LibraryResponse,
  type MarketplaceStatus,
  type PatchSkillInput,
  type PersonRef,
  type PromotionView,
  type SkillCard,
  type SkillCommentView,
  type SkillDetail,
  type SkillVersionView,
  type SyncResult,
  iso,
  rungFromLabel,
  rungLabel,
  slugify,
} from './skills.types';

interface CardContext {
  boundary: ComplianceBoundary;
  usage: Map<string, { activeUsers: number; runs: number }>;
  adoptedByMe: Set<string>;
  grades: Map<string, Grade>;
  people: Map<string, Person>;
  refs: Map<string, PersonRef>;
  teams: Map<string, Team>;
  pendingPromotion: Set<string>;
  triggerIndex: { id: string; tokens: Set<string> }[];
  now: Date;
}

/**
 * The Skill Library. The marketplace repo is the source of truth for *published* skills (sync merges
 * it in by slug, never deletes DB rows, marks vanished published skills deprecated); the DB is what
 * the UI reads. Drafts live on `skill/<slug>` branches when the repo is available, always in the DB.
 */
@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);

  constructor(
    @InjectRepository(Skill) private readonly skills: Repository<Skill>,
    @InjectRepository(SkillVersion)
    private readonly versions: Repository<SkillVersion>,
    @InjectRepository(SkillUsage)
    private readonly usage: Repository<SkillUsage>,
    @InjectRepository(SkillAdoption)
    private readonly adoptions: Repository<SkillAdoption>,
    @InjectRepository(SkillComment)
    private readonly comments: Repository<SkillComment>,
    @InjectRepository(SkillAssignment)
    private readonly assignments: Repository<SkillAssignment>,
    @InjectRepository(PromotionRequest)
    private readonly promotions: Repository<PromotionRequest>,
    @InjectRepository(Person) private readonly people: Repository<Person>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(Org) private readonly orgs: Repository<Org>,
    @InjectRepository(Grade) private readonly grades: Repository<Grade>,
    @InjectRepository(Exercise)
    private readonly exercises: Repository<Exercise>,
    @InjectRepository(WorkflowMap)
    private readonly workflows: Repository<WorkflowMap>,
    @InjectRepository(Baseline)
    private readonly baselines: Repository<Baseline>,
    @InjectRepository(Measurement)
    private readonly measurements: Repository<Measurement>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
    private readonly git: GitRepoService,
    private readonly refs: PersonRefService,
  ) {}

  // ───────────────────────── lookups ─────────────────────────

  async orgBoundary(orgId: string): Promise<ComplianceBoundary> {
    const org = await this.orgs.findOne({ where: { id: orgId } });
    return { ...EMPTY_BOUNDARY, ...(org?.settings?.boundary ?? {}) };
  }

  async findSkill(orgId: string, idOrSlug: string): Promise<Skill> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idOrSlug,
      );
    const skill = isUuid
      ? await this.skills.findOne({ where: { id: idOrSlug, orgId } })
      : await this.skills.findOne({ where: { slug: idOrSlug, orgId } });
    if (!skill)
      throw new NotFoundException(`Skill "${idOrSlug}" not found in this org`);
    return skill;
  }

  async isChampionFor(person: Person, teamId: string | null): Promise<boolean> {
    if (
      person.roles.some(
        (r: Role) => r === 'admin' || r === 'lead' || r === 'sponsor',
      )
    )
      return true;
    if (!teamId) return person.roles.includes('champion');
    const team = await this.teams.findOne({ where: { id: teamId } });
    if (team?.championPersonId === person.id) return true;
    return person.roles.includes('champion') && person.teamId === teamId;
  }

  async canEdit(person: Person, skill: Skill): Promise<boolean> {
    if (skill.ownerPersonId === person.id) return true;
    return this.isChampionFor(person, skill.teamId);
  }

  private async assertCanEdit(person: Person, skill: Skill) {
    if (!(await this.canEdit(person, skill)))
      throw new ForbiddenException(
        'Only the owner or a champion may change this skill',
      );
  }

  // ───────────────────────── sync from the repo ─────────────────────────

  async status(orgId: string): Promise<MarketplaceStatus> {
    await this.git.refresh(orgId);
    const repo = await this.git.repoFor(orgId);
    const head = await this.git.head(orgId);
    let pluginCount = 0;
    let skillCount = 0;
    const path = await this.git.pathFor(orgId);
    if (path) {
      const read = await readRepoSkills(path).catch(() => null);
      pluginCount = read?.plugins.length ?? 0;
      skillCount = read?.skills.length ?? 0;
    }
    const org = await this.orgs.findOne({ where: { id: orgId } });
    return {
      repo: repo.path || repo.mode === 'clone' ? repo.label : null,
      branch: head.branch,
      head: head.head,
      dirty: head.dirty,
      pluginCount,
      skillCount,
      lastSyncAt:
        (org?.settings as { lastMarketplaceSyncAt?: string } | undefined)
          ?.lastMarketplaceSyncAt ?? null,
      workDir: repo.mode === 'nested' ? repo.workDir : null,
      mode:
        repo.config.provider === 'github'
          ? 'github'
          : repo.config.provider === 'git'
            ? 'git'
            : repo.mode === 'nested'
              ? 'local-nested'
              : 'local',
      lastError: repo.lastError,
    };
  }

  async sync(
    orgId: string,
    actorPersonId: string | null = null,
  ): Promise<SyncResult> {
    await this.git.refresh(orgId);
    const repoPath = await this.git.pathFor(orgId);
    if (!repoPath) {
      const repo = await this.git.repoFor(orgId);
      throw new ConflictException(
        `Marketplace repo not available (${repo.lastError ?? repo.label}); nothing to sync.`,
      );
    }
    const read = await readRepoSkills(repoPath);
    const result: SyncResult = {
      created: 0,
      updated: 0,
      deprecated: 0,
      versions: 0,
      skills: [],
      warnings: [...read.warnings],
      syncedAt: new Date().toISOString(),
    };
    const orgPeople = await this.people.find({ where: { orgId } });
    const orgTeams = await this.teams.find({ where: { orgId } });
    const personByIdentity = new Map<string, Person>();
    for (const p of orgPeople) {
      personByIdentity.set(p.email.toLowerCase(), p);
      if (p.claudeUserId) personByIdentity.set(p.claudeUserId, p);
      if (p.workosUserId) personByIdentity.set(p.workosUserId, p);
    }
    const teamBySlug = new Map(orgTeams.map((t) => [t.slug, t]));
    const seen = new Set<string>();
    const successorLinks: { slug: string; successorSlug: string }[] = [];

    for (const rs of read.skills) {
      seen.add(rs.slug);
      const owner =
        personByIdentity.get(rs.ownerIdentity.toLowerCase()) ??
        personByIdentity.get(rs.ownerIdentity) ??
        null;
      if (rs.ownerIdentity && !owner)
        result.warnings.push(
          `${rs.repoPath}: owner "${rs.ownerIdentity}" is not a person in this org`,
        );
      const team = teamBySlug.get(rs.teamSlug) ?? null;
      let skill = await this.skills.findOne({
        where: { orgId, slug: rs.slug },
      });
      const existingVersions = skill
        ? await this.versions.find({
            where: { skillId: skill.id },
            order: { version: 'ASC' },
          })
        : [];
      const maxRepoVersion = Math.max(0, ...rs.versions.map((v) => v.version));
      const hasLocalDraftAhead = existingVersions.some(
        (v) => !v.tag && v.version > maxRepoVersion,
      );
      const created = !skill;
      if (!skill) {
        skill = this.skills.create({
          orgId,
          slug: rs.slug,
          currentVersion: 0,
          authoredBy: 'builder',
        });
      }
      // identity/governance fields always follow the repo
      skill.plugin = rs.plugin;
      skill.repoPath = rs.repoPath;
      skill.ownerPersonId = owner?.id ?? skill.ownerPersonId ?? null;
      skill.teamId = team?.id ?? skill.teamId ?? null;
      skill.rungRequired = rs.rungRequired;
      skill.workflowFamily = rs.family ?? skill.workflowFamily ?? null;
      skill.manifest = rs.manifest;
      skill.branch = skill.branch ?? `skill/${rs.slug}`;
      if (!hasLocalDraftAhead) {
        skill.name = rs.name;
        skill.triggerLine = rs.triggerLine;
        skill.skillMd = rs.skillMd;
        skill.boundary = rs.boundary;
        skill.sampleCases = rs.sampleCases;
        skill.status = rs.status;
      } else {
        result.warnings.push(
          `${rs.slug}: local draft ahead of the repo; kept DB content, refreshed manifest/versions only`,
        );
      }
      if (rs.status === 'published' && !skill.publishedAt)
        skill.publishedAt = rs.versions.length
          ? new Date(rs.versions[rs.versions.length - 1].committedAt)
          : new Date();
      if (rs.successor)
        successorLinks.push({ slug: rs.slug, successorSlug: rs.successor });
      skill.skillMd ??= rs.skillMd;
      skill.name ??= rs.name;
      skill.triggerLine ??= rs.triggerLine;
      skill.boundary ??= rs.boundary;
      skill = await this.skills.save(skill);

      // versions from tags (or the declared activate-version from HEAD when the repo has no tags)
      const repoVersions = rs.versions.length
        ? rs.versions
        : [
            {
              version: rs.declaredVersion,
              tag: null as string | null,
              commitSha: rs.headSha ?? '',
              skillMd: rs.skillMd,
              manifest: rs.manifest,
              changelog: 'Imported from marketplace (untagged)',
              authorEmail: rs.ownerIdentity,
              authorName: null,
              committedAt: new Date().toISOString(),
            },
          ];
      for (const rv of repoVersions) {
        let v = existingVersions.find((e) => e.version === rv.version) ?? null;
        const author = rv.authorEmail
          ? (personByIdentity.get(rv.authorEmail.toLowerCase()) ?? null)
          : null;
        if (!v) {
          v = this.versions.create({
            skillId: skill.id,
            version: rv.version,
            changelog: rv.changelog,
            skillMd: rv.skillMd,
            approverPersonIds: [],
          });
          result.versions++;
        }
        v.commitSha = rv.commitSha || v.commitSha;
        v.tag = rv.tag ?? v.tag;
        v.skillMd = rv.skillMd;
        v.manifest =
          (rv.manifest as unknown as Record<string, unknown> | null) ??
          v.manifest;
        v.changelog = rv.changelog || v.changelog;
        v.authorPersonId =
          author?.id ?? v.authorPersonId ?? skill.ownerPersonId;
        const approvers = (rv.manifest?.promotion?.approved_by ?? [])
          .map(
            (a) =>
              personByIdentity.get(
                String(a)
                  .replace(/^compliance:/, '')
                  .toLowerCase(),
              )?.id,
          )
          .filter((x): x is string => Boolean(x));
        if (approvers.length) v.approverPersonIds = approvers;
        await this.versions.save(v);
      }
      const maxVersion = Math.max(
        skill.currentVersion,
        ...repoVersions.map((v) => v.version),
        ...existingVersions.map((v) => v.version),
      );
      if (maxVersion !== skill.currentVersion)
        await this.skills.update(skill.id, { currentVersion: maxVersion });
      result.skills.push(rs.slug);
      if (created) result.created++;
      else result.updated++;
    }

    // successors resolve after every skill exists (plugin read order is arbitrary)
    for (const link of successorLinks) {
      const [skill, successor] = await Promise.all([
        this.skills.findOne({ where: { orgId, slug: link.slug } }),
        this.skills.findOne({ where: { orgId, slug: link.successorSlug } }),
      ]);
      if (skill && successor && skill.successorSkillId !== successor.id)
        await this.skills.update(skill.id, { successorSkillId: successor.id });
      if (skill && !successor)
        result.warnings.push(
          `${link.slug}: successor "${link.successorSlug}" is not in the repo or the DB`,
        );
    }

    // published skills that vanished from the repo → deprecated (never delete)
    const vanished = await this.skills.find({
      where: { orgId, status: 'published', repoPath: Not(IsNull()) },
    });
    for (const s of vanished) {
      if (seen.has(s.slug)) continue;
      await this.skills.update(s.id, {
        status: 'deprecated',
        manifest: {
          ...(s.manifest ?? {}),
          status: 'deprecated',
        },
      });
      result.deprecated++;
      result.warnings.push(
        `${s.slug}: no longer in the repo; marked deprecated`,
      );
    }

    // plugin ↔ team intended assignments (available by default; champions adjust)
    for (const plugin of read.plugins) {
      const targets =
        plugin === 'shared'
          ? orgTeams.filter((t) => t.inProgram)
          : orgTeams.filter((t) => t.pluginName === plugin);
      for (const team of targets) {
        const existing = await this.assignments.findOne({
          where: { orgId, plugin, teamId: team.id },
        });
        if (!existing)
          await this.assignments.save(
            this.assignments.create({
              orgId,
              plugin,
              teamId: team.id,
              intendedMode: 'available',
              observedMode: null,
            }),
          );
      }
    }

    // Recorded on the org so every replica reports the same time.
    const orgRow = await this.orgs.findOne({ where: { id: orgId } });
    if (orgRow) {
      orgRow.settings = {
        ...(orgRow.settings ?? {}),
        lastMarketplaceSyncAt: result.syncedAt,
      } as typeof orgRow.settings;
      await this.orgs.save(orgRow);
    }
    await this.audit.save(
      this.audit.create({
        orgId,
        actorPersonId,
        action: 'marketplace.synced',
        subjectType: 'marketplace',
        subjectId: null,
        meta: { ...result, warnings: result.warnings.slice(0, 50) },
      }),
    );
    this.logger.log(
      `Synced ${read.skills.length} skills for org ${orgId} (${result.created} new, ${result.deprecated} deprecated)`,
    );
    return result;
  }

  // ───────────────────────── cards & library ─────────────────────────

  private async cardContext(
    orgId: string,
    skills: Skill[],
    personId?: string | null,
  ): Promise<CardContext> {
    const now = new Date();
    const ids = skills.map((s) => s.id);
    const boundary = await this.orgBoundary(orgId);
    const usage = new Map<string, { activeUsers: number; runs: number }>();
    if (ids.length) {
      const rows: { skillId: string; users: string; runs: string }[] =
        await this.usage
          .createQueryBuilder('u')
          .select('u.skillId', 'skillId')
          .addSelect('COUNT(DISTINCT u.personId)', 'users')
          .addSelect('COALESCE(SUM(u.activations), 0)', 'runs')
          .where('u.skillId IN (:...ids)', { ids })
          .andWhere('u.day >= :since', { since: isoDay(daysAgo(30, now)) })
          .groupBy('u.skillId')
          .getRawMany();
      for (const r of rows)
        usage.set(r.skillId, {
          activeUsers: Number(r.users),
          runs: Number(r.runs),
        });
    }
    const adoptedByMe = new Set<string>();
    if (personId && ids.length)
      for (const a of await this.adoptions.find({
        where: { personId, skillId: In(ids) },
      }))
        adoptedByMe.add(a.skillId);
    const gradeIds = skills
      .map((s) => s.latestGradeId)
      .filter((x): x is string => Boolean(x));
    const grades = new Map<string, Grade>();
    if (gradeIds.length)
      for (const g of await this.grades.find({ where: { id: In(gradeIds) } }))
        grades.set(g.id, g);
    const ownerIds = [
      ...new Set(
        skills
          .map((s) => s.ownerPersonId)
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const people = new Map<string, Person>();
    const refs = new Map<string, PersonRef>();
    if (ownerIds.length) {
      const persons = await this.people.find({ where: { id: In(ownerIds) } });
      for (const p of persons) people.set(p.id, p);
      for (const r of await this.refs.refs(persons)) refs.set(r.id, r);
    }
    const teams = new Map(
      (await this.teams.find({ where: { orgId } })).map((t) => [t.id, t]),
    );
    const pendingPromotion = new Set<string>();
    if (ids.length)
      for (const p of await this.promotions.find({
        where: { skillId: In(ids), decision: 'pending' },
      }))
        pendingPromotion.add(p.skillId);
    const allOrg = await this.skills.find({
      where: { orgId, status: Not('deprecated') },
      select: { id: true, triggerLine: true },
    });
    const triggerIndex = allOrg.map((s) => ({
      id: s.id,
      tokens: triggerTokens(s.triggerLine),
    }));
    return {
      boundary,
      usage,
      adoptedByMe,
      grades,
      people,
      refs,
      teams,
      pendingPromotion,
      triggerIndex,
      now,
    };
  }

  private healthFlags(skill: Skill, ctx: CardContext): HealthFlag[] {
    const flags: HealthFlag[] = [];
    const u = ctx.usage.get(skill.id) ?? { activeUsers: 0, runs: 0 };
    const publishedLongEnough =
      !skill.publishedAt ||
      ctx.now.getTime() - new Date(skill.publishedAt).getTime() >
        30 * 86_400_000;
    if (skill.status === 'published' && u.runs === 0 && publishedLongEnough)
      flags.push('unused_30d');
    const grade = skill.latestGradeId
      ? ctx.grades.get(skill.latestGradeId)
      : undefined;
    if (grade && grade.score < SKILL_PASS_THRESHOLD)
      flags.push('grade_below_threshold');
    if (undeclaredForbiddenClasses(skill, ctx.boundary).length > 0)
      flags.push('boundary_gap');
    const owner = skill.ownerPersonId
      ? ctx.people.get(skill.ownerPersonId)
      : undefined;
    if (
      skill.ownerPersonId &&
      (!owner || owner.status === 'inactive' || owner.orgId !== skill.orgId)
    )
      flags.push('owner_left');
    if (skill.status !== 'deprecated') {
      const mine = triggerTokens(skill.triggerLine);
      if (
        ctx.triggerIndex.some(
          (o) =>
            o.id !== skill.id &&
            jaccard(mine, o.tokens) > TRIGGER_OVERLAP_THRESHOLD,
        )
      )
        flags.push('overlapping_trigger');
    }
    if (skill.status === 'in_review' || ctx.pendingPromotion.has(skill.id))
      flags.push('pending_review');
    return flags;
  }

  private toCard(skill: Skill, ctx: CardContext): SkillCard {
    const u = ctx.usage.get(skill.id) ?? { activeUsers: 0, runs: 0 };
    const grade = skill.latestGradeId
      ? ctx.grades.get(skill.latestGradeId)
      : undefined;
    const team = skill.teamId ? ctx.teams.get(skill.teamId) : undefined;
    return {
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      triggerLine: skill.triggerLine,
      plugin: skill.plugin,
      team: team ? { id: team.id, name: team.name } : null,
      owner: skill.ownerPersonId
        ? (ctx.refs.get(skill.ownerPersonId) ?? null)
        : null,
      status: skill.status,
      rungRequired: skill.rungRequired,
      version: skill.currentVersion,
      grade: grade ? { score: grade.score, decision: grade.decision } : null,
      boundaryBadge: boundaryBadge(skill, ctx.boundary),
      activeUsers30d: u.activeUsers,
      runs30d: u.runs,
      adoptedByMe: ctx.adoptedByMe.has(skill.id),
      publishedAt: iso(skill.publishedAt),
      updatedAt: iso(skill.updatedAt) ?? new Date().toISOString(),
      health: this.healthFlags(skill, ctx),
    };
  }

  /** Cards for an arbitrary set of skills (all in `orgId`). */
  async cards(
    orgId: string,
    skills: Skill[],
    personId?: string | null,
  ): Promise<SkillCard[]> {
    if (skills.length === 0) return [];
    const ctx = await this.cardContext(orgId, skills, personId);
    return skills.map((s) => this.toCard(s, ctx));
  }

  async card(
    orgId: string,
    skill: Skill,
    personId?: string | null,
  ): Promise<SkillCard> {
    return (await this.cards(orgId, [skill], personId))[0];
  }

  async listLibrary(
    orgId: string,
    filters: LibraryFilters = {},
  ): Promise<LibraryResponse> {
    const all = await this.skills.find({
      where: { orgId },
      order: { updatedAt: 'DESC' },
    });
    const ctx = await this.cardContext(orgId, all, filters.personId);
    let cards = all.map((s) => ({ skill: s, card: this.toCard(s, ctx) }));
    const facets = this.facets(all, ctx);
    if (filters.team)
      cards = cards.filter(
        (c) =>
          c.skill.teamId === filters.team ||
          c.card.team?.name.toLowerCase() === filters.team!.toLowerCase() ||
          ctx.teams.get(c.skill.teamId ?? '')?.slug === filters.team,
      );
    if (filters.family)
      cards = cards.filter(
        (c) =>
          (c.skill.workflowFamily ?? '').toLowerCase() ===
          filters.family!.toLowerCase(),
      );
    if (filters.rung !== undefined && Number.isFinite(filters.rung))
      cards = cards.filter((c) => c.skill.rungRequired === filters.rung);
    if (filters.status)
      cards = cards.filter((c) => c.skill.status === filters.status);
    if (filters.q) {
      const q = filters.q.toLowerCase();
      cards = cards.filter((c) =>
        [
          c.skill.name,
          c.skill.slug,
          c.skill.triggerLine,
          c.skill.plugin,
          c.skill.workflowFamily ?? '',
          c.card.owner?.name ?? '',
        ].some((f) => f.toLowerCase().includes(q)),
      );
    }
    const sort = filters.sort ?? 'usage';
    cards.sort((a, b) => {
      switch (sort) {
        case 'grade':
          return (b.card.grade?.score ?? -1) - (a.card.grade?.score ?? -1);
        case 'updated':
          return b.card.updatedAt.localeCompare(a.card.updatedAt);
        case 'name':
          return a.card.name.localeCompare(b.card.name);
        default:
          return (
            b.card.runs30d - a.card.runs30d ||
            b.card.activeUsers30d - a.card.activeUsers30d ||
            a.card.name.localeCompare(b.card.name)
          );
      }
    });
    return { skills: cards.map((c) => c.card), facets };
  }

  private facets(skills: Skill[], ctx: CardContext): LibraryFacets {
    const count = <K>(keys: (K | null)[]) => {
      const m = new Map<K, number>();
      for (const k of keys)
        if (k !== null && k !== undefined) m.set(k, (m.get(k) ?? 0) + 1);
      return m;
    };
    const teams = count(skills.map((s) => s.teamId));
    const families = count(skills.map((s) => s.workflowFamily));
    const rungs = count(skills.map((s) => s.rungRequired));
    const statuses = count(skills.map((s) => s.status));
    return {
      teams: [...teams]
        .map(([id, c]) => ({
          id,
          name: ctx.teams.get(id)?.name ?? id,
          count: c,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      families: [...families]
        .map(([name, c]) => ({ name, count: c }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      rungs: [...rungs]
        .map(([rung, c]) => ({ rung, count: c }))
        .sort((a, b) => a.rung - b.rung),
      statuses: [...statuses].map(([status, c]) => ({ status, count: c })),
    };
  }

  // ───────────────────────── detail ─────────────────────────

  async getDetail(
    orgId: string,
    idOrSlug: string,
    personId?: string | null,
  ): Promise<SkillDetail> {
    const skill = await this.findSkill(orgId, idOrSlug);
    return this.detail(orgId, skill, personId);
  }

  async detail(
    orgId: string,
    skill: Skill,
    personId?: string | null,
  ): Promise<SkillDetail> {
    const card = await this.card(orgId, skill, personId);
    const versions = await this.versions.find({
      where: { skillId: skill.id },
      order: { version: 'DESC' },
    });
    const personIds = new Set<string>();
    for (const v of versions) {
      if (v.authorPersonId) personIds.add(v.authorPersonId);
      v.approverPersonIds.forEach((p) => personIds.add(p));
    }
    const adoptions = await this.adoptions.find({
      where: { skillId: skill.id },
    });
    adoptions.forEach((a) => personIds.add(a.personId));
    const comments = await this.comments.find({
      where: { skillId: skill.id },
      order: { createdAt: 'DESC' },
    });
    comments.forEach((c) => personIds.add(c.personId));
    const refMap = await this.refMap([...personIds]);

    const versionIds = versions.map((v) => v.id);
    const grades = versionIds.length
      ? await this.grades.find({
          where: { skillVersionId: In(versionIds) },
          order: { gradedAt: 'DESC' },
        })
      : [];
    const gradeViews = await Promise.all(
      grades.map(async (g) =>
        toGradeView(
          g,
          g.gradedByPersonId
            ? await this.refs.refById(g.gradedByPersonId)
            : null,
        ),
      ),
    );

    const since30 = isoDay(daysAgo(30));
    const since90 = isoDay(daysAgo(90));
    const byTeamRows: { teamId: string | null; activations: string }[] =
      await this.usage
        .createQueryBuilder('u')
        .select('u.teamId', 'teamId')
        .addSelect('COALESCE(SUM(u.activations),0)', 'activations')
        .where('u.skillId = :id', { id: skill.id })
        .andWhere('u.day >= :since', { since: since30 })
        .groupBy('u.teamId')
        .getRawMany();
    const teams = new Map(
      (await this.teams.find({ where: { orgId } })).map((t) => [t.id, t]),
    );
    const usageByTeam = byTeamRows.map((r) => ({
      teamId: r.teamId,
      teamName: r.teamId
        ? (teams.get(r.teamId)?.name ?? 'Unknown team')
        : 'No team',
      activations30d: Number(r.activations),
    }));
    const seriesRows: { day: string; activations: string }[] = await this.usage
      .createQueryBuilder('u')
      .select('u.day', 'day')
      .addSelect('COALESCE(SUM(u.activations),0)', 'activations')
      .where('u.skillId = :id', { id: skill.id })
      .andWhere('u.day >= :since', { since: since90 })
      .groupBy('u.day')
      .orderBy('u.day', 'ASC')
      .getRawMany();
    const usageSeries = seriesRows.map((r) => ({
      day: String(r.day).slice(0, 10),
      activations: Number(r.activations),
    }));

    const pending = await this.promotions.findOne({
      where: { skillId: skill.id },
      order: { createdAt: 'DESC' },
    });
    const promotion = pending ? await this.promotionView(pending, card) : null;
    const successor = skill.successorSkillId
      ? await this.skills.findOne({ where: { id: skill.successorSkillId } })
      : null;
    const workflow = skill.workflowMapId
      ? await this.workflowSummary(orgId, skill.workflowMapId, [card])
      : null;
    const orgBoundary = await this.orgBoundary(orgId);

    return {
      ...card,
      skillMd: skill.skillMd,
      boundary: skill.boundary,
      orgBoundary,
      sampleCases: skill.sampleCases,
      manifest: skill.manifest,
      workflow,
      versions: versions.map((v): SkillVersionView => ({
        id: v.id,
        version: v.version,
        tag: v.tag,
        commitSha: v.commitSha,
        changelog: v.changelog,
        author: v.authorPersonId
          ? (refMap.get(v.authorPersonId) ?? null)
          : null,
        gradeScore: v.gradeScore,
        approvers: v.approverPersonIds
          .map((p) => refMap.get(p))
          .filter((x): x is PersonRef => Boolean(x)),
        createdAt: iso(v.createdAt) ?? new Date().toISOString(),
      })),
      grades: gradeViews,
      usageByTeam,
      usageSeries,
      adopters: adoptions
        .map((a) => refMap.get(a.personId))
        .filter((x): x is PersonRef => Boolean(x)),
      comments: comments
        .map((c): SkillCommentView | null => {
          const person = refMap.get(c.personId);
          return person
            ? {
                id: c.id,
                person,
                body: c.body,
                kind: c.kind,
                createdAt: iso(c.createdAt) ?? new Date().toISOString(),
              }
            : null;
        })
        .filter((x): x is SkillCommentView => Boolean(x)),
      promotion,
      successor: successor ? await this.card(orgId, successor, personId) : null,
    };
  }

  async refMap(personIds: string[]): Promise<Map<string, PersonRef>> {
    if (personIds.length === 0) return new Map();
    const persons = await this.people.find({ where: { id: In(personIds) } });
    return new Map((await this.refs.refs(persons)).map((r) => [r.id, r]));
  }

  async workflowSummary(
    orgId: string,
    workflowMapId: string,
    linkedSkills: SkillCard[] = [],
  ): Promise<WorkflowSummary | null> {
    const map = await this.workflows.findOne({
      where: { id: workflowMapId, orgId },
    });
    if (!map) return null;
    const team = map.teamId
      ? await this.teams.findOne({ where: { id: map.teamId } })
      : null;
    const owner = map.ownerPersonId
      ? await this.refs.refById(map.ownerPersonId)
      : null;
    const baseline = await this.baselines.findOne({
      where: { workflowMapId },
      order: { capturedAt: 'DESC' },
    });
    const measurement = await this.measurements.findOne({
      where: { workflowMapId },
      order: { periodEnd: 'DESC' },
    });
    return toWorkflowSummary(map, {
      team: team ? { id: team.id, name: team.name } : null,
      owner,
      linkedSkills,
      baseline,
      measurement,
    });
  }

  /** PromotionView for a PromotionRequest (used by the Promoter and by skill detail). */
  async promotionView(
    pr: PromotionRequest,
    skillCard?: SkillCard,
  ): Promise<PromotionView> {
    const skill =
      skillCard ??
      (await this.card(pr.orgId, await this.findSkill(pr.orgId, pr.skillId)));
    const version = await this.versions.findOne({
      where: { id: pr.skillVersionId },
    });
    const requester =
      (await this.refs.refById(pr.requestedByPersonId)) ??
      placeholderRef(pr.requestedByPersonId);
    const grade = pr.gradeId
      ? await this.grades.findOne({ where: { id: pr.gradeId } })
      : null;
    const approverRefs = await this.refMap(pr.approvals.map((a) => a.personId));
    // The merge tags a *new* SkillVersion (N+1), so the promoted `version` is not the published one.
    let mergedTag: string | null = null;
    let mergedVersion: number | null = null;
    if (pr.decision === 'merged') {
      const tagged = await this.versions.find({
        where: { skillId: pr.skillId, tag: Not(IsNull()) },
        order: { version: 'DESC' },
      });
      const hit =
        tagged.find(
          (v) =>
            (pr.gradeId ? v.gradeId === pr.gradeId : true) &&
            v.version >= (version?.version ?? 0),
        ) ?? null;
      mergedTag = hit?.tag ?? null;
      mergedVersion = hit?.version ?? null;
    }
    return {
      id: pr.id,
      skill,
      version: version?.version ?? skill.version,
      mergedTag,
      mergedVersion,
      requestedBy: requester,
      prNumber: pr.prNumber,
      prUrl: pr.prUrl,
      branch: pr.branch,
      grade: grade ? toGradeView(grade) : null,
      boundaryCheck: pr.boundaryCheck,
      diffSummary: pr.diffSummary,
      approvals: pr.approvals.map((a) => ({
        ...a,
        person: approverRefs.get(a.personId) ?? null,
      })),
      requiredApproverRoles: pr.requiredApproverRoles,
      decision: pr.decision,
      highExposure: pr.highExposure,
      testResults: pr.testResults,
      createdAt: iso(pr.createdAt) ?? new Date().toISOString(),
      decidedAt: iso(pr.decidedAt),
    };
  }

  // ───────────────────────── authoring ─────────────────────────

  private normaliseBoundary(
    b: Partial<BoundaryDeclaration> | null | undefined,
  ): BoundaryDeclaration {
    const arr = (v: unknown) =>
      Array.isArray(v)
        ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))]
        : [];
    return {
      mayRead: arr(b?.mayRead),
      mustNeverReceive: arr(b?.mustNeverReceive),
      humanReview: arr(b?.humanReview),
    };
  }

  private normaliseCases(cases: SampleCase[] | undefined): SampleCase[] {
    return (cases ?? [])
      .filter((c) => c && typeof c.input === 'string' && c.input.trim())
      .map((c) => ({
        input: c.input.trim(),
        shouldTrigger: ['yes', 'no', 'ambiguous'].includes(c.shouldTrigger)
          ? c.shouldTrigger
          : 'ambiguous',
        expected: String(c.expected ?? '').trim(),
      }));
  }

  async manifestFor(
    skill: Skill,
  ): Promise<ActivateManifest & { family?: string }> {
    const owner = skill.ownerPersonId
      ? await this.people.findOne({ where: { id: skill.ownerPersonId } })
      : null;
    const team = skill.teamId
      ? await this.teams.findOne({ where: { id: skill.teamId } })
      : null;
    const prev = (skill.manifest ?? {}) as Partial<ActivateManifest>;
    const successor = skill.successorSkillId
      ? await this.skills.findOne({
          where: { id: skill.successorSkillId },
          select: { id: true, slug: true },
        })
      : null;
    return {
      id: skill.slug,
      owner: owner?.email ?? prev.owner ?? '',
      team:
        team?.slug ??
        prev.team ??
        (skill.plugin === 'shared' ? 'shared' : skill.plugin.split('-')[0]),
      ...(skill.workflowFamily ? { family: skill.workflowFamily } : {}),
      rung_required: rungLabel(skill.rungRequired),
      boundary: boundaryToManifest(skill.boundary),
      sample_cases: 'cases/',
      ...(prev.baseline_task ? { baseline_task: prev.baseline_task } : {}),
      ...(prev.promotion ? { promotion: prev.promotion } : {}),
      status: skill.status,
      ...(successor ? { successor: successor.slug } : {}),
    };
  }

  /** SKILL.md with governance frontmatter (author layer preserved; metadata layer owned by Activate). */
  composeSkillMd(skill: Skill, ownerEmail: string, version: number): string {
    const fm = parseFrontmatter(skill.skillMd);
    const body = fm ? fm.body : skill.skillMd;
    const data: Record<string, unknown> = { ...(fm?.data ?? {}) };
    data.name = skill.slug;
    data.description = skill.triggerLine;
    data.metadata = {
      ...(data.metadata ?? {}),
      'activate-id': skill.slug,
      'activate-version': String(version),
      'activate-owner': ownerEmail,
    };
    return composeSkillMd(data, body);
  }

  private async repoFiles(
    skill: Skill,
    version: number,
  ): Promise<Record<string, string>> {
    const manifest = await this.manifestFor(skill);
    // repoPath is the skill *directory* when written by sync/create, but the demo seed stores the
    // SKILL.md file path; normalise so we never write `<dir>/SKILL.md/SKILL.md`.
    const dir = (
      skill.repoPath ?? `plugins/${skill.plugin}/skills/${skill.slug}`
    ).replace(/\/SKILL\.md$/i, '');
    return {
      [`${dir}/SKILL.md`]: this.composeSkillMd(skill, manifest.owner, version),
      [`${dir}/activate.yaml`]: stringifyYaml(manifest, { lineWidth: 0 }),
      [`${dir}/cases/cases.json`]:
        JSON.stringify(skill.sampleCases, null, 2) + '\n',
    };
  }

  /** Commit the skill's current content on its `skill/<slug>` branch. Never throws. */
  async writeDraftToRepo(
    skill: Skill,
    author: Person,
    message: string,
  ): Promise<string | null> {
    const files = await this.repoFiles(skill, skill.currentVersion);
    const res = await this.git.writeOnBranch(
      skill.orgId,
      skill.slug,
      files,
      message,
      { name: author.name, email: author.email },
    );
    return res?.sha ?? null;
  }

  /** Commit the skill's content to main and tag `<slug>@vN`. Never throws. */
  async publishToRepo(
    skill: Skill,
    author: Person,
    message: string,
    version: number,
  ): Promise<string | null> {
    const files = await this.repoFiles(skill, version);
    const res = await this.git.publish(
      skill.orgId,
      skill.slug,
      files,
      message,
      { name: author.name, email: author.email },
      `${skill.slug}@v${version}`,
    );
    return res?.sha ?? null;
  }

  /** Snapshot the skill's content as the next SkillVersion. */
  async snapshotVersion(
    skill: Skill,
    author: Person | null,
    changelog: string,
    extra: Partial<SkillVersion> = {},
  ): Promise<SkillVersion> {
    const version = skill.currentVersion + 1;
    const v = await this.versions.save(
      this.versions.create({
        skillId: skill.id,
        version,
        skillMd: skill.skillMd,
        manifest: (await this.manifestFor(skill)) as unknown as Record<
          string,
          unknown
        >,
        changelog,
        authorPersonId: author?.id ?? skill.ownerPersonId,
        approverPersonIds: [],
        ...extra,
      }),
    );
    skill.currentVersion = version;
    await this.skills.update(skill.id, { currentVersion: version });
    return v;
  }

  async latestVersion(skillId: string): Promise<SkillVersion | null> {
    return this.versions.findOne({
      where: { skillId },
      order: { version: 'DESC' },
    });
  }

  async create(
    orgId: string,
    person: Person,
    input: CreateSkillInput,
  ): Promise<SkillDetail> {
    if (!input.name?.trim()) throw new ConflictException('name is required');
    if (!input.triggerLine?.trim())
      throw new ConflictException('triggerLine is required');
    if (!input.skillMd?.trim())
      throw new ConflictException('skillMd is required');
    const teamId = input.teamId === undefined ? person.teamId : input.teamId;
    const team = teamId
      ? await this.teams.findOne({ where: { id: teamId, orgId } })
      : null;
    const base = slugify(input.slug ?? input.name);
    let slug = base;
    for (let i = 2; await this.skills.exists({ where: { orgId, slug } }); i++)
      slug = `${base}-${i}`;
    const plugin = input.plugin?.trim() || team?.pluginName || 'shared';
    let skill = this.skills.create({
      orgId,
      slug,
      name: input.name.trim(),
      triggerLine: input.triggerLine.trim(),
      plugin,
      repoPath: `plugins/${plugin}/skills/${slug}`,
      ownerPersonId: person.id,
      teamId: team?.id ?? null,
      status: 'draft',
      rungRequired: input.rungRequired ?? 1,
      skillMd: input.skillMd,
      boundary: this.normaliseBoundary(input.boundary),
      sampleCases: this.normaliseCases(input.sampleCases),
      workflowFamily: input.workflowFamily ?? null,
      workflowMapId: input.workflowMapId ?? null,
      forkedFromSkillId: input.forkedFromSkillId ?? null,
      authoredBy:
        input.authoredBy ??
        (person.roles.includes('champion') ? 'champion' : 'learner'),
      branch: `skill/${slug}`,
      currentVersion: 0,
    });
    skill.manifest = await this.manifestFor(skill);
    skill = await this.skills.save(skill);
    skill.manifest = await this.manifestFor(skill);
    await this.snapshotVersion(
      skill,
      person,
      input.forkedFromSkillId ? 'Forked draft' : 'Initial draft',
    );
    await this.skills.update(skill.id, { manifest: skill.manifest });
    const sha = await this.writeDraftToRepo(
      skill,
      person,
      `${slug}: initial draft`,
    );
    if (sha)
      await this.versions.update(
        { skillId: skill.id, version: skill.currentVersion },
        { commitSha: sha },
      );
    if (skill.workflowMapId) {
      const map = await this.workflows.findOne({
        where: { id: skill.workflowMapId, orgId },
      });
      if (map && !map.linkedSkillIds.includes(skill.id))
        await this.workflows.update(map.id, {
          linkedSkillIds: [...map.linkedSkillIds, skill.id],
        });
    }
    await this.audit.save(
      this.audit.create({
        orgId,
        actorPersonId: person.id,
        action: 'skill.created',
        subjectType: 'skill',
        subjectId: skill.id,
        meta: { slug, plugin, forkedFrom: input.forkedFromSkillId ?? null },
      }),
    );
    return this.detail(orgId, await this.findSkill(orgId, skill.id), person.id);
  }

  async patch(
    orgId: string,
    person: Person,
    idOrSlug: string,
    input: PatchSkillInput,
  ): Promise<SkillDetail> {
    const skill = await this.findSkill(orgId, idOrSlug);
    await this.assertCanEdit(person, skill);
    if (skill.status === 'deprecated')
      throw new ConflictException(
        'Deprecated skills cannot be edited; fork the successor instead.',
      );
    const before = JSON.stringify([
      skill.skillMd,
      skill.triggerLine,
      skill.boundary,
      skill.sampleCases,
      skill.name,
      skill.rungRequired,
    ]);
    if (input.skillMd !== undefined) skill.skillMd = input.skillMd;
    if (input.triggerLine !== undefined)
      skill.triggerLine = input.triggerLine.trim();
    if (input.boundary !== undefined)
      skill.boundary = this.normaliseBoundary(input.boundary);
    if (input.sampleCases !== undefined)
      skill.sampleCases = this.normaliseCases(input.sampleCases);
    if (input.name !== undefined && input.name.trim())
      skill.name = input.name.trim();
    if (input.rungRequired !== undefined)
      skill.rungRequired = rungFromLabel(
        input.rungRequired,
        skill.rungRequired,
      );
    const after = JSON.stringify([
      skill.skillMd,
      skill.triggerLine,
      skill.boundary,
      skill.sampleCases,
      skill.name,
      skill.rungRequired,
    ]);
    if (before === after) return this.detail(orgId, skill, person.id);
    skill.manifest = await this.manifestFor(skill);
    await this.skills.save(skill);
    const changed = Object.keys(input).filter(
      (k) => (input as Record<string, unknown>)[k] !== undefined,
    );
    await this.snapshotVersion(skill, person, `Edited ${changed.join(', ')}`);
    const sha = await this.writeDraftToRepo(
      skill,
      person,
      `${skill.slug}: edit ${changed.join(', ')}`,
    );
    if (sha)
      await this.versions.update(
        { skillId: skill.id, version: skill.currentVersion },
        { commitSha: sha },
      );
    return this.detail(orgId, await this.findSkill(orgId, skill.id), person.id);
  }

  async fork(
    orgId: string,
    person: Person,
    idOrSlug: string,
    overrides: Partial<CreateSkillInput> = {},
  ): Promise<SkillDetail> {
    const source = await this.findSkill(orgId, idOrSlug);
    return this.create(orgId, person, {
      name:
        overrides.name ??
        `${source.name} (${person.name.split(' ')[0]}'s fork)`,
      slug:
        overrides.slug ??
        `${source.slug}-${slugify(person.name.split(' ')[0])}`,
      plugin:
        overrides.plugin ??
        (person.teamId && person.teamId !== source.teamId
          ? undefined
          : source.plugin),
      teamId: overrides.teamId ?? person.teamId,
      triggerLine: overrides.triggerLine ?? source.triggerLine,
      skillMd: overrides.skillMd ?? source.skillMd,
      boundary: overrides.boundary ?? source.boundary,
      sampleCases: overrides.sampleCases ?? source.sampleCases,
      workflowMapId: overrides.workflowMapId ?? null,
      forkedFromSkillId: source.id,
      rungRequired: overrides.rungRequired ?? source.rungRequired,
      workflowFamily: overrides.workflowFamily ?? source.workflowFamily,
    });
  }

  async adopt(
    orgId: string,
    person: Person,
    idOrSlug: string,
  ): Promise<{ adoption: SkillAdoption; exercise: Exercise }> {
    const skill = await this.findSkill(orgId, idOrSlug);
    const existing = await this.adoptions.findOne({
      where: { skillId: skill.id, personId: person.id },
    });
    if (existing) {
      const ex = existing.exerciseId
        ? await this.exercises.findOne({ where: { id: existing.exerciseId } })
        : null;
      if (ex) return { adoption: existing, exercise: ex };
    }
    const exercise = await this.exercises.save(
      this.exercises.create({
        personId: person.id,
        rung: Math.max(1, Math.min(3, skill.rungRequired)),
        competencyCodes:
          skill.rungRequired >= 3
            ? ['L3.trigger', 'L3.boundary']
            : skill.rungRequired === 2
              ? ['L2.selection']
              : ['L1.delegation', 'L1.discernment'],
        title: `Adopt ${skill.name} on your own case`,
        brief: `Use ${skill.name} on one real case from this week where its trigger applies: "${skill.triggerLine}".`,
        rationale: `${skill.name} is published for ${skill.plugin.replace(/-/g, ' ')} and matches work you already do. Adopting a teammate's skill is the fastest route through this rung: you learn what a good trigger and boundary look like by using one on real work before writing your own.`,
        kind: 'adopt',
        mode: 'in_app',
        workSurface: 'skill',
        contextTag: skill.workflowFamily ?? skill.slug,
        skillId: skill.id,
        workflowMapId: skill.workflowMapId,
        hints: [
          'Start from the "When to use" section: does your case match the trigger line exactly, or is it one of the "do not use" cases?',
          'Check your input against "Must never receive" before you paste anything. Replace anything restricted with the summary the skill asks for.',
          'Compare the output against the "Output format" block line by line; note what the skill left out and whether the review footer is present.',
        ],
        starter: {
          skillSlug: skill.slug,
          triggerLine: skill.triggerLine,
          boundary: skill.boundary,
          outputFormatHint: 'Follow the Output format section of the skill.',
        },
        status: 'queued',
        estimatedMinutes: 25,
        generatedBy: 'adopt',
      }),
    );
    const adoption = existing
      ? await this.adoptions.save({ ...existing, exerciseId: exercise.id })
      : await this.adoptions.save(
          this.adoptions.create({
            skillId: skill.id,
            personId: person.id,
            exerciseId: exercise.id,
          }),
        );
    await this.audit.save(
      this.audit.create({
        orgId,
        actorPersonId: person.id,
        action: 'skill.adopted',
        subjectType: 'skill',
        subjectId: skill.id,
        meta: { exerciseId: exercise.id },
      }),
    );
    return { adoption, exercise };
  }

  async comment(
    orgId: string,
    person: Person,
    idOrSlug: string,
    body: string,
    kind: SkillComment['kind'] = 'feedback',
  ): Promise<SkillCommentView> {
    const skill = await this.findSkill(orgId, idOrSlug);
    if (!body?.trim()) throw new ConflictException('body is required');
    const c = await this.comments.save(
      this.comments.create({
        skillId: skill.id,
        personId: person.id,
        body: body.trim(),
        kind,
      }),
    );
    const ref = (await this.refs.ref(person)) ?? placeholderRef(person.id);
    return {
      id: c.id,
      person: ref,
      body: c.body,
      kind: c.kind,
      createdAt: iso(c.createdAt) ?? new Date().toISOString(),
    };
  }

  async deprecate(
    orgId: string,
    person: Person,
    idOrSlug: string,
    successorSkillId?: string | null,
  ): Promise<SkillDetail> {
    const skill = await this.findSkill(orgId, idOrSlug);
    await this.assertCanEdit(person, skill);
    if (successorSkillId) {
      const successor = await this.findSkill(orgId, successorSkillId);
      if (successor.id === skill.id)
        throw new ConflictException('A skill cannot succeed itself');
      skill.successorSkillId = successor.id;
    }
    const wasPublished = skill.status === 'published';
    skill.status = 'deprecated';
    skill.manifest = await this.manifestFor(skill);
    await this.skills.save(skill);
    const successorSlug = skill.manifest.successor ?? null;
    const v = await this.snapshotVersion(
      skill,
      person,
      `Deprecated${successorSlug ? ` in favour of ${successorSlug}` : ''}`,
    );
    if (wasPublished) {
      const sha = await this.publishToRepo(
        skill,
        person,
        `${skill.slug}: deprecate${successorSlug ? ` in favour of ${successorSlug}` : ''}`,
        v.version,
      );
      await this.versions.update(v.id, {
        tag: `${skill.slug}@v${v.version}`,
        ...(sha ? { commitSha: sha } : {}),
      });
    } else {
      const sha = await this.writeDraftToRepo(
        skill,
        person,
        `${skill.slug}: deprecate`,
      );
      if (sha) await this.versions.update(v.id, { commitSha: sha });
    }
    await this.comments.save(
      this.comments.create({
        skillId: skill.id,
        personId: person.id,
        kind: 'system',
        body: `Deprecated by ${person.name}${successorSlug ? `; successor: ${successorSlug}` : ''}.`,
      }),
    );
    await this.audit.save(
      this.audit.create({
        orgId,
        actorPersonId: person.id,
        action: 'skill.deprecated',
        subjectType: 'skill',
        subjectId: skill.id,
        meta: { successorSkillId: skill.successorSkillId },
      }),
    );
    return this.detail(orgId, await this.findSkill(orgId, skill.id), person.id);
  }

  // ───────────────────────── grading glue ─────────────────────────

  /** Persist a Grade produced by GraderService.gradeSkillText against the latest version. */
  async recordSkillGrade(
    orgId: string,
    skill: Skill,
    grader: Person,
    draft: Omit<Grade, 'id' | 'gradedAt'>,
  ): Promise<Grade> {
    let version = await this.latestVersion(skill.id);
    if (!version || version.skillMd !== skill.skillMd)
      version = await this.snapshotVersion(
        skill,
        grader,
        version ? 'Snapshot for grading' : 'Initial snapshot',
      );
    const grade = await this.grades.save(
      this.grades.create({
        ...draft,
        submissionId: null,
        skillVersionId: version.id,
        personId: skill.ownerPersonId ?? grader.id,
      }),
    );
    await this.versions.update(version.id, {
      gradeId: grade.id,
      gradeScore: grade.score,
    });
    await this.skills.update(skill.id, {
      latestGradeId: grade.id,
      lastRegradedAt: new Date(),
    });
    const top = grade.rubric
      .slice()
      .sort((a, b) => a.score - b.score)
      .slice(0, 2);
    const summary = [
      `Grader ${grade.decision === 'pass' ? 'PASS' : 'REVISE'} — score ${(grade.score * 100).toFixed(0)}% (v${version.version}).`,
      top.length
        ? `Weakest: ${top.map((r) => `${r.label} ${(r.score * 100).toFixed(0)}%`).join('; ')}.`
        : '',
      grade.securityFindings.length
        ? `Security: ${grade.securityFindings.map((f) => `[${f.severity}] ${f.finding}`).join(' ')}`
        : 'Security review: no findings.',
      grade.feedback.split('\n')[0],
    ]
      .filter(Boolean)
      .join(' ');
    await this.comments.save(
      this.comments.create({
        skillId: skill.id,
        personId: grader.id,
        kind: 'grader',
        body: summary,
      }),
    );
    await this.audit.save(
      this.audit.create({
        orgId,
        actorPersonId: grader.id,
        action: 'skill.graded',
        subjectType: 'skill',
        subjectId: skill.id,
        meta: {
          gradeId: grade.id,
          score: grade.score,
          decision: grade.decision,
          version: version.version,
        },
      }),
    );
    return grade;
  }

  /** Previous vs current grade score for the scheduled re-grade check. */
  async regradeCheck(
    orgId: string,
    idOrSlug: string,
  ): Promise<{
    previous: number | null;
    current: number | null;
    drop: boolean;
    delta: number;
    threshold: number;
  }> {
    const skill = await this.findSkill(orgId, idOrSlug);
    const versionIds = (
      await this.versions.find({
        where: { skillId: skill.id },
        select: { id: true },
      })
    ).map((v) => v.id);
    const grades = versionIds.length
      ? await this.grades.find({
          where: { skillVersionId: In(versionIds) },
          order: { gradedAt: 'DESC' },
          take: 2,
        })
      : [];
    const current = grades[0]?.score ?? null;
    const previous = grades[1]?.score ?? null;
    const delta =
      current !== null && previous !== null
        ? Math.round((current - previous) * 1000) / 1000
        : 0;
    // "review recommended": the score fell by more than 5 points, or crossed below the pass threshold
    const drop =
      current !== null &&
      previous !== null &&
      (current < previous - 0.05 ||
        (current < SKILL_PASS_THRESHOLD && previous >= SKILL_PASS_THRESHOLD));
    return { previous, current, drop, delta, threshold: SKILL_PASS_THRESHOLD };
  }

  // ───────────────────────── assignments ─────────────────────────

  async listAssignments(
    orgId: string,
    teamId?: string,
  ): Promise<AssignmentView[]> {
    const rows = await this.assignments.find({
      where: teamId ? { orgId, teamId } : { orgId },
    });
    const teams = new Map(
      (await this.teams.find({ where: { orgId } })).map((t) => [t.id, t]),
    );
    return rows
      .filter((r) => teams.has(r.teamId))
      .map((r) => ({
        plugin: r.plugin,
        team: { id: r.teamId, name: teams.get(r.teamId)!.name },
        intendedMode: r.intendedMode,
        observedMode: r.observedMode,
        drift: r.observedMode !== null && r.observedMode !== r.intendedMode,
      }))
      .sort(
        (a, b) =>
          a.team.name.localeCompare(b.team.name) ||
          a.plugin.localeCompare(b.plugin),
      );
  }

  async putAssignment(
    orgId: string,
    actor: Person,
    input: {
      plugin: string;
      teamId: string;
      intendedMode: SkillAssignment['intendedMode'];
    },
  ): Promise<AssignmentView> {
    if (!input.plugin || !input.teamId)
      throw new ConflictException('plugin and teamId are required');
    const team = await this.teams.findOne({
      where: { id: input.teamId, orgId },
    });
    if (!team) throw new NotFoundException('Team not found in this org');
    const mode = ['hidden', 'available', 'auto'].includes(input.intendedMode)
      ? input.intendedMode
      : 'available';
    let row = await this.assignments.findOne({
      where: { orgId, plugin: input.plugin, teamId: team.id },
    });
    row = row
      ? { ...row, intendedMode: mode }
      : this.assignments.create({
          orgId,
          plugin: input.plugin,
          teamId: team.id,
          intendedMode: mode,
          observedMode: null,
        });
    row = await this.assignments.save(row);
    await this.audit.save(
      this.audit.create({
        orgId,
        actorPersonId: actor.id,
        action: 'assignment.updated',
        subjectType: 'plugin',
        subjectId: null,
        meta: { plugin: input.plugin, teamId: team.id, intendedMode: mode },
      }),
    );
    return {
      plugin: row.plugin,
      team: { id: team.id, name: team.name },
      intendedMode: row.intendedMode,
      observedMode: row.observedMode,
      drift: row.observedMode !== null && row.observedMode !== row.intendedMode,
    };
  }

  /** Skills adopted or authored by a person (used by the learning module's /my-skills and MC). */
  async skillsForPerson(
    orgId: string,
    personId: string,
  ): Promise<{ adopted: SkillCard[]; authored: SkillCard[] }> {
    const adoptions = await this.adoptions.find({ where: { personId } });
    const adoptedSkills = adoptions.length
      ? await this.skills.find({
          where: { orgId, id: In(adoptions.map((a) => a.skillId)) },
        })
      : [];
    const authored = await this.skills.find({
      where: { orgId, ownerPersonId: personId },
    });
    return {
      adopted: await this.cards(orgId, adoptedSkills, personId),
      authored: await this.cards(orgId, authored, personId),
    };
  }

  async recentUsageForPerson(
    skillId: string,
    personId: string,
  ): Promise<number> {
    const rows = await this.usage.find({
      where: { skillId, personId, day: MoreThanOrEqual(isoDay(daysAgo(30))) },
    });
    return rows.reduce((n, r) => n + r.activations, 0);
  }

  /** Repo-side record for a skill, if present on main (used for previousSkillMd on promotions). */
  async repoSkill(orgId: string, slug: string): Promise<RepoSkill | null> {
    const path = await this.git.pathFor(orgId);
    if (!path) return null;
    const read = await readRepoSkills(path).catch(() => null);
    return read?.skills.find((s) => s.slug === slug) ?? null;
  }
}

function placeholderRef(id: string): PersonRef {
  return {
    id,
    name: 'Unknown person',
    email: '',
    title: null,
    avatarUrl: null,
    teamId: null,
    teamName: null,
    rung: 0,
    roles: [],
  };
}
