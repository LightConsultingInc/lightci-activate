# LightCI Activate — UI, Setup, Data Model, Features (Draft v0.2)

Companion to the product spec. Everything here assumes: Claude Enterprise tenant, Analytics/Admin/Compliance API access, one private GitHub marketplace repo per client, Activate hosted per client (or LightCI-hosted with no client content retained).

---

## 1. UI surfaces

Five surfaces on one data spine, delivered through two hosts. **Primary host is Claude itself:** Activate is a remote MCP server with MCP Apps UI, so each surface below has an inline-card form rendered in the conversation (see §1.6). **Secondary host is the web app** for deep admin views, provisioning, and non-Claude users. Role determines which you land on; everyone can see their own Ladder.

### 1.1 My Ladder (learner)

Single page, no catalogue.

- **Header strip:** name, team, current rung with progress ring, hours-back this month vs baseline, streak of active-on-real-work days.
- **Next up:** the one exercise Coach has queued, with why it was chosen ("you run the Monday meeting prep every week; this teaches you to hand it off"). Below it, spaced revisits due today (2–5 min retrieval prompts on earlier competencies).
- **Exercise view (split pane):**
  - Left: the work surface — depends on rung. L1: prompt editor + Claude output. L2: Project builder (instructions, files, what to include/exclude). L3: skill editor (SKILL.md, sample cases, boundary declaration). L4: workflow map editor (schema form) and the skill it compiles to.
  - Right: Coach panel. Sequence is fixed per run: *state your expectation* → run → *critique the output* → Coach feedback (hints first; worked example only after a cold attempt). Grade card at the end: rubric bars, written feedback, pass/revise.
  - Option: "Do this in Claude" — opens the exercise in claude.ai with the context pre-loaded; learner pastes the artifact back. Cheaper to build and keeps them in the real tool. Default for L1–L2.
- **My skills:** adopted (from library, with your usage count) and authored (draft / in review / published, with version and usage by others).
- **My workflows:** maps you've submitted, Scorer's ranking, status (candidate → in build → shipped → measured).
- **History:** every submission with expectation, output, critique, grade — the learner's own evidence trail.

### 1.2 Team (champion)

- **Roster:** each member's rung, last active-on-real-work day, hours-back vs baseline, stalled flag (no progression in N days), revisits overdue.
- **Backlog:** team workflows ranked by Scorer (value × hours × readiness ÷ compliance exposure), with owner, status, and "convert to build" action.
- **Review queue:** L3/L4 submissions from teammates awaiting champion grading (L5 exercise), and promotion requests awaiting champion approval.
- **Team library:** skills assigned to this team's group, usage per skill, who authored, version, last changed.
- **Team readout:** one-click summary for the team lead.

### 1.3 Mission Control (sponsor / admin)

Tabs: Adoption · People · Groups · Skills · Governance · Backlog · Cost · Readouts. Detail in §5.

### 1.4 Skill Library (everyone; edit rights by role)

Detail in §4.

### 1.5 Activation Lead Console (LightCI)

Cross-client. One queue, four columns: **Escalations** (Coach couldn't unblock; Builder confidence low; Interviewer schema incomplete after N turns), **Approvals** (Promoter packages awaiting human where champion isn't yet trusted or compliance exposure is high), **Stalled** (client, team or learner metrics below threshold), **Wave status** (per client: week, skills shipped vs target, baseline coverage, active %). Each item opens to the artifact with a one-screen decision. Client switcher, SLA timers.

### 1.6 In-Claude cards (MCP App)

| Tool | Who | Renders |
|---|---|---|
| `my_ladder` | learner | rung ring, next exercise, revisits due, hours-back sparkline |
| `library` (team / workflow / rung filters) | everyone | skill cards: trigger line, owner, version, active users, grade, boundary badge; adopt / fork |
| `skill_detail` | everyone | rendered SKILL.md, boundary, version timeline, usage by team |
| `submit_skill`, `submit_artifact` | learner | grade card: rubric bars, feedback, revise / request promotion |
| `map_workflow` | learner, champion | live scribe card while Interviewer asks questions; completeness meter |
| `team` | champion | roster strip, backlog top-5, review queue with approve |
| `org` | sponsor | adoption, people, groups, cost summary cards; "open in Activate" |
| `promotion_queue` | champion, lead | one-screen approval: diff summary, grade, boundary check, approve / send back |

Coach is a skill in the marketplace plugin that calls these tools. Every tool returns structured text when the host can't render UI. Distribution via org-level connector plus `.mcp.json` in the marketplace plugin so group assignment covers skills and Activate together. Auth: OAuth/OIDC to the client IdP; identity joins on email ↔ Claude `user_id`.

---

## 2. Setup

### 2.1 Client provisioning (LightCI, before kickoff)

1. Create Activate org; set data-residency mode (client-hosted vs LightCI-hosted, no-retention).
2. Client primary owner creates keys: Analytics API key (`read:analytics`), Admin API key, Compliance Access Key (requested from Anthropic). Stored in Activate's vault per client.
3. SSO: Activate as an app in the client's IdP; SCIM optional. Identity join key = email ↔ Claude `user_id`.
4. Import Admin API groups → Activate Teams. Choose which groups are in-program.
5. Company context ingest: Granola scoping transcripts, proposal, org chart, SOP sources (Confluence via connector, Drive). Stored as the company `ContextLayer`; tagged by source; reviewable.
6. Governance: usage policy text; compliance boundary (allowed data classes, forbidden data classes, systems that are read-only, human-review points). Boundary becomes a machine-checkable declaration schema every skill must fill.
7. GitHub: create `<client>-claude-marketplace` (private, client-owned org or LightCI-owned with client access). Install the GitHub app; link the repo in Claude Enterprise → Organization settings → Plugins; enable auto-sync. Confirm a hello-world plugin appears in the client's plugin directory. (Details §3.)
9. Connector: owner adds the Activate MCP server as an org-level custom connector (enterprise-managed auth); add `.mcp.json` to the marketplace plugin so it travels with group assignment. Verify `my_ladder` renders in a test chat.
8. Baseline design: choose method per workflow (time diary vs Interviewer estimate + champion sign-off); set capture window (week 1).

### 2.2 Team setup

1. Name champions (assign role in Activate).
2. Champion interview (Interviewer, champion mode): team purpose, recurring workflows, systems, pain, compliance sensitivities → team `ContextLayer` + seed `WorkflowMap`s.
3. Scorer produces the initial backlog; champion edits ranking.

### 2.3 Learner onboarding

1. SSO in. Consent screen: what Activate sees (usage metadata, artifacts you submit) and doesn't (your chats).
2. Interviewer intake, ~15 min: role, responsibilities, weekly workflows, current Claude use, self-rated comfort. Writes person `ContextLayer` + 2–4 `WorkflowMap` candidates.
3. Diagnostic: two short real-work tasks; Grader places them on the ladder (L0–L2 typical).
4. First exercise in the same session — finish something real.
5. Baseline capture prompts start (per workflow they named).

### 2.4 Wave open

Scorer finalises top N workflows → Builder drafts anchor skills with sample cases and boundary declarations → Grader → Promoter opens PRs → champion/compliance approve → merge → auto-sync → plugin assigned to team group → Coach begins assigning "adopt this skill on your case" exercises. Wave clock starts.

---

## 3. GitHub mechanics (the publish path)

### 3.1 Repo layout

```
<client>-claude-marketplace/
  .claude-plugin/
    marketplace.json          # plugin catalogue read by Claude Enterprise
  plugins/
    fp-meeting-prep/          # one plugin per team or per workflow family
      .claude-plugin/plugin.json
      skills/
        advisor-meeting-prep/
          SKILL.md
          activate.yaml        # Activate manifest (below)
          cases/               # author-supplied sample cases (should/shouldn't/ambiguous)
        client-followup-notes/
          ...
    wm-proposals/
      ...
  .github/
    workflows/
      validate.yml            # lint SKILL.md, validate activate.yaml + boundary schema, block merges without approval
    CODEOWNERS                # champions per plugin dir; compliance for anything touching restricted classes
```

- Everything lives inside the marketplace repo as relative paths — avoids the private-source ownership constraint.
- Plugin = unit of assignment (Claude assigns plugins to groups). Skill = unit of authorship. Plugins are usually per team; cross-team skills go in a `shared/` plugin assigned to multiple groups.

### 3.2 `activate.yaml` (per skill)

```yaml
id: advisor-meeting-prep
owner: user_01H...          # Claude user_id
team: fp                    # Activate team / rbac group
rung_required: L1           # minimum rung to be assigned this skill
boundary:
  may_read: [calendar, crm_summary_export, internal_templates]
  must_never_receive: [client_pii_documents, account_numbers]
  human_review: [before_send, before_crm_entry]
sample_cases: cases/
baseline_task: "Monday meeting prep"     # links to Baseline records
promotion:
  requested_by: user_01H...
  grade_ref: grade_9f2...                 # Grader run id
  approved_by: [user_02K..., compliance:user_03M...]
  approved_at: 2026-09-18T14:02Z
status: published           # draft | in_review | published | deprecated
```

### 3.3 Lifecycle

| Step | Actor | Git |
|---|---|---|
| Draft | learner (or Builder) in Activate editor | branch `skill/<id>`; commits on save |
| Grade | Grader | writes grade to Activate; posts summary as PR comment |
| Request promotion | learner / Builder | Promoter opens PR: diff, grade card, boundary check result, sample cases |
| Approve | champion (+ compliance if restricted classes touched) via Activate one-screen approval | Activate approves PR as GitHub app; CODEOWNERS enforces |
| Publish | merge | CI validates; auto-sync pulls into Claude Enterprise; Activate confirms via plugin appearance |
| Assign | Activate | plugin ↔ group mapping (set in Claude admin; Activate records and prompts) |
| Version | any change | new PR; git tag `<id>@vN`; Activate shows changelog from commits |
| Re-grade on model change | Grader (scheduled) | opens PR with "review recommended" if grade drops |
| Deprecate | owner/champion | PR sets `status: deprecated`; plugin removed from groups; library shows successor |
| Rollback | champion | revert PR; one click from library version history |

Activate reads the repo (not the Claude UI) as the source of truth for library, versions, and manifests. Usage comes from the Analytics API and is joined on skill name.

### 3.4 Group-level visibility

- Group assignment lives in Claude admin (hidden / available / auto-installed). Activate stores the intended mapping and shows drift if a plugin's live assignment doesn't match.
- Learner sees only skills assigned to their groups plus the shared plugin; "request access" creates an escalation to the owning champion.

---

## 4. Skill Library

Lives at `/library`. Source of truth = marketplace repo + Analytics usage + Activate manifests.

- **Browse:** by team, workflow family, rung, status. Cards: name, one-line trigger, owner, team, version, active users (30d), runs (30d), grade, boundary badge (green: no restricted classes; amber: human-review steps; red: restricted classes, compliance-approved).
- **Detail:** SKILL.md rendered; sample cases; boundary declaration; grade history; version timeline (git commits with author, grade delta, approvers); usage chart by team; "who else uses this" (opt-in visibility); comments/feedback thread (feeds Grader on next revision); "adopt" (adds to My skills and creates an exercise), "fork" (new branch pre-filled), "propose change" (PR).
- **Health signals:** unused for 30d; grade below threshold after re-grade; boundary declaration missing a newly restricted class; owner left the org (from Admin API); duplicate/overlapping triggers with another skill (Grader flags).
- **Publishing rules:** peer org-wide sharing stays off in Claude; the library is the only publish path; every published skill has an owner, a grade, a boundary declaration, and an approver.
- **Portfolio mode (PE):** library across companies with company tags; "propagate" opens PRs into other companies' repos, each going through that company's approval.

---

## 5. Mission Control — management analytics

All metrics are computed from Analytics API (daily), Admin API (roster/groups), Compliance API (events), and Activate's own tables (rungs, grades, baselines). Every number carries its source and its baseline.

### 5.1 Adoption
- Active-on-real-work: daily/weekly/monthly, % of seats, trend, by team. Definition inherited from Anthropic (message sent / Code or Cowork session with tool use).
- Depth: sessions per active user, surfaces used (chat, Projects, Code, Cowork), connectors used, skills activated.
- Funnel: provisioned → logged in → first real-work → L1 → L2 → L3 → L4 → L5, with conversion and median days per step.
- Inactive seats: list, days since last activity, team, with "nudge" and "reassign seat" actions.

### 5.2 People — "who are my top people"
- **Ranking view:** sortable by rung, hours-back vs baseline, skills published, skills adopted by others (influence), grade quality, active days. Composite "activation score" shown with its components — never a single opaque number.
- **Rising:** fastest rung progression in the last 30 days.
- **Stalled:** no progression in N days, or activity dropped >50% vs prior month; reason from Coach if known (blocked, no time, tool issue).
- **Champion candidates:** high influence + high grade quality + not yet L5.
- **Person page:** journey timeline (rungs, exercises, grades, skills, hours-back), baseline table, usage sparkline, Coach notes, escalations. What the learner sees plus management overlays.

### 5.3 Journey — "where is everybody"
- Rung distribution heatmap: teams × rungs, counts and % of team.
- Cohort view: by onboarding week, where each cohort sits now.
- Time-in-rung: median and outliers per rung; flags rungs where people get stuck (design signal for LightCI).
- Revisit compliance: spaced exercises due vs done, by team.

### 5.4 Groups — "which groups are performing best"
- Group table: active %, rung mix, hours-back per person, skills published and adopted, promotion throughput, rework rate (grade revise/pass ratio), champion responsiveness (queue age).
- Compare mode: two groups side by side; normalised for team size and start date.
- Leaderboard toggle (opt-in per client); default off in regulated firms.

### 5.5 Cost — "where is the cost coming from"
- **Seats:** total seats × price; active vs inactive seat cost; cost per active user; by team. (Seat price entered by client.)
- **Premium seats:** Claude Code / Cowork seat counts and utilisation from Analytics; cost of premium seats with no usage.
- **Spend where metered:** Claude Code token/spend metrics per user where the Analytics API exposes them; API/Console spend if the client has a linked Console org (imported). *Validate exact fields during build.*
- **Program cost:** LightCI fees, champion hours logged, learner time in exercises (from Activate) — the denominator for ROI.
- **Return:** hours-back × loaded hourly rate (client-entered) vs cost; per team and per skill. Every ROI figure links to its baseline records.
- **Waste signals:** inactive seats, premium seats unused, skills built but unadopted, exercises abandoned.

### 5.6 Skills
- Library health rollup (§4 signals); most/least used; usage by team; skills without owners; re-grade queue.

### 5.7 Governance
- Policy and boundary versions; promotion log (who approved what, when, with grade); compliance-touch skills; Compliance API events relevant to skills (sharing, role assignment); drift between intended and live group assignment; audit export.

### 5.8 Backlog
- Org-wide workflow inventory with Scorer ranking, hours at stake, readiness, compliance exposure, owning team, status. Filter to "next wave"; export to SOW.

### 5.9 Readouts
- Generated per team/org/period from the above; narrative drafted by Auditor; every figure footnoted to source and baseline; export PDF/Docs.

---

## 6. Data model (expanded)

Identity
- `Org` (client), `Team` (↔ `rbac_group_id`), `Person` (↔ Claude `user_id`, email, roles: learner/champion/sponsor/admin/lead)

Context
- `ContextSource` (type, uri, ingested_at, layer: company/team/person, review_state)
- `ContextLayer` (owner ref, embeddings/summaries, version)

Learning
- `Placement` (person, rung, placed_at, by: diagnostic/promotion)
- `Competency` (id, rung, name — e.g. Description, Discernment, Progressive disclosure)
- `Exercise` (person, rung, competency[], generated_from: ContextLayer refs, workflow/skill ref, mode: in_app/in_claude)
- `Submission` (exercise, expectation_text, artifact, critique_text, submitted_at)
- `Grade` (submission, rubric[] {criterion, score, note}, feedback, decision: pass/revise, grader_version)
- `Revisit` (person, competency, due_at, done_at, score)
- `CoachNote` (person, note, tags: blocked/no_time/tool_issue)

Work
- `WorkflowMap` (owner person/team, schema fields, score {value, hours, readiness, exposure}, status, linked skills)
- `Baseline` (person, task, method, minutes_per_week, captured_at, approved_by)
- `Measurement` (person, task, minutes_per_week, period, method, source: self/auditor)

Skills
- `Skill` (id, repo_path, plugin, owner, team, status, manifest)
- `SkillVersion` (skill, commit_sha, tag, grade ref, changelog)
- `SkillAssignment` (plugin, team, mode: hidden/available/auto, intended vs observed)
- `SkillUsage` (skill, person/team, day, activations — from Analytics)
- `PromotionRequest` (skill_version, pr_number, grade ref, boundary_check, approvers[], decision, decided_at)

Ops
- `UsageSnapshot` (person, day, metrics from Analytics)
- `Escalation` (source_agent, subject ref, reason, assignee, state, sla)
- `Wave` (org, teams, start, end, targets, status)
- `Readout` (scope, period, metrics json, narrative, exported_at)
- `CostInput` (org, seat_price, premium_seat_price, loaded_hourly_rate, lightci_fees, period)

---

## 7. Feature list by release

### v1 — run Mercer wave two
- Client provisioning wizard (keys, SSO, groups, context ingest, boundary schema, repo link)
- Interviewer intake (learner + champion modes) writing to WorkflowMap schema
- Diagnostic placement
- My Ladder L0–L3: exercise generation, expectation/critique capture, Coach hints-first, Grader rubric feedback, in-Claude mode
- Baseline capture + hours-back per person
- Skill Library read from repo; versions; usage join; adopt/fork/propose
- Builder drafts anchor skills → Promoter PR → one-screen approval → merge → sync check
- Team page (roster, backlog, review queue)
- Mission Control: Adoption, People ranking, Journey heatmap, Groups table, Skills health, Governance log
- Activation Lead Console
- MCP App: `my_ladder`, `library`, `skill_detail`, `submit_skill`, `map_workflow`, `team`, `promotion_queue` cards; Coach skill in marketplace plugin
- Nightly Analytics/Admin sync

### v2 — program and handover
- L4 end-to-end (workflow → skill → promotion → measured), L5 champion grading tools
- Spaced revisit scheduler; judgement-retention metrics
- Scorer-maintained org backlog; SOW export
- Cost tab with ROI, waste signals
- MCP App: `org` cards for sponsors; drill-through to web app
- Readout generator
- Scheduled re-grade on model change; drift detection on group assignment
- Nudges (email/Slack) for stalled learners and overdue approvals

### v3 — platform
- Portfolio mode for PE sponsors; cross-company propagation
- Compliance API event feed in Governance
- Live execution of skills against cases for high-exposure promotions
- Confluence write-back of workflow maps
- Public API for clients' own BI

---

## 8. Open decisions

- Which surfaces remain web-only vs get in-Claude cards (Mission Control depth, provisioning).
- Baseline method per workflow type; how to treat self-report bias.
- Composite activation score: show components only, or also a headline number.
- Leaderboards in regulated clients.
- Repo ownership (client GitHub org vs LightCI org) and what happens at handover.
- Exact cost fields available from the Analytics API for Code/Cowork; whether to import Console billing.
