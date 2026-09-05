# LightCI Activate — Product Spec (Draft v0.4)

*LightCI · September 2026*

## What it is

An AI-native activation and enablement platform for Claude Enterprise customers. LightCI runs the program; the platform does the work. Employees progress up a mastery-gated fluency ladder where every rung is passed by producing a graded artifact from their own work — an audited workflow, a passing skill, a shipped governed workflow — and the education is injected just-in-time inside those exercises rather than delivered as courses. One activation lead supervises many client engagements by exception, the way one engineer supervises many PRISM engagements.

## Why

Anthropic funnels LightCI activation and enablement leads. Today each engagement is trainer-led: interviews, slides, small-group sessions, office hours, a readout. The Mercer pilot ($25K, six weeks, two teams) shows the playbook works and that it does not scale — wave two costs the same as wave one. The boutique activation market runs the same five moves everywhere at $10–15K/month; vendor academies own generic curriculum; the Anthropic/Blackstone JV owns build-it-for-you. The open position is "make your people able to build and run it themselves, governed, and prove it" — Multiply Academy's philosophy inside enterprise controls.

## Who it's for

- **Employees** at PE-backed and enterprise clients on Claude Enterprise, in regulated and semi-regulated knowledge work (wealth, planning, ops, client service).
- **Sponsors** — the program owner and PE operating partner who need evidence to extend the program.
- **Champions** — named per team, who inherit the human layer after handover.
- **LightCI activation lead** — supervises the exception queue across clients.

## Design principles (from learning science, context engineering, knowledge engineering)

**Learning science → the ladder enforces judgement, not usage.** The durable findings are retrieval before re-exposure, spacing across days, deliberate practice with fast feedback, and desirable difficulty; they hold for working professionals, not just students. The AI-specific risk is cognitive offloading: performance rises with the aid present and falls without it, and unstructured AI use produces "metacognitive laziness." Blunt blocking hurts productivity; structured prompting, forced justification and intermittent retrieval preserve the benefit. Activate is therefore a delegation-training system: every rung forces the judgement step — predict before Claude runs, critique before accepting, write the prompt cold before Coach shows a worked example — and Coach gives hints before answers. This is also the mechanism that attacks the rework problem, and a claim nobody else in the activation market makes.

**Context engineering → what L2 and L3 teach, and what Grader checks.** Anthropic's framing: curate the optimal set of tokens, keep context informative but tight, use canonical examples rather than edge-case lists, prune tool sets. L1 is prompting; L2 is context engineering for one person (Projects, what to include and leave out); L3 is context engineering packaged for reuse (progressive disclosure, minimal triggers, canonical examples). Grader's rubric is Anthropic's published guidance turned into a checklist — a citable standard rather than an opinion.

**Knowledge engineering → what Interviewer is.** Tacit workflow knowledge fails loudly when an agent runs it, because the agent can't ask the clarifying question a new hire would. The field is converging on multi-agent guided interviews (assistant / scribe / knowledge-checker) writing into a schema-constrained specification, with a human verifying the summary because models lack an inherent logic check. Interviewer is built that way: it writes into a fixed workflow schema, and the champion is the human consistency check.

**How they fit.** Knowledge engineering extracts the workflow; context engineering compiles it into a skill; learning science is how the person acquires the judgement to do both without LightCI — and to keep doing their job well once Claude drafts. Design tension: the more efficient Activate makes someone at delegating, the more deliberately it must preserve their difficulty. Where that line sits per rung is an open design decision.

## The ladder

| Rung | Competency | Passing artifact |
|---|---|---|
| L0 Orientation | Which surface for what; the firm's usage policy and boundary; 4D frame | First finished piece of real work in session one |
| L1 Conversational | Prompting, discernment; predict-then-critique on every run | A graded draft on a real task, with the author's pre-run expectation and post-run critique recorded |
| L2 Context | Context engineering for one person: Projects, reusable context, what to include and leave out | A working Project that improves a repeated task, with a written rationale for what was included and excluded |
| L3 Skill | Context engineering for reuse: progressive disclosure, minimal triggers, canonical examples | A skill that passes the Grader rubric, written cold before seeing a worked example |
| L4 Workflow | Map a workflow and ship it governed | A workflow promoted through the compliance queue with a measured baseline |
| L5 Champion | Grade and review others | Reviews in the promotion queue; owns a team's backlog |

L0–L1 content adapts Anthropic's CC-licensed AI Fluency course. Advancement is gated on artifacts, never completion. Teaching happens inside the exercise: Coach sees a weak prompt and teaches Description on that prompt. Spacing is built in — earlier rungs' skills resurface as short retrieval exercises in later rungs, and Coach schedules revisits across days rather than in one sitting.

## Three layers of context

Every module is generated at run time, never authored generically.

1. **Company** — scoping-call transcripts, proposal, org chart, existing SOPs (Confluence via the first-party Atlassian connector). Seeds vocabulary, the compliance boundary, anchor workflows.
2. **Team** — the champion interview. Seeds the team's workflow inventory and priorities.
3. **Person** — intake conversation: what do you do, what are you responsible for, how do you use Claude now. Seeds the individual path and exercises.

A planner and an advisor at the same firm take the same L3 rung with different exercises.

## Agent roles

| Role | Does |
|---|---|
| Interviewer | Guided knowledge-elicitation interview (assistant / scribe / checker pattern) writing into a fixed workflow schema — inputs, steps, decisions, exceptions, systems touched, what must never leave; champion verifies the map |
| Scorer | Ranks workflows by value, hours, automation-readiness, compliance exposure; maintains the backlog |
| Builder | Drafts anchor skills from workflow map + firm context, with test cases and a boundary declaration |
| Coach | Runs the person through their own case with hints before answers; requires a stated expectation before each run and a critique after; grades output, generates the next exercise, schedules spaced revisits, teaches just-in-time, escalates what it can't unblock |
| Grader | LLM review of a submitted skill against a rubric — trigger clarity, scope, progressive disclosure, boundary declaration, canonical examples over edge-case lists, tight context, expected behaviour on the author's own sample cases — rubric derived from Anthropic's published context-engineering and skill-authoring guidance — returning a score, written feedback and a pass/revise decision; also a security review of the skill's contents (see Constraints) |
| Promoter | Checks boundary declaration and tests; packages a one-screen approval for human sign-off; on approval, merges to the client's marketplace repo |
| Auditor | Captures baselines before anything ships, measures hours returned on real work, drafts readouts |

Human work remaining: client compliance sign-off, escalations from Coach and Promoter, the executive relationship. Builder is the highest-risk role in a regulated firm; Grader, Promoter and human review are strict on its output from day one.

## Mission control

The org view of the same loop.

- **Skill library** — published, governed skills with owner, version history, boundary, test status, and measured usage. Doubles as discovery: the fastest path through L3 is adopting a teammate's skill.
- **Governance** — usage policy, compliance boundary, promotion queue, run logs.
- **Adoption** — active on real work (not logins), rung distribution, hours returned against baseline, stalled users; sliceable by team.
- **Backlog** — scored inventory of remaining workflows across teams; the input to the next wave and the next SOW.

Native Claude Enterprise has no promotion/approval workflow for shared skills, no versioning or rollback UI, no skill-contents inspection for admins, and no grouping of skills by team beyond plugin assignment. Those gaps are the cockpit. If Anthropic closes them, the durable part of Activate is the ladder, the measurement against baselines, and the backlog-to-SOW pipeline — not skill CRUD.

## Surfaces: Activate inside Claude (MCP App) first, web app second

Activate is a remote MCP server with MCP Apps UI. The same backend serves two hosts: Claude renders Activate's cards inline in the conversation ("show me my team's skills" → the library card; "what's next?" → the ladder card), and a standalone web app carries the heavy admin surfaces (provisioning, full Mission Control) and anyone not in Claude. This settles where the learner works: in Claude, with Activate appearing inside it — the tool they'll keep using after the program, not a separate LMS.

Tools and the cards they render:

| Tool | Who | Card |
|---|---|---|
| `my_ladder` | learner | rung, next exercise, revisits due, hours-back |
| `library` (filters: team, workflow, rung) | everyone | skill cards with usage, version, adopt / fork |
| `skill_detail` | everyone | SKILL.md, boundary, version history, who uses it |
| `submit_skill` | learner | takes the draft from the conversation → Grader → grade card inline with revise / request-promotion. Write the skill with Claude, submit without leaving. |
| `map_workflow` | learner, champion | Interviewer as a multi-turn tool; scribe card fills as they talk |
| `team` | champion | roster, backlog, review queue with approve actions |
| `org` | sponsor | adoption, people, groups, cost cards; drill-through opens web app |
| `promotion_queue` | champion, lead | one-screen approvals |

Coach ships as a skill in the client's marketplace plugin that calls these tools, so "Coach, what's next?" works in any chat.

Distribution: the connector is added once at org level by an owner (enterprise-managed auth via the client's IdP, users inherit through groups) and can be bundled in the marketplace plugin via `.mcp.json`, so skills and dashboard share one install path and one group assignment.

Constraints: sandboxed iframe with strict CSP (no third-party assets); every tool must degrade to useful text when the host can't render UI; OAuth/OIDC to the client IdP for per-user identity (the same mapping to Claude `user_id`); GitHub approvals still happen via CODEOWNERS — the card triggers them. Technical implementation is handled separately.

## Platform integration (validated Sept 2026)

**Adoption — read (native, complete).** Claude Enterprise Analytics API (Analytics API key, `read:analytics`, created by the primary owner). Per-user daily metrics across chat, projects, files, artifacts, Claude Code and Cowork; org DAU/WAU/MAU; per-skill, per-connector, per-project and per-plugin usage. Skill usage counts only explicit activations, not installs. "Active" is defined natively as a chat message, a Code session with tool use, or a Cowork session with tool use — i.e. real work. `group_by`/`filter` on `rbac_group_id` gives the team slice; Compliance and Admin APIs give the group roster. One-day lag, 60 req/min per org, data from Jan 2026.

**Identity (native).** SSO/SCIM on Enterprise. Admin API (GA) lists members, manages groups and membership, reads custom roles. Every analytics record carries `user_id` and email for mapping to Activate seats.

**Skills — publish (workaround, git-native).** No public API for org-level skill CRUD; the admin UI's internal endpoints are session-cookie auth. Publish path: one private GitHub marketplace repo per client, synced to Organization settings > Plugins (auto-sync available; group-level overrides persist across syncs). Skills are bundled into plugins and assigned to RBAC groups, which is how team scoping works natively. Private plugin sources must share the marketplace repo's owner or sit on the client's GitHub Enterprise host with the app installed — so all Activate-published skills live inside the marketplace repo as relative paths.

This turns the promotion queue into a pull request: Promoter opens the PR with test results and boundary declaration attached; human approval is the merge; git history is the version history and rollback. Activate's library view reads the repo, not the Claude UI. A custom manifest alongside each SKILL.md carries Activate metadata (owner, rung, baseline, test suite, boundary, promoted-by, promoted-at).

**Grading — LLM review (ours).** Grader is a Claude reviewer, not an execution harness: it reads the skill and the author's sample cases and returns rubric scores, written feedback and a pass/revise decision. Rubric adopts Anthropic's enterprise guidance — 3–5 representative queries covering should-trigger, should-not-trigger and ambiguous cases — as required author-supplied inputs, judged by the model rather than executed. No Console org or Skills API dependency; runs on the client's Enterprise tenant or LightCI's own API account against skill text only, never client data. Live execution against test cases is a possible later hardening step for L4 promotions.

**Artifacts and audit (native, governed).** Compliance API (enabled on request; Compliance Access Key) exposes the activity feed, chats, files, projects, session transcripts, and org directory. Skill-sharing events appear as `role_assignment` activities. Auditor uses it for event-level evidence; content access is scoped by the client's data boundary and Activate does not retain conversation content.

**What does not exist.** No sandbox or non-production org (test on an owner account before provisioning). No per-user OAuth into claude.ai's data APIs — Activate reads org data as the org; per-user identity comes from the MCP App's own OAuth to the client IdP. Native skill security scanning is unavailable on CMEK, ZDR and HIPAA configurations, so Grader carries the security review for regulated clients. No partner-only preview APIs are publicly documented.

## The cycle

Per person, repeated: **audit** (what you do, how you use Claude now) → **workflow** (highest-value gap) → **skill** (build or adopt one that closes it) → **measure** (hours back) → audit again. Education lives inside each step. At org level: usage data → new workflow candidates → scored backlog → next wave → more usage.

## Constraints

- Runs inside the client's Claude Enterprise environment. No client data enters LightCI systems; the platform sees workflow descriptions, artifacts, and time and usage data, never client records.
- People remain the only bridge into systems of record and the only voice a client hears.
- No number reported without a baseline. Hours returned are net of rework.
- Org-wide peer sharing stays off; all publishing goes through the promotion queue.

## Commercial shape

Pilot (fixed fee, one wave, LightCI in the queue) → Program (monthly retainer, LightCI in the queue across waves) → Handover (champions take the queue) → Platform subscription (per seat; agents keep onboarding new hires, re-testing skills on model changes, refreshing the backlog). PE sponsors get one instance across the portfolio with a shared governed library.

## Success metrics

Weekly active on real work ≥ 60%; rung progression rate; skills promoted per wave; hours returned per person per week against baseline, net of rework; wave-two delivery cost as a fraction of wave one; judgement retention — accuracy of pre-run expectations and post-run critiques over time, and performance on periodic unaided retrieval exercises.

## What to build first

1. Analytics and Admin API ingestion + the sponsor dashboard (native data, lowest risk, immediately useful for Mercer's readout).
2. The person-level loop as an MCP App: intake → generated path → submit → grade, rendered inline in Claude.
3. The marketplace-repo publish path and PR-based promotion queue.
4. Run Mercer's wave two on it. Everything else is a feature request from that.

## Open questions

- Lead mix from Anthropic: motivation problem (training-shaped) vs scoping problem (workflow-shaped)? Decides whether Coach or Interviewer leads.
- Build vs partner: Multiply Academy (Phil Hewinson, ex-Alpha CPO) already has the self-build loop; a conversation before six months of platform work.
- Which surfaces stay web-only vs render in Claude (Mission Control depth, provisioning).
- Where the desirable-difficulty line sits per rung: how much friction Coach preserves before it costs adoption.
- Per-rung passing artifacts in regulated contexts — what L2 looks like when personal knowledge bases can't hold client data.
- Ask the partner team: org-level skill CRUD roadmap, and whether partners get preview API access.
