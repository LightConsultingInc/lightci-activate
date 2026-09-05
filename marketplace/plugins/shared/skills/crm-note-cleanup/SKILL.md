---
name: crm-note-cleanup
description: Rewrite a rough post-meeting note into the structured Salesforce activity note Meridian uses (context, decisions, follow-ups, next contact) from the advisor's or associate's raw text. Use when someone pastes a messy note and asks to "clean up", "format" or "make this a CRM note". Do not use for client-facing emails, for notes that already follow the structure, or when the note contains account numbers or statement figures.
metadata:
  activate-id: crm-note-cleanup
  activate-version: "2"
  activate-owner: marcus.reid@meridianwealth.demo
---

# CRM note cleanup

> **Deprecated (Aug 2026).** `client-followup-notes` v2 produces the Salesforce note together with the follow-up email. Use that skill for meeting notes; this one remains only for cleaning up legacy notes and will be removed from group assignments.

Friday's Salesforce notes are written from memory because Tuesday's note was never written. This skill takes the raw note — dictated, typed, half sentences — and gives back the structured activity note so it takes thirty seconds to paste, not fifteen minutes to compose.

## When to use

- Someone has a rough note from a client interaction and wants it in Meridian's Salesforce note shape.
- The note is about an existing household.

Do not use to write the client email (`client-followup-notes`), when the note is already structured, or when it contains account identifiers or figures copied from a statement.

## Inputs

1. **Raw note** in any form.
2. **Interaction type**: meeting, call, email exchange.
3. Optional: the date if not today.

## Steps

1. Identify the four sections: **Context** (why the interaction happened), **Decisions**, **Follow-ups** (with owner: us / client), **Next contact** (date or trigger).
2. Keep the author's wording for anything the client said. Do not add interpretation.
3. Anything personal that does not belong in a CRM note (health details, family conflict) is left out and returned separately for the author to decide.
4. Output the note in the fixed shape, under 150 words.
5. Add the review line.

## Output format

```
[<Interaction type> — <date>]
Context: ...
Decisions: ...
Follow-ups: (us) ... | (client) ...
Next contact: ...

--- Review before entering in Salesforce. ---
Left out: ...
```

## Boundaries

- **May read:** the Salesforce summary export, internal templates.
- **Must never receive:** account numbers, Social Security numbers, client identity documents, raw custodial statements.
- **Human review:** the author reviews before entering the note in Salesforce. The skill never writes to Salesforce.

## Examples

### Example 1

**Input:** "call w/ Dana, she's worried about the market, told her plan is fine, she wants to talk about 529 for the new baby, I'll send the 529 one-pager, check in after the baby comes in Nov. also her mom is unwell."

**Output:**
```
[Call — <date>]
Context: Dana called with market concerns.
Decisions: Confirmed plan remains appropriate; no changes.
Follow-ups: (us) send 529 one-pager for the new baby | (client) none
Next contact: after the baby arrives, November

--- Review before entering in Salesforce. ---
Left out: mother's health
```

### Example 2

**Input:** "Format this: met the Reyes, agreed to move $60k from acct 8834-2210 to the IRA."

**Output:** The structured note with "agreed to move approximately $60k to the IRA" and no account identifier, plus: "I removed the account number; it is outside what this skill may receive."
