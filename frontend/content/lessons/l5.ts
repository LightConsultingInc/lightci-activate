import type { Module } from "./types"

export const MODULE_L5: Module = {
  rung: 5,
  code: "L5",
  name: "Champion",
  tagline: "Review your teammates' work so they get better, keep the queue moving, and own what the team does next.",
  outcomes: [
    "Score a teammate's draft out of 10 and name the one change that matters most, and why.",
    "Give feedback as a hint the person can act on, and decide approve or send back in one clear line.",
    "Spot a stuck teammate early, and keep the team's list of what to do next written so anyone can read it.",
  ],
  practice:
    "Practice: you'll see a teammate's work, give it a score out of 10 with a short note, and see where you and our reviewer agree.",
  lessons: [
    {
      slug: "l5-name-the-one-change",
      rung: 5,
      title: "A review that names one change",
      promise: "You will review a teammate's draft so they know exactly what to change and why.",
      minutes: 3,
      scene: "review-others",
      body: `Your team will only trust what you sign off on, so your review is the product. A review that says "looks good" tells the author nothing, and tells the team nothing about what good means.

**Before.** A teammate sends you a prompt for the weekly sales report. You reply: "Looks good, nice work, ship it."

**After.** "7 out of 10. The one thing to change: it never says who reads the report. Add a line like 'for the regional managers, who skim it in five minutes', because Claude picks the length and the level of detail from the reader. The three examples of past reports are exactly right. Keep those."

Notice the shape. A score, so the author knows how far they are from done. One change, not a list, because one thing fixed is worth more than twelve things noted. A why, so the author can write the next prompt without you. And a keep, so they know what not to touch.

If you spot five problems, pick the one that would change the output most and say that. The rest can wait for the next draft.`,
      keyPoints: [
        "Give a score and one change, not \"looks good\".",
        "Say why the change matters, so the next draft does not need you.",
        "Name what to keep.",
      ],
      example: {
        title: "Try this",
        text: "Take the last draft a teammate sent you. Write one sentence naming the single most useful change, and one sentence on why.",
      },
      check: {
        question: "A teammate sends you a draft with five problems. What does the best review do?",
        options: [
          "List all five so nothing is missed",
          "Say \"looks good\" to keep them motivated",
          "Name the one change that would most improve the output, say why, and say what to keep",
          "Rewrite the draft yourself and send it back",
        ],
        answer: 2,
        explanation: "One change with a reason gets fixed and teaches something. A list of five gets skimmed, and \"looks good\" teaches nothing.",
      },
      competencies: ["L5.grading", "L5.feedback"],
    },
    {
      slug: "l5-hint-before-answer",
      rung: 5,
      title: "A hint beats an answer",
      promise: "You will write feedback that lets the author find the fix, so they never make that mistake again.",
      minutes: 3,
      scene: "review-others",
      body: `Feedback that hands over the answer fixes one draft. A hint fixes every draft after it, because the author found the gap themselves and will look for it next time.

A teammate shares a Project for customer follow-up emails. The instructions say "be professional" but never say the emails go to customers who have just complained.

**Giving the answer.** "Your instructions are missing the situation. Add: 'These go to customers who complained this week, so acknowledge the problem before anything else.'"

**Giving a hint.** "Read your instructions as if you were Claude. What do you know about the person receiving this email, and what mood they are in? What would you add if you had one line?"

The second takes thirty seconds longer, and the author will never leave the reader out again.

Two rules for hints. Point at the exact place so the hunt is short: "look at the instructions", not "think about context". Ask a question they can answer from the draft in front of them.

Give the answer only when the hint has failed. Then say it plainly, and say why.`,
      keyPoints: [
        "A hint the author works out sticks; an answer is forgotten by next week.",
        "Point at the exact spot and ask a question they can answer from the draft.",
        "Give the answer only after a hint has failed, and say why.",
      ],
      example: {
        title: "Try this",
        text: "Find one weak line in a teammate's prompt. Instead of fixing it, write one question that would lead them to the fix.",
      },
      check: {
        question: "A teammate's instructions never say who receives the emails. What is the best first line of feedback?",
        options: [
          "\"Add: these go to customers who have complained.\"",
          "\"What do you know about the person receiving this email? What would you add if you had one line?\"",
          "\"Context is missing.\"",
          "\"Rewrite it and send it again.\"",
        ],
        answer: 1,
        explanation: "It points at the exact spot and asks a question the author can answer from their own draft, so they find the gap and remember it.",
      },
      competencies: ["L5.feedback"],
    },
    {
      slug: "l5-approve-or-send-back",
      rung: 5,
      title: "Approve or send back, in one line",
      promise: "You will clear a review request with a clear decision and the one line that explains it.",
      minutes: 3,
      scene: "promotion-queue",
      body: `Work waits in your review queue until you decide, so a fast, clear decision is how the team's work ships. Sit on one for two weeks and the author learns it did not matter.

Every request gets one of two outcomes, plus one line saying why.

**Approve.** A skill for meeting prep. It handles one job ("prep me for a customer call"), reads only the calendar and shared notes, and its three sample requests each produce a one-page brief. Your line: "Approved: does one job, says what it reads, all three samples work."

**Send back.** A skill for renewal reminders. Its rules say it must never see payment details, but step four says "pull the last invoice". Your line: "Back to you: step four reads invoices, which your own rules forbid. Fix one or the other."

The line is the whole review: what you checked and, if sent back, what would make it pass.

Two habits keep the queue moving. Open it at a fixed time twice a week, and decide everything you open. Anything touching payment or health details goes to whoever handles that in your firm, never to you alone.`,
      keyPoints: [
        "Two outcomes, approve or send back, each with one line saying why.",
        "The send-back line names the single thing that would make it pass.",
        "Fixed time twice a week, decide everything you open; payment or health details never get approved by you alone.",
      ],
      example: {
        title: "Try this",
        text: "Open the oldest request waiting on you. Decide approve or send back, and write the one line that says why.",
      },
      check: {
        question: "A skill's rules say it must never see payment details, but one step reads the last invoice. What do you do?",
        options: [
          "Approve it; the rest is fine",
          "Send it back with one line naming the step that breaks its own rule",
          "Delete the rule so the step is allowed",
          "Wait until the author asks about it",
        ],
        answer: 1,
        explanation: "The skill contradicts itself. One line naming the step tells the author exactly what to fix, and the rule about payment details stays honest.",
      },
      competencies: ["L5.stewardship", "L5.grading"],
    },
    {
      slug: "l5-two-signs-of-stuck",
      rung: 5,
      title: "Two signs a teammate is stuck",
      promise: "You will notice a stuck teammate early and know the first thing to say.",
      minutes: 3,
      scene: "review-others",
      body: `People rarely say they are stuck, so you have to see it in the work, early enough that one conversation fixes it.

Two signs. **Quiet for two weeks:** nothing sent for review, no questions. **The same thing failing twice:** a draft sent back for the same reason both times.

Both look like a lack of interest. They rarely are.

The wrong first move: "Why haven't you done anything?" The person hears "you are behind" and goes quieter.

Instead, ask about their week, not about Claude. "What is the most annoying thing on your calendar this week?" Then make that the next task. Anna has sent nothing in two weeks. You ask; it is the monthly report, due Friday. You write the first prompt together in twenty minutes and she sends it that afternoon. The practice task just did not look like her job.

For the same thing failing twice, add one step: put the two returned drafts side by side and ask what they share. Patterns are hard to see from inside.

If two conversations change nothing, tell your lead, with one line on what you tried.`,
      keyPoints: [
        "Two signs: quiet for two weeks, or the same thing failing twice.",
        "First move: ask about their week, then make the annoying task the next practice.",
        "After two conversations with no change, tell your lead with one line on what you tried.",
      ],
      example: {
        title: "Try this",
        text: "Find one teammate who has sent you nothing in two weeks. Message them: \"What is the most annoying thing on your calendar this week?\"",
      },
      check: {
        question: "A teammate has sent nothing for two weeks. What is the best opening?",
        options: [
          "\"Why haven't you done anything?\"",
          "\"What is the most annoying thing on your calendar this week?\"",
          "\"Everyone else is ahead of you.\"",
          "Wait another two weeks and see",
        ],
        answer: 1,
        explanation: "Asking about their real week finds the actual cause, which is rarely Claude, and hands you the next task to do together.",
      },
      competencies: ["L5.stewardship", "L5.feedback"],
    },
    {
      slug: "l5-backlog-line",
      rung: 5,
      title: "A backlog line anyone can read",
      promise: "You will write the team's list of what to hand to Claude next so anyone can see why each item sits where it does.",
      minutes: 3,
      scene: "workflow-map",
      body: `Your team's list of what to hand to Claude next is only useful if anyone can read a line and see why it sits where it does. You own that list.

**Before.** "Quarterly report automation - high priority."

**After.** "Quarterly report. Value: saves Priya about six hours each quarter. Time: two afternoons to set up. How ready: not yet, the template changes next quarter, so wait until it settles."

Three things in plain words: what it is worth, what it costs to do, and whether it can start now. Nobody has to ask you what "high priority" meant.

Ranking follows from the lines. Six hours a week and ready now goes above six hours a quarter and not ready. Boring and frequent beats impressive and rare: weekly meeting prep returns more than a clever one-off.

Once a month, read the top five lines and ask whether each is still true. Owners leave, templates change. Move things and write one line on why.

Feed the list from what you hear. Every "I spend all Friday on..." in a team meeting is a new line.`,
      keyPoints: [
        "Every line says value, time and how ready, in plain words.",
        "Frequent and ready beats impressive and rare.",
        "Monthly: check the top five are still true, and write one line on why anything moves.",
      ],
      example: {
        title: "Try this",
        text: "Take one item on your team's list. Rewrite it as three short clauses: value, time, how ready.",
      },
      check: {
        question: "Which backlog line is written well?",
        options: [
          "\"Quarterly report automation - high priority\"",
          "\"Quarterly report. Value: saves Priya six hours a quarter. Time: two afternoons. How ready: wait for the new template.\"",
          "\"Reports - urgent\"",
          "\"Something for Priya\"",
        ],
        answer: 1,
        explanation: "It says value, time and how ready in plain words, so anyone can see why it sits where it does without asking you.",
      },
      competencies: ["L5.stewardship"],
    },
  ],
}
