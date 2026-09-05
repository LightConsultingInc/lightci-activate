/**
 * LibraryService against a temp copy of the real marketplace repo, with in-memory stand-ins for the
 * TypeORM repositories. Covers sync (upsert by slug, versions from tags, owner/team resolution,
 * successors, idempotency, vanished → deprecated, local draft kept), library cards/facets/filters,
 * detail, and the authoring path (create → branch commit, patch → new version, adopt → exercise,
 * grade → comment, deprecate).
 */
import { randomUUID } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { FindOperator } from 'typeorm';
import type { Person } from '../orgs/entities/person.entity';
import { GitRepoService } from './git-repo.service';
import { LibraryService } from './library.service';
import { SEEDED_SLUGS, copyMarketplace, governedWarnings, repoFor } from './repo-reader.spec';

// ───────────────────────── in-memory repository ─────────────────────────

type Row = Record<string, any>;

function opMatch(actual: unknown, op: FindOperator<unknown>): boolean {
  switch (op.type) {
    case 'in':
      return (op.value as unknown[]).includes(actual);
    case 'isNull':
      return actual === null || actual === undefined;
    case 'not':
      return op.value instanceof FindOperator ? !opMatch(actual, op.value) : actual !== op.value;
    case 'moreThanOrEqual':
      return (actual as number) >= (op.value as number);
    default:
      throw new Error(`FakeRepo: unsupported operator ${op.type}`);
  }
}

function matches(row: Row, where: Row | Row[] | undefined): boolean {
  if (!where) return true;
  if (Array.isArray(where)) return where.some((w) => matches(row, w));
  for (const [k, v] of Object.entries(where)) {
    if (v === undefined) continue;
    if (v instanceof FindOperator) {
      if (!opMatch(row[k], v)) return false;
    } else if (row[k] !== v) return false;
  }
  return true;
}

class FakeRepo<T extends Row = Row> {
  rows: T[] = [];
  create(data: Partial<T> = {}): T {
    return { ...data } as T;
  }
  async save(e: Row | Row[]): Promise<any> {
    if (Array.isArray(e)) return Promise.all(e.map((x) => this.save(x)));
    if (!e.id) e.id = randomUUID();
    e.createdAt ??= new Date();
    e.updatedAt = new Date();
    const i = this.rows.findIndex((r) => r.id === e.id);
    if (i >= 0) this.rows[i] = { ...this.rows[i], ...e };
    else this.rows.push(e as T);
    return this.rows.find((r) => r.id === e.id);
  }
  async find(opts: { where?: Row | Row[]; order?: Record<string, 'ASC' | 'DESC'>; take?: number; select?: unknown } = {}): Promise<T[]> {
    let out = this.rows.filter((r) => matches(r, opts.where)).map((r) => ({ ...r }));
    if (opts.order) {
      const keys = Object.entries(opts.order);
      out.sort((a, b) => {
        for (const [k, dir] of keys) {
          const av = a[k] instanceof Date ? a[k].getTime() : a[k];
          const bv = b[k] instanceof Date ? b[k].getTime() : b[k];
          if (av === bv) continue;
          const c = av > bv ? 1 : -1;
          return dir === 'DESC' ? -c : c;
        }
        return 0;
      });
    }
    if (opts.take) out = out.slice(0, opts.take);
    return out;
  }
  async findOne(opts: { where?: Row | Row[]; order?: Record<string, 'ASC' | 'DESC'>; select?: unknown }): Promise<T | null> {
    return (await this.find(opts))[0] ?? null;
  }
  async findOneOrFail(opts: { where?: Row }): Promise<T> {
    const r = await this.findOne(opts);
    if (!r) throw new Error('not found');
    return r;
  }
  async update(criteria: string | Row, patch: Row): Promise<void> {
    const where = typeof criteria === 'string' ? { id: criteria } : criteria;
    for (const r of this.rows) if (matches(r, where)) Object.assign(r, patch, { updatedAt: new Date() });
  }
  async exists(opts: { where: Row }): Promise<boolean> {
    return this.rows.some((r) => matches(r, opts.where));
  }
  async count(opts: { where: Row }): Promise<number> {
    return this.rows.filter((r) => matches(r, opts.where)).length;
  }
  createQueryBuilder(): any {
    const qb: any = new Proxy({}, { get: (_t, prop) => (prop === 'getRawMany' ? async () => [] : prop === 'getRawOne' ? async () => undefined : () => qb) });
    return qb;
  }
}

// ───────────────────────── fixtures ─────────────────────────

const ORG_ID = randomUUID();
const BOUNDARY = {
  allowedDataClasses: ['aggregated_client_summaries', 'internal_templates', 'public_regulation', 'calendar', 'crm_summary_export'],
  forbiddenDataClasses: ['client_pii_documents', 'account_numbers', 'ssn', 'statements_raw'],
  readOnlySystems: ['Salesforce', 'Orion', 'eMoney'],
  humanReviewPoints: ['before_send', 'before_crm_entry', 'before_client_meeting'],
};

function person(name: string, email: string, teamId: string | null, roles: string[]): Person {
  return { id: randomUUID(), orgId: ORG_ID, teamId, email, name, title: null, roles, status: 'active', avatarUrl: null } as unknown as Person;
}

describe('LibraryService against the demo marketplace', () => {
  let dir: string;
  let git: GitRepoService;
  let lib: LibraryService;
  const repos = {
    skills: new FakeRepo(), versions: new FakeRepo(), usage: new FakeRepo(), adoptions: new FakeRepo(), comments: new FakeRepo(), assignments: new FakeRepo(), promotions: new FakeRepo(),
    people: new FakeRepo(), teams: new FakeRepo(), orgs: new FakeRepo(), grades: new FakeRepo(), exercises: new FakeRepo(), workflows: new FakeRepo(), baselines: new FakeRepo(), measurements: new FakeRepo(), audit: new FakeRepo(),
  };
  const teamIds = { fp: randomUUID(), wa: randomUUID(), cso: randomUUID() };
  const daniel = person('Daniel Okafor', 'daniel.okafor@meridianwealth.demo', teamIds.fp, ['champion', 'learner']);
  const priya = person('Priya Nair', 'priya.nair@meridianwealth.demo', teamIds.fp, ['learner']);
  const sofia = person('Sofia Alvarez', 'sofia.alvarez@meridianwealth.demo', teamIds.wa, ['champion', 'learner']);
  const tom = person('Tom Becker', 'tom.becker@meridianwealth.demo', teamIds.cso, ['champion', 'learner']);
  const marcus = person('Marcus Reid', 'marcus.reid@meridianwealth.demo', teamIds.wa, ['learner']);

  beforeAll(async () => {
    dir = copyMarketplace();
    git = await repoFor(dir);
    const refOf = (p: Row) => ({ id: p.id, name: p.name, email: p.email, title: p.title ?? null, avatarUrl: null, teamId: p.teamId ?? null, teamName: null, rung: 1, roles: p.roles });
    const refs = {
      refs: async (persons: Row[]) => persons.map(refOf),
      ref: async (p: Row) => refOf(p),
      refById: async (id: string) => {
        const p = repos.people.rows.find((r) => r.id === id);
        return p ? refOf(p) : null;
      },
      currentRung: async () => 1,
    };
    lib = new LibraryService(
      repos.skills as any, repos.versions as any, repos.usage as any, repos.adoptions as any, repos.comments as any, repos.assignments as any, repos.promotions as any,
      repos.people as any, repos.teams as any, repos.orgs as any, repos.grades as any, repos.exercises as any, repos.workflows as any, repos.baselines as any, repos.measurements as any, repos.audit as any,
      git, refs as any,
    );
    await repos.orgs.save({ id: ORG_ID, name: 'Meridian', slug: 'meridian', settings: { boundary: BOUNDARY } });
    await repos.teams.save([
      { id: teamIds.fp, orgId: ORG_ID, name: 'Financial Planning', slug: 'fp', pluginName: 'fp-meeting-prep', championPersonId: daniel.id, inProgram: true },
      { id: teamIds.wa, orgId: ORG_ID, name: 'Wealth Advisors', slug: 'wa', pluginName: 'wa-client-comms', championPersonId: sofia.id, inProgram: true },
      { id: teamIds.cso, orgId: ORG_ID, name: 'Client Service Ops', slug: 'cso', pluginName: 'cso-operations', championPersonId: tom.id, inProgram: true },
    ]);
    await repos.people.save([daniel, priya, sofia, tom, marcus] as unknown as Row[]);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('status reports the repo on main, clean, with counts', async () => {
    expect(git.available()).toBe(true);
    const s = await lib.status(ORG_ID);
    expect(s).toMatchObject({ branch: 'main', dirty: false, skillCount: 11, mode: 'local', lastSyncAt: null });
    expect(s.pluginCount).toBeGreaterThanOrEqual(4);
    expect(s.repo).toBe(dir);
  });

  it('sync creates every skill with versions from tags, resolved owners/teams and successors', async () => {
    const r = await lib.sync(ORG_ID, daniel.id);
    expect(r.created).toBe(11);
    expect(r.updated).toBe(0);
    expect(r.deprecated).toBe(0);
    expect(r.versions).toBe(11); // one import tag per skill at its declared activate-version
    expect(governedWarnings(r.warnings)).toEqual([]);
    expect(r.skills.sort()).toEqual(SEEDED_SLUGS);
    expect(repos.skills.rows).toHaveLength(11);
    const bySlug = (slug: string) => repos.skills.rows.find((s) => s.slug === slug)!;
    const prep = bySlug('advisor-meeting-prep');
    expect(prep).toMatchObject({ orgId: ORG_ID, plugin: 'fp-meeting-prep', ownerPersonId: daniel.id, teamId: teamIds.fp, status: 'published', rungRequired: 1, currentVersion: 2, workflowFamily: 'meeting-prep', repoPath: 'plugins/fp-meeting-prep/skills/advisor-meeting-prep' });
    expect(prep.publishedAt).toBeInstanceOf(Date);
    expect(prep.manifest.boundary.may_read).toContain('calendar');
    expect(prep.sampleCases).toHaveLength(4);
    expect(bySlug('rmd-letter-draft').ownerPersonId).toBe(priya.id);
    expect(bySlug('onboarding-packet-qa')).toMatchObject({ ownerPersonId: tom.id, teamId: teamIds.cso, currentVersion: 1 });
    const dep = bySlug('crm-note-cleanup');
    expect(dep).toMatchObject({ status: 'deprecated', teamId: null, plugin: 'shared', successorSkillId: bySlug('client-followup-notes').id });
    const followupVersions = repos.versions.rows.filter((v) => v.skillId === bySlug('client-followup-notes').id).sort((a, b) => a.version - b.version);
    expect(followupVersions.map((v) => [v.version, v.tag])).toEqual([[2, 'client-followup-notes@v2']]); // v1 only exists in the DB seed
    expect(followupVersions[0].authorPersonId).toBe(sofia.id); // bot author is not a person → owner
    expect(followupVersions[0].approverPersonIds).toEqual([daniel.id]);
    expect(followupVersions[0].commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(bySlug('fee-change-comms')).toMatchObject({ status: 'in_review', ownerPersonId: marcus.id, teamId: teamIds.wa, plugin: 'wa-client-comms', currentVersion: 1 });
    expect(bySlug('fee-change-comms').publishedAt ?? null).toBeNull();
    expect(repos.assignments.rows.map((a) => `${a.plugin}→${a.teamId === teamIds.fp ? 'fp' : a.teamId === teamIds.wa ? 'wa' : 'cso'}`).sort()).toEqual(
      ['cso-operations→cso', 'fp-meeting-prep→fp', 'shared→cso', 'shared→fp', 'shared→wa', 'wa-client-comms→wa'],
    );
    expect(repos.audit.rows.some((a) => a.action === 'marketplace.synced' && a.actorPersonId === daniel.id)).toBe(true);
    expect((await lib.status(ORG_ID)).lastSyncAt).not.toBeNull();
  });

  it('lists the library with cards, facets, filters and health flags', async () => {
    const all = await lib.listLibrary(ORG_ID, { personId: marcus.id });
    expect(all.skills).toHaveLength(11);
    expect(all.facets.teams.map((t) => t.name).sort()).toEqual(['Client Service Ops', 'Financial Planning', 'Wealth Advisors']);
    expect(all.facets.statuses).toEqual(expect.arrayContaining([{ status: 'published', count: 9 }, { status: 'deprecated', count: 1 }, { status: 'in_review', count: 1 }]));
    expect(all.facets.rungs).toEqual([{ rung: 1, count: 7 }, { rung: 2, count: 4 }]);
    expect(all.facets.families.find((f) => f.name === 'client-communications')?.count).toBe(4);
    expect(all.skills.find((s) => s.slug === 'fee-change-comms')!.health).toContain('pending_review');
    const card = all.skills.find((s) => s.slug === 'onboarding-packet-qa')!;
    expect(card).toMatchObject({ plugin: 'cso-operations', team: { id: teamIds.cso, name: 'Client Service Ops' }, status: 'published', rungRequired: 1, version: 1, grade: null, boundaryBadge: 'amber', activeUsers30d: 0, runs30d: 0, adoptedByMe: false });
    expect(card.owner).toMatchObject({ id: tom.id, email: 'tom.becker@meridianwealth.demo' });
    expect(all.skills.find((s) => s.slug === 'rebalancing-exception-memo')!.health).toContain('boundary_gap');
    expect(all.skills.find((s) => s.slug === 'advisor-meeting-prep')!.health).not.toContain('boundary_gap');
    expect(all.skills.find((s) => s.slug === 'crm-note-cleanup')!.health).not.toContain('unused_30d');
    expect(all.skills.every((s) => !s.health.includes('owner_left'))).toBe(true);
    expect((await lib.listLibrary(ORG_ID, { team: 'fp' })).skills.map((s) => s.slug).sort()).toEqual(['advisor-meeting-prep', 'annual-review-deck-outline', 'rmd-letter-draft']);
    expect((await lib.listLibrary(ORG_ID, { team: teamIds.wa })).skills).toHaveLength(4);
    expect((await lib.listLibrary(ORG_ID, { rung: 2 })).skills).toHaveLength(4);
    expect((await lib.listLibrary(ORG_ID, { status: 'deprecated' })).skills.map((s) => s.slug)).toEqual(['crm-note-cleanup']);
    expect((await lib.listLibrary(ORG_ID, { status: 'in_review' })).skills.map((s) => s.slug)).toEqual(['fee-change-comms']);
    expect((await lib.listLibrary(ORG_ID, { q: 'RMD' })).skills.map((s) => s.slug)).toEqual(['rmd-letter-draft']);
    expect((await lib.listLibrary(ORG_ID, { family: 'proposals' })).skills.map((s) => s.slug)).toEqual(['proposal-assembly']);
    const byName = (await lib.listLibrary(ORG_ID, { sort: 'name' })).skills.map((s) => s.name);
    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b)));
  });

  it('detail carries versions, successor, comments and empty usage', async () => {
    const d = await lib.getDetail(ORG_ID, 'crm-note-cleanup', marcus.id);
    expect(d.status).toBe('deprecated');
    expect(d.successor?.slug).toBe('client-followup-notes');
    expect(d.versions.map((v) => v.version)).toEqual([2]);
    expect(d.versions[0].author?.email).toBe('marcus.reid@meridianwealth.demo');
    expect(d.manifest?.successor).toBe('client-followup-notes');
    expect(d.skillMd).toContain('Deprecated (Aug 2026)');
    expect(d.usageByTeam).toEqual([]);
    expect(d.usageSeries).toEqual([]);
    expect(d.grades).toEqual([]);
    expect(d.promotion).toBeNull();
    const byId = await lib.getDetail(ORG_ID, d.id);
    expect(byId.slug).toBe('crm-note-cleanup');
    await expect(lib.getDetail(ORG_ID, 'does-not-exist')).rejects.toThrow(/not found/);
    await expect(lib.getDetail(randomUUID(), 'crm-note-cleanup')).rejects.toThrow(/not found/);
  });

  it('a second sync is idempotent', async () => {
    const r = await lib.sync(ORG_ID);
    expect(r).toMatchObject({ created: 0, updated: 11, deprecated: 0, versions: 0 });
    expect(repos.skills.rows).toHaveLength(11);
    expect(repos.versions.rows).toHaveLength(11);
    expect(repos.assignments.rows).toHaveLength(6);
  });

  it('marks published skills that vanished from the repo deprecated, never deletes them', async () => {
    await repos.skills.save({ orgId: ORG_ID, slug: 'gone-skill', name: 'Gone', triggerLine: 'Use when gone.', plugin: 'shared', repoPath: 'plugins/shared/skills/gone-skill', status: 'published', rungRequired: 1, skillMd: '# Gone', boundary: { mayRead: [], mustNeverReceive: [], humanReview: [] }, sampleCases: [], manifest: null, currentVersion: 1 });
    const r = await lib.sync(ORG_ID);
    expect(r.deprecated).toBe(1);
    expect(governedWarnings(r.warnings)).toEqual(['gone-skill: no longer in the repo; marked deprecated']);
    expect(repos.skills.rows.find((s) => s.slug === 'gone-skill')!.status).toBe('deprecated');
    expect(repos.skills.rows).toHaveLength(12);
  });

  it('patch by the owner creates a draft version, commits on skill/<slug>, and sync keeps the local draft', async () => {
    const before = repos.skills.rows.find((s) => s.slug === 'rmd-letter-draft')!;
    const edited = before.skillMd.replace('# RMD letter draft', '# RMD letter draft\n\n> Draft edit by Priya.');
    const d = await lib.patch(ORG_ID, priya, before.id, { skillMd: edited, triggerLine: before.triggerLine + ' Also covers first-year RMDs.' });
    expect(d.version).toBe(2);
    const drafts = repos.versions.rows.filter((v) => v.skillId === before.id).sort((a, b) => a.version - b.version);
    expect(drafts.map((v) => [v.version, v.tag ?? null])).toEqual([[1, 'rmd-letter-draft@v1'], [2, null]]);
    expect(drafts[1].changelog).toBe('Edited skillMd, triggerLine');
    expect(drafts[1].commitSha).toMatch(/^[0-9a-f]{40}$/);
    const g = simpleGit(dir);
    expect((await g.revparse(['--abbrev-ref', 'HEAD'])).trim()).toBe('main');
    expect((await g.branchLocal()).all).toContain('skill/rmd-letter-draft');
    const onBranch = await g.show(['skill/rmd-letter-draft:plugins/fp-meeting-prep/skills/rmd-letter-draft/SKILL.md']);
    expect(onBranch).toContain('Draft edit by Priya');
    expect(onBranch).toMatch(/activate-version: "?2"?/);
    expect(onBranch).toContain('Also covers first-year RMDs.');
    const onMain = await g.show(['main:plugins/fp-meeting-prep/skills/rmd-letter-draft/SKILL.md']);
    expect(onMain).not.toContain('Draft edit by Priya');
    expect((await g.status()).isClean()).toBe(true);
    // a learner who is neither owner nor champion cannot edit
    await expect(lib.patch(ORG_ID, marcus, before.id, { name: 'Hijack' })).rejects.toThrow(/owner or a champion/);
    // a champion of the team can
    const byChampion = await lib.patch(ORG_ID, daniel, before.id, { name: 'RMD letter draft (planning)' });
    expect(byChampion.name).toBe('RMD letter draft (planning)');
    expect(byChampion.version).toBe(3);
    // sync keeps the local draft ahead of the repo
    const r = await lib.sync(ORG_ID);
    expect(governedWarnings(r.warnings)).toContain('rmd-letter-draft: local draft ahead of the repo; kept DB content, refreshed manifest/versions only');
    const after = repos.skills.rows.find((s) => s.slug === 'rmd-letter-draft')!;
    expect(after.skillMd).toContain('Draft edit by Priya');
    expect(after.name).toBe('RMD letter draft (planning)');
    expect(after.currentVersion).toBe(3);
  });

  it('create writes a new draft on its own branch; fork, adopt, grade, comment and deprecate follow', async () => {
    const created = await lib.create(ORG_ID, priya, {
      name: 'Cash-flow write-up',
      triggerLine: 'Write the cash-flow summary paragraph for a plan. Use when a planner asks for the cash-flow write-up. Do not use for projections or statements.',
      skillMd: '# Cash-flow write-up\n\n## When to use\n\nWhen asked.\n\n## Boundaries\n\nNever paste account numbers.',
      boundary: { mayRead: ['aggregated_client_summaries'], mustNeverReceive: ['account_numbers', 'ssn'], humanReview: ['before_client_meeting'] },
      sampleCases: [{ input: 'Write the cash-flow paragraph for the Lees', shouldTrigger: 'yes', expected: 'Writes it' }],
    });
    expect(created).toMatchObject({ slug: 'cash-flow-write-up', plugin: 'fp-meeting-prep', status: 'draft', version: 1, boundaryBadge: 'amber', team: { id: teamIds.fp } });
    expect(created.owner?.id).toBe(priya.id);
    expect(created.manifest).toMatchObject({ id: 'cash-flow-write-up', owner: 'priya.nair@meridianwealth.demo', team: 'fp', rung_required: 'L1', status: 'draft', sample_cases: 'cases/' });
    expect(created.health).not.toContain('boundary_gap'); // 'account numbers' is mentioned but declared
    const g = simpleGit(dir);
    expect((await g.branchLocal()).all).toContain('skill/cash-flow-write-up');
    const md = await g.show(['skill/cash-flow-write-up:plugins/fp-meeting-prep/skills/cash-flow-write-up/SKILL.md']);
    expect(md).toMatch(/^---\nname: cash-flow-write-up\n/);
    expect(md).toContain('activate-owner: priya.nair@meridianwealth.demo');
    const yaml = await g.show(['skill/cash-flow-write-up:plugins/fp-meeting-prep/skills/cash-flow-write-up/activate.yaml']);
    expect(yaml).toContain('status: draft');
    expect(yaml).toContain('- account_numbers');
    expect(existsSync(join(dir, 'plugins/fp-meeting-prep/skills/cash-flow-write-up'))).toBe(false); // not on main
    expect((await g.revparse(['--abbrev-ref', 'HEAD'])).trim()).toBe('main');
    // slug collision → suffix
    const dup = await lib.create(ORG_ID, priya, { name: 'Cash-flow write-up', triggerLine: 'Use when… Do not use…', skillMd: '# Dup', boundary: {} });
    expect(dup.slug).toBe('cash-flow-write-up-2');

    // fork by someone on another team lands in their plugin
    const fork = await lib.fork(ORG_ID, marcus, created.id);
    expect(fork).toMatchObject({ plugin: 'wa-client-comms', status: 'draft', team: { id: teamIds.wa } });
    expect(fork.slug).toBe('cash-flow-write-up-marcus');
    expect(repos.skills.rows.find((s) => s.id === fork.id)!.forkedFromSkillId).toBe(created.id);

    // adopt → exercise
    const { adoption, exercise } = await lib.adopt(ORG_ID, marcus, 'advisor-meeting-prep');
    expect(exercise).toMatchObject({ personId: marcus.id, kind: 'adopt', generatedBy: 'adopt', workSurface: 'skill', mode: 'in_claude', status: 'queued', title: 'Adopt Advisor meeting prep on your own case' });
    expect(exercise.brief).toContain('Build the one-page pre-meeting brief');
    expect(adoption.exerciseId).toBe(exercise.id);
    const again = await lib.adopt(ORG_ID, marcus, 'advisor-meeting-prep');
    expect(again.exercise.id).toBe(exercise.id);
    expect((await lib.listLibrary(ORG_ID, { personId: marcus.id })).skills.find((s) => s.slug === 'advisor-meeting-prep')!.adoptedByMe).toBe(true);
    expect((await lib.skillsForPerson(ORG_ID, marcus.id)).adopted.map((s) => s.slug)).toEqual(['advisor-meeting-prep']);

    // grade glue
    const skill = repos.skills.rows.find((s) => s.id === created.id)!;
    const grade = await lib.recordSkillGrade(ORG_ID, skill as any, priya, {
      submissionId: null, skillVersionId: null, personId: priya.id, rubric: [{ criterion: 'skill.scope', label: 'Scope', score: 0.6, note: 'Thin' }, { criterion: 'skill.trigger_clarity', label: 'Trigger clarity', score: 0.9, note: 'Good' }],
      score: 0.72, feedback: 'Needs steps and examples.\nMore detail.', decision: 'revise', critiqueQuality: null, expectationAccuracy: null, securityFindings: [], teachingMoment: null, graderVersion: 'grader-v1', model: 'mock', gradedByPersonId: null,
    } as any);
    expect(repos.skills.rows.find((s) => s.id === created.id)!.latestGradeId).toBe(grade.id);
    expect(repos.versions.rows.find((v) => v.id === grade.skillVersionId)!.gradeScore).toBe(0.72);
    const graderComment = repos.comments.rows.find((c) => c.skillId === created.id && c.kind === 'grader')!;
    expect(graderComment.body).toMatch(/^Grader REVISE — score 72% \(v1\)\. Weakest: Scope 60%; Trigger clarity 90%\./);
    const detail = await lib.getDetail(ORG_ID, created.id, priya.id);
    expect(detail.grade).toEqual({ score: 0.72, decision: 'revise' });
    expect(detail.health).toContain('grade_below_threshold');
    expect(detail.grades).toHaveLength(1);
    expect(detail.comments.some((c) => c.kind === 'grader')).toBe(true);
    expect(await lib.regradeCheck(ORG_ID, created.id)).toMatchObject({ previous: null, current: 0.72, drop: false });

    // comment + deprecate (draft → stays on branch; successor recorded)
    const c = await lib.comment(ORG_ID, marcus, created.id, 'Could this also cover the retirement cash-flow table?');
    expect(c.person.id).toBe(marcus.id);
    const dep = await lib.deprecate(ORG_ID, priya, created.id, fork.id);
    expect(dep.status).toBe('deprecated');
    expect(dep.successor?.id).toBe(fork.id);
    expect(dep.manifest?.successor).toBe('cash-flow-write-up-marcus');
    await expect(lib.patch(ORG_ID, priya, created.id, { name: 'x' })).rejects.toThrow(/Deprecated skills cannot be edited/);
    await expect(lib.deprecate(ORG_ID, marcus, 'advisor-meeting-prep')).rejects.toThrow(/owner or a champion/);
  });

  it('assignments list and upsert with drift', async () => {
    const list = await lib.listAssignments(ORG_ID, teamIds.fp);
    expect(list.map((a) => a.plugin).sort()).toEqual(['fp-meeting-prep', 'shared']);
    expect(list.every((a) => a.drift === false && a.intendedMode === 'available')).toBe(true);
    const put = await lib.putAssignment(ORG_ID, daniel, { plugin: 'fp-meeting-prep', teamId: teamIds.fp, intendedMode: 'auto' });
    expect(put).toMatchObject({ plugin: 'fp-meeting-prep', team: { id: teamIds.fp }, intendedMode: 'auto', drift: false });
    await repos.assignments.update({ orgId: ORG_ID, plugin: 'fp-meeting-prep', teamId: teamIds.fp }, { observedMode: 'hidden' });
    expect((await lib.listAssignments(ORG_ID, teamIds.fp)).find((a) => a.plugin === 'fp-meeting-prep')!.drift).toBe(true);
    await expect(lib.putAssignment(ORG_ID, daniel, { plugin: 'x', teamId: randomUUID(), intendedMode: 'auto' })).rejects.toThrow(/Team not found/);
  });
});
