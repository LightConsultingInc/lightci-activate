---
name: advisor-meeting-prep
description: Build the one-page pre-meeting brief a Meridian advisor reads before a scheduled client review, from the calendar entry, the Salesforce summary export and the planning template. Use when an advisor or planner asks to "prep", "brief" or "get ready for" a named household meeting that is already on the calendar. Do not use for prospect discovery calls (no plan exists yet), for the annual review deck itself, or when the request includes account statements or identity documents.
metadata:
  activate-id: advisor-meeting-prep
  activate-version: "2"
  activate-owner: daniel.okafor@meridianwealth.demo
---

# Advisor meeting prep

Produces the Monday brief: what the household came in for last time, what changed, what the advisor should raise, and what the planner still needs. One page, in the planning team's voice, ready for the advisor to skim in the car.

## When to use

- A review meeting with an existing household is on the calendar and someone asks for the prep, brief, or agenda.
- The inputs are the CRM summary export for that household and the planning template. Nothing else is needed.

Do not use when the meeting is a prospect discovery call (use the discovery agenda in the advisor's own notes), when the ask is the annual review deck (use `annual-review-deck-outline`), or when the person offers a statement, tax return or ID scan as input. Say so and stop.

## Inputs

1. **Calendar entry**: household name, meeting date and time, attendees, meeting type (quarterly, annual, ad hoc).
2. **Salesforce summary export** for the household: last meeting notes, open tasks, life events flagged, service requests in flight. This is the aggregated summary export, not raw account data.
3. **Planning template** (`Meeting Brief v4`, internal). If the person pastes a different template, follow theirs.
4. Optional: the planner's own bullet list of things they want raised.

## Steps

1. Read the calendar entry and confirm the meeting type. If it is not a review with an existing household, stop and say which skill applies.
2. From the CRM summary, list what was agreed at the last meeting and mark each item **done**, **open** or **overdue** using the open-tasks section. Do not infer status that is not in the export.
3. Pull the life events and service requests into a "What changed since last time" list. One line each, dated.
4. Draft three to five "Raise with client" points. Each must trace to an item in steps 2 or 3; do not invent talking points from general planning advice.
5. List "Still needed from planning" — anything the export shows as pending on our side.
6. Fill the template. Keep the brief under one page. Leave the "Advisor notes" box empty.
7. Add the review line at the bottom exactly as shown in Output format.

### What not to include

- Performance figures or balances, even rounded; the advisor pulls those live in Orion.
- Anything from a prior brief that the CRM export no longer shows as open.
- General planning advice the export does not support ("consider a Roth conversion").

## Output format

```
MEETING BRIEF — <Household> — <Date, time> — <Meeting type>
Attendees: <names>

Last time we agreed
- <item> — done | open | overdue (<date>)

What changed since
- <date>: <event or request>

Raise with client
1. <point> (from: <item it traces to>)

Still needed from planning
- <item> — owner <planner>

Advisor notes
[blank]

Reviewed by: __________ before meeting (required)
```

## Boundaries

- **May read:** calendar entries, the Salesforce summary export, internal templates, aggregated client summaries.
- **Must never receive:** client identity documents, account numbers, Social Security numbers, raw custodial statements. If any appear in the input, do not produce the brief; say the input needs to be replaced with the summary export.
- **Human review:** the advisor reads and initials the brief before the client meeting. The brief is a draft until then. Nothing in it is entered into Salesforce by this skill.
- Salesforce, Orion and eMoney are read-only sources. The skill never proposes CRM updates.

## Examples

### Example 1 — quarterly review, straightforward household

**Input:** Calendar: "Q3 review — Patel household — Thu 10:00 — Marcus Reid, Priya Nair". CRM export shows last meeting agreed to (a) raise 529 contribution, (b) send updated beneficiary form; open tasks: beneficiary form outstanding since June; life event: eldest child starting college Aug 2026; service request: address change completed.

**Output:**
```
MEETING BRIEF — Patel household — Thu 10:00 — Quarterly review
Attendees: Marcus Reid, Priya Nair

Last time we agreed
- Increase 529 contribution — done (Jul)
- Updated beneficiary form — overdue (open since Jun)

What changed since
- Aug 2026: eldest child started college
- Jul 2026: address change completed

Raise with client
1. Beneficiary form still outstanding; confirm they received it (from: overdue item)
2. First tuition draw from the 529 — confirm timing and amount they expect (from: college start)
3. Confirm new address on all correspondence (from: address change)

Still needed from planning
- Nothing pending

Advisor notes
[blank]

Reviewed by: __________ before meeting (required)
```

### Example 2 — request that must be declined

**Input:** "Prep me for the Hendersons tomorrow, here is their Schwab statement PDF and the ID copies from onboarding."

**Output:** "I can build the Henderson brief from the Salesforce summary export and the calendar entry, but not from the statement or ID copies — those are outside what this skill may receive. Please export the household summary from Salesforce and paste that instead, and remove the attachments."
