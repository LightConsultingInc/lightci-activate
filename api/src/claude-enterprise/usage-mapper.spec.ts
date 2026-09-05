import type { AnalyticsUserActivity } from './types';
import {
  centsToUsd,
  claudeCodeToolActions,
  mapUserActivityToUsageMetrics,
  toDailyUserMetric,
} from './usage-mapper';

const zeroTool = { accepted_count: 0, rejected_count: 0 };

function record(
  overrides: Partial<AnalyticsUserActivity> = {},
): AnalyticsUserActivity {
  return {
    user: {
      id: 'user_01AbC',
      email_address: 'user1@example.com',
      type: 'user',
    },
    rbac_group_id: null,
    rbac_group_name: null,
    web_search_count: 0,
    chat_metrics: {
      message_count: 0,
      connectors_used_count: 0,
      distinct_connectors_used_count: 0,
      distinct_conversation_count: 0,
      distinct_files_uploaded_count: 0,
      distinct_projects_created_count: 0,
      distinct_projects_used_count: 0,
      distinct_shared_artifacts_viewed_count: 0,
      distinct_artifacts_created_count: 0,
      distinct_skills_used_count: 0,
      shared_conversations_viewed_count: 0,
      thinking_message_count: 0,
    },
    claude_code_metrics: {
      core_metrics: {
        distinct_session_count: 0,
        artifacts_created_count: 0,
        commit_count: 0,
        pull_request_count: 0,
        lines_of_code: { added_count: 0, removed_count: 0 },
      },
      tool_actions: {
        edit_tool: zeroTool,
        multi_edit_tool: zeroTool,
        write_tool: zeroTool,
        notebook_edit_tool: zeroTool,
      },
    },
    cowork_metrics: {
      message_count: 0,
      action_count: 0,
      connectors_used_count: 0,
      distinct_connectors_used_count: 0,
      skills_used_count: 0,
      distinct_skills_used_count: 0,
      distinct_session_count: 0,
      dispatch_turn_count: 0,
      artifacts_created_count: 0,
    },
    office_metrics: {},
    science_metrics: {
      message_count: 0,
      distinct_session_count: 0,
      skills_used_count: 0,
      delegation_count: 0,
      remote_compute_job_count: 0,
    },
    ...overrides,
  };
}

describe('mapUserActivityToUsageMetrics', () => {
  it('maps an all-zero record to inactive', () => {
    const m = mapUserActivityToUsageMetrics(record());
    expect(m).toEqual({
      messages: 0,
      codeSessions: 0,
      coworkSessions: 0,
      projectsUsed: 0,
      filesUploaded: 0,
      skillActivations: 0,
      connectorsUsed: 0,
      activeOnRealWork: false,
    });
    expect('codeSpendUsd' in m).toBe(false);
  });

  it('a single chat message counts as active on real work', () => {
    const m = mapUserActivityToUsageMetrics(
      record({ chat_metrics: { message_count: 1 } }),
    );
    expect(m.messages).toBe(1);
    expect(m.activeOnRealWork).toBe(true);
  });

  it('a Claude Code session without tool use or git activity is not active', () => {
    const rec = record();
    rec.claude_code_metrics!.core_metrics!.distinct_session_count = 2;
    const m = mapUserActivityToUsageMetrics(rec);
    expect(m.codeSessions).toBe(2);
    expect(m.activeOnRealWork).toBe(false);
  });

  it('Claude Code tool use makes the user active even when session count is null (group-scoped)', () => {
    const rec = record();
    rec.claude_code_metrics!.core_metrics!.distinct_session_count = null;
    rec.claude_code_metrics!.tool_actions!.edit_tool = {
      accepted_count: 3,
      rejected_count: 1,
    };
    expect(claudeCodeToolActions(rec)).toBe(4);
    const m = mapUserActivityToUsageMetrics(rec);
    expect(m.codeSessions).toBe(0);
    expect(m.activeOnRealWork).toBe(true);
  });

  it('git activity alone (a commit) counts as active', () => {
    const rec = record();
    rec.claude_code_metrics!.core_metrics!.commit_count = 1;
    expect(mapUserActivityToUsageMetrics(rec).activeOnRealWork).toBe(true);
  });

  it('a Cowork session with actions is active; without actions or messages it is not', () => {
    const idle = record();
    idle.cowork_metrics!.distinct_session_count = 1;
    expect(mapUserActivityToUsageMetrics(idle).coworkSessions).toBe(1);
    expect(mapUserActivityToUsageMetrics(idle).activeOnRealWork).toBe(false);

    const busy = record();
    busy.cowork_metrics!.distinct_session_count = 1;
    busy.cowork_metrics!.action_count = 5;
    expect(mapUserActivityToUsageMetrics(busy).activeOnRealWork).toBe(true);
  });

  it('sums skills and connectors across chat, cowork, office and science', () => {
    const rec = record({
      chat_metrics: {
        message_count: 2,
        connectors_used_count: 3,
        distinct_skills_used_count: 1,
        distinct_projects_used_count: 2,
        distinct_files_uploaded_count: 4,
      },
      office_metrics: {
        excel: {
          connectors_used_count: 1,
          distinct_connectors_used_count: 1,
          skills_used_count: 2,
          distinct_skills_used_count: 1,
          message_count: 1,
          distinct_session_count: 1,
        },
        word: {
          connectors_used_count: 0,
          distinct_connectors_used_count: 0,
          skills_used_count: 1,
          distinct_skills_used_count: 1,
          message_count: 0,
          distinct_session_count: 0,
        },
      },
    });
    rec.cowork_metrics!.skills_used_count = 4;
    rec.cowork_metrics!.connectors_used_count = 2;
    rec.science_metrics!.skills_used_count = 1;
    const m = mapUserActivityToUsageMetrics(rec);
    expect(m.skillActivations).toBe(4 + 1 + 2 + 1 + 1);
    expect(m.connectorsUsed).toBe(3 + 2 + 1);
    expect(m.projectsUsed).toBe(2);
    expect(m.filesUploaded).toBe(4);
  });

  it('treats null metric values as zero and tolerates missing blocks', () => {
    const rec: AnalyticsUserActivity = {
      user: {
        id: 'user_01Zz',
        email_address: 'user2@example.com',
        type: 'user',
      },
      chat_metrics: {
        message_count: 1,
        distinct_projects_used_count: null,
        distinct_files_uploaded_count: null,
      },
    };
    const m = mapUserActivityToUsageMetrics(rec);
    expect(m).toMatchObject({
      messages: 1,
      projectsUsed: 0,
      filesUploaded: 0,
      codeSessions: 0,
      coworkSessions: 0,
      activeOnRealWork: true,
    });
  });

  it('attaches codeSpendUsd from a cents string', () => {
    const m = mapUserActivityToUsageMetrics(record(), '41280.000000');
    expect(m.codeSpendUsd).toBe(412.8);
    expect(centsToUsd('abc')).toBeUndefined();
    expect(centsToUsd(null)).toBeUndefined();
    expect(centsToUsd(150)).toBe(1.5);
  });
});

describe('toDailyUserMetric', () => {
  it('carries user, day and group through', () => {
    const d = toDailyUserMetric(
      record({
        rbac_group_id: 'rbac_group_01X',
        rbac_group_name: 'Engineering',
      }),
      '2026-09-01',
    );
    expect(d).toMatchObject({
      userId: 'user_01AbC',
      email: 'user1@example.com',
      day: '2026-09-01',
      groupId: 'rbac_group_01X',
      groupName: 'Engineering',
    });
    expect(d.metrics.activeOnRealWork).toBe(false);
  });
});
