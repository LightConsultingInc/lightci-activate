import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { Grade } from '../learning/entities/grade.entity';
import { AuditLog } from '../ops/entities/audit-log.entity';
import { Escalation } from '../ops/entities/escalation.entity';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { PromoterPackageSchema } from './ai-schemas';
import { checkBoundary } from './boundary';
import { PromotionRequest } from './entities/promotion-request.entity';
import { SkillComment } from './entities/skill-comment.entity';
import { SkillVersion } from './entities/skill-version.entity';
import { type ActivateManifest, Skill } from './entities/skill.entity';
import { GitRepoService, diffSummary } from './git-repo.service';
import { LibraryService } from './library.service';
import type { PromotionDetail, PromotionView } from './skills.types';
import './skills.mocks';

export { checkBoundary };

const PROMOTER_SYSTEM = `You are the Promoter for LightCI Activate at a regulated wealth-management firm. You package a skill for human approval.
You never execute skills or touch client data. You read the SKILL.md, the author's sample cases, the Grader's result, the machine boundary check and the diff, then write:
1. approvalSummary — one screen a champion reads before approving: what the skill does and for whom, what changed, what the Grader said, what the boundary check found, which approvers are required. Plain, specific, no marketing.
2. risks — concrete risks for the approver (boundary gaps, over-triggering, steps that could write to a read-only system, missing human review). One sentence each. Empty when there are none.
3. testResults — for each sample case, reason from the skill text whether it would trigger and whether it would behave as the author's expected-behaviour column says. Say when it would not. Do not invent cases.
Facts only; if the Grader and the sample cases disagree, say so.`;

/**
 * Promoter role: packages a graded skill for one-screen approval (PR), records approvals by role,
 * merges when every required role has approved (SkillVersion tagged, repo commit + tag, manifest
 * promotion block, AuditLog), or sends it back.
 */
@Injectable()
export class PromoterService {
  private readonly logger = new Logger(PromoterService.name);

  constructor(
    @InjectRepository(PromotionRequest)
    private readonly promotions: Repository<PromotionRequest>,
    @InjectRepository(Skill) private readonly skills: Repository<Skill>,
    @InjectRepository(SkillVersion)
    private readonly versions: Repository<SkillVersion>,
    @InjectRepository(SkillComment)
    private readonly comments: Repository<SkillComment>,
    @InjectRepository(Grade) private readonly grades: Repository<Grade>,
    @InjectRepository(Person) private readonly people: Repository<Person>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(Escalation)
    private readonly escalations: Repository<Escalation>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
    private readonly library: LibraryService,
    private readonly git: GitRepoService,
    private readonly ai: AiService,
  ) {}

  // ───────────────────────── package ─────────────────────────

  async package(
    orgId: string,
    skillIdOrSlug: string,
    requester: Person,
  ): Promise<PromotionView> {
    const skill = await this.library.findSkill(orgId, skillIdOrSlug);
    if (skill.status === 'deprecated')
      throw new ConflictException('Deprecated skills cannot be promoted.');
    const pending = await this.promotions.findOne({
      where: { skillId: skill.id, decision: 'pending' },
    });
    if (pending)
      throw new ConflictException(
        `A promotion request for ${skill.slug} is already pending (#${pending.prNumber ?? '?'}).`,
      );

    const grade = skill.latestGradeId
      ? await this.grades.findOne({ where: { id: skill.latestGradeId } })
      : null;
    if (!grade)
      throw new ConflictException(
        `${skill.name} has not been graded. Run the Grader first (POST /skills/${skill.id}/grade); promotion requires a passing grade.`,
      );
    if (grade.decision !== 'pass') {
      throw new ConflictException(
        `${skill.name}'s latest grade is "revise" (${Math.round(grade.score * 100)}%). Address the Grader feedback, re-grade, then request promotion. Feedback: ${grade.feedback.split('\n')[0].slice(0, 300)}`,
      );
    }
    const gradedVersion = grade.skillVersionId
      ? await this.versions.findOne({ where: { id: grade.skillVersionId } })
      : null;
    if (gradedVersion && gradedVersion.skillMd !== skill.skillMd) {
      throw new ConflictException(
        `${skill.name} changed after it was last graded (graded v${gradedVersion.version}, now v${skill.currentVersion}). Re-grade the current content before requesting promotion.`,
      );
    }
    let version = await this.library.latestVersion(skill.id);
    if (!version || version.skillMd !== skill.skillMd)
      version = await this.library.snapshotVersion(
        skill,
        requester,
        'Snapshot for promotion',
      );
    if (version.gradeId !== grade.id)
      await this.versions.update(version.id, {
        gradeId: grade.id,
        gradeScore: grade.score,
      });

    const boundary = await this.library.orgBoundary(orgId);
    const check = checkBoundary(skill, boundary);
    const previous = await this.previousPublished(skill.id, version.version);
    const diff = diffSummary(previous?.skillMd ?? null, skill.skillMd);
    const requiredApproverRoles = [
      'champion',
      ...(check.highExposure ? ['compliance'] : []),
    ];

    const pack = await this.ai.structured(
      {
        agent: 'promoter',
        task: 'promoter.package',
        orgId,
        personId: requester.id,
        effort: 'medium',
        system: PROMOTER_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              `# Skill ${skill.slug} v${version.version} (${skill.status}) — plugin ${skill.plugin}`,
              `Trigger line: ${skill.triggerLine}`,
              '',
              `# Grader: ${grade.decision} ${(grade.score * 100).toFixed(0)}%`,
              grade.rubric
                .map(
                  (r) =>
                    `- ${r.label}: ${(r.score * 100).toFixed(0)}% — ${r.note}`,
                )
                .join('\n'),
              grade.feedback,
              grade.securityFindings.length
                ? `Security findings: ${grade.securityFindings.map((f) => `[${f.severity}] ${f.finding}`).join('; ')}`
                : 'Security findings: none.',
              '',
              '# Boundary check (machine)',
              JSON.stringify(check, null, 2),
              `Firm boundary: forbidden=${boundary.forbiddenDataClasses.join(', ')}; read-only systems=${boundary.readOnlySystems.join(', ')}; review points=${boundary.humanReviewPoints.join(', ')}`,
              '',
              `# Diff vs previous published version: ${diff.summary}`,
              '',
              '# Sample cases',
              skill.sampleCases
                .map(
                  (c, i) =>
                    `${i + 1}. [${c.shouldTrigger}] ${c.input}\n   expected: ${c.expected}`,
                )
                .join('\n') || '(none)',
              '',
              '# SKILL.md',
              skill.skillMd,
            ].join('\n'),
          },
        ],
        mockSeed: {
          slug: skill.slug,
          name: skill.name,
          triggerLine: skill.triggerLine,
          version: version.version,
          gradeScore: grade.score,
          gradeDecision: grade.decision,
          boundaryCheck: check,
          highExposure: check.highExposure,
          diffSummary: diff.summary,
          sampleCases: skill.sampleCases,
          humanReview: skill.boundary.humanReview,
        },
      },
      PromoterPackageSchema,
    );

    const branch = skill.branch ?? `skill/${skill.slug}`;
    // make sure the branch carries the promoted content (status in_review) before a PR is opened
    skill.status = 'in_review';
    const manifest = await this.library.manifestFor(skill);
    manifest.promotion = {
      ...(manifest.promotion ?? {}),
      requested_by: requester.email,
      grade_ref: grade.id,
    };
    skill.manifest = manifest;
    skill.branch = branch;
    await this.skills.save(skill);
    const sha = await this.library.writeDraftToRepo(
      skill,
      requester,
      `${skill.slug}: request promotion (grade ${(grade.score * 100).toFixed(0)}%)`,
    );
    if (sha) await this.versions.update(version.id, { commitSha: sha });

    const pr = await this.openPullRequest(
      orgId,
      skill,
      branch,
      version.version,
      pack.approvalSummary,
      pack.risks,
      pack.testResults,
      check.highExposure,
    );

    const request = await this.promotions.save(
      this.promotions.create({
        orgId,
        skillId: skill.id,
        skillVersionId: version.id,
        requestedByPersonId: requester.id,
        prNumber: pr.number,
        prUrl: pr.url,
        branch,
        gradeId: grade.id,
        boundaryCheck: {
          ok: check.ok,
          touchesRestrictedClasses: check.touchesRestrictedClasses,
          missingDeclarations: check.missingDeclarations,
          humanReviewRequired: check.humanReviewRequired,
          notes: check.notes,
        },
        diffSummary: diff,
        approvals: [],
        requiredApproverRoles,
        decision: 'pending',
        highExposure: check.highExposure,
        testResults: [
          pack.approvalSummary,
          '',
          pack.risks.length
            ? `Risks:\n- ${pack.risks.join('\n- ')}`
            : 'Risks: none identified.',
          '',
          'Sample cases:',
          pack.testResults,
        ].join('\n'),
      }),
    );

    if (check.highExposure) {
      const team = skill.teamId
        ? await this.teams.findOne({ where: { id: skill.teamId } })
        : null;
      await this.escalations.save(
        this.escalations.create({
          orgId,
          sourceAgent: 'promoter',
          kind: 'approval',
          subjectType: 'promotion_request',
          subjectId: request.id,
          reason: `High-exposure promotion: ${skill.name} v${version.version} ${check.touchesRestrictedClasses.length ? `reads restricted class(es) ${check.touchesRestrictedClasses.join(', ')}` : 'has a human-review step touching CRM entry'}. Needs champion + compliance approval.`,
          assigneePersonId: team?.championPersonId ?? null,
          state: 'open',
          slaDueAt: new Date(Date.now() + 2 * 86_400_000),
        }),
      );
    }
    await this.comments.save(
      this.comments.create({
        skillId: skill.id,
        personId: requester.id,
        kind: 'system',
        body: `Promotion requested (PR #${pr.number ?? '—'}).\n${pack.approvalSummary}`,
      }),
    );
    await this.audit.save(
      this.audit.create({
        orgId,
        actorPersonId: requester.id,
        action: 'promotion.requested',
        subjectType: 'promotion_request',
        subjectId: request.id,
        meta: {
          skillId: skill.id,
          slug: skill.slug,
          version: version.version,
          prNumber: pr.number,
          highExposure: check.highExposure,
          requiredApproverRoles,
        },
      }),
    );
    return this.library.promotionView(request);
  }

  private async previousPublished(
    skillId: string,
    beforeVersion: number,
  ): Promise<SkillVersion | null> {
    const tagged = await this.versions.find({
      where: { skillId, tag: Not(IsNull()) },
      order: { version: 'DESC' },
    });
    return tagged.find((v) => v.tag && v.version < beforeVersion) ?? null;
  }

  private async openPullRequest(
    orgId: string,
    skill: Skill,
    branch: string,
    version: number,
    summary: string,
    risks: string[],
    tests: string,
    highExposure: boolean,
  ): Promise<{ number: number | null; url: string | null }> {
    const repo = await this.git.repoFor(orgId);
    if (repo.githubMode) {
      // The draft branch was pushed when it was written; make sure it is on the remote.
      const pushed = await this.git.pushBranch(orgId, branch);
      if (pushed) {
        try {
          const res = await fetch(
            `https://api.github.com/repos/${repo.config.owner}/${repo.config.repo}/pulls`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${repo.config.token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'User-Agent': 'lightci-activate',
              },
              body: JSON.stringify({
                title: `${skill.slug} v${version}: ${skill.name}`,
                head: branch,
                base: repo.config.defaultBranch,
                body: [
                  summary,
                  '',
                  risks.length
                    ? `### Risks\n- ${risks.join('\n- ')}`
                    : '### Risks\nNone identified.',
                  '',
                  '### Sample cases',
                  tests,
                  '',
                  highExposure
                    ? '**High exposure — compliance approval required.**'
                    : '',
                  '',
                  '_Opened by LightCI Activate Promoter._',
                ].join('\n'),
              }),
            },
          );
          if (res.ok) {
            const json = (await res.json()) as {
              number: number;
              html_url: string;
            };
            return { number: json.number, url: json.html_url };
          }
          this.logger.warn(
            `GitHub PR creation failed (${res.status}); falling back to a local PR number.`,
          );
        } catch (e) {
          this.logger.warn(
            `GitHub PR creation failed: ${(e as Error).message}; falling back to a local PR number.`,
          );
        }
      }
    }
    const max: { max: string | null } | undefined = await this.promotions
      .createQueryBuilder('p')
      .select('MAX(p.prNumber)', 'max')
      .where('p.orgId = :orgId', { orgId })
      .getRawOne();
    return { number: Number(max?.max ?? 0) + 1, url: null };
  }

  // ───────────────────────── queue ─────────────────────────

  async list(
    orgId: string,
    state: 'pending' | 'all' = 'pending',
  ): Promise<PromotionView[]> {
    const rows = await this.promotions.find({
      where: state === 'pending' ? { orgId, decision: 'pending' } : { orgId },
      order: { createdAt: 'DESC' },
    });
    const skillIds = [...new Set(rows.map((r) => r.skillId))];
    const skills = skillIds.length
      ? await this.skills.find({ where: { id: In(skillIds), orgId } })
      : [];
    const cards = new Map(
      (await this.library.cards(orgId, skills)).map((c) => [c.id, c]),
    );
    return Promise.all(
      rows.map((r) => this.library.promotionView(r, cards.get(r.skillId))),
    );
  }

  async find(orgId: string, id: string): Promise<PromotionRequest> {
    const pr = await this.promotions.findOne({ where: { id, orgId } });
    if (!pr) throw new NotFoundException('Promotion request not found');
    return pr;
  }

  async get(orgId: string, id: string): Promise<PromotionDetail> {
    const pr = await this.find(orgId, id);
    const view = await this.library.promotionView(pr);
    const version = await this.versions.findOne({
      where: { id: pr.skillVersionId },
    });
    const skill = await this.skills.findOne({ where: { id: pr.skillId } });
    const previous = version
      ? await this.previousPublished(pr.skillId, version.version)
      : null;
    const previousSkillMd =
      previous?.skillMd ??
      (skill
        ? ((await this.library.repoSkill(orgId, skill.slug))?.skillMd ?? null)
        : null);
    return {
      ...view,
      skillMd: version?.skillMd ?? skill?.skillMd ?? '',
      previousSkillMd:
        previousSkillMd === (version?.skillMd ?? '') ? null : previousSkillMd,
    };
  }

  // ───────────────────────── decisions ─────────────────────────

  /** Roles this person can approve as, for this request. */
  async approverRoles(
    pr: PromotionRequest,
    skill: Skill,
    person: Person,
  ): Promise<string[]> {
    const roles: string[] = [];
    const team = skill.teamId
      ? await this.teams.findOne({ where: { id: skill.teamId } })
      : null;
    const isLead = person.roles.includes('lead');
    const champion =
      isLead ||
      team?.championPersonId === person.id ||
      person.roles.includes('champion');
    if (champion) roles.push('champion');
    if (
      pr.requiredApproverRoles.includes('compliance') &&
      (isLead ||
        person.roles.includes('admin') ||
        person.roles.includes('sponsor'))
    )
      roles.push('compliance');
    return roles;
  }

  async approve(
    orgId: string,
    id: string,
    person: Person,
    note?: string,
  ): Promise<PromotionView> {
    const pr = await this.find(orgId, id);
    if (pr.decision !== 'pending')
      throw new ConflictException(`This request is already ${pr.decision}.`);
    const skill = await this.library.findSkill(orgId, pr.skillId);
    const roles = await this.approverRoles(pr, skill, person);
    if (roles.length === 0)
      throw new ForbiddenException(
        'Only the team champion (or compliance for high-exposure requests) can approve this promotion.',
      );
    if (pr.requestedByPersonId === person.id && !person.roles.includes('lead'))
      throw new ForbiddenException(
        'You cannot approve your own promotion request.',
      );
    const now = new Date().toISOString();
    for (const role of roles) {
      if (!pr.requiredApproverRoles.includes(role)) continue;
      if (
        pr.approvals.some(
          (a) =>
            a.personId === person.id &&
            a.role === role &&
            a.decision === 'approve',
        )
      )
        continue;
      pr.approvals = [
        ...pr.approvals,
        {
          personId: person.id,
          role,
          decision: 'approve',
          ...(note ? { note } : {}),
          at: now,
        },
      ];
    }
    await this.audit.save(
      this.audit.create({
        orgId,
        actorPersonId: person.id,
        action: 'promotion.approved',
        subjectType: 'promotion_request',
        subjectId: pr.id,
        meta: { roles, note: note ?? null, skillId: skill.id },
      }),
    );
    const satisfied = pr.requiredApproverRoles.every((r) =>
      pr.approvals.some((a) => a.role === r && a.decision === 'approve'),
    );
    if (satisfied) {
      pr.decision = 'approved';
      await this.promotions.save(pr);
      await this.merge(orgId, pr, skill, person);
    } else {
      await this.promotions.save(pr);
      await this.comments.save(
        this.comments.create({
          skillId: skill.id,
          personId: person.id,
          kind: 'system',
          body: `Approved as ${roles.join(' + ')}${note ? `: ${note}` : ''}. Waiting for ${pr.requiredApproverRoles.filter((r) => !pr.approvals.some((a) => a.role === r && a.decision === 'approve')).join(', ')}.`,
        }),
      );
    }
    return this.library.promotionView(await this.find(orgId, id));
  }

  async sendBack(
    orgId: string,
    id: string,
    person: Person,
    note: string,
  ): Promise<PromotionView> {
    const pr = await this.find(orgId, id);
    if (pr.decision !== 'pending')
      throw new ConflictException(`This request is already ${pr.decision}.`);
    if (!note?.trim())
      throw new ConflictException(
        'A note is required when sending a promotion back.',
      );
    const skill = await this.library.findSkill(orgId, pr.skillId);
    const roles = await this.approverRoles(pr, skill, person);
    if (roles.length === 0)
      throw new ForbiddenException(
        'Only the team champion (or compliance) can send this promotion back.',
      );
    pr.approvals = [
      ...pr.approvals,
      {
        personId: person.id,
        role: roles[0],
        decision: 'send_back',
        note: note.trim(),
        at: new Date().toISOString(),
      },
    ];
    pr.decision = 'sent_back';
    pr.decidedAt = new Date();
    await this.promotions.save(pr);
    skill.status = skill.publishedAt ? 'published' : 'draft';
    const manifest = await this.library.manifestFor(skill);
    skill.manifest = manifest;
    await this.skills.save(skill);
    await this.library.writeDraftToRepo(
      skill,
      person,
      `${skill.slug}: sent back by ${person.name}`,
    );
    await this.comments.save(
      this.comments.create({
        skillId: skill.id,
        personId: person.id,
        kind: 'feedback',
        body: `Sent back: ${note.trim()}`,
      }),
    );
    await this.resolveEscalations(pr.id, `Sent back by ${person.name}`);
    await this.audit.save(
      this.audit.create({
        orgId,
        actorPersonId: person.id,
        action: 'promotion.sent_back',
        subjectType: 'promotion_request',
        subjectId: pr.id,
        meta: { note: note.trim(), skillId: skill.id },
      }),
    );
    return this.library.promotionView(await this.find(orgId, id));
  }

  /** All required approvals are in: publish. New SkillVersion tagged `<slug>@vN`, repo commit + tag, manifest, audit. */
  async merge(
    orgId: string,
    pr: PromotionRequest,
    skill: Skill,
    actor: Person,
  ): Promise<void> {
    const approverIds = [
      ...new Set(
        pr.approvals
          .filter((a) => a.decision === 'approve')
          .map((a) => a.personId),
      ),
    ];
    const approvers = approverIds.length
      ? await this.people.find({ where: { id: In(approverIds) } })
      : [];
    const requester = await this.people.findOne({
      where: { id: pr.requestedByPersonId },
    });
    const approvedAt = new Date();
    const approvedBy = pr.approvals
      .filter((a) => a.decision === 'approve')
      .map(
        (a) =>
          `${a.role === 'compliance' ? 'compliance:' : ''}${approvers.find((p) => p.id === a.personId)?.email ?? a.personId}`,
      );

    skill.status = 'published';
    skill.publishedAt = approvedAt;
    const manifest = await this.library.manifestFor(skill);
    manifest.status = 'published';
    manifest.promotion = {
      requested_by: requester?.email ?? pr.requestedByPersonId,
      grade_ref: pr.gradeId ?? undefined,
      approved_by: approvedBy,
      approved_at: approvedAt.toISOString(),
    };
    skill.manifest = manifest;
    await this.skills.save(skill);

    const grade = pr.gradeId
      ? await this.grades.findOne({ where: { id: pr.gradeId } })
      : null;
    const version = await this.library.snapshotVersion(
      skill,
      requester ?? actor,
      `Published via promotion #${pr.prNumber ?? '?'}: ${pr.diffSummary.summary}`,
      {
        gradeId: pr.gradeId,
        gradeScore: grade?.score ?? null,
        approverPersonIds: approverIds,
      },
    );
    const tag = `${skill.slug}@v${version.version}`;
    const sha = await this.library.publishToRepo(
      skill,
      actor,
      `${skill.slug} v${version.version}: ${skill.name}\n\nPromotion #${pr.prNumber ?? '?'} approved by ${approvedBy.join(', ')}.\nGrade ${grade ? `${(grade.score * 100).toFixed(0)}%` : 'n/a'}.`,
      version.version,
    );
    await this.versions.update(version.id, {
      tag,
      ...(sha ? { commitSha: sha } : {}),
    });
    // the promoted draft version records the same grade/approvers for the timeline
    await this.versions.update(pr.skillVersionId, {
      approverPersonIds: approverIds,
      gradeId: pr.gradeId ?? undefined,
      gradeScore: grade?.score ?? undefined,
    });

    pr.decision = 'merged';
    pr.decidedAt = approvedAt;
    await this.promotions.save(pr);
    await this.resolveEscalations(pr.id, `Merged as ${tag}`);
    await this.comments.save(
      this.comments.create({
        skillId: skill.id,
        personId: actor.id,
        kind: 'system',
        body: `Merged and published as ${tag}${sha ? ` (${sha.slice(0, 7)})` : ''}. Approved by ${approvedBy.join(', ')}.`,
      }),
    );
    await this.audit.save(
      this.audit.create({
        orgId,
        actorPersonId: actor.id,
        action: 'promotion.merged',
        subjectType: 'promotion_request',
        subjectId: pr.id,
        meta: {
          skillId: skill.id,
          slug: skill.slug,
          version: version.version,
          tag,
          commitSha: sha,
          prNumber: pr.prNumber,
          approvedBy,
          gradeScore: grade?.score ?? null,
          highExposure: pr.highExposure,
        },
      }),
    );
    this.logger.log(`Merged ${tag} (PR #${pr.prNumber ?? '?'})`);
  }

  private async resolveEscalations(
    promotionRequestId: string,
    resolution: string,
  ) {
    const open = await this.escalations.find({
      where: {
        subjectType: 'promotion_request',
        subjectId: promotionRequestId,
        state: In(['open', 'in_progress']),
      },
    });
    for (const e of open)
      await this.escalations.update(e.id, {
        state: 'resolved',
        resolution,
        resolvedAt: new Date(),
      });
  }
}
