---
name: annual-review-deck-outline
description: Produce the slide-by-slide outline and speaker notes for a Meridian annual review deck from the planner's aggregated household summary (goals, progress, allocation as percentages, planning items) and the deck template. Use when a planner asks to "outline", "structure" or "draft the narrative for" an annual review deck. Do not use for the quarterly meeting brief, for anything involving actual account balances by account number, or to produce the slides themselves.
metadata:
  activate-id: annual-review-deck-outline
  activate-version: "1"
  activate-owner: priya.nair@meridianwealth.demo
---

# Annual review deck outline

The annual review is the planning team's biggest block of hours. This skill does the thinking part that is the same every time: which slides, in what order, what each slide says and what the advisor says over it. The planner then drops the numbers in.

## When to use

- The planner has the household's aggregated summary (goals and status, allocation as percentages, planning items for the year) and wants the deck structured.
- The output is an outline plus speaker notes, not slides. The planner builds slides in the template.

Do not use for the quarterly brief (`advisor-meeting-prep`), for prospects (`proposal-assembly`), or when asked to include account-level balances, holdings by account number or statement pages.

## Inputs

1. **Deck template** (`Annual Review 2026`, 12 slides, internal) — slide titles and purpose per slide.
2. **Household summary**: goals with on-track / watch / off-track status, allocation vs target as percentages, the year's planning items (done and proposed), any life events.
3. Optional: the advisor's steer ("keep it to 8 slides", "they are nervous about markets").

## Steps

1. Map the summary onto the template. Drop slides that have nothing to say; never pad.
2. For each kept slide write: title, the one sentence the slide makes, two to four bullets, and speaker notes of 40–80 words in the advisor's voice.
3. Put goals before allocation before planning items; end with "Decisions for today" and "What we will do next".
4. Where a goal is off-track, the speaker note must say what changed and offer one action, not reassurance.
5. Flag every place a number belongs with `[NUMBER: description]`. Never fill numbers from memory.
6. Add the review line at the end.

## Output format

```
DECK OUTLINE — <Household> — Annual review <year>  (<n> slides)

Slide 1 — <Title>
  Says: <one sentence>
  Bullets:
  - ...
  Notes: <40–80 words>

...

Decisions for today
- ...

To be reviewed by the advisor before the client meeting.
```

## Boundaries

- **May read:** aggregated client summaries, internal templates, the Salesforce summary export.
- **Must never receive:** raw custodial statements, account numbers, Social Security numbers, client identity documents. Percentages and goal statuses are fine; account-level balances are not.
- **Human review:** the advisor reviews the finished deck before the client meeting. This skill produces an outline only.

## Examples

### Example 1 — household with one goal off-track

**Input:** Summary: retirement goal on-track; second-home goal off-track (timeline moved up two years); allocation 62/38 vs target 60/40; planning items done: Roth conversion, updated wills; proposed: increase 529, review umbrella coverage. Advisor steer: "keep it to 9 slides."

**Output:** A 9-slide outline that drops the template's "Tax-loss review" slide (nothing to say), gives the second-home slide a note that states the timeline change plainly and offers one action (revisit the savings rate or the target date), marks allocation as `[NUMBER: current vs target]`, and ends with two decisions for today.

### Example 2 — out-of-scope input

**Input:** "Here are the three Schwab statements and the Orion holdings report, build the annual review."

**Output:** "I can outline the deck from the household summary (goal status, allocation as percentages, this year's planning items). The statements and account-level holdings report are outside what this skill may receive. Can you paste the summary from the planning file instead?"
