import type { Module } from "./types"

export const MODULE_L0: Module = {
  rung: 0,
  code: "L0",
  name: "Orientation",
  tagline: "Where Claude lives, what you can paste, which tools it can read, and your first real piece of work.",
  outcomes: [
    "Pick the right place to do a task: a chat, a Project, a shared skill, or Claude Code and Cowork.",
    "Paste and upload freely, and know the few data classes your firm keeps out and where that list lives.",
    "See which of your firm's tools Claude can read, and finish one real task with it today.",
  ],
  practice:
    "Practice: you'll pick one small, real task from this week, write what you'd ask Claude, run it, and get three lines of feedback.",
  lessons: [
    {
      slug: "l0-which-surface",
      rung: 0,
      title: "Which surface for what",
      promise: "You will know whether a task belongs in a chat, a Project, a skill, or Claude Code and Cowork.",
      minutes: 4,
      scene: "surfaces",
      mock: "new-chat",
      body: `Claude shows up in a few places, and picking the right one saves you from fighting the tool.

**Chat** is for one-off work: draft this email, summarise these notes, give me three ways to say this more gently. You bring everything Claude needs in the moment, and when you are done, you are done.

**Projects** are for work you repeat. A Project holds instructions and reference files that stay put, so every week you open the same one and only add what changed this week. If you have typed the same background twice, it belongs in a Project.

**Skills** are recipes the team shares. Someone writes the steps once, and Claude picks the recipe up on its own when a request matches. You will write one later; for now, just know they exist in the library.

**Claude Code and Cowork** are for multi-step work across files and systems: go through this folder of exported reports and build me a summary table. They act, rather than just answer. Most people will not need them in the first month.

The rule of thumb: one-off means Chat, repeated means Project, shared means Skill, many steps across files means Code or Cowork. When you are not sure, start in Chat and notice whether you come back to it.`,
      keyPoints: [
        "One-off work goes in a chat; work you repeat goes in a Project.",
        "A skill is a shared recipe Claude picks up on its own when a request matches.",
        "Claude Code and Cowork act across files and systems; most people do not need them at first.",
      ],
      example: {
        title: "Try this",
        text: "Write down the last three things you asked Claude, or would have. Next to each, put one word: one-off, repeated, or shared. Anything marked repeated is your first Project.",
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
      slug: "l0-what-you-can-paste",
      rung: 0,
      title: "What you can paste, and the few things you can't",
      promise: "You will paste documents and upload files with confidence, and know the short list your firm keeps out.",
      minutes: 4,
      scene: "policy-boundary",
      mock: "attach-menu",
      body: `Claude Enterprise is a governed workspace your firm chose. Pasting documents, uploading files and connecting tools is how Claude does real work here, and it is expected. Most of what crosses your desk can go straight in: notes, drafts, contracts, proposals, transcripts, spreadsheets, internal pages.

The only line is your firm's own policy, and it is about a few named kinds of data, not about documents in general. Typically: personal identifiers, health data, payment card data, account numbers, and secrets such as passwords or keys. Your firm's exact list is written down in Activate under your firm's boundary. Read it once; it is short.

**Before**: Sam needs a summary of a customer contract. Worried about "sensitive data", he retypes it as vague bullet points with everything stripped out. The summary comes back vague too, and he spends twenty minutes fixing it.

**After**: Priya pastes the whole contract. She notices a payment card number in the billing clause, replaces it with [card ending 4821], and asks for the summary. It comes back complete and accurate in one pass.

Redact the forbidden class; keep everything else. For the few classes on the list, describing the situation instead of pasting the identifier is the technique: "a customer on our top pricing tier" rather than a card number.

Some outputs still get a human read before they go out: anything a customer receives, anything saved to a system of record. The policy names those points too.`,
      keyPoints: [
        "Pasting, uploading and connecting tools is expected; most documents can go straight in.",
        "The only line is your firm's short list of data classes, written in Activate under your firm's boundary.",
        "Redact the one forbidden item and keep the rest; stripping everything makes the output worse.",
      ],
      example: {
        title: "Try this",
        text: "Open your firm's boundary in Activate and read the list of forbidden data classes. Then paste one real document you worked on this week, redact anything on that list, and ask Claude for a one-paragraph summary.",
      },
      check: {
        question: "You need a summary of a 12-page customer contract. One clause contains a payment card number. What do you do?",
        options: [
          "Retype the contract as vague bullet points with all details removed",
          "Paste the whole contract, replace the card number with a placeholder, and ask for the summary",
          "Do not use Claude for anything involving contracts",
          "Paste only the first page to be safe",
        ],
        answer: 1,
        explanation: "The contract itself is fine to paste; only the payment card number is on the forbidden list, so redact that one item and keep the rest.",
      },
      competencies: ["L0.boundary"],
    },
    {
      slug: "l0-connectors",
      rung: 0,
      title: "Connectors: Claude can read your tools",
      promise: "You will know what a connector is, how to see which ones your firm has turned on, and why your permissions still apply.",
      minutes: 4,
      scene: "connectors",
      mock: "tools-menu",
      body: `Claude does its best work when it can see the same things you see. A connector is the link that makes that possible: your firm connects Claude to a tool it already uses, and Claude can read from it, and sometimes write to it, inside a conversation.

Typical connectors: **Salesforce** for accounts and opportunities, **Gong** for call recordings and transcripts, **Google Drive** for documents and spreadsheets, **Confluence** for internal pages. Your firm may have others.

To see which ones you have, open a new chat, click the **+** button under the message box and look under **Connectors**. Everything listed there has been turned on by your firm's admin. The first time you use one you connect your own account: **Settings**, **Connectors**, **Connect**, then sign in with your normal login for that tool. Activate lists your firm's connectors too, on your home page. If something you use is missing, ask your champion; you cannot add connectors yourself, and that is the point.

Permissions follow you. When Claude reads Salesforce through a connector, it sees only the records you could open yourself. It cannot reach a colleague's private files or a restricted folder. Nothing about your access changes; Claude simply works with it.

So instead of exporting a report, copying it and pasting it in, you can say: "Using Salesforce, show me the open opportunities I own that close this month." The next module shows how to ask well.`,
      keyPoints: [
        "A connector links Claude to a tool your firm already uses, so it can read from it in a conversation.",
        "The + button in a chat shows which connectors your firm has turned on; you connect your own account once in Settings.",
        "Claude sees only what you could see yourself; your permissions do not change.",
      ],
      example: {
        title: "Try this",
        text: "Open a new chat, click the + button under the message box, open Connectors and write down which ones you see. If one says Connect rather than a switch, connect it with your own login. Then ask: \"Using Salesforce, list the accounts I own.\"",
      },
      check: {
        question: "A colleague worries that a connector lets Claude read a restricted folder they cannot open themselves. Is that right?",
        options: [
          "Yes, connectors give Claude admin access",
          "No, Claude sees only what that person could open themselves",
          "Only if the folder is in Google Drive",
          "Yes, unless the champion blocks it",
        ],
        answer: 1,
        explanation: "Permissions follow the user: a connector reads with your access, never more.",
      },
      competencies: ["L0.surfaces"],
    },
    {
      slug: "l0-four-d",
      rung: 0,
      title: "The 4D frame in one picture",
      promise: "You will recognise the four habits every later lesson builds on: delegate, describe, discern, be diligent.",
      minutes: 4,
      scene: "four-d",
      body: `Anthropic describes working well with AI as four habits. You will see them in every module, so here is the whole picture once.

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
        title: "Try this",
        text: "Take one output Claude gave you recently that was not quite right. Name which of the four it was: did you hand over the wrong thing, describe it badly, skip the careful read, or send it unchecked?",
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
      scene: "first-task",
      mock: "new-chat",
      body: `You finish this module by doing one real piece of work with Claude today. Not a demo. Something already on your list.

Pick a task that is small, yours, and low-stakes: a first draft of a follow-up email, a summary of your own meeting notes, an agenda for next week. Paste in whatever it needs. If the material contains something on your firm's short list of forbidden data, redact that part and carry on.

Before you run it, write one sentence about what you expect to get back. "A polite, slightly generic email that will need our usual sign-off." This takes ten seconds and it is the most useful habit in the whole programme. It turns reading the output from passive to active: you are checking a guess, not just skimming.

Then run it, read the output, and write one more sentence: what was better than you expected, what was worse, what you changed. That is the whole exercise.

Nobody is marking the output today. The point is to finish something real, notice the gap between what you expected and what arrived, and use the right surface for it. Everything after this builds on that small loop.`,
      keyPoints: [
        "Choose something small, real and already on your list, and paste in what it needs.",
        "Write one sentence about what you expect before you run it.",
        "Afterwards, write one sentence on what was better, worse, and what you changed.",
      ],
      example: {
        title: "Try this",
        text: "Paste the notes from your last customer meeting and ask Claude for a three-line follow-up email. Before you press send on the prompt, write one sentence on what you think it will get wrong.",
      },
      check: {
        question: "What does this module actually ask you to do to finish it?",
        options: [
          "Pass a quiz on Claude features",
          "Write a perfect prompt",
          "Finish one real task, with your expectation noted first and a short reflection after",
          "Build a Project",
        ],
        answer: 2,
        explanation: "Orientation is completion only: one real finished piece of work, with the guess-then-look loop around it.",
      },
      competencies: ["L0.surfaces", "L0.boundary"],
    },
  ],
}
