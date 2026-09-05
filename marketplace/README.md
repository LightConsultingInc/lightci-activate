# meridian-claude-marketplace

Private Claude Enterprise plugin marketplace for **Meridian Wealth Partners**, published and governed through [LightCI Activate](https://activate.lightci.com). Claude Enterprise syncs this repo (Organization settings → Plugins) and assigns plugins to RBAC groups; Activate reads it as the source of truth for the Skill Library, versions and manifests.

## Layout

```
.claude-plugin/marketplace.json   catalogue Claude Enterprise reads
plugins/
  fp-meeting-prep/                Financial Planning  (champion: Daniel Okafor)
  wa-client-comms/                Wealth Advisors     (champion: Sofia Alvarez)
  cso-operations/                 Client Service Ops  (champion: Tom Becker; compliance co-owns)
  shared/                         cross-team skills assigned to every in-program group
  activate-coach/                 Activate-owned: the Coach skill that calls the Activate MCP tools (no manifest; linted only)
.mcp.json                         Activate connector so skills and dashboard share one install path
    <plugin>/.claude-plugin/plugin.json
    <plugin>/skills/<slug>/SKILL.md          author-written skill (frontmatter + body)
    <plugin>/skills/<slug>/activate.yaml     governance manifest (owner, team, rung, boundary, promotion, status)
    <plugin>/skills/<slug>/cases/cases.json  should / should-not / ambiguous sample cases the Grader judges
schema/activate.schema.json       JSON schema for activate.yaml
scripts/validate.mjs              validator run by CI (no dependencies)
.github/workflows/validate.yml    lint + schema + approval gate
.github/CODEOWNERS                champions per plugin dir, compliance for restricted classes
```

## Skills

| Plugin | Skill | Owner | Rung | Status |
|---|---|---|---|---|
| fp-meeting-prep | advisor-meeting-prep | daniel.okafor | L1 | published |
| fp-meeting-prep | rmd-letter-draft | priya.nair | L1 | published |
| fp-meeting-prep | annual-review-deck-outline | priya.nair | L2 | published |
| wa-client-comms | client-followup-notes | sofia.alvarez | L1 | published |
| wa-client-comms | proposal-assembly | sofia.alvarez | L2 | published |
| wa-client-comms | ips-refresh-checklist | sofia.alvarez | L2 | published |
| wa-client-comms | fee-change-comms | marcus.reid | L1 | in_review (awaiting champion approval) |
| cso-operations | onboarding-packet-qa | tom.becker | L1 | published (compliance-approved) |
| cso-operations | attestation-summary | tom.becker | L1 | published (compliance-approved) |
| cso-operations | rebalancing-exception-memo | tom.becker | L2 | published |
| shared | crm-note-cleanup | marcus.reid | L1 | deprecated → client-followup-notes |

Skill names shown in the library come from the SKILL.md `# H1`; frontmatter `name` is the slug. Skills without an `activate.yaml` (the Activate-owned Coach) are linted by CI but are not governed skills and do not appear in the library.

## Lifecycle

| Step | Actor | Git |
|---|---|---|
| Draft | learner or Builder in Activate | committed on `main` as `status: draft`; edits made through Activate go on branch `skill/<slug>`, a commit per save |
| Grade | Grader | grade stored in Activate; summary posted as a skill comment / PR comment |
| Request promotion | learner / Builder | Promoter opens the PR: diff, grade, boundary check, sample cases, test results |
| Approve | champion (+ compliance when restricted classes are touched) | Activate one-screen approval; CODEOWNERS and `approval-gate` enforce |
| Publish | merge to `main` | CI validates; Claude Enterprise auto-sync picks it up |
| Version | any change | tag `<slug>@vN`; changelog from commits |
| Deprecate | owner / champion | `status: deprecated` + `successor`; library shows the successor |

## Compliance boundary (Meridian)

- **Allowed classes:** `aggregated_client_summaries`, `internal_templates`, `public_regulation`, `calendar`, `crm_summary_export`
- **Forbidden classes:** `client_pii_documents`, `account_numbers`, `ssn`, `statements_raw`
- **Read-only systems:** Salesforce, Orion, eMoney
- **Human review points:** `before_send`, `before_crm_entry`, `before_client_meeting`

Every skill declares `may_read`, `must_never_receive` and `human_review` in `activate.yaml`; the validator warns when a skill's body mentions a forbidden class it has not declared, and the approval gate requires a compliance review when `may_read` includes a forbidden class.

## Git

This folder is committed to the Activate monorepo as plain files (no nested `.git`). At runtime Activate's `GitRepoService.ensureRepo()` initialises a local git repo on first use — in place when this folder is standalone (Docker `/marketplace`), or in a mirror work dir (`api/.marketplace-work/`, `LIBRARY_WORK_DIR`) when it sits inside another git work tree such as the monorepo (`main`, one "Initial marketplace import" commit, tags `<slug>@v<activate-version>` from each SKILL.md) so branches, commits and tags work as described above. When a client links a real GitHub repo, that clone replaces this folder.

## Validate locally

```
node scripts/validate.mjs           # errors fail; warnings reported
node scripts/validate.mjs --strict  # warnings fail too
```
