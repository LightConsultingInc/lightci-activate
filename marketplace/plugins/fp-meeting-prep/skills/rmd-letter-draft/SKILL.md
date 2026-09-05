---
name: rmd-letter-draft
description: Draft the annual required-minimum-distribution reminder letter for a Meridian household from the RMD letter template and the planner's summary of the distribution plan (amounts as round figures, accounts by nickname). Use when a planner asks to "draft", "write" or "prepare" an RMD letter or RMD reminder for a named client in RMD season. Do not use for Roth conversion analysis, for calculating the RMD itself, or when the input includes account numbers or a custodian statement.
metadata:
  activate-id: rmd-letter-draft
  activate-version: "1"
  activate-owner: priya.nair@meridianwealth.demo
---

# RMD letter draft

Turns the planner's distribution plan into the client-ready reminder letter Meridian sends each autumn. The letter explains what is due, how we propose to take it, and what the client needs to do. Tone: plain, warm, no jargon the client has not heard from us before.

## When to use

- The planner has already worked out the RMD plan in eMoney or Orion and wants the client letter written.
- The input is the planner's summary: total RMD as a round figure, which accounts (by nickname, e.g. "the Fidelity IRA"), the proposed timing and withholding choice, and the deadline.

Do not use to compute or check the RMD amount (that stays in eMoney), for Roth conversion or QCD analysis, or for inherited-IRA rules questions. If the input contains an account number or a statement, stop and ask for the summary instead.

## Inputs

1. **RMD letter template** (`RMD Reminder 2026`, internal).
2. **Planner's summary**: client salutation, total RMD (rounded), accounts by nickname, proposed distribution schedule, withholding choice, whether a QCD is planned, deadline (31 December or 1 April for first-year).
3. Optional: one or two household-specific notes the planner wants included (e.g. "they asked to route to the checking account they use for the grandchildren").

## Steps

1. Confirm the summary contains amount, accounts by nickname, schedule and deadline. If any is missing, list what is missing and stop.
2. Fill the template. Keep the client's own account nicknames; never introduce a number that looks like an account identifier.
3. State what we propose to do and what the client must confirm (usually: approve the schedule, confirm withholding, sign the distribution form if one is needed).
4. Add the standard regulatory sentence from the template verbatim. Do not paraphrase it.
5. Close with the planner's name and the review footer from Output format.

## Output format

Letter body in the template's order: greeting → why you are receiving this → what is due and by when → what we propose → what we need from you → standard sentence → sign-off. Under 350 words. Ends with:

```
--- Draft. Reviewed by ________ before sending. ---
```

## Boundaries

- **May read:** internal templates, aggregated client summaries, public regulatory material (IRS Publication 590-B wording).
- **Must never receive:** account numbers, Social Security numbers, client identity documents, raw custodial statements. Round-figure amounts and account nicknames are fine.
- **Human review:** the planner reviews and the advisor signs before the letter is sent. Not sent by this skill.
- Does not compute, verify or restate the RMD calculation; it repeats the planner's figure and says where it came from.

## Examples

### Example 1 — standard letter

**Input:** "Mr and Mrs Alvarez-Kim. RMD total about $41,000. Accounts: the Schwab rollover IRA and the small Vanguard IRA. Take it quarterly starting January, 20% federal withholding, no QCD. Deadline 31 Dec 2026."

**Output:** A letter opening "Dear Mr and Mrs Alvarez-Kim," explaining the 2026 required minimum distribution of approximately $41,000 across the Schwab rollover IRA and the Vanguard IRA, proposing four equal quarterly distributions from January with 20% federal withholding, asking them to confirm the schedule and withholding by reply, including the template's standard sentence on the 31 December deadline and the excise tax, signed by Priya Nair, with the review footer.

### Example 2 — missing information

**Input:** "Draft the RMD letter for the Nakamuras, it's the usual."

**Output:** "I can draft it once I have the total RMD (rounded), which accounts by nickname, the proposed schedule and withholding, and the deadline. Which of those can you paste from your eMoney summary? Please do not include account numbers."
