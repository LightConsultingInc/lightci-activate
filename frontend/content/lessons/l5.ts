import type { Module } from "./types"

export const MODULE_L5: Module = {
  rung: 5,
  code: "L5",
  name: "Champion",
  tagline: "Review others fairly, give feedback that teaches, and keep the team's queue and backlog moving.",
  outcomes: [
    "Review a teammate's skill against the checklist and land close to the automatic review's score and decision.",
    "Give feedback that is specific, actionable and teaches the principle, with hints before answers.",
    "Run the promotion queue on time, review skills that touch systems of record with extra care, and own the team backlog.",
  ],
  practice:
    "Practice: you'll review two real skills from your team, score each and write short feedback, and see how your review compares.",
  lessons: [
    {
      slug: "l5-grading-with-rubric",
      rung: 5,
      title: "Reviewing someone else's skill with the checklist",
      promise: "You will review a skill against the seven-part checklist and see how close you land to the automatic review.",
      minutes: 4,
      scene: "review-others",
      body: `As a champion, you review other people's skills against the same checklist Activate's automatic review uses. The aim is agreement: your score and the automatic one should land close, and your pass or revise decision should match.

The checklist has seven parts, and you already know them from writing your own skill. Trigger clarity. Scope. Short front page with references behind it. Boundary declaration. Good examples over edge-case lists. Tight context. Behaviour on the author's own sample cases.

Review the skill, not the author. Read the description first and ask what it would catch and miss. Then the front page: could anything be cut. Then the boundary: do the steps honour it. Then run the sample cases in your head and check the expected behaviour is what you would want.

Score each part before you look at the automatic score. If you look first, you will anchor and learn nothing. Where you disagree by more than a little, work out why. Usually one of you saw something the other did not, and the conversation is worth having.

Be consistent across authors. The same skill from a nervous first-timer and from a confident veteran gets the same score. Consistency is what makes the library trustworthy.

Aim to be strict and kind at once: strict on the checklist, kind in the feedback.`,
      keyPoints: [
        "Seven parts: trigger, scope, front page, boundary, examples, tight context, sample-case behaviour.",
        "Score before you look at the automatic score, then work out any big disagreement.",
        "Same skill, same score, whoever wrote it.",
      ],
      example: {
        title: "Try this",
        text: "Take the next skill in your queue. Write seven numbers, one per checklist part, before you open the automatic review. Then compare and note the biggest gap.",
      },
      check: {
        question: "Why should you score a skill before looking at the automatic review's score?",
        options: [
          "To finish faster",
          "So you do not anchor on it and can find out where your judgement differs",
          "Because the automatic review is usually wrong",
          "It does not matter which comes first",
        ],
        answer: 1,
        explanation: "An independent score is the only way to measure agreement and learn from the places you disagree.",
      },
      competencies: ["L5.grading"],
    },
    {
      slug: "l5-feedback-that-teaches",
      rung: 5,
      title: "Giving feedback that teaches",
      promise: "You will write feedback that is specific, actionable and explains the principle, with a hint before the answer.",
      minutes: 4,
      scene: "review-others",
      body: `Good feedback leaves the author able to fix this skill and write a better one next time. Bad feedback fixes this skill and teaches nothing.

Three qualities matter.

**Specific.** Point at the line. "The description says helps with customer emails, so it will fire for complaints and proposals too" beats "trigger is vague".

**Actionable.** Say what would fix it, or what question to ask. "Name the two or three requests this should catch, in the words the team uses."

**Teaches the principle.** One sentence on why. "Claude chooses between dozens of skills from the description alone, so it has to rule out neighbours, not just describe the job." Now the author can write the next trigger line without you.

Give hints before answers. If a boundary list is incomplete, ask "what does step three read?" before you say "you have not declared Salesforce". The author who finds the gap remembers it. The author who is told the gap forgets by Thursday.

Lead with what is right. Not as a courtesy; because the author needs to know what to keep.

Keep it short. Three findings that matter beat twelve that do not. If a skill has twelve problems, the biggest is scope, so say that one.`,
      keyPoints: [
        "Specific, actionable, and one sentence on the principle behind it.",
        "Hints before answers: ask the question that leads the author to the gap.",
        "Three findings that matter, starting with what to keep.",
      ],
      example: {
        title: "Try this",
        text: "Rewrite the last piece of feedback you gave as three lines: one thing to keep, one question that points at the biggest gap, one sentence on why it matters.",
      },
      check: {
        question: "A teammate's boundary declaration is missing the Salesforce read that step three does. What is the best first line of feedback?",
        options: [
          "\"Boundary incomplete.\"",
          "\"You forgot Salesforce; add it.\"",
          "\"What does step three read, and is it in your may-read list?\"",
          "\"Revise and resubmit.\"",
        ],
        answer: 2,
        explanation: "A hint that leads the author to find the gap teaches more than naming it, and is still specific and actionable.",
      },
      competencies: ["L5.feedback"],
    },
    {
      slug: "l5-running-the-queue",
      rung: 5,
      title: "Running the review and promotion queue",
      promise: "You will clear the queue on a rhythm, choose approve, revise or escalate, and watch the library's health.",
      minutes: 4,
      scene: "promotion-queue",
      body: `The promotion queue is where the team's work waits for you. Run it well and skills ship within days. Run it badly and people stop writing them.

Set a rhythm. Look at the queue at a fixed time, at least twice a week. Each request has a package on one screen: skill, score, boundary check, sample cases. Most take ten minutes to review. Aim to return every request within the team's agreed time, usually a few working days. A request that sits for two weeks tells the author their effort did not matter.

Three outcomes. **Approve** when the checklist is met and the boundary is clean. **Revise** with feedback that teaches, and say what will make it pass. **Escalate** when it is not your call: a skill that touches a forbidden data class needs compliance; a skill that overlaps with another team's needs both champions; anything you are unsure about goes to your activation lead.

Watch the library, not just the queue. Skills that nobody has used for a month, scores that dropped after a model change, a boundary that is missing a newly restricted class, two skills with overlapping triggers. Each is a short conversation with an owner.

Your job is stewardship. The queue should be a place work flows through, not where it goes to wait.`,
      keyPoints: [
        "Fixed rhythm, at least twice a week; return every request within the agreed time.",
        "Approve, revise with teaching feedback, or escalate to compliance, another champion, or your activation lead.",
        "Watch library health too: unused skills, dropped scores, stale boundaries, overlapping triggers.",
      ],
      example: {
        title: "Try this",
        text: "Put two fifteen-minute slots in your calendar this week labelled \"queue\". In the first, write approve, revise or escalate next to every request waiting.",
      },
      check: {
        question: "A submitted skill reads one of the firm's forbidden data classes. What do you do?",
        options: [
          "Approve it if the skill is otherwise good",
          "Reject it outright",
          "Escalate to compliance for their review alongside yours",
          "Ask the author to remove the declaration",
        ],
        answer: 2,
        explanation: "Forbidden classes are not the champion's call alone; compliance reviews too, and the declaration must stay honest.",
      },
      competencies: ["L5.stewardship"],
    },
    {
      slug: "l5-system-of-record",
      rung: 5,
      title: "Reviewing a skill that touches a system of record",
      promise: "You will check five things before approving a skill that writes to Salesforce, the CRM, or any other system of record.",
      minutes: 4,
      scene: "review-others",
      body: `Most skills read. A few write to Salesforce, the CRM, or another system of record. Those need a slower review, because a wrong write is not a bad draft; it is a bad record that other people will rely on.

Before approving, check five things.

**Is the write allowed?** The firm's policy names which systems a skill may write to. If the system is not named, the skill cannot write to it, whatever the author intended.

**Is the write declared?** The boundary declaration lists it under may write, and the steps match. A step that says "update the note" with nothing declared fails.

**Does a person confirm before the write?** The skill drafts the change and stops; a person saves it. Look for the review point in the steps, not just in the declaration.

**Can it be undone?** Ask the author. If a wrong write cannot be reversed, that is a reason to keep the step human for now.

**Do the sample cases cover the empty and the wrong record?** A case where the source has no record, and one where the record is stale, each with the skill stopping rather than guessing.

If any of the five is missing, revise with a specific line. If the system also holds a forbidden data class, compliance reviews too.`,
      keyPoints: [
        "Allowed by policy, declared under may write, and the steps match.",
        "A person confirms before the write, and the write can be undone.",
        "Sample cases include an empty record and a stale record, with the skill stopping rather than guessing.",
      ],
      example: {
        title: "Try this",
        text: "Open the next skill in your queue that writes to a system. Tick the five checks on paper. Send the author one line for the first unticked box.",
      },
      check: {
        question: "A skill updates a deal stage in Salesforce. The step is declared, and a person confirms before saving. What else must be true before you approve?",
        options: [
          "Nothing; that is enough",
          "The firm's policy allows writes to Salesforce and the change can be undone",
          "The author has used Salesforce for a year",
          "The skill also reads Gong",
        ],
        answer: 1,
        explanation: "A write also has to be allowed by the firm's policy and reversible; declaration and confirmation alone are not enough.",
      },
      competencies: ["L5.grading", "L5.stewardship"],
    },
    {
      slug: "l5-stalled-teammate",
      rung: 5,
      title: "Spotting a stalled teammate and what to do",
      promise: "You will notice a stall early, start with the work rather than the person, and know when to escalate.",
      minutes: 4,
      scene: "review-others",
      body: `Not everyone moves through the modules at the same pace, and that is fine. A stall is different: someone has stopped producing anything at their level, or keeps missing the same thing, and nothing is changing. Champions see this before anyone else.

The signs are on your Team page. No submission in two or three weeks. The same checklist item scored low three times running. Recaps skipped. A first skill abandoned mid-way.

Do not start with "why haven't you". Start with the work. "What is the thing on your calendar this week that annoys you most?" Almost always, the stall is not about Claude. The person is busy, the exercise did not match their real work, or they thought a whole document was off-limits when only one line of it was.

Each has a fix. Busy: shrink the exercise to twenty minutes on something already due. Poor match: ask for a new exercise and say what the person actually does. Over-caution: sit with them for one prompt, paste the real document together, and redact just the forbidden item.

If two conversations change nothing, escalate to your activation lead. That is not giving up on the teammate. It is getting them help you cannot give alone.`,
      keyPoints: [
        "A stall is no submission for weeks or the same item missed repeatedly, not just a slow pace.",
        "Start with the work on their calendar, not with why they have not done the exercise.",
        "Shrink it, re-match it, or sit with them for one prompt; escalate after two conversations that change nothing.",
      ],
      example: {
        title: "Try this",
        text: "Open your Team page and find anyone with no submission in three weeks. Send one message: \"What's the most annoying thing on your calendar this week?\"",
      },
      check: {
        question: "A teammate has submitted nothing for three weeks. What is the best opening?",
        options: [
          "\"Why haven't you done your exercises?\"",
          "\"What is the most annoying thing on your calendar this week?\"",
          "\"You are behind the rest of the team.\"",
          "Say nothing and wait another month",
        ],
        answer: 1,
        explanation: "Starting with real work usually reveals the actual cause, which is rarely about Claude, and gives you the next exercise.",
      },
      competencies: ["L5.stewardship", "L5.feedback"],
    },
    {
      slug: "l5-own-the-backlog",
      rung: 5,
      title: "Owning the team backlog",
      promise: "You will keep the ranked list of workflows honest against reality and feed it with what you hear from the team.",
      minutes: 4,
      scene: "workflow-map",
      body: `The backlog is the list of workflows your team could hand to Claude next, ranked. As champion, you own it. Nobody else has both the view of the team's real work and the standing to say what matters.

Activate ranks candidates by hours, value, how ready they are to automate, and compliance exposure. Your job is to check its work against reality. It cannot know that the quarterly report process is about to change, or that the proposal workflow is one person's job and she is leaving in March.

Once a month, open the backlog with your team's workflow maps beside it. Ask three questions of the top five. Is this still how the work goes? Is the baseline still right? Is the person named as owner still the right person? Move things up or down and write one line on why.

Prefer boring, frequent workflows over impressive rare ones. Weekly meeting prep saves more hours than an elegant one-off. Prefer read-heavy workflows while the team is learning; save the ones that write to systems of record for when your reviewers are practised.

Feed the backlog with what you hear. Every "I spend all Friday on" in a team meeting is a candidate.

A backlog nobody owns fills with wishes. Yours should be a plan.`,
      keyPoints: [
        "Check the automatic ranking against what you know is changing in the team.",
        "Monthly: is this still how the work goes, is the baseline right, is the owner right? Write one line on why.",
        "Boring and frequent beats impressive and rare; read-heavy first while the team learns.",
      ],
      example: {
        title: "Try this",
        text: "Open the backlog and look at the top five. Move one item up or down based on something you know that the ranking does not, and write one line saying why.",
      },
      check: {
        question: "Two candidates: a weekly workflow that only reads from the CRM, and a rare, impressive one that writes deal stages back. Which goes first while the team is still learning?",
        options: [
          "The impressive one; bigger win",
          "The weekly read-only one",
          "Both at once",
          "Neither; wait for the ranking to change",
        ],
        answer: 1,
        explanation: "Frequent, read-heavy work returns more hours and lets reviewers practise before anything writes to a system of record.",
      },
      competencies: ["L5.stewardship"],
    },
  ],
}
