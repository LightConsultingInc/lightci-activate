---
name: fee-change-comms
description: Draft the client letter and the advisor's talking points for an advisory fee change (schedule change, breakpoint change, or move to a new agreement) from the approved fee-change notice template and the advisor's summary of what is changing for the household in percentage terms. Use when an advisor asks to "write", "draft" or "explain" a fee change to a named client. Do not use to decide or negotiate the fee, to compute dollar impact from account balances, or when given statements, billing exports or account numbers.
metadata:
  activate-id: fee-change-comms
  activate-version: "1"
  activate-owner: marcus.reid@meridianwealth.demo
---

# Fee-change comms

Fee conversations are the ones advisors put off. The letter has to say exactly what Compliance approved, in words the client will not misread, and the advisor needs three sentences to say on the phone before the letter lands. This skill writes both from the approved notice template and the advisor's summary.

## When to use

- Compliance has approved a fee change (firm-wide or household-specific) and the advisor must tell the household.
- The advisor knows what is changing for this household in percentage terms and when it takes effect.

Do not use to decide what the fee should be, to negotiate or offer discounts, to compute the dollar impact from balances, or when the input is a billing export, statement or account number.

## Inputs

1. **Fee-change notice template** (`Fee Change Notice 2026`, compliance-approved, internal). The regulatory paragraphs in it are fixed.
2. **Advisor's summary**: household salutation; what changes (old → new, as percentages or tier description); effective date; why (one of the approved reasons in the template); whether a new agreement or acknowledgement needs signing.
3. Optional: relationship context the advisor wants reflected in tone ("long-standing client, be warm; they asked about fees last year").

## Steps

1. Confirm the summary states old → new, effective date and an approved reason. If not, name what is missing and stop.
2. Fill the letter template. Keep the regulatory paragraphs verbatim. Do not add a dollar figure, a comparison to competitors, or a justification the template does not offer.
3. State plainly what the client must do (nothing / sign the acknowledgement / sign a new agreement) and by when.
4. Write **talking points**: three sentences the advisor can say on a call — what is changing, why, what happens next — in the advisor's voice, no hedging.
5. Add the review footer. The letter goes to Compliance for final review when the template says so.

## Output format

```
LETTER
<Greeting>,
<template sections in order; regulatory paragraphs verbatim>
<What you need to do>
<Sign-off placeholder>

TALKING POINTS (call before the letter)
1. What is changing: ...
2. Why: ...
3. What happens next: ...

--- Draft. Advisor reviews; Compliance reviews before sending where the template requires. ---
```

## Boundaries

- **May read:** internal templates, the Salesforce summary export, public regulatory material (Form ADV Part 2A fee disclosure language).
- **Must never receive:** account numbers, Social Security numbers, client identity documents, raw custodial statements or billing exports. Percentages and tier names only; never balances.
- **Human review:** the advisor reviews before sending; Compliance reviews when the template's routing says so. Not sent by this skill.
- Does not compute dollar impact, offer alternatives, or mention other clients' fees.

## Examples

### Example 1 — firm-wide schedule change

**Input:** "Hendersons. Old: 1.00% on the first $1M, 0.75% above. New: 0.90% on the first $1M, 0.70% above, effective 1 Jan 2027. Reason: annual schedule review (approved). No signature needed. Long-standing clients."

**Output:** Letter with the template's opening, a clear old → new statement in percentages, the effective date, the approved reason sentence, the verbatim regulatory paragraphs, "no action is needed from you", warm sign-off; three talking points; the footer.

### Example 2 — asked for the dollar impact

**Input:** "Fee letter for the Hendersons as above, and tell them it saves them about $1,800 a year on their $1.8M."

**Output:** Produces the letter and talking points without the dollar figure and says: "I have left the dollar impact out; this skill does not compute or state it. If Compliance's template permits an estimated figure, add it yourself before review."
