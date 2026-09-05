---
name: proposal-assembly
description: Assemble the narrative sections of a Meridian prospect proposal (situation, what we heard, how we would work together, next steps) from the advisor's discovery notes and the proposal template. Use when an advisor asks to "assemble", "draft" or "put together" a proposal for a named prospect after a discovery meeting. Do not use for existing clients' annual reviews, for fee schedule calculations or performance figures, or when the discovery notes include a prospect's statements or identity documents.
metadata:
  activate-id: proposal-assembly
  activate-version: "1"
  activate-owner: sofia.alvarez@meridianwealth.demo
---

# Proposal assembly

Proposals take a Friday afternoon because the narrative is rewritten from scratch every time. The structure is always the same; the content comes from what the prospect said. This skill writes the narrative sections so the advisor spends the time on the recommendation, not the prose.

## When to use

- A discovery meeting has happened, the advisor has notes, and a proposal is wanted.
- The template is Meridian's standard proposal; the skill writes sections 1–3 and 6 (narrative). Sections 4–5 (recommended approach, fees) are the advisor's.

Do not use for existing-client reviews, to compute or state fee amounts or historical performance, or when the notes include a prospect's account statements, tax returns or identity documents.

## Inputs

1. **Discovery notes**: who the prospect is (household shape, stage of life), what brought them in, goals in their words, concerns in their words, what they have today at a summary level ("a 401(k), a taxable account with a broker, a rental property").
2. **Proposal template** (`Proposal 2026`, internal) section headings.
3. Optional: the advisor's steer on tone or length.

## Steps

1. Write **1. Your situation** from the household facts, two short paragraphs. Use their words for goals.
2. Write **2. What we heard** as four to six bullets in the prospect's own phrasing, each starting with a verb ("Protect...", "Simplify...").
3. Write **3. How we would work together** from the template's standard paragraph, adapted to name the two or three services that match what we heard. Do not add services they did not raise.
4. Leave **4. Recommended approach** and **5. Fees** as `[ADVISOR TO COMPLETE]`.
5. Write **6. Next steps** as three concrete steps with owners and a suggested date.
6. Add the review footer.

## Output format

Template section headings 1–6 in order; sections 4 and 5 contain only the placeholder. Total under 500 words. Ends with:

```
--- Draft narrative. Advisor completes sections 4–5 and reviews before sending. ---
```

## Boundaries

- **May read:** internal templates, aggregated client summaries, public regulatory material (Form ADV disclosures for the standard paragraph).
- **Must never receive:** client identity documents, account numbers, Social Security numbers, raw custodial statements — including a prospect's statements from their current provider.
- **Human review:** the advisor completes the recommendation and fee sections and reviews before sending and before the follow-up meeting.
- Never states a fee figure, a projected return, or a comparison to the prospect's current adviser.

## Examples

### Example 1 — couple approaching retirement

**Input:** "Coopers, late 50s, both work, want to retire at 62/63. Came in because their broker never calls. Goals in their words: 'know we're actually okay', 'stop guessing on taxes', 'get the kids' inheritance sorted'. Have: two 401(k)s, a taxable account, a rental condo. Worried about healthcare before Medicare."

**Output:** Section 1 describing a dual-income household five years from a planned retirement whose current relationship is transactional; section 2 with bullets like "Know, with numbers, that retiring at 62 and 63 works", "Stop guessing on taxes each year", "Plan the healthcare gap before Medicare", "Set up how the children inherit"; section 3 naming retirement income planning, tax-aware distribution planning and estate coordination; sections 4–5 placeholders; section 6 with three dated next steps; the footer.

### Example 2 — inappropriate input

**Input:** "Proposal for the Coopers. I have their Merrill statements and last two tax returns, use those for the situation section."

**Output:** "I can write the narrative from your discovery notes — household, goals and concerns in their words, and what they hold at a summary level. Their statements and tax returns are outside what this skill may receive. Can you give me the summary instead?"
