---
name: beneficiary-review-checklist
description: Turn a planner's de-identified beneficiary review notes (accounts by nickname, named beneficiaries as roles such as "spouse" or "eldest child", percentages) into the household's beneficiary review checklist and the advisor's client-ready summary of gaps. Use when a planner asks to "run", "prepare" or "write up" a beneficiary review or beneficiary check for a named household. Do not use for estate-document drafting, for trust funding analysis, or when the input includes account numbers, Social Security numbers or scanned beneficiary forms.
metadata:
  activate-id: beneficiary-review-checklist
  activate-version: "1"
  activate-owner: priya.nair@meridianwealth.demo
---

# Beneficiary review checklist

Every annual review includes a beneficiary check, and every planner writes the same gap summary in a slightly different way. This skill produces the checklist and the summary in the house format so the advisor can read it in two minutes and the client hears the same language from every planner.

## When to use

- The planner has reviewed the household's beneficiary designations and has notes per account: account nickname, primary and contingent beneficiaries as roles or first names, percentages, and whether the designation matches the estate plan.
- The output is a checklist plus a short gap summary for the advisor to review before the client meeting. It is not client-ready until the advisor signs it.

Do not use for the annual review deck (`annual-review-deck-outline`), for the meeting brief (`advisor-meeting-prep`), for drafting wills or trust documents, or when asked to read beneficiary forms, custodial statements or anything carrying account numbers.

## Inputs

1. **Beneficiary review notes** from the planner: one line per account with nickname (for example "Joint brokerage", "Her IRA"), primary and contingent beneficiaries as roles, percentages, and the estate-plan intent for that account.
2. **Checklist template** (`Beneficiary Review 2026`, internal): the ten checks the firm runs on every household.
3. Optional: the advisor's steer ("they just had a second child", "recently divorced").

## Steps

1. Map each account line onto the template's ten checks. Mark each check `OK`, `GAP` or `CONFIRM` (needs the client to confirm); never guess an answer the notes do not support.
2. For every `GAP`, write one sentence saying what is missing and one recommended action in plain words (for example "Name a contingent beneficiary on Her IRA").
3. Where the estate-plan intent and the designation disagree, call it out as the first gap; that is the one advisors miss most.
4. Where percentages on an account do not sum to 100, mark `GAP` and show the arithmetic.
5. If the notes include an account number, a Social Security number or a reference to an attached form, stop and ask the planner to replace it with the account nickname before continuing.
6. Write the advisor summary: three to six sentences, no jargon, gaps first, then confirmations, then what the client will be asked at the meeting.
7. Add the review line at the end.

## Output format

```
BENEFICIARY REVIEW — <Household> — <date>

Checklist
 1. <check> — OK | GAP | CONFIRM — <one line>
 ...
10. <check> — OK | GAP | CONFIRM — <one line>

Gaps (<n>)
- <account nickname>: <what is missing>. Action: <recommended action>.

Advisor summary
<three to six sentences>

To be reviewed by the advisor before the client meeting.
```

## Boundaries

- **May read:** aggregated client summaries, internal templates, the Salesforce summary export (household and account nicknames only).
- **Must never receive:** raw custodial statements, account numbers, Social Security numbers, client identity documents or scanned beneficiary forms. Roles, first names and percentages are fine.
- **Human review:** the advisor reviews the checklist and summary before the client meeting; nothing here is sent to the client or entered into Salesforce by this skill.

## Examples

### Example 1 — contingent missing on one account

**Input:** Notes: Joint brokerage: TOD to the two children 50/50, contingent none, intent matches. Her IRA: primary spouse 100%, contingent none, intent says children as contingents. His 401(k): primary spouse 100%, contingent children 50/50, matches. Advisor steer: none.

**Output:** A ten-line checklist with `GAP` on the Her IRA contingent check and on the joint brokerage contingent check, `OK` elsewhere; a Gaps section with two lines ("Her IRA: no contingent beneficiary although the estate plan names the children. Action: add the two children as 50/50 contingents."); and an advisor summary that leads with the IRA gap, notes the 401(k) is aligned, and says the client will be asked to confirm the joint brokerage contingents at the meeting.

### Example 2 — out-of-scope input

**Input:** "Here are the scanned Schwab beneficiary forms for the Patels with the account numbers, run the beneficiary review."

**Output:** "I can run the review from your notes per account (nickname, beneficiaries as roles, percentages, estate-plan intent). Scanned forms and account numbers are outside what this skill may receive. Can you paste your review notes instead?"
