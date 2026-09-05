---
name: client-followup-notes
description: Write the same-day follow-up email and the matching Salesforce activity note after a Meridian client review meeting, from the advisor's rough meeting notes, in the "discussed / agreed / needed from you" shape the team uses. Use when an advisor pastes meeting notes and asks for the follow-up, recap, or "the email to the client". Do not use for prospect follow-ups after discovery calls, for fee-change or IPS communications (separate skills), or when the notes contain account numbers or statement figures.
metadata:
  activate-id: client-followup-notes
  activate-version: "2"
  activate-owner: sofia.alvarez@meridianwealth.demo
---

# Client follow-up notes

The meeting ends at four; the email should go at five, not seven. This skill turns the advisor's rough notes into the follow-up email in Meridian's shape. It keeps the advisor's words for anything the client said, and it never adds advice that was not given in the room.

## When to use

- An advisor has just finished a review meeting with an existing household and has notes (typed, dictated, or bullet points).
- They want the client email.

Do not use after a prospect discovery call (those get a different, no-commitments note), for fee-change letters (`fee-change-comms`), for IPS refresh summaries (`ips-refresh-checklist`), or when the notes include account numbers or figures copied from a statement.

## Inputs

1. **Meeting notes** in any form. Names, what was discussed, what was decided, what each side owes.
2. **Household salutation** as the advisor uses it ("Hi Dana and Chris").
3. Optional: a due date for the client's action items.

## Steps

1. Sort the notes into three buckets: **What we discussed**, **What we agreed**, **What we need from you**. Anything that does not fit is left out and listed for the advisor separately under "Not included".
2. Keep every commitment in the advisor's own words. Do not soften, strengthen, or add recommendations.
3. Convert "needed from you" items into a checklist with a date if one was given; otherwise write "when convenient".
4. Write the email: greeting, one warm sentence, the three sections, a closing line offering to talk, the advisor's sign-off block placeholder.
5. Keep it under 220 words. No attachments referenced unless the notes say one is being sent.
6. Add the review footer.
7. Below the email, produce the **Salesforce activity note** in the fixed four-line shape (Context / Decisions / Follow-ups / Next contact) from the same buckets, under 80 words. The note is pasted by the advisor after review; the skill never enters it.

## Output format

```
Subject: Follow-up from today's review

<Greeting>,

<One sentence thanking them / referencing the meeting.>

What we discussed
- ...

What we agreed
- ...

What we need from you
- [ ] ... (by <date> | when convenient)

<Closing line.>
<Sign-off placeholder>

--- Draft. Advisor reviews before sending. ---

Not included (for the advisor): - ...

SALESFORCE NOTE (review before entry)
[Meeting — <date>] Context: ... | Decisions: ... | Follow-ups: (us) ... (client) ... | Next contact: ...
```

## Boundaries

- **May read:** calendar entries, the Salesforce summary export, internal templates.
- **Must never receive:** account numbers, Social Security numbers, client identity documents, raw custodial statements. Notes that mention "the IRA" or "the joint account" are fine; notes with account identifiers or statement line items are not.
- **Human review:** the advisor reviews the email before sending and the note before entering it in Salesforce. Nothing is entered into Salesforce by this skill.

## Examples

### Example 1 — routine review

**Input:** "Dana + Chris. talked markets, they're fine. agreed: move 529 to age-based, I'll send the form. they want to look at umbrella coverage — I said get a quote from their P&C agent and send it to me. Chris starting new job in Oct, needs to roll old 401k, he'll send the plan statement. Kids soccer this weekend."

**Output:**
```
Subject: Follow-up from today's review

Hi Dana and Chris,

Thank you for the time today — good to catch up.

What we discussed
- Markets and how your plan is positioned; no changes needed.
- Umbrella liability coverage.
- Chris's new role starting in October.

What we agreed
- We will move the 529 to the age-based option. I will send the form.
- You will get an umbrella quote from your P&C agent and send it to me.

What we need from you
- [ ] The old 401(k) plan statement so we can plan the rollover (when convenient)
- [ ] The umbrella quote once you have it (when convenient)

Happy to talk any of this through before then.
[Advisor sign-off]

--- Draft. Advisor reviews before sending. ---

Not included (for the advisor): - Kids' soccer this weekend

SALESFORCE NOTE (review before entry)
[Meeting — <date>] Context: quarterly review, markets + coverage | Decisions: 529 to age-based; no allocation change | Follow-ups: (us) send 529 form (client) umbrella quote, old 401(k) statement | Next contact: after Chris starts new role in Oct
```

### Example 2 — must decline part of the input

**Input:** "Follow-up for the Reyes. Notes: discussed rebalancing, agreed to trim tech to 25%. Their Schwab account ****4471 has $1,204,331.18 — mention that we'll move about $60k."

**Output:** Produces the email with "We agreed to trim the technology allocation toward 25%" and no account identifier or balance, and tells the advisor: "I left out the account number and the balance figure; those are outside what this skill may receive. If you want the approximate amount in the email, add it yourself before sending."
