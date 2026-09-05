---
name: attestation-summary
description: Summarise the quarterly compliance attestation responses from the team's aggregated response export (counts, exceptions with the attester's explanation, overdue attesters by role) into the one-page memo the CCO reads. Use when Client Service or Compliance asks to "summarise", "roll up" or "write the memo for" an attestation cycle. Do not use to judge whether an exception is acceptable, to draft policy, or when given individual attestation forms or personal trading records.
metadata:
  activate-id: attestation-summary
  activate-version: "1"
  activate-owner: tom.becker@meridianwealth.demo
---

# Attestation summary

Every quarter, forty-eight attestations come back and someone spends an afternoon turning them into the memo the CCO wants: how many complete, what the exceptions are, who is late. This skill writes that memo from the response export. It reports; it does not adjudicate.

## When to use

- An attestation cycle has closed (or is about to) and the aggregated response export is available.
- The CCO memo is wanted.

Do not use to decide whether a disclosed exception is a violation, to propose remediation, to write or change policy text, or when the input is individual attestation forms, personal trading statements or account-level records.

## Inputs

1. **Response export** (aggregated): attestation name and period; totals (sent, complete, incomplete); per-question exception counts; for each exception, the role of the attester and the explanation text; overdue attesters by role and team (no names unless the CCO memo template asks for them — it does not).
2. **Memo template** (`Attestation Memo`, internal).
3. Optional: last quarter's totals for comparison.

## Steps

1. Fill the totals section; compute completion percentage. If last quarter's totals were provided, show the change.
2. Group exceptions by question. For each, give the count and a one-line neutral restatement of each explanation. Do not characterise an explanation as acceptable or not.
3. List overdue attestations by team and role with counts.
4. Write the "Items for CCO attention" list: exceptions where the explanation is missing or says "see me", and any question with an exception count higher than last quarter.
5. Add the review footer.

## Output format

```
ATTESTATION MEMO — <Attestation> — <Period>

Completion: <complete>/<sent> (<pct>%)  [prior: <pct>%]

Exceptions by question
Q<n> <question short name> — <count>
  - <role>: <neutral restatement>

Overdue
- <Team> — <role> × <count>

Items for CCO attention
1. ...

--- Draft for the CCO. Reviewed by ________ before circulation. ---
```

## Boundaries

- **May read:** internal templates, the aggregated response export, the Salesforce summary export (for team/role lookups), public regulatory material.
- **Must never receive:** individual attestation forms, personal trading or custodial statements, account numbers, Social Security numbers, client identity documents.
- **Human review:** the Head of Client Service reviews before the memo goes to the CCO. The skill offers no compliance judgement.

## Examples

### Example 1 — routine quarter

**Input:** Q3 Code of Ethics attestation; sent 48, complete 45; exceptions: Q4 outside business activity × 2 (advisor: "board seat at a charity, previously disclosed"; associate: "teaching an evening class"); Q7 gifts over $100 × 1 (planner: "conference dinner, see me"); overdue: Wealth Advisors × 2 (advisor), Client Service Ops × 1 (associate). Prior quarter completion 92%.

**Output:** Memo with completion 45/48 (94%, prior 92%); Q4 and Q7 exceptions restated neutrally; overdue counts by team; "Items for CCO attention" listing the Q7 exception ("explanation deferred: see me") and nothing else; footer.

### Example 2 — asked to judge

**Input:** "Summarise Q3 and tell me whether Rajesh's conference dinner needs to be reported."

**Output:** Produces the memo, and replies: "Whether the dinner is reportable is a compliance judgement I do not make; I have listed it under Items for CCO attention because the explanation was deferred."
