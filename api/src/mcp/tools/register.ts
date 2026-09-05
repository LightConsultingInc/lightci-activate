/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- REST payloads are forwarded as untyped JSON (three renderers, one payload) */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import {
  APP_RESOURCE_URI,
  type McpCaller,
  type RestResult,
  type ToolEnvelope,
  type ToolName,
  toolError,
  viewerOf,
  webUrl,
} from '../context';
import type { McpService } from '../mcp.service';
import { frontmatter, slugify } from './helpers';
import {
  renderError,
  renderInterview,
  renderLadder,
  renderLibrary,
  renderOrg,
  renderPromotionQueue,
  renderSkillDetail,
  renderSubmitArtifact,
  renderSubmitSkill,
  renderTeam,
} from './render';

type Obj = Record<string, any>;
type Rest = <T = Obj>(
  path: string,
  method?: string,
  body?: unknown,
) => Promise<RestResult<T>>;

const ui = { ui: { resourceUri: APP_RESOURCE_URI } };

function envelope<T>(
  tool: ToolName,
  caller: McpCaller,
  data: T | null,
  web: string,
  input?: Record<string, unknown>,
  error?: ToolEnvelope['error'],
): ToolEnvelope<T> {
  const rung =
    (data as Obj | null)?.rung ?? (data as Obj | null)?.person?.rung ?? null;
  const env: ToolEnvelope<T> = {
    tool,
    data,
    links: { web },
    viewer: viewerOf(caller.person, typeof rung === 'number' ? rung : null),
    input,
  };
  if (error) env.error = error;
  return env;
}

function ok(text: string, structuredContent: ToolEnvelope): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    structuredContent: structuredContent as unknown as Record<string, unknown>,
  };
}

function failed(
  tool: ToolName,
  caller: McpCaller,
  res: RestResult,
  web: string,
  input?: Record<string, unknown>,
): CallToolResult {
  const err = toolError(res);
  return {
    content: [{ type: 'text', text: renderError(tool, err) }],
    structuredContent: envelope(
      tool,
      caller,
      null,
      web,
      input,
      err,
    ) as unknown as Record<string, unknown>,
    isError: true,
  };
}

function query(params: Record<string, unknown>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
    )
    .join('&');
  return q ? `?${q}` : '';
}

export function registerTools(
  mcpServer: McpServer,
  caller: McpCaller,
  mcp: McpService,
) {
  // ext-apps types the server against the SDK ESM build; the API compiles to CJS, so the nominal types differ.
  const server = mcpServer as unknown as Parameters<typeof registerAppTool>[0];
  const rest: Rest = (path, method = 'GET', body) =>
    mcp.callRest(caller, path, method, body);

  registerAppTool(
    server,
    'my_ladder',
    {
      title: 'My ladder',
      description:
        "The caller's place on the Activate ladder (L0 Orientation … L5 Champion): rung, progress to the next rung and which gates are met, the next exercise Coach has queued, revisits due, hours back vs baseline, judgement and recent grades. " +
        'Call this first whenever the user asks "what\'s next", "what should I work on", "how am I doing", or at the start of a coaching conversation. Read-only. ' +
        'Speak to the person in the second person and lead with the next action; never paste ids.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: ui,
    },
    async () => {
      const web = webUrl('/');
      const res = await rest('/ladder/me');
      if (res.status >= 400) return failed('my_ladder', caller, res, web);
      return ok(
        renderLadder(res.body),
        envelope('my_ladder', caller, res.body, web),
      );
    },
  );

  registerAppTool(
    server,
    'library',
    {
      title: 'Skill library',
      description:
        "Browse the organisation's governed skill library: each skill's trigger line, owner, team, version, grade, boundary badge (green/amber/red), active users in the last 30 days and whether the caller has adopted it. " +
        'Use for "show the library", "what skills does my team have", "is there a skill for X". Read-only; adopting or forking happens in the card or via skill_detail follow-ups. ' +
        'Summarise the top matches by name and trigger line; do not list ids.',
      inputSchema: {
        team: z
          .string()
          .optional()
          .describe(
            'Team name or team id to filter by. Omit for the whole organisation. Use the caller\'s own team when they say "my team".',
          ),
        workflow: z
          .string()
          .optional()
          .describe(
            'Workflow name or id: only skills linked to that workflow. Also matched against trigger lines as free text.',
          ),
        rung: z
          .number()
          .int()
          .min(0)
          .max(5)
          .optional()
          .describe(
            "Only skills whose required rung is at or below this level (0–5). Use the caller's rung from my_ladder when they ask what they can use now.",
          ),
        q: z
          .string()
          .optional()
          .describe('Free-text search over name and trigger line.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: ui,
    },
    async (args) => {
      const input = { ...args } as Record<string, unknown>;
      const web = webUrl(
        `/library${query({ team: args.team, rung: args.rung, q: args.q ?? args.workflow })}`,
      );
      const res = await rest(
        `/library${query({ team: args.team, workflow: args.workflow, rung: args.rung, q: args.q })}`,
      );
      if (res.status >= 400) return failed('library', caller, res, web, input);
      return ok(
        renderLibrary(res.body, input),
        envelope('library', caller, res.body, web, input),
      );
    },
  );

  registerAppTool(
    server,
    'skill_detail',
    {
      title: 'Skill detail',
      description:
        'One skill in full: rendered SKILL.md, compliance boundary declaration, version timeline with grades and approvers, usage by team, adopters, comments and any open promotion. ' +
        'Use when the user names a skill or picks one from the library. Read-only. When quoting SKILL.md, quote the relevant section rather than the whole file.',
      inputSchema: {
        slug: z
          .string()
          .min(1)
          .describe(
            'The skill slug as shown by `library` (e.g. "advisor-meeting-prep"). A skill id also works.',
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: ui,
    },
    async ({ slug }) => {
      const input = { slug };
      const web = webUrl(`/library/${encodeURIComponent(slug)}`);
      const res = await rest(`/skills/${encodeURIComponent(slug)}`);
      if (res.status >= 400)
        return failed('skill_detail', caller, res, web, input);
      return ok(
        renderSkillDetail(res.body),
        envelope('skill_detail', caller, res.body, web, input),
      );
    },
  );

  registerAppTool(
    server,
    'submit_skill',
    {
      title: 'Submit skill for grading',
      description:
        'WRITES: creates (or updates) a draft skill in the library from the SKILL.md drafted in this conversation and runs the Grader immediately, returning a grade card (score, decision pass/revise/fail, rubric, feedback, security findings). ' +
        'Call this only after the user has explicitly confirmed they want to submit ("submit it", "grade my skill", "send it to the Grader"); drafting, reviewing or discussing a skill is not confirmation. ' +
        'Before calling, make sure the SKILL.md has frontmatter (name, description), the boundary declaration is filled in honestly, and there are at least three sample cases (should trigger / should not / ambiguous). ' +
        'After the result, relay the decision and feedback; offer "revise" or, on a pass, "request promotion". Never invent a grade.',
      inputSchema: {
        skill_md: z
          .string()
          .min(20)
          .describe(
            'Full SKILL.md content including YAML frontmatter (name, description). Exactly what the user approved; do not rewrite it on the way in.',
          ),
        sample_cases: z
          .array(
            z.looseObject({
              input: z
                .string()
                .describe('A realistic user request or situation.'),
              expected: z
                .enum(['should_trigger', 'should_not_trigger', 'ambiguous'])
                .describe('Whether this skill should activate for that input.'),
              note: z.string().optional().describe('Why, in one line.'),
            }),
          )
          .min(1)
          .describe(
            'Author-supplied trigger cases. Include at least one should_trigger, one should_not_trigger and one ambiguous case.',
          ),
        boundary: z
          .looseObject({
            readsDataClasses: z
              .array(z.string())
              .optional()
              .describe(
                'Data classes the skill reads (e.g. "client PII", "account balances"). Be exhaustive; the compliance check compares this to the org boundary.',
              ),
            mustNeverReceive: z
              .array(z.string())
              .optional()
              .describe('Data classes the skill must never be given.'),
            humanReview: z
              .array(z.string())
              .optional()
              .describe(
                'Points where a human must review before output is used (e.g. "before sending to client"). Non-empty turns the badge amber.',
              ),
            systemsReadOnly: z
              .array(z.string())
              .optional()
              .describe('Systems the skill may read but never write.'),
          })
          .describe(
            'Compliance boundary declaration. Ask the user for anything you cannot infer from the conversation; do not guess restricted data classes.',
          ),
        slug: z
          .string()
          .optional()
          .describe(
            'Existing skill slug to update (creates a new version). Omit to create a new draft; a slug is derived from the name.',
          ),
        name: z
          .string()
          .optional()
          .describe('Display name. Defaults to frontmatter `name`.'),
        trigger_line: z
          .string()
          .optional()
          .describe(
            'One-line "use when…" trigger. Defaults to frontmatter `description`.',
          ),
        workflow_map_id: z
          .string()
          .optional()
          .describe(
            'Workflow this skill implements, if it came out of map_workflow.',
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: ui,
    },
    async (args) => {
      const input = { slug: args.slug, name: args.name } as Record<
        string,
        unknown
      >;
      const fm = frontmatter(args.skill_md);
      const name = args.name ?? fm.name ?? 'Untitled skill';
      const triggerLine = args.trigger_line ?? fm.description ?? '';
      const web = webUrl('/library');

      let skillRes: RestResult<Obj>;
      if (args.slug) {
        const existing = await rest(`/skills/${encodeURIComponent(args.slug)}`);
        if (existing.status >= 400)
          return failed('submit_skill', caller, existing, web, input);
        skillRes = await rest(`/skills/${existing.body.id}`, 'PATCH', {
          skillMd: args.skill_md,
          triggerLine,
          boundary: args.boundary,
          sampleCases: args.sample_cases,
          name,
        });
      } else {
        skillRes = await rest('/skills', 'POST', {
          name,
          slug: slugify(name),
          triggerLine,
          skillMd: args.skill_md,
          boundary: args.boundary,
          sampleCases: args.sample_cases,
          workflowMapId: args.workflow_map_id,
        });
      }
      if (skillRes.status >= 400)
        return failed('submit_skill', caller, skillRes, web, input);
      const skill = skillRes.body;
      const gradeRes = await rest(`/skills/${skill.id}/grade`, 'POST', {});
      const skillWeb = webUrl(
        `/library/${encodeURIComponent(skill.slug ?? skill.id)}`,
      );
      if (gradeRes.status >= 400) {
        const err = toolError(gradeRes);
        const data = { skill, grade: null };
        return {
          content: [
            {
              type: 'text',
              text: `${renderSubmitSkill(data)}\nGrading failed: ${err.detail}`,
            },
          ],
          structuredContent: envelope(
            'submit_skill',
            caller,
            data,
            skillWeb,
            input,
            err,
          ) as unknown as Record<string, unknown>,
          isError: true,
        };
      }
      const data = {
        skill: gradeRes.body.skill ?? skill,
        grade: gradeRes.body.grade ?? gradeRes.body,
      };
      return ok(
        renderSubmitSkill(data),
        envelope('submit_skill', caller, data, skillWeb, input),
      );
    },
  );

  registerAppTool(
    server,
    'submit_artifact',
    {
      title: 'Submit exercise artifact',
      description:
        "WRITES: submits the user's work on a Coach exercise and grades it synchronously (Grader rubric + calibration of their stated expectation and critique), updates mastery, schedules revisits and may promote them a rung. " +
        'Call only after the user explicitly says to submit. Coach sequence before calling: (1) the user states what they expect the output to achieve and how confident they are, (2) they run/produce the artifact, (3) they critique it themselves. Do not write the critique for them; hints before answers. ' +
        'Relay the grade, feedback and teaching moment, then the next exercise if one was queued.',
      inputSchema: {
        exercise_id: z
          .string()
          .min(1)
          .describe(
            'The exercise being submitted, from my_ladder `nextUp.id` or `queued[].id`. Do not show this id to the user.',
          ),
        expectation: z
          .string()
          .min(1)
          .describe(
            "The user's own prediction, stated before running, of what a good result looks like.",
          ),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .describe(
            'Their confidence in that expectation, 0–1 (0.7 = "fairly sure"). Ask if not stated.',
          ),
        artifact: z
          .looseObject({
            kind: z
              .enum(['text', 'prompt', 'project', 'skill', 'document', 'link'])
              .describe('What the artifact is.'),
            title: z.string().optional(),
            content: z
              .string()
              .optional()
              .describe(
                'The artifact itself (text/markdown), or a summary if it is a link/document.',
              ),
            url: z.string().optional(),
          })
          .describe(
            'The work product. Include the actual content whenever it is text.',
          ),
        critique: z
          .string()
          .min(1)
          .describe(
            "The user's own critique of the artifact against their expectation: what held, what missed, what they would change.",
          ),
        cold_attempt: z
          .boolean()
          .optional()
          .describe(
            'True if they attempted before seeing any hint or worked example (default true when no hints were revealed).',
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: ui,
    },
    async (args) => {
      const input = { exercise_id: args.exercise_id } as Record<
        string,
        unknown
      >;
      const web = webUrl(`/exercise/${encodeURIComponent(args.exercise_id)}`);
      const res = await rest(
        `/exercises/${encodeURIComponent(args.exercise_id)}/submit`,
        'POST',
        {
          expectationText: args.expectation,
          expectationConfidence: args.confidence,
          artifact: args.artifact,
          critiqueText: args.critique,
          coldAttempt: args.cold_attempt ?? true,
        },
      );
      if (res.status >= 400)
        return failed('submit_artifact', caller, res, web, input);
      return ok(
        renderSubmitArtifact(res.body),
        envelope('submit_artifact', caller, res.body, web, input),
      );
    },
  );

  registerAppTool(
    server,
    'map_workflow',
    {
      title: 'Map a workflow (Interviewer)',
      description:
        "Multi-turn Interviewer that maps one of the user's recurring workflows into a WorkflowMap (steps, systems, inputs/outputs, time per run, runs per week, pain points, sensitivities) while a scribe card fills in. " +
        "First call: omit interview_id and pass the user's opening description as message; the result includes the interview id and the next question. Every later turn: pass that interview_id back with the user's answer. " +
        'Ask exactly the returned nextQuestion (you may soften wording), one question per turn, and do not answer for the user. When completeness reaches 0.85 or the interviewer proposes finishing, ask the user if they want to finish; call again with finish=true only after they agree. Never show the interview id.',
      inputSchema: {
        interview_id: z
          .string()
          .optional()
          .describe(
            'Interview id from the previous map_workflow result. Omit on the first turn only.',
          ),
        message: z
          .string()
          .min(1)
          .describe(
            "The user's latest answer or opening description, verbatim or lightly cleaned. Not your paraphrase.",
          ),
        mode: z
          .enum(['workflow', 'intake', 'champion'])
          .optional()
          .describe(
            "Interview mode for the first turn. Default workflow. Use intake for a new learner's onboarding, champion for a team lead mapping the team.",
          ),
        team_id: z.string().optional().describe('Team id for champion mode.'),
        finish: z
          .boolean()
          .optional()
          .describe(
            'Set true only when the user has agreed to finish; completes the interview and writes the workflow map.',
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: ui,
    },
    async (args) => {
      const web = webUrl('/workflows');
      let interviewId = args.interview_id;
      if (!interviewId) {
        const created = await rest('/interviews', 'POST', {
          mode: args.mode ?? 'workflow',
          teamId: args.team_id,
        });
        if (created.status >= 400)
          return failed('map_workflow', caller, created, web, {
            mode: args.mode,
          });
        interviewId = created.body.id as string;
      }
      const input = {
        interview_id: interviewId,
        finish: args.finish,
      } as Record<string, unknown>;
      const turn = await rest(
        `/interviews/${encodeURIComponent(interviewId)}/turns`,
        'POST',
        { content: args.message },
      );
      if (turn.status >= 400)
        return failed('map_workflow', caller, turn, web, input);
      let data: Obj = turn.body;
      let text = renderInterview(data);
      if (args.finish) {
        const done = await rest(
          `/interviews/${encodeURIComponent(interviewId)}/complete`,
          'POST',
          {},
        );
        if (done.status >= 400)
          return failed('map_workflow', caller, done, web, input);
        data = { ...(done.body.interview ?? data), completion: done.body };
        const maps = Array.isArray(done.body.workflowMapIds)
          ? done.body.workflowMapIds.length
          : 0;
        const exercises = Array.isArray(done.body.exercises)
          ? done.body.exercises.length
          : 0;
        text = `Interview complete: ${maps} workflow map${maps === 1 ? '' : 's'} written${done.body.placement ? `, placed at ${done.body.placement.rung !== undefined ? `L${done.body.placement.rung}` : 'the ladder'}` : ''}${
          exercises
            ? `, ${exercises} exercise${exercises === 1 ? '' : 's'} queued`
            : ''
        }.`;
      }
      return ok(text, envelope('map_workflow', caller, data, web, input));
    },
  );

  registerAppTool(
    server,
    'team',
    {
      title: 'Team (champion view)',
      description:
        "The champion's team: roster with activity, hours back, stalled flags and overdue revisits; backlog top workflows; the review queue of submissions awaiting a human grade; pending promotions; team skill library; headline stats. " +
        'Use for "show my team", "who is stalled", "what needs review". Read-only; approvals happen in the card or via promotion_queue. Refer to people by name.',
      inputSchema: {
        team_id: z
          .string()
          .optional()
          .describe(
            "Team id (leads/sponsors viewing another team). Omit for the caller's own team.",
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: ui,
    },
    async ({ team_id }) => {
      const input = { team_id } as Record<string, unknown>;
      const web = webUrl('/team');
      const res = await rest(`/team${query({ teamId: team_id })}`);
      if (res.status >= 400) return failed('team', caller, res, web, input);
      return ok(
        renderTeam(res.body),
        envelope('team', caller, res.body, web, input),
      );
    },
  );

  registerAppTool(
    server,
    'org',
    {
      title: 'Organisation (sponsor view)',
      description:
        'Mission Control summary for sponsors and admins: adoption (active % of seats, trend), people (rising, stalled, champion candidates), groups (per-team activity and skills) and cost (per active seat, inactive spend, ROI on hours back). ' +
        'Use for "how is the programme going", "adoption", "cost", "which teams". Read-only; deep dives open in the Activate web app.',
      inputSchema: {
        range: z
          .enum(['30d', '90d'])
          .optional()
          .describe('Adoption window. Default 30d.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: ui,
    },
    async ({ range }) => {
      const input = { range } as Record<string, unknown>;
      const web = webUrl('/mission-control');
      const [org, adoption, people, groups, cost] = await Promise.all([
        rest('/org'),
        rest(`/mc/adoption${query({ range })}`),
        rest('/mc/people'),
        rest('/mc/groups'),
        rest('/mc/cost'),
      ]);
      if (org.status >= 400) return failed('org', caller, org, web, input);
      const pick = (r: RestResult<Obj>) => (r.status < 400 ? r.body : null);
      const data = {
        org: org.body,
        adoption: pick(adoption),
        people: pick(people),
        groups: pick(groups),
        cost: pick(cost),
      };
      return ok(renderOrg(data), envelope('org', caller, data, web, input));
    },
  );

  registerAppTool(
    server,
    'promotion_queue',
    {
      title: 'Promotion queue',
      description:
        'Pending skill promotions awaiting approval (champion / compliance / lead): for each, the diff summary, Grader result, boundary check, exposure tier, approvals so far and required approver roles. ' +
        'Without `action` this is read-only. With `action` it WRITES a decision on `promotion_id`: use it only after the user has explicitly said to approve or send back that specific skill; listing or discussing the queue is not approval. ' +
        'Present each item by skill name and version; never show ids.',
      inputSchema: {
        state: z
          .enum(['pending', 'all'])
          .optional()
          .describe('Which promotions to list. Default pending.'),
        promotion_id: z
          .string()
          .optional()
          .describe(
            'The promotion to act on (from a previous promotion_queue result). Required when action is set.',
          ),
        action: z
          .enum(['approve', 'send_back'])
          .optional()
          .describe(
            'Decision to record. Only pass this when the user has said, in their own words, to approve or send back this exact skill in this turn (e.g. "approve the RMD letter skill"). Never infer approval from silence or from a general "looks good".',
          ),
        note: z
          .string()
          .optional()
          .describe(
            'Reviewer note. Required for send_back: the concrete change the author must make. Optional for approve.',
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: ui,
    },
    async (args) => {
      const input = {
        state: args.state,
        promotion_id: args.promotion_id,
        action: args.action,
      } as Record<string, unknown>;
      const web = webUrl('/promotions');
      let acted: Obj | undefined;
      if (args.action) {
        if (!args.promotion_id) {
          return {
            content: [
              {
                type: 'text',
                text: 'promotion_id is required with action. List the queue first and ask the user which skill to decide on.',
              },
            ],
            isError: true,
          };
        }
        if (args.action === 'send_back' && !args.note?.trim()) {
          return {
            content: [
              {
                type: 'text',
                text: 'A note is required to send a promotion back: ask the user what the author must change.',
              },
            ],
            isError: true,
          };
        }
        const decision = await rest(
          `/promotions/${encodeURIComponent(args.promotion_id)}/${args.action === 'approve' ? 'approve' : 'send-back'}`,
          'POST',
          { note: args.note },
        );
        if (decision.status >= 400)
          return failed('promotion_queue', caller, decision, web, input);
        acted = decision.body;
      }
      const listRes = await rest<Obj[]>(
        `/promotions${query({ state: args.state ?? 'pending' })}`,
      );
      if (listRes.status >= 400)
        return failed('promotion_queue', caller, listRes, web, input);
      const data = {
        promotions: Array.isArray(listRes.body) ? listRes.body : [],
        acted,
      };
      return ok(
        renderPromotionQueue(data),
        envelope('promotion_queue', caller, data, web, input),
      );
    },
  );

  // App-only broker: the MCP App fetches and mutates through this, as the calling person. Hidden from the model.
  registerAppTool(
    server,
    'activate_api',
    {
      title: 'Activate API broker (app only)',
      description:
        'Internal: proxies a REST call to the Activate API as the authenticated person. Used by the Activate card UI; not for direct model use.',
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe(
            'REST path relative to /api, e.g. /ladder/me or /skills/<id>/adopt. May include a query string.',
          ),
        method: z
          .enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE'])
          .optional()
          .describe('HTTP method. Default GET.'),
        body: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('JSON body for write methods.'),
      },
      _meta: { ui: { resourceUri: APP_RESOURCE_URI, visibility: ['app'] } },
    },
    async ({ path, method, body }) => {
      if (!path.startsWith('/') || path.includes('..') || /^\/\//.test(path)) {
        return {
          content: [{ type: 'text', text: 'Invalid path' }],
          structuredContent: {
            status: 400,
            contentType: 'application/json',
            body: { status: 400, title: 'Bad Request', detail: 'Invalid path' },
          },
          isError: true,
        };
      }
      const res = await rest(path, method ?? 'GET', body);
      return {
        content: [
          {
            type: 'text',
            text:
              typeof res.body === 'string'
                ? res.body
                : JSON.stringify(res.body),
          },
        ],
        structuredContent: {
          status: res.status,
          contentType: res.contentType,
          body: res.body,
        },
        isError: res.status >= 400,
      };
    },
  );
}
