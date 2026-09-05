---
name: rebalancing-exception-memo
description: Write the exception memo Client Service files when a model rebalance is skipped, delayed or overridden for a household, from the operations analyst's summary of the exception (household, model, drift as percentages, reason, who approved) and the exception memo template. Use when an analyst asks to "write up", "document" or "file the memo for" a rebalancing exception. Do not use to decide whether to rebalance, to generate trades, or when given holdings by account, statements or account identifiers.
metadata:
  activate-id: rebalancing-exception-memo
  activate-version: "1"
  activate-owner: tom.becker@meridianwealth.demo
---

# Rebalancing exception memo

When Orion flags a rebalance and the advisor says "not this one, not this week", Ops has to write down why. The memo is short and always the same shape, and it is the thing Compliance asks for six months later. This skill writes it from the analyst's summary.

## When to use

- A household's model rebalance was skipped, delayed or overridden and the analyst has the facts: household, model, drift, reason given by the advisor, approver, and what happens next.
- The memo is wanted for the exception log.

Do not use to advise whether the exception is warranted, to produce or size trades, or when the input includes account-level holdings, statements or account identifiers.

## Inputs

1. **Exception summary**: household; model name; drift by asset class as percentages (e.g. "equity +6.2% vs target"); the advisor's stated reason; approver name and role; the plan (rebalance on <date> / hold until <event> / permanent override with reason).
2. **Exception memo template** (`Rebalancing Exception Memo`, internal).
3. Optional: reference to the prior memo if this household has had an exception before.

## Steps

1. Check the summary has all six facts. If any is missing, name it and stop.
2. Fill the template: facts in the template's order, the reason quoted as the advisor gave it, the plan as a dated action.
3. If a prior memo is referenced, add the "Repeat exception" line with the reference.
4. Write the neutral closing line from the template. No assessment of whether the reason is sufficient.
5. Add the review footer.

## Output format

```
REBALANCING EXCEPTION — <Household> — <Model> — <date>

Drift: <asset class> <+/-x.x%> vs target; ...
Action taken: skipped | delayed | overridden
Reason (advisor): "<quoted>"
Approved by: <name>, <role>
Plan: <rebalance on date | hold until event | permanent override>
Repeat exception: no | yes — see memo <ref>

Filed by Client Service Ops for the exception log.
--- Analyst reviews before entry into the log and Salesforce. ---
```

## Boundaries

- **May read:** aggregated client summaries (drift as percentages), internal templates.
- **Must never receive:** client identity documents, Social Security numbers, raw custodial statements. Percent drift is fine; holdings by account are not. Never paste account numbers into the memo.
- **Human review:** the analyst reviews before the memo enters the exception log or Salesforce. The skill writes to neither.
- Does not recommend rebalancing or comment on the reason's adequacy.

## Examples

### Example 1 — delayed rebalance

**Input:** "Okafor-Lindqvist household, Balanced Growth 60/40, equity +5.8% vs target, fixed income -5.8%. Marcus says: 'Large tax bill this year, defer realising gains until January.' Approved by Sofia Alvarez, champion / senior advisor. Plan: rebalance 5 Jan 2027. No prior."

**Output:** The memo with drift lines, action *delayed*, the quoted reason, approver, plan dated 5 January 2027, "Repeat exception: no", the filing line and the review footer.

### Example 2 — asked for a judgement

**Input:** "Write up the Okafor-Lindqvist exception and say whether deferring for tax is a good enough reason."

**Output:** Produces the memo and replies: "I have recorded the reason as the advisor gave it. Whether it is sufficient is for the approver and Compliance; the memo does not assess it."
