/**
 * Nightly pull from the Claude Enterprise Analytics API into UsageSnapshot / SkillUsage,
 * per org that has a verified `claude_analytics` key. Skips silently when unconfigured.
 * Also exposed as `POST /org/sync-analytics` for admins (runs now, returns counts).
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ClaudeEnterpriseService,
  addDays,
} from '../claude-enterprise/claude-enterprise.service';
import type { ClaudeKeys } from '../claude-enterprise/types';
import { isoDay } from '../common/dates';
import { Org } from '../orgs/entities/org.entity';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { IntegrationsService } from '../orgs/integrations.service';
import { settingsOf, type GovernedOrgSettings } from '../orgs/org-settings';
import { Skill } from '../skills/entities/skill.entity';
import { SkillUsage } from '../skills/entities/skill-usage.entity';
import { UsageSnapshot } from './entities/usage-snapshot.entity';

export interface SyncResult {
  orgId: string;
  skipped: boolean;
  reason?: string;
  range?: { from: string; to: string };
  usage: {
    records: number;
    upserted: number;
    unmatchedEmails: number;
    skippedDays: string[];
  };
  skills: { rows: number; upserted: number; unmatched: string[] };
  groups: { seen: number; linked: number };
  errors: string[];
}

export function slugOf(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class AnalyticsSyncService {
  private readonly logger = new Logger(AnalyticsSyncService.name);

  constructor(
    private readonly claude: ClaudeEnterpriseService,
    private readonly integrations: IntegrationsService,
    @InjectRepository(Org) private readonly orgs: Repository<Org>,
    @InjectRepository(Person) private readonly people: Repository<Person>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(Skill) private readonly skills: Repository<Skill>,
    @InjectRepository(SkillUsage)
    private readonly skillUsage: Repository<SkillUsage>,
    @InjectRepository(UsageSnapshot)
    private readonly usage: Repository<UsageSnapshot>,
  ) {}

  /** 03:15 UTC daily: the Analytics API publishes a day around 17:00 UTC the day after, so the last 3 days catch up any lag. */
  @Cron('15 3 * * *', { name: 'analytics-sync' })
  async nightly() {
    const orgs = await this.orgs.find();
    for (const org of orgs) {
      try {
        const r = await this.syncOrg(org.id);
        if (!r.skipped)
          this.logger.log(
            `Synced ${org.slug}: ${r.usage.upserted} usage rows, ${r.skills.upserted} skill rows`,
          );
      } catch (error) {
        this.logger.error(
          `Sync failed for ${org.slug}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private async keysFor(
    orgId: string,
  ): Promise<{ keys: ClaudeKeys; analyticsVerified: boolean }> {
    const list = await this.integrations.list(orgId);
    const analytics = list.find((i) => i.kind === 'claude_analytics');
    const analyticsVerified = Boolean(
      analytics?.configured &&
      (analytics.status === 'verified' || analytics.source === 'platform'),
    );
    const [a, ad] = await Promise.all([
      this.integrations.resolve(orgId, 'claude_analytics'),
      this.integrations.resolve(orgId, 'claude_admin'),
    ]);
    return {
      keys: { analytics: a?.secret, admin: ad?.secret },
      analyticsVerified,
    };
  }

  async syncOrg(orgId: string, days = 3): Promise<SyncResult> {
    const result: SyncResult = {
      orgId,
      skipped: false,
      usage: { records: 0, upserted: 0, unmatchedEmails: 0, skippedDays: [] },
      skills: { rows: 0, upserted: 0, unmatched: [] },
      groups: { seen: 0, linked: 0 },
      errors: [],
    };
    const { keys, analyticsVerified } = await this.keysFor(orgId);
    if (!keys.analytics || !analyticsVerified)
      return {
        ...result,
        skipped: true,
        reason: keys.analytics
          ? 'claude_analytics key not verified'
          : 'no claude_analytics key configured',
      };

    const to = addDays(isoDay(), -1);
    const from = addDays(to, -(days - 1));
    result.range = { from, to };
    const people = await this.people.find({ where: { orgId } });
    const byClaudeId = new Map(
      people.filter((p) => p.claudeUserId).map((p) => [p.claudeUserId!, p]),
    );
    const byEmail = new Map(people.map((p) => [p.email.toLowerCase(), p]));

    // 1. Per-user daily metrics → UsageSnapshot
    try {
      const metrics = await this.claude.dailyUserMetrics(keys, { from, to });
      result.usage.records = metrics.records.length;
      result.usage.skippedDays = metrics.skippedDays.map((d) => d.day);
      const unmatched = new Set<string>();
      for (const rec of metrics.records) {
        const person =
          byClaudeId.get(rec.userId) ?? byEmail.get(rec.email.toLowerCase());
        if (!person) {
          unmatched.add(rec.email.toLowerCase());
          continue;
        }
        if (!person.claudeUserId) {
          person.claudeUserId = rec.userId;
          await this.people.update(person.id, { claudeUserId: rec.userId });
          byClaudeId.set(rec.userId, person);
        }
        const existing = await this.usage.findOne({
          where: { personId: person.id, day: rec.day },
        });
        const row =
          existing ??
          this.usage.create({ orgId, personId: person.id, day: rec.day });
        row.metrics = rec.metrics;
        row.source = 'analytics_api';
        await this.usage.save(row);
        result.usage.upserted++;
        if (rec.metrics.activeOnRealWork) {
          const at = new Date(`${rec.day}T12:00:00Z`);
          if (!person.lastActiveAt || person.lastActiveAt < at) {
            person.lastActiveAt = at;
            await this.people.update(person.id, { lastActiveAt: at });
          }
        }
      }
      result.usage.unmatchedEmails = unmatched.size;
    } catch (error) {
      result.errors.push(
        `usage: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 2. Groups → Team.rbacGroupId (admin key needed)
    const teams = await this.teams.find({ where: { orgId } });
    if (keys.admin) {
      try {
        const groups = await this.claude.listGroups(keys);
        result.groups.seen = groups.length;
        for (const g of groups) {
          const team =
            teams.find((t) => t.rbacGroupId === g.id) ??
            teams.find(
              (t) =>
                !t.rbacGroupId &&
                (t.name.toLowerCase() === g.name.toLowerCase() ||
                  t.slug === slugOf(g.name)),
            );
          if (team && team.rbacGroupId !== g.id) {
            team.rbacGroupId = g.id;
            await this.teams.save(team);
            result.groups.linked++;
          }
        }
      } catch (error) {
        result.errors.push(
          `groups: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // 3. Skill usage → SkillUsage (aggregate per skill; per group when teams are linked)
    try {
      const skills = await this.skills.find({ where: { orgId } });
      const bySlug = new Map(skills.map((s) => [s.slug.toLowerCase(), s]));
      const byName = new Map(skills.map((s) => [s.name.toLowerCase(), s]));
      const match = (name: string) =>
        bySlug.get(slugOf(name)) ??
        bySlug.get(name.toLowerCase()) ??
        byName.get(name.toLowerCase()) ??
        null;
      const linkedTeams = teams.filter((t) => t.rbacGroupId);
      const scopes: { groupId?: string; team: Team | null }[] =
        linkedTeams.length
          ? linkedTeams.map((t) => ({ groupId: t.rbacGroupId!, team: t }))
          : [{ team: null }];
      for (const scope of scopes) {
        const rows = await this.claude.skillUsage(keys, {
          from,
          to,
          groupId: scope.groupId,
        });
        result.skills.rows += rows.length;
        for (const r of rows) {
          const skill = match(r.skillName);
          if (!skill) {
            if (!result.skills.unmatched.includes(r.skillName))
              result.skills.unmatched.push(r.skillName);
            continue;
          }
          // The Analytics /skills endpoint is aggregate (no per-user rows); the carrier person is the
          // team champion for group-scoped rows, else the skill owner. See docs/api-contract.md deviations.
          const carrier = scope.team?.championPersonId ?? skill.ownerPersonId;
          if (!carrier) continue;
          const existing = await this.skillUsage.findOne({
            where: { skillId: skill.id, personId: carrier, day: to },
          });
          const row =
            existing ??
            this.skillUsage.create({
              skillId: skill.id,
              personId: carrier,
              day: to,
            });
          row.teamId = scope.team?.id ?? skill.teamId ?? null;
          row.activations = r.usageCount;
          await this.skillUsage.save(row);
          result.skills.upserted++;
        }
      }
    } catch (error) {
      result.errors.push(
        `skills: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const org = await this.orgs.findOne({ where: { id: orgId } });
    if (org) {
      org.settings = {
        ...settingsOf(org),
        claudeAnalyticsConfigured: true,
        claudeAdminConfigured:
          Boolean(keys.admin) || settingsOf(org).claudeAdminConfigured,
        lastAnalyticsSyncAt: new Date().toISOString(),
      } as GovernedOrgSettings;
      await this.orgs.save(org);
    }
    return result;
  }
}
