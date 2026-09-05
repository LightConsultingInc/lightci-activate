---
name: ips-refresh-checklist
description: Produce the pre-meeting checklist and client-facing change summary for an Investment Policy Statement refresh, from the current IPS summary (objectives, constraints, target allocation as percentages) and the advisor's list of what changed. Use when an advisor asks to "refresh", "update" or "prepare the IPS review for" a named household. Do not use to write the IPS document itself, to choose or justify an allocation, or when given account-level holdings or statements.
metadata:
  activate-id: ips-refresh-checklist
  activate-version: "1"
  activate-owner: sofia.alvarez@meridianwealth.demo
---

# IPS refresh checklist

An IPS refresh goes wrong in one of two ways: something changed and the IPS did not, or the IPS changed and nobody told the client in plain words. This skill produces both halves — the advisor's checklist of what to confirm, and the one-paragraph-per-change summary the client reads.

## When to use

- A household's IPS is due for its periodic review, or a life event has triggered one.
- The advisor has the current IPS summary and knows what changed.

Do not use to author the IPS from scratch (the compliance-approved IPS template is completed by the advisor), to recommend or defend an allocation, or when the input includes holdings by account or statement figures.

## Inputs

1. **Current IPS summary**: objectives, time horizon, risk tolerance band, liquidity needs, constraints, target allocation as percentages with ranges, review frequency, last review date.
2. **What changed**: the advisor's list (life event, goal change, risk tolerance re-score, new constraint, allocation change already agreed with the household).
3. **IPS refresh template** (`IPS Refresh Checklist`, internal).

## Steps

1. Build the **advisor checklist**: for each IPS section, state whether it is *unchanged*, *changed* (with the old → new value), or *to confirm* (the change list implies it may need updating but the advisor did not say). Never mark a section changed unless the advisor's list says so.
2. Write the **client change summary**: one short paragraph per changed section, in plain language, saying what changed, why (from the advisor's list), and what it means in practice. No percentages beyond the target allocation.
3. List the **signatures and dates** needed per the template.
4. Add the review footer.

## Output format

```
IPS REFRESH — <Household> — prepared <date>

Advisor checklist
| Section | Status | Detail |
| Objectives | unchanged / changed / to confirm | old → new |
...

Client change summary
<paragraph per change>

To complete
- [ ] Signatures: ...
- [ ] Date the refreshed IPS; set next review <date>

--- Draft. Advisor reviews before the client meeting and before sending. ---
```

## Boundaries

- **May read:** internal templates, aggregated client summaries, the Salesforce summary export.
- **Must never receive:** client identity documents, account numbers, Social Security numbers, raw custodial statements.
- **Human review:** the advisor reviews before the client meeting and before sending the summary. The IPS document itself is completed and signed outside this skill.
- Does not recommend allocations or comment on suitability.

## Examples

### Example 1 — one life event, one agreed change

**Input:** IPS summary: objective growth with income at 65; horizon 12 years; risk band moderate; target 65/35 (±5). Changed: "Rita is retiring two years early at 63; we agreed to move to 60/40."

**Output:** Checklist marking Time horizon *to confirm* (retirement moved earlier), Objectives *to confirm*, Target allocation *changed* 65/35 → 60/40, others unchanged; a client summary paragraph explaining the earlier retirement and the more conservative mix; signature and date items; footer.

### Example 2 — out-of-scope ask

**Input:** "Refresh the Delgados' IPS and tell me whether 70/30 is right for them."

**Output:** Produces the checklist from the summary and the change list, and says: "Whether 70/30 is appropriate is your call and the IPS template's suitability section; this skill records the change you decide on and explains it to the client."
