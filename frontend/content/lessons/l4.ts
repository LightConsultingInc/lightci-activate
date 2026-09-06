import type { Module } from "./types"

export const MODULE_L4: Module = {
  rung: 4,
  code: "L4",
  name: "Workflow",
  tagline: "Write down how a task really happens, decide which steps a person keeps, note how long it takes today, and turn it into a skill your team can use.",
  outcomes: [
    "Write down a task you own as inputs, steps, decisions, exceptions, systems and outputs, clearly enough that a new colleague could run it.",
    "Mark which steps a person must keep and which Claude can draft.",
    "Note how long the task takes today so you can say honestly what you got back, and know how the skill gets reviewed and published for the team.",
  ],
  practice:
    "Practice: map one task you own in the workflow form (inputs, steps, decisions, exceptions, systems, outputs, review points). We draft the skill from your map and show it to you.",
  lessons: [
    {
      slug: "l4-write-it-down",
      rung: 4,
      title: "Write down how the task really happens",
      promise: "You will turn a one-line description of a task into a map a new colleague could follow.",
      minutes: 3,
      scene: "workflow-map",
      body: `Writing down how a task actually happens is what lets someone else, or Claude, do it the same way. Most tasks live in one person's head as a single line, and that line hides everything that matters.

**Before**, the task as usually described:

"Every Friday I send the weekly sales report."

**After**, the same task as it really happens:

Inputs: the export from the sales tool, last week's report.
Steps: pull the export, drop the numbers into the template, write three lines on what changed, attach, send to the regional manager.
Decisions: if a deal over 50k moved stage, add a line naming it.
Exceptions: the export sometimes lands after lunch; if so, send a holding note and the full report on Monday.
Systems: sales tool (read only), email.
Outputs: one email with the report attached, to the manager, by 4pm.

It is what you would tell a colleague covering your holiday. The test of a good map: could someone who has never done the task run it from the page without asking you a question? If they would have to ask, the answer belongs in the map.`,
      keyPoints: [
        "A one-line description hides everything that matters; write the task as inputs, steps, decisions, exceptions, systems and outputs.",
        "Write it the way you would explain it to a colleague covering your holiday.",
        "The test: could someone who has never done it run it from the page without asking you anything?",
      ],
      example: {
        title: "Try this",
        text: "Pick one task you do every week. Write its inputs, steps and outputs as bullet points, in the order they really happen, not the order the manual says.",
      },
      check: {
        question: "A colleague reads your map of the weekly report and asks, \"What do I do if the export is late?\" What does that tell you?",
        options: [
          "They should have asked you before reading it",
          "The map is missing an exception and it should be added",
          "The map is fine; late exports are rare",
          "Exceptions belong in an email, not in the map",
        ],
        answer: 1,
        explanation: "If someone has to ask you a question to run the task, the answer belongs in the map. A late export is an exception, so it goes under Exceptions.",
      },
      competencies: ["L4.schema"],
    },
    {
      slug: "l4-decisions-and-exceptions",
      rung: 4,
      title: "Decisions and exceptions are where the value hides",
      promise: "You will spot the steps that sound like one action but hide a choice, and write the choice down.",
      minutes: 3,
      scene: "workflow-map",
      body: `The steps you can list in a minute are not the hard part of a task. The hard part is the choices inside them, and those are what a colleague, or Claude, gets wrong if you leave them out.

**Before**, a step as it usually gets written:

"Check the proposal before it goes out."

**After**, the same step with its decisions and exceptions:

Check the price table matches the quote in the sales tool. If any line differs, stop and fix it; do not send. If the proposal is over 100k, it also goes to the head of sales first. If the customer asked for a payment plan we do not offer, hand it to your manager rather than improvising one.

One line became four sentences, and every one is something you already do without thinking. The knowledge was there; it just was not written down.

To find hidden decisions, ask of each step: "what am I looking for here, and what do I do when it is wrong?" If the answer is anything other than "nothing", you have found a decision or an exception. Write it under the step.`,
      keyPoints: [
        "A step that sounds like one action often hides a choice: what you check for, and what you do when it fails.",
        "Ask of every step: what am I looking for, and what do I do when it is wrong?",
        "Exceptions are the cases that go wrong often enough to matter; write down what happens then.",
      ],
      example: {
        title: "Try this",
        text: "Take one step from a task you do, something like \"review the draft\", and write two sentences under it: what you check for, and what you do when it fails.",
      },
      check: {
        question: "Which of these turns \"check the proposal\" into something a new colleague could do?",
        options: [
          "Check the proposal carefully",
          "Check the price table matches the quote; if any line differs, stop and fix it",
          "Ask the manager to check the proposal",
          "Skip the check if you are in a hurry",
        ],
        answer: 1,
        explanation: "It says what to look for and what to do when it is wrong. \"Carefully\" and \"ask the manager\" leave the choice in someone's head.",
      },
      competencies: ["L4.schema"],
    },
    {
      slug: "l4-which-steps-a-person-keeps",
      rung: 4,
      title: "Which steps a person keeps",
      promise: "You will mark the steps in your map that must stay with a person and the ones Claude can draft.",
      minutes: 3,
      scene: "boundary-declaration",
      body: `Once a task is written down, you can see which steps Claude can take a first pass at and which must stay with you. That split makes the result safe to use.

**Claude can draft** a step when it is mostly writing or arranging text and you can check the result by reading it: the three lines on what changed, the filled-in template, a first-draft follow-up email.

**A person keeps** a step when it:
- approves something, such as a discount or a delivery date;
- sends something to a customer;
- enters something into a system of record, such as the CRM;
- needs information that must not be shared, such as account numbers or contracts;
- is a judgement about a person's money or situation.

On the weekly report: Claude drafts the three lines on what changed. You read them against the numbers, decide whether the big deal needs a mention, and press send. You enter the final figure in the CRM.

The pattern is the same almost everywhere: Claude drafts, a person decides, a person sends. Mark each handoff in your map as a review point.`,
      keyPoints: [
        "Claude can draft steps that are mostly text and can be checked by reading.",
        "A person keeps approving, sending, entering into a system of record, anything with information that must not be shared, and judgements about a person's money.",
        "Claude drafts, a person decides, a person sends; each handoff is a review point in the map.",
      ],
      example: {
        title: "Try this",
        text: "Write the five steps of your weekly report as bullet points, then mark which ones you must do yourself.",
      },
      check: {
        question: "Claude has drafted the meeting summary. The next step is to save it as the record in the CRM. Who does that step?",
        options: [
          "Claude, since it wrote the summary",
          "A person, because it is entering something into a system of record",
          "Whoever is free at the time",
          "Nobody; the draft is enough",
        ],
        answer: 1,
        explanation: "Entering into a system of record is one of the steps a person keeps, even when Claude wrote the text that goes in.",
      },
      competencies: ["L4.schema", "L4.governance"],
    },
    {
      slug: "l4-measure-before-you-change-it",
      rung: 4,
      title: "Measure it before you change it",
      promise: "You will write a two-line note of how long a task takes today, so that later you can say honestly what you got back.",
      minutes: 3,
      scene: "baseline-measure",
      body: `If you want to say a skill saved you time, you need to know how long the task took before. Two lines, written down now, are the difference between a number and a story.

**Before** the change, the note looks like this:

Weekly sales report: about 90 minutes each Friday, including 20 minutes fixing figures after review.
Measured: timed the last three Fridays (85, 95, 90).

That is the whole thing: how long, how often, and how you measured. Include fixing and redoing time; it is part of the real cost and often the part that disappears.

For a weekly task, time three real runs. For a monthly one, look back at your calendar for the last two and say it is an estimate. Ask the person who owns the task to agree the number.

**After** the change, measure the same way, including the time you spend reading the draft, checking it and fixing anything wrong. If the draft takes 20 minutes instead of 90 but checking takes 40, you got back 30 minutes, not 70. A small honest number is worth more than a big hopeful one.`,
      keyPoints: [
        "Two lines before you change anything: how long, how often, and how you measured.",
        "Include time spent fixing and redoing; it is part of the real cost.",
        "Measure the same way after, including checking and fixing the draft, and report what is left.",
      ],
      example: {
        title: "Try this",
        text: "Write one line for a task you did this week: how many minutes it took, how often you do it, and whether that includes fixing time.",
      },
      check: {
        question: "Before the skill, the report took 90 minutes. Now the draft takes 20 minutes and checking and fixing takes 40. What did you get back?",
        options: [
          "70 minutes",
          "30 minutes",
          "90 minutes",
          "Nothing yet",
        ],
        answer: 1,
        explanation: "Measure the same way as before, including checking and fixing: 20 plus 40 is 60, and 90 minus 60 leaves 30 minutes.",
      },
      competencies: ["L4.baseline"],
    },
    {
      slug: "l4-reviewed-and-published",
      rung: 4,
      title: "Getting the skill reviewed and published for the team",
      promise: "You will know what happens between your draft skill and the version your whole team can use.",
      minutes: 3,
      scene: "promotion-queue",
      body: `A skill only you have helps one person. A skill in the team library helps everyone, and getting it there means one teammate reads it first, so the rest of the team can trust it without redoing your work.

**Before**: a draft. It lives with you and nobody else can see it.

**After**: a published skill. It sits in the team library with a version number, who reviewed it and when. Any later change is a new version, reviewed the same way, so the team can see what changed and go back if needed.

Between the two sits the review. You send the skill with the sample requests you tested it on. A reviewer on your team checks four things: does it do one job; does it start on the right requests and not others; does it keep restricted information out and the person's steps in; do the sample requests behave as described. If it touches account details or contracts, compliance reads it too.

Most skills that stall in review stall on the third question. A map that marks which steps a person keeps has already answered it.`,
      keyPoints: [
        "A draft is yours alone; a published skill is in the team library with a version, a reviewer and a date.",
        "The reviewer checks: one job, starts on the right requests, keeps restricted information out and the person's steps in, and the sample requests behave.",
        "Every later change is a new version through the same review, so the team can see what changed and go back.",
      ],
      example: {
        title: "Try this",
        text: "Write three sample requests for your skill: one it should handle, one it should not, and one that is borderline.",
      },
      check: {
        question: "What turns a draft skill into one the whole team can use?",
        options: [
          "Saving it with a new name",
          "A teammate reviews it and it is published to the team library",
          "Using it yourself for a month",
          "Sending it to everyone by email",
        ],
        answer: 1,
        explanation: "A draft is yours alone. It becomes the team's when a reviewer has read it and it is published to the library with a version.",
      },
      competencies: ["L4.governance"],
    },
  ],
}
