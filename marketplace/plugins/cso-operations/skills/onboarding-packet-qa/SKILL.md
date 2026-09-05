---
name: onboarding-packet-qa
description: Check a new-client onboarding packet for completeness and consistency using the onboarding specialist's field-level checklist (which forms are present, which fields are filled, which signatures are dated) and the account-opening requirements matrix. Use when someone in Client Service asks to "QA", "check" or "review the packet for" a new household before submission. Do not use on the documents themselves — the input is the redacted checklist, never the forms, IDs or statements.
metadata:
  activate-id: onboarding-packet-qa
  activate-version: "1"
  activate-owner: tom.becker@meridianwealth.demo
---

# Onboarding packet QA

Onboarding packets bounce from the custodian for the same dozen reasons: a missing signature date, a beneficiary percentage that does not sum to 100, a trust account without the certification page. This skill catches those from the specialist's checklist before the packet is submitted. It works on the *checklist of what is present*, never on the documents.

## When to use

- An onboarding specialist has completed the packet checklist for a new household (form present yes/no, field filled yes/no, signature dated yes/no, account types, registration types).
- They want the packet checked against the requirements matrix before submission.

Do not use with the actual forms, ID scans, statements or any field *values* (names, dates of birth, numbers). If the input contains a document rather than a checklist, stop and ask for the checklist.

## Inputs

1. **Packet checklist** (`Onboarding Checklist v3`, internal): one row per required item with present / filled / dated flags, account type and registration for each account being opened, transfer type if any.
2. **Requirements matrix** (`Account Opening Requirements`, internal): which forms and pages each registration type needs.
3. Optional: the custodian's last rejection reason, if this is a resubmission.

## Steps

1. For each account being opened, look up the required items in the matrix and compare to the checklist. List anything **missing**, **present but unfilled**, or **unsigned/undated**.
2. Run the consistency checks the matrix defines (beneficiary percentages sum to 100; joint registrations have both signatures; trust accounts have the certification page; transfer forms match the account type).
3. If this is a resubmission, confirm the prior rejection reason is addressed and say so explicitly.
4. Produce the QA result: **Ready to submit** or **Not ready** with a numbered fix list, each item naming the form and the field flag, never a value.
5. Add the review footer.

## Output format

```
ONBOARDING QA — <Household> — <n> accounts — <date>

Result: READY TO SUBMIT | NOT READY

Fix list
1. <Form> — <what is missing / unfilled / undated>
...

Consistency checks
- Beneficiary percentages: pass / fail
- ...

Prior rejection addressed: yes / no / n.a.

--- Specialist reviews before submission; nothing is entered in Salesforce from this output. ---
```

## Boundaries

- **May read:** internal templates and checklists, the Salesforce summary export (account types and registrations only).
- **Must never receive:** client identity documents, account numbers, Social Security numbers, raw custodial statements, or any field value copied from a form. Flags only.
- **Human review:** the specialist reviews the result before submission and before any CRM entry. The skill never marks a packet submitted or updates Salesforce.

## Examples

### Example 1 — one gap

**Input:** Checklist for the Ferreira household: individual brokerage + joint brokerage + Roth IRA. All forms present. Roth IRA beneficiary designation: filled yes, percentages 60/30. Joint account application: signature 1 dated yes, signature 2 dated no. Transfer form: present, matches Roth.

**Output:**
```
ONBOARDING QA — Ferreira — 3 accounts — <date>

Result: NOT READY

Fix list
1. Roth IRA beneficiary designation — percentages total 90; must total 100
2. Joint account application — second signature not dated

Consistency checks
- Beneficiary percentages: fail (Roth IRA)
- Joint signatures: fail (date missing)
- Trust certification: n.a.
- Transfer form matches account type: pass

Prior rejection addressed: n.a.

--- Specialist reviews before submission; nothing is entered in Salesforce from this output. ---
```

### Example 2 — documents offered instead of the checklist

**Input:** "Can you QA the Ferreira packet? PDFs of all the signed forms and their driver's licences attached."

**Output:** "I can check the packet from the onboarding checklist — the form-present / filled / dated flags and the account registrations — but not from the forms or ID copies, which are outside what this skill may receive. Please fill in the checklist and paste that."
