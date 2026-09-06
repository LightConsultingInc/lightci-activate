import type { Module } from "./types"

export const MODULE_L0: Module = {
  rung: 0,
  code: "L0",
  name: "Orientation",
  tagline: "Ask Claude for one real piece of work, and know what to paste, what to check, and where it belongs.",
  outcomes: [
    "Ask Claude for a first draft of something real, with the two or three facts it needs to do it well.",
    "Know what is fine to paste in and what to leave out, and describe a customer without naming them.",
    "Read a draft before it goes anywhere, and know when a repeated task belongs in a Project instead of a chat.",
  ],
  practice:
    "Practice: you'll write what you'd ask Claude for one real task of yours, press Run, and see what it makes. You get three short lines of feedback and a score, and you can try again.",
  lessons: [
    {
      slug: "l0-ask-like-a-brief",
      rung: 0,
      title: "Ask the way you'd brief a colleague",
      promise: "You will be able to ask Claude for a first draft and get something you can actually use.",
      minutes: 3,
      scene: "prompt-anatomy",
      body: `Most people's first ask to Claude is one line, and the draft that comes back is generic. That is not Claude being weak; it is the ask being thin.

Think of Claude as a capable colleague who joined this morning. If you said "write a follow-up email" to them, they would have to guess who it is for and what it should say. Claude guesses too.

**A thin ask:** "Write a follow-up email after a customer meeting."

**A better ask:** "Write a short follow-up email to a customer we met this morning. We agreed to send revised pricing by Friday and to book a demo for their operations team. Friendly, plain, under 100 words."

The second names who is reading, what was agreed, and how long it should be. That is usually enough for a draft you can send with small changes.

You do not need special wording. Say what you would say to a colleague, plus the two or three facts they would need to start. If the draft comes back wrong, say what is wrong and ask again, the way you would with a person.`,
      keyPoints: [
        "A one-line ask gets a generic draft; two or three facts get a usable one.",
        "Say who will read it, what it must contain or what was agreed, and how long it should be.",
        "If the draft is off, say what is wrong and ask again, like you would with a colleague.",
      ],
      example: {
        title: "Try this",
        text: "Paste an email you wrote this week (take out any names) into Claude and ask for a version half the length. Read both and notice what it cut.",
      },
      check: {
        question: "You need a first draft of a cover note for a proposal. Which ask will get you the most usable draft?",
        options: [
          "\"Write a proposal cover note.\"",
          "\"Write a cover note for a proposal. Please make it good.\"",
          "\"Write a one-paragraph cover note for a proposal to a customer we met last week. They care about switching with no downtime. Warm, plain, under 120 words.\"",
          "\"Write a cover note using the best professional template.\"",
        ],
        answer: 2,
        explanation: "It says who is reading, what they care about, and how long it should be. The others leave Claude guessing.",
      },
      competencies: ["L1.description"],
    },
    {
      slug: "l0-what-not-to-paste",
      rung: 0,
      title: "What not to paste in",
      promise: "You will know what to leave out when you paste, and how to describe a customer without naming them.",
      minutes: 3,
      scene: "policy-boundary",
      body: `Claude is most useful when you give it real material, so you need to know what is fine to paste and what is not.

**Fine to paste:** your own notes and drafts, meeting agendas, internal templates, anything already public, and summaries with the names taken out.

**Never paste:** customer names next to account or contract details, documents a customer sent you, payment details, and anything shared with you in confidence.

If you are unsure, ask yourself: would I paste this into an email to someone at another company? If not, do not paste it into Claude.

This is less limiting than it sounds, because Claude does not need the person. It needs the situation.

**Instead of pasting the contract:** "Customer has been with us five years, renews in December, prefers plain language, and has asked us to keep emails short. Draft a renewal reminder."

That one sentence gives Claude everything it needs for the email. The name, the account number and the contract itself would add nothing to the draft. And whatever comes back, you read it before it reaches the customer.`,
      keyPoints: [
        "Your own notes, drafts, templates and public material are fine; customer documents, account and payment details are not.",
        "The test: would you paste it into an email to someone at another company?",
        "Describe the situation, not the person. The facts of the case are what Claude needs, never the name.",
      ],
      example: {
        title: "Try this",
        text: "Take your notes from your last customer meeting, cross out the names and any account numbers, paste what is left into Claude and ask for a five-line summary.",
      },
      check: {
        question: "You want Claude to draft a reminder about a customer's overdue invoice. Which of these should you give it?",
        options: [
          "The invoice PDF the customer received, so the numbers are right",
          "The customer's account number and contact details",
          "\"A customer is three weeks overdue on a mid-sized invoice, has always paid on time before, and we want to stay friendly. Draft a reminder.\"",
          "The full email thread with the customer, unchanged",
        ],
        answer: 2,
        explanation: "Describe the situation. The invoice, account details and email thread are the customer's material, and the draft does not need them.",
      },
      competencies: ["L0.boundary"],
    },
    {
      slug: "l0-read-before-it-goes",
      rung: 0,
      title: "Read it before it goes anywhere",
      promise: "You will catch the mistakes a fluent draft hides before anyone else sees them.",
      minutes: 3,
      scene: "check-output",
      body: `Claude's drafts read well. That is the risk: a fluent draft is easy to send without really reading, and the mistake is usually something small it did not know.

Read Claude's draft the way you would read a new colleague's: quickly, but with your own knowledge switched on. Is anything wrong? Is anything missing? Would we say it that way?

**Sent as it came:** You ask for a follow-up to Tuesday's meeting. The draft is polite and well-shaped. You send it. It never mentions that you agreed to move the delivery date, because you never told Claude that, and the customer emails back confused.

**Read first:** Same draft. You read it once, notice the missing date, add one line, and send. Thirty seconds.

Three things are worth a look every time: numbers and dates, names and titles, and anything Claude could not have known about your situation.

Claude drafted; you decided. Anything a customer receives, anything with a number in it, and anything that becomes a record gets read by a person first. That person is you.`,
      keyPoints: [
        "A fluent draft is the easiest one to send unread. Read it like a colleague's draft.",
        "Check numbers and dates, names and titles, and anything Claude could not have known.",
        "Anything a customer receives or that has a number in it gets read by a person first.",
      ],
      example: {
        title: "Try this",
        text: "Ask Claude to summarise your notes from your last meeting in five bullets. Read them and find one thing it missed or got slightly wrong.",
      },
      check: {
        question: "Claude's draft of your monthly report summary reads smoothly and sounds like you. What do you do before sending it?",
        options: [
          "Send it; it sounds right.",
          "Ask Claude to confirm it is accurate.",
          "Read it once for numbers, names and anything it could not have known, then fix what you find.",
          "Run it through Claude a second time to be safe.",
        ],
        answer: 2,
        explanation: "Fluent is not the same as right. The check is your own read, especially of numbers, names and what Claude could not have known.",
      },
      competencies: ["L1.discernment", "L1.diligence"],
    },
    {
      slug: "l0-chat-or-project",
      rung: 0,
      title: "A chat or a Project",
      promise: "You will know when a task belongs in a fresh chat and when it belongs in a Project.",
      minutes: 3,
      scene: "surfaces",
      body: `Most of your work with Claude happens in a chat: ask, read, done. But if you find yourself typing the same background every time, there is a better home for it.

**A chat** is for one-off work. Draft this email, summarise these notes, give me three gentler ways to say this. You bring what Claude needs, and when you are finished, you are finished.

**A Project** is for work you repeat. It keeps your instructions and reference files in one place, so each time you open it you only add what changed.

**Every month, in a fresh chat:** "Write the cover note for our monthly sales report. One paragraph, lead with the total, mention the top three accounts, our usual sign-off, no exclamation marks." Then you paste last month's note so it matches.

**In a Project:** those rules and last month's note live in the Project. Each month you type: "Here are this month's numbers. Write the cover note."

The rule of thumb: one-off means chat, repeated means Project. If you have typed the same background twice, it belongs in a Project.`,
      keyPoints: [
        "One-off work goes in a chat; work you repeat goes in a Project.",
        "A Project holds the instructions and files that stay the same, so each time you add only what changed.",
        "If you have typed the same background twice, it belongs in a Project.",
      ],
      example: {
        title: "Try this",
        text: "In a fresh chat, ask Claude for an agenda for your next team meeting. Notice what background you had to type in. That is what would live in a Project if you did this every week.",
      },
      check: {
        question: "You write the same cover note for a recurring monthly report, with the same house rules each time. Where should it live?",
        options: ["A fresh chat each time", "A Project", "A new document each time, without Claude", "An email to yourself"],
        answer: 1,
        explanation: "The task repeats and the background stays the same, which is exactly what a Project holds for you.",
      },
      competencies: ["L0.surfaces"],
    },
  ],
}
