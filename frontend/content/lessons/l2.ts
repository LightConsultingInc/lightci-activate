import type { Module } from "./types"

export const MODULE_L2: Module = {
  rung: 2,
  code: "L2",
  name: "Context",
  tagline: "Set up a Project so one repeated task starts with the right background every time.",
  outcomes: [
    "Set up a Project: standing instructions plus one or two files that Claude reads every time.",
    "Choose what goes in and what stays out, and replace a long document with a one-page summary.",
    "Write instructions that say how you decide, and fix repeat mistakes in the Project rather than in the chat.",
  ],
  practice:
    "Practice: set up a Project for one of your own tasks. Write the instructions, paste one or two files, and we run a test task and show you the result.",
  lessons: [
    {
      slug: "l2-what-is-a-project",
      rung: 2,
      title: "What a Project is",
      promise: "You will know what a Project holds, what stays in each chat, and which tasks deserve one.",
      minutes: 3,
      scene: "project-context",
      body: `Most of what you type to Claude each week is the same background, again. A Project stops the retyping.

A Project is a folder with standing instructions and a few files. Every chat you start inside it begins with those already read. You add only the part that changed today.

**Without a Project**, every Monday: "You're helping me write our weekly sales report. One page, results before commentary, no customer names. Here is last week's for the format..." and then your notes.

**With a Project called "Weekly report"**: the instructions say "One page, results before commentary, never name a customer. Match the attached report's structure." One file: last month's report. Each Monday you open it, paste your bullet notes and type "Draft this week's."

Make a Project for a task you do again and again where the background barely changes: the weekly report, customer-meeting prep, the follow-up email after a call. One Project per task. Not for a one-off, and not one giant Project for "my job". A folder that holds everything helps with nothing.`,
      keyPoints: [
        "A Project is a folder of standing instructions and files that Claude reads at the start of every chat inside it.",
        "The part that stays the same goes in the Project; only what changed today goes in the chat.",
        "One Project per repeated task; never one giant Project for everything.",
      ],
      example: {
        title: "Try this",
        text: "Create a Project called 'Weekly report'. Paste last month's report as a file and write one instruction: 'Match this tone and structure.' Ask it to draft this month's from your bullet notes.",
      },
      check: {
        question: "What goes in the Project, and what goes in each chat?",
        options: [
          "Standing instructions and reference files in the Project; today's notes in the chat",
          "Everything in the chat every time; the Project is just a name",
          "Today's notes in the Project; the instructions in each chat",
          "Every task you do, together in one Project",
        ],
        answer: 0,
        explanation: "The Project holds what stays the same between runs; each chat adds only what changed today.",
      },
      competencies: ["L2.project_design", "L0.surfaces"],
    },
    {
      slug: "l2-include-exclude",
      rung: 2,
      title: "What to put in and what to leave out",
      promise: "You will pick the few files that do a job in a Project and remove the ones that only add bulk.",
      minutes: 3,
      scene: "include-exclude",
      body: `Every file you add to a Project is one more thing Claude has to read before it gets to your request. Add too much and the rules you care about get lost in the pile.

The question for each item: does Claude need this every time, and would it not already know it? It knows what a follow-up email is. It does not know your template, your rule about never quoting a price in an email, or that your customers read on their phones.

**Bloated "Follow-up emails" Project**: a guide to writing business emails, the whole 2025 email archive, two contracts, the brand guidelines PDF, six draft emails, and one instruction: "Be professional."

**Trimmed version**: the email template; three house rules ("never quote a price; always name who to contact; one screen long"); one finished email you were proud of; and one line: "Readers are busy managers on their phones."

The trimmed one wins because every item does a job. For each file, say in one sentence why it is there. If you cannot finish the sentence, take it out. Four good pages beat forty.`,
      keyPoints: [
        "Add only what Claude needs every time and would not already know.",
        "Include the real template, the house rules that trip people up, one finished example, and who reads the output.",
        "Say in one sentence why each file is there; if you cannot, remove it.",
      ],
      example: {
        title: "Try this",
        text: "Open one Project. For each file in it, say in one sentence why it is there. Remove any file you could not finish the sentence for.",
      },
      check: {
        question: "Which item earns its place in a \"Follow-up emails\" Project?",
        options: [
          "A general guide to writing business emails",
          "Last year's whole email archive",
          "Your team's three house rules for customer emails",
          "A contract, just in case",
        ],
        answer: 2,
        explanation: "Claude does not know your house rules and needs them every time; the others are known already or rarely relevant.",
      },
      competencies: ["L2.selection"],
    },
    {
      slug: "l2-instructions-how-you-decide",
      rung: 2,
      title: "Instructions that say how you decide",
      promise: "You will write Project instructions that describe how you make the calls, not just what the task is.",
      minutes: 3,
      scene: "project-context",
      body: `Project instructions are where you tell Claude how you make the calls, so it makes them the same way when you are not there to type them.

Two common misses. Too vague: "Be professional and helpful." Claude already assumed that; it changes nothing. Too rigid: "If the customer is new, write A. If returning, write B." It breaks the first time a customer fits neither.

**Describes the task** (not much use): "Write follow-up emails to customers after meetings."

**Describes how you decide** (useful): "Lead with what the customer needs to do, then why. Never quote a price in an email; point to the attached proposal. Always name who to contact. If a question came up in the meeting that my notes do not answer, leave a bracketed placeholder rather than guessing."

The second is what you would tell a new colleague in their first week. Short headings help you both: who reads this, what good looks like, house rules, what to do when unsure.

And if you catch yourself typing the same correction in chat twice, that sentence belongs in the instructions.`,
      keyPoints: [
        "Write what you would tell a new colleague in their first week, not vague encouragement or a rule for every case.",
        "Use four short headings: who reads this, what good looks like, house rules, what to do when unsure.",
        "A correction you have typed twice in chat belongs in the instructions.",
      ],
      example: {
        title: "Try this",
        text: "Write four lines for one Project: who reads the output, what a good one looks like, one house rule, and what to do when unsure. Paste them into the instructions.",
      },
      check: {
        question: "Which instruction helps Claude most?",
        options: [
          "Be helpful and professional.",
          "Write follow-up emails to customers after meetings.",
          "Lead with what the customer needs to do, then why; never quote a price in an email.",
          "If the customer is new write A; if returning write B; if lapsed write C.",
        ],
        answer: 2,
        explanation: "It says how you decide, so Claude can apply it to any email; the others are vague, only name the task, or break on the first case they miss.",
      },
      competencies: ["L2.project_design"],
    },
    {
      slug: "l2-one-page-beats-forty",
      rung: 2,
      title: "One page beats forty",
      promise: "You will replace a long document with a one-page summary in your own words, and know when the long version still belongs.",
      minutes: 3,
      scene: "include-exclude",
      body: `The fastest way to make a Project worse is to drop the whole policy manual into it "for reference".

A 40-page document has one or two paragraphs that matter for your task, buried among dozens that do not. Claude has to hunt for them, and the bulk pushes your instructions aside. The output gets vaguer, not sharper.

**Raw**: the 40-page "Reporting standards and brand guide" PDF.

**Summary** (one page, your words): "Our report standards: eight slides maximum. Summary chart on slide two. Every figure shown with the same month last year alongside. Never name an individual customer. Titles in sentence case."

The summary carries everything Claude needs and nothing it does not. Same for examples: one finished report you were proud of teaches the shape better than six half-finished ones.

If a long reference really is needed sometimes, keep it as its own file and say in the instructions when to open it: "For refund questions, check the refunds file." Then it is read only when it matters.

If you cannot summarise a document in a paragraph, you do not yet know what you want Claude to take from it.`,
      keyPoints: [
        "A long raw document buries the paragraph you need and pushes your instructions aside.",
        "Write one page, in your words, of the rules from it that apply to this task.",
        "Keep a genuinely needed long reference as its own file and say when to open it.",
      ],
      example: {
        title: "Try this",
        text: "Take one long document you would have added to a Project. Write five lines, in your own words, of the rules from it that apply to your task. Add those five lines instead of the document.",
      },
      check: {
        question: "You want Claude to follow your team's report standards. What should you add to the Project?",
        options: [
          "The 40-page brand and reporting PDF",
          "A one-page summary, in your words, of the rules that apply to reports",
          "Six half-finished reports from last year",
          "Nothing; Claude knows what a good report looks like",
        ],
        answer: 1,
        explanation: "The summary carries the rules that matter without burying them; the PDF and the half-finished reports add bulk, and Claude cannot guess your team's standards.",
      },
      competencies: ["L2.selection"],
    },
    {
      slug: "l2-fix-it-in-the-project",
      rung: 2,
      title: "Fix it in the Project, not in the chat",
      promise: "You will make a repeat mistake go away for good by moving the correction into the Project.",
      minutes: 2,
      scene: "project-context",
      body: `When Claude gets the same thing wrong two weeks running, the fix you type in chat is gone by next week. The fix you make in the Project lasts.

Every Monday the report comes back with the chart labelled by quarter when you want it by month. You type "label by month" and carry on. Next Monday, same thing.

**In the chat**: "Label the chart by month, not quarter." Works today. Forgotten tomorrow.

**In the Project instructions**: "Charts are always labelled by month." Works every week from now on, for you and anyone who borrows the Project.

The same goes for files. When the template changes in June, swap the file and delete the old one; leaving both in makes Claude guess which you meant. A one-line note at the bottom of the instructions ("June: new proposal template") tells you later why it looks the way it does.

Two signs a Project needs attention: you are prefacing every chat with the same paragraph again, or the file list has grown past a handful. Both take five minutes: move the correction in, or take the file out.`,
      keyPoints: [
        "A correction typed in chat fixes today; the same line in the Project fixes every run from now on.",
        "When a file changes, swap it and delete the old one, then add a one-line note saying what changed.",
        "If you are prefacing every chat with the same paragraph again, that paragraph belongs in the Project.",
      ],
      example: {
        title: "Try this",
        text: "Think of the last correction you typed to Claude twice. Open the Project and add it as one line in the instructions.",
      },
      check: {
        question: "Claude labels the chart wrongly in every monthly report. What is the right fix?",
        options: [
          "Correct it in the chat each time",
          "Add the labelling rule to the Project instructions",
          "Start a new Project",
          "Stop using Claude for reports",
        ],
        answer: 1,
        explanation: "A mistake that repeats belongs in the instructions; a chat correction only fixes today's run.",
      },
      competencies: ["L2.project_design"],
    },
  ],
}
