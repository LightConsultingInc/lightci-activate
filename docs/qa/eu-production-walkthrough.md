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

## Housekeeping

- A first QA company, "LightCI QA (EU)" on `qa-activate.lciventure.com`, was created by a server task
  before the browser-only rule was set. It is unused; its TXT record on `qa-activate.lciventure.com`
  and the company itself should be removed.
