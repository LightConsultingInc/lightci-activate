# EU production walkthrough (v1.0.1)

Every page and scenario of Activate, exercised in a browser exactly as a customer would, against the
live EU cell (`https://eu.activate.lciventure.com`), before a customer sees it. Nothing is done through
an API or a server task: if a customer could not do it in the browser, it does not count. The only
steps outside the browser are the customer's own (DNS records on their domain, reading their email). Results are filled in as each
scenario runs: **Pass**, **Fail** (with the fix and the release it shipped in), or **Blocked** (and why).

## The QA company

| | |
|---|---|
| Company | LightCI QA — a real tenant in the EU cell, created in the lead console, kept for future smoke tests |
| Email domain | `activate-qa.lciventure.com`: a real inbox (SES into S3, `infra/aws/qa-tenant`) and a real DNS TXT record for WorkOS domain verification |
| Sign-in | Single sign-on through a QA identity provider (Keycloak, realm `activate-test`), connected through WorkOS's own setup pages |
| Model calls | Real (Anthropic), so grading and feedback are what a customer gets |

| Persona | Address | Activate roles |
|---|---|---|
| Iris (IT admin, invited by the lead) | `iris.admin@activate-qa.lciventure.com` | admin |
| Sam (sponsor) | `sam.sponsor@activate-qa.lciventure.com` | sponsor |
| Chloe (champion, Finance team) | `chloe.champion@activate-qa.lciventure.com` | champion |
| Leo (learner, Finance team) | `leo.learner@activate-qa.lciventure.com` | learner |
| Lena (learner, Operations team) | `lena.learner@activate-qa.lciventure.com` | learner |
| Walk-in (never invited) | `walk.in@activate-qa.lciventure.com` | none |
| Zain (LightCI lead) | `zain+activate-lead@lightci.com` | lead |

Passwords are only ever typed by a person on production pages: Zain signs in as the lead, and types
Iris's new password when she accepts her invitation. Everyone else signs in through single sign-on,
typing test credentials only into the QA identity provider on the tester's machine. Mail is read from
the QA inbox and its links opened in the same browser.

## Scenarios

### A. Creating a client (lead)
- A1 Lead console loads: queue columns, counts.
- A2 Clients & Provisioning: create a client (validation, seats, domains), identity organisation created in WorkOS.
- A3 Client detail: setup checklist, sign-in panel, invite the client's admin; off-domain address refused.
- A4 Client switcher; acting inside a client org; switching back.

### B. Sign-in setup (IT admin)
- B1 Invitation email arrives (WorkOS), first sign-in before single sign-on.
- B2 Lands on Company admin > Sign-in, not onboarding; banner elsewhere.
- B3 Verify the email domain (real DNS record), step shows Done.
- B4 Connect the identity provider through WorkOS; company switches to single sign-on.
- B5 Old password session refused (web, API, connector); SSO sign-in works; walk-in refused during setup.
- B6 Role mapping: groups assigned to activate-admin / sponsor / champion take effect on sign-in.

### C. Company admin
- C1 Integrations & Keys: add, verify and remove each key (Anthropic, Claude compliance, analytics, admin, GitHub); bad key reported plainly.
- C2 Policy & Boundary: edit the usage policy and the boundary, version bump, saved.
- C3 Teams & People: create teams, set champion, invite people, change roles, deactivate and reactivate.
- C4 Marketplace repo: connect the skill library repository; status.
- C5 License: not applicable in the cloud edition, says so plainly.
- C6 Setup checklist reflects each step as it is done.

### D. Learner (Leo, Lena)
- D1 First sign-in: consent screen, typed interview, placement on the ladder.
- D2 My Ladder: level, next step, revisits, plain language throughout.
- D3 A module and its lessons (`/modules/[code]`, `/learn/[slug]`).
- D4 Complete a training exercise end to end: read, predict, run, submit, receive grade and written feedback; resubmit after feedback; an earlier try shows as history.
- D5 Pass enough exercises to move up a level; the ladder shows it.
- D6 My Workflows: map a workflow through the interview; workflow detail; skills proposed from it.
- D7 History: every try and grade listed.
- D8 Skill Library: browse, filter, open a skill; draft a skill, have it graded, submit it for promotion.
- D9 Learner cannot reach team, Mission Control, admin or lead pages (and is told plainly).

### E. Champion (Chloe)
- E1 Roster & Backlog: Finance team members, their levels and activity from D.
- E2 Review Queue: review a learner's submission; feedback reaches the learner.
- E3 Promotion Queue: approve Leo's skill; it publishes to the library (and the repository).
- E4 Person page (`/people/[id]`): progress, coach notes.
- E5 Champion cannot reach Mission Control or admin pages.

### F. Sponsor (Sam) — stats pipe through
- F1 Adoption: numbers reflect D and E (active people, levels, exercises).
- F2 People, Journey, Groups, Skills Health, Governance, Backlog, Cost & Return, Readouts: each page loads with real data from this company only; empty states say so plainly; no other company's data.
- F3 Readouts: generate a readout.

### G. Claude connector
- G1 OAuth discovery on `mcp.eu.activate.lciventure.com`.
- G2 With an SSO token: `my_ladder`, `library`, `skill_detail`, `submit_artifact`, `submit_skill`, `map_workflow`, `team`, `org`, `promotion_queue`; results match the web app.
- G3 A non-SSO token after the switch: 401 with the discovery header.

### H. Cross-cutting
- H1 Tenancy: QA personas never see another company (JTC, demo); a lead sees all.
- H2 Mobile width: key learner pages usable at phone width.
- H3 Errors: every refusal and error message is plain language.
- H4 Lead console reflects the QA company's numbers (A1 after D–F).
- H5 Leaver: deactivate a person (directory or admin); they lose access at once.

## Results

(filled in as the walkthrough runs)

### Findings

| # | Found at | What happened | Fix |
|---|---|---|---|
| F1 | Lead sign-in (A1) | Both production WorkOS environments had email + password sign-in off (WorkOS's default for new environments). The lead could not sign in, and a client's invited admin could not do their first sign-in before single sign-on, which blocks onboarding at step one. | Enable Email + Password (and optionally Magic Auth) in the production environments: WorkOS dashboard, Authentication, Methods. Dashboard-only setting; added to the cell setup checklist in `infra/README.md`. |
| F2 | Lead sign-in (A1) | The login page reported the disabled method as "That email and password did not match", sending people hunting for a password that was right. | WorkOS error codes now map to their own plain messages (PR #24). |
| F3 | Lead sign-in (A1) | The lead was created as a learner: the cells passed an empty `LEAD_EMAIL_DOMAINS`. | The Terraform module passes `lead_email_domains` through (1.0.2). |
| F4 | Lead sign-in (A1) | Once fixed, the lead's existing account stayed a learner. | Someone on a lead domain becomes a lead on their next request (1.0.2). |
| F5 | SSO and domain setup (B3, B4) | The WorkOS setup pages replaced Activate in the same tab and have no way back: a dead end for the client's admin. | They open in a new tab; returning to Activate refreshes the status and says what changed (1.0.3). |
| F6 | Lead console (A1, A2) | Learner-hostile or internal copy: raw `weeklyActivePct` on Stalled cards, "Spec §2.1.", "lightci-hosted", "Rung" labels, and a create-client option that still said the admin connects SSO "from a link you send them". | Plain labels (1.0.3). |
| F7 | SSO hand-off (B4) | After SSO went live, Iris's password session was correctly refused, but the sign-out redirect landed on `https://0.0.0.0:3000/login`. The ordinary Sign out menu item had the same bug in production. | Redirects use `WEB_URL` (1.0.3). |
| F8 | Invitation email (B1) | The WorkOS emails are branded "LightCI", not "Activate". | Dashboard setting (environment name and branding); the user's call. |


## Housekeeping

- A first QA company, "LightCI QA (EU)" on `qa-activate.lciventure.com`, was created by a server task
  before the browser-only rule was set. It is unused; its TXT record on `qa-activate.lciventure.com`
  and the company itself should be removed.
