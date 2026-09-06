import type { Module } from "./types"

export const MODULE_L0: Module = {
  rung: 0,
  code: "L0",
  name: "Orientation",
  tagline: "Where Claude lives, what can go in, and your first real piece of work.",
  outcomes: [
    "Pick the right place to do a task: a chat, a Project, a shared skill, or Claude Code and Cowork.",
    "Say what can go into Claude and what never can, and where a person has to review.",
    "Finish one real task with Claude today, with your expectation written down first.",
  ],
  practice:
    "Practice: you'll pick one small, real task from this week, say what you expect to get back, run it, and note what was different.",
  lessons: [
    {
      slug: "l0-which-surface",
      rung: 0,
      title: "Which surface for what",
      promise: "You will know whether a task belongs in a chat, a Project, a skill, or Claude Code and Cowork.",
      minutes: 4,
      scene: "surfaces",
      body: `Claude shows up in a few places, and picking the right one saves you from fighting the tool.

**Chat** is for one-off work: draft this email, summarise these notes, give me three ways to say this more gently. You bring everything Claude needs in the moment, and when you are done, you are done.

**Projects** are for work you repeat. A Project holds instructions and reference files that stay put, so every week you open the same one and only add what changed this week. If you have typed the same background twice, it belongs in a Project.

**Skills** are recipes the team shares. Someone writes the steps once, and Claude picks the recipe up on its own when a request matches. You will write one at L3; for now, just know they exist in the library.

**Claude Code and Cowork** are for multi-step work across files and systems: go through this folder of exported reports and build me a summary table. They act, rather than just answer. Most people will not need them in the first month.

The rule of thumb: one-off means Chat, repeated means Project, shared means Skill, many steps across files means Code or Cowork. When you are not sure, start in Chat and notice whether you come back to it.`,
      keyPoints: [
        "One-off work goes in a chat; work you repeat goes in a Project.",
        "A skill is a shared recipe Claude picks up on its own when a request matches.",
        "Claude Code and Cowork act across files and systems; most people do not need them at first.",
      ],
      example: {
        title: "Weekly customer-meeting prep",
        text: "Someone drafts one follow-up email in a chat. She preps her weekly customer meetings with the same structure every time, so that becomes a Project. Her whole team preps meetings the same way, so at L3 it becomes a skill in the library.",
      },
      check: {
        question: "You write the same cover note for a recurring monthly report, with the same house rules each time. Where should it live?",
        options: ["A fresh chat each time", "A Project", "Claude Code", "It should not use Claude"],
        answer: 1,
        explanation: "The task repeats and the background stays stable, which is exactly what a Project holds for you.",
      },
      competencies: ["L0.surfaces"],
    },
    {
      slug: "l0-policy-boundary",
      rung: 0,
      title: "Your firm's policy and the boundary",
      promise: "You will be able to say what goes into Claude, what never does, and where a person must review.",
      minutes: 4,
      scene: "policy-boundary",
      body: `Your firm has a usage policy. It is shorter than you think, and most of it comes down to one line: some kinds of information go into Claude, and some never do.

**What can go in**: your own notes and drafts, internal templates, public material, meeting agendas, anonymised summaries, and anything already approved for internal sharing. This is the bulk of your work.

**What never goes in**: customer identifiers and account numbers, contracts and financial documents a customer sent you, anything shared with you in confidence, and anything on the firm's restricted list. The test is simple. If you would not paste it into an email to a colleague at another firm, do not paste it into Claude.

Between those two sits **human review**. Some outputs are fine to draft with Claude but must be read by a person before they go anywhere: anything a customer will receive, anything that becomes a record in your CRM, anything with numbers in it. The policy names these points. Learn where they are.

The boundary is not a limit on how useful Claude can be. It shapes how you use it: describe the situation, not the person. "A long-standing customer whose contract renews in December and who has asked for shorter, plainer emails" gives Claude everything it needs. The name gives it nothing.`,
      keyPoints: [
        "Your own notes, templates and anonymised summaries go in; customer identifiers, contracts and restricted documents never do.",
        "Anything a customer receives or that becomes a record gets read by a person first.",
        "Describe the situation, not the person: Claude needs the facts of the case, never the name.",
      ],
      example: {
        title: "A renewal reminder email",
        text: "Instead of pasting the customer's contract, you write: \"Customer has been with us five years, renews in December, prefers plain language, has asked us to keep emails short.\" Claude drafts the email. You read it before it goes anywhere near the send button.",
      },
      check: {
        question: "Which of these can go into Claude under a typical firm policy?",
        options: [
          "A scanned copy of the customer's signed contract",
          "The customer's account number so the email can reference it",
          "Your own bullet notes from the meeting, with names removed",
          "A spreadsheet of customer payment details, for context",
        ],
        answer: 2,
        explanation: "Your own anonymised notes are yours to share; contracts, account numbers and payment details are restricted classes.",
      },
      competencies: ["L0.boundary"],
    },
    {
      slug: "l0-four-d",
      rung: 0,
      title: "The 4D frame in one picture",
      promise: "You will recognise the four habits every later lesson builds on: delegate, describe, discern, be diligent.",
      minutes: 4,
      scene: "four-d",
      body: `Anthropic describes working well with AI as four habits. You will see them at every rung, so here is the whole picture once.

**Delegation** is deciding what to hand over and what to keep. Not every task belongs with Claude, and inside one task some parts are yours: the judgement call, the customer relationship, the final say.

**Description** is telling Claude what you want clearly enough that it can do the work. Who is this for, what should it contain, what should it look like, what must it avoid.

**Discernment** is reading the output the way you would read a junior colleague's draft: is it right, is anything missing, does it sound like us. This is the habit most people skip, and it is where the value lives.

**Diligence** is owning the result. You checked the facts, you respected the review points, and your name is on it. Claude drafted; you decided.

The four form a loop. Poor delegation makes description hard. Poor description makes discernment slow. Skipping discernment makes diligence impossible. When something goes wrong with an output, one of the four is usually where the problem started, and naming which one tells you what to fix.`,
      keyPoints: [
        "Delegation: decide what to hand over and what stays yours.",
        "Description and Discernment: say clearly what you want, then read the result like a colleague's draft.",
        "Diligence: you own what goes out, so you check it and respect the review points.",
      ],
      example: {
        title: "A quarterly report deck",
        text: "Delegation: Claude drafts the background slide; you write the recommendation. Description: \"eight slides, house template, no customer names.\" Discernment: you spot that a chart label is wrong. Diligence: fixed before the deck goes to the customer.",
      },
      check: {
        question: "A draft came back fluent and plausible, and you sent it without reading it closely. Which habit was skipped?",
        options: ["Delegation", "Description", "Discernment", "Diligence"],
        answer: 2,
        explanation: "Discernment is the careful read of the output; skipping it is the most common and most costly miss.",
      },
      competencies: ["L1.delegation", "L1.discernment"],
    },
    {
      slug: "l0-first-real-work",
      rung: 0,
      title: "Your first real piece of work today",
      promise: "You will finish one small, real task with Claude today, with your expectation written down before you run it.",
      minutes: 3,
      scene: "predict-then-see",
      body: `You finish this module by doing one real piece of work with Claude today. Not a demo. Something already on your list.

Pick a task that is small, yours, and low-stakes: a first draft of a follow-up email, a summary of your own meeting notes, an agenda for next week. Check it against the boundary from the last lesson. If it needs customer names or account details, choose something else.

Before you run it, write one sentence about what you expect to get back. "A polite, slightly generic email that will need our usual sign-off." This takes ten seconds and it is the most important habit in the whole programme. It turns reading the output from passive to active: you are checking a guess, not just skimming.

Then run it, read the output, and write one more sentence: what was better than you expected, what was worse, what you changed. That is the whole exercise.

You are not being graded on the output today. L0 asks only that you finish something real, notice the gap between what you expected and what arrived, and use the right surface for it. Everything after this builds on that small loop.`,
      keyPoints: [
        "Choose something small, real and already on your list, and check it against the boundary.",
        "Write one sentence about what you expect before you run it.",
        "Afterwards, write one sentence on what was better, worse, and what you changed.",
      ],
      example: {
        title: "A meeting follow-up",
        text: "You pick the follow-up note from Tuesday's customer meeting. Expectation: \"It will be too formal and forget to mention the timeline change we agreed.\" Result: tone was fine, and it did forget the timeline change. You add one line and send it. Done in eleven minutes.",
      },
      check: {
        question: "What does L0 actually ask you to do to finish it?",
        options: [
          "Pass a quiz on Claude features",
          "Write a perfect prompt",
          "Finish one real task, with your expectation noted first and a short reflection after",
          "Build a Project",
        ],
        answer: 2,
        explanation: "L0 is completion only: one real finished piece of work, with the predict-then-look loop around it.",
      },
      competencies: ["L0.surfaces", "L0.boundary"],
    },
  ],
}
