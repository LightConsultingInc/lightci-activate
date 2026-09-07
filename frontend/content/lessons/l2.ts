import type { Module } from "./types"

export const MODULE_L2: Module = {
  rung: 2,
  code: "L2",
  name: "Context",
  tagline: "Build a Project that makes one repeated task better every time you open it.",
  outcomes: [
    "Decide when a task deserves a Project and when it does not.",
    "Choose the small set of instructions, files and connected sources that earn their place, and write down why.",
    "Keep a Project useful over months by fixing it where it lives, not in the chat.",
  ],
  practice:
    "Practice: you'll set up a Project for one task you do every week, run a test task inside it, and get three lines of feedback.",
  lessons: [
    {
      slug: "l2-what-is-a-project",
      rung: 2,
      title: "What a Project is and when to make one",
      promise: "You will know the three signs that a task deserves a Project, and the shapes to avoid.",
      minutes: 4,
      scene: "project-context",
      body: `A Project is a chat with a memory. You give it instructions and reference files once, and every conversation inside it starts with them already loaded.

Make a Project when three things are true. You do the task more than once. The background stays mostly the same between runs. And you have caught yourself pasting the same context twice.

Weekly customer-meeting prep is the classic case. Every week you want the same structure, the same tone, the same reminders about what to check. What changes is this week's customers and this week's notes. The stable part goes into the Project. The changing part goes into each chat, or comes from a connected tool.

Do not make a Project for a one-off. Do not make one for a task where every run is completely different. And do not make one giant Project for "my work". It will collect everything and help with nothing. One Project per repeated task is the shape to aim for.

A useful test: could you hand this Project to a colleague on your team and have them run it next week without asking you anything? If yes, you have built something that improves the task. If no, the missing piece is probably in the instructions, which the next lessons cover.`,
      keyPoints: [
        "Make a Project when the task repeats, the background is stable, and you have pasted the same context twice.",
        "The stable part goes in the Project; only what changed this week goes in the chat.",
        "One Project per repeated task; never one giant Project for everything.",
      ],
      example: {
        title: "Try this",
        text: "Create a Project named after one task you do every week. Paste in the template you use for it and one finished example. Run this week's version inside it.",
      },
      check: {
        question: "Which of these should become a Project?",
        options: [
          "A one-time email explaining an office move",
          "The weekly customer-meeting prep",
          "Everything you do at work, in one place",
          "A quick rewording of one sentence",
        ],
        answer: 1,
        explanation: "Meeting prep repeats weekly with a stable structure; the others are one-offs or too broad to help.",
      },
      competencies: ["L2.project_design", "L0.surfaces"],
    },
    {
      slug: "l2-include-exclude",
      rung: 2,
      title: "What to put in and what to leave out",
      promise: "You will choose the tight set of context that helps and write one line on why each item is there.",
      minutes: 4,
      scene: "include-exclude",
      body: `The best context is the smallest set that lets Claude do the job well. Every page you add competes for attention with every other page. Add too much and the important things get diluted.

Start with the question: what does Claude need on every run that it does not already know? It knows what a status report is. It does not know your team's report template, your house rule about never quoting prices in a cover note, or the three things your team always checks before a customer meeting.

**Include**: the template you actually use, the house rules that trip people up, one strong example of a finished output, and a short description of who the audience is.

**Leave out**: general background Claude already has, anything you added "just in case", documents you have not read yourself, and the few data classes on your firm's forbidden list.

For each item, write one sentence saying why it earns its place. If you cannot finish the sentence, take the item out. The reasoning is the skill, not the file list.

Tight beats thorough. A Project with four well-chosen pages will outperform one with forty.`,
      keyPoints: [
        "Add only what Claude needs on every run and does not already know.",
        "Include the real template, the house rules that trip people up, one strong example, and the audience.",
        "Write one line on why each item earns its place; if you cannot, remove it.",
      ],
      example: {
        title: "Try this",
        text: "Open one of your Projects and, next to each file, write one sentence on why it is there. Remove any file you could not finish the sentence for.",
      },
      check: {
        question: "A colleague wants to add the full 60-page policy manual to the Project \"just in case\". What is the right call?",
        options: [
          "Add it; more context is always safer",
          "Leave it out and write a one-page summary of the rules that apply to this task",
          "Add it but tell Claude to ignore most of it",
          "Replace the instructions with the manual",
        ],
        answer: 1,
        explanation: "A long raw document dilutes attention; a short summary of the rules that apply carries the signal without the noise.",
      },
      competencies: ["L2.selection"],
    },
    {
      slug: "l2-reusable-instructions",
      rung: 2,
      title: "Reusable instructions that describe your judgement",
      promise: "You will write Project instructions at the right altitude: principles a new hire could follow, not rigid rules or vague advice.",
      minutes: 4,
      scene: "project-context",
      body: `Project instructions are where you describe your judgement so Claude can apply it without you.

Aim for the right altitude. Too low, and you write rigid rules for every case: "if the customer is new say this, if returning say that." They break the first time reality does not match. Too high, and you write "be professional and helpful", which tells Claude nothing it did not already assume.

The middle is the useful part: the principles you would explain to a new hire in their first week. "We lead with what the customer needs to do, then why. We never quote prices in a cover email. We always say who to contact with questions, using the team member's name the user supplies."

Structure helps. Give the instructions short headed sections: who this is for, what a good output looks like, house rules, what to do when unsure. Claude reads structure well, and so will you when you come back to edit in three months.

Test the instructions by giving Claude a run with as little extra input as possible. If you find yourself typing the same correction in chat twice, that correction belongs in the instructions. Move it there and the Project gets better for good.`,
      keyPoints: [
        "Write the principles you would tell a new hire, not rigid rules or vague encouragement.",
        "Use short headed sections: audience, what good looks like, house rules, what to do when unsure.",
        "A correction you have typed twice in chat belongs in the instructions.",
      ],
      example: {
        title: "Try this",
        text: "Add one line to a Project's instructions that starts \"We always...\" or \"We never...\", using a rule your team actually follows. Run the task again and see if the draft changes.",
      },
      check: {
        question: "Which instruction is at the right altitude?",
        options: [
          "Be helpful and professional.",
          "If the customer is new write A; if returning write B; if lapsed write C.",
          "Lead with what the customer needs to do, then why; never quote prices in a cover email.",
          "Do whatever seems best.",
        ],
        answer: 2,
        explanation: "It states a principle Claude can apply to any case, unlike the vague first option or the brittle rule list.",
      },
      competencies: ["L2.project_design"],
    },
    {
      slug: "l2-connected-sources",
      rung: 2,
      title: "A Project that uses your connected tools",
      promise: "You will write Project instructions that name which connected sources to read, in what order, and what to do if one is empty.",
      minutes: 4,
      scene: "project-context",
      body: `A Project can tell Claude where to look, not just what to know. If your team has connectors, the instructions should name the sources and the order to read them.

Without that, each run starts with Claude asking, or guessing, where the customer's history lives. With it, every run does the same thing: "For meeting prep, first read the account in Salesforce, then the last two calls in Gong, then the latest proposal in Drive. Use the templates in this Project for the output."

Keep it to the sources this task needs. A meeting-prep Project does not need Confluence; a policy-lookup Project probably needs nothing else.

Say what to do when a source is empty or missing. "If there are no Gong calls in the last 90 days, say so and work from Salesforce notes alone." That one line stops a quiet gap becoming a confident invention.

Files you upload to the Project still matter: templates, house rules, one good example. Connectors carry the changing facts; the Project carries the constant shape.

Anyone who uses the Project sees only what their own access allows, so a colleague with narrower Salesforce permissions gets a narrower answer. That is expected. Note it in the instructions so nobody is surprised.`,
      keyPoints: [
        "Name the connected sources and the order to read them, and only the ones this task needs.",
        "Say what to do when a source is empty, so a gap does not become an invention.",
        "Connectors carry the changing facts; the Project's files carry the constant shape.",
      ],
      example: {
        title: "Try this",
        text: "Add one line to a Project's instructions: \"Before drafting, read the customer's record in Salesforce (or the pasted notes if there is no connector).\" Run this week's task and see what changes.",
      },
      check: {
        question: "What should the instructions say about a connected source that might have no data for this customer?",
        options: [
          "Nothing; Claude will work it out",
          "Tell Claude to invent a plausible history",
          "Tell Claude to say the source is empty and continue from the other sources",
          "Remove the source from the Project",
        ],
        answer: 2,
        explanation: "One line about the empty case keeps a missing record from turning into a confident but invented one.",
      },
      competencies: ["L2.project_design", "L2.selection"],
    },
    {
      slug: "l2-summaries-beat-documents",
      rung: 2,
      title: "Files: summaries beat raw documents",
      promise: "You will replace a long raw document with a one-page summary in your own words, and know when a full reference still belongs.",
      minutes: 4,
      scene: "include-exclude",
      body: `It is tempting to drop the whole policy manual into a Project. Resist, not because it is unsafe, but because it works badly.

Long raw documents work against you in two ways. Claude has to find the relevant paragraph in a sea of irrelevant ones, and the sheer volume crowds out the instructions you wrote so carefully. A forty-page PDF added "for reference" usually makes the output worse.

Write a summary instead. One page, in your words, of the parts that matter for this task. "Our report standards: eight slides maximum, the summary chart on slide two, no individual customer names, every figure shown with the same period last year alongside." That page carries everything Claude needs and nothing it does not.

The same applies to examples. One finished quarterly report outline teaches the shape better than six partial ones. Pick the one you were proudest of.

Where a long reference really is needed, keep it as a separate file and tell Claude in the instructions when to look at it: "For questions about refunds, consult the refunds reference file." Then it is read only when it is relevant.

Rule of thumb: if you could not summarise the document in a paragraph, you do not yet understand what you want Claude to take from it.`,
      keyPoints: [
        "A long raw document buries the useful paragraph and crowds out your instructions.",
        "Write a one-page summary in your words of the parts that matter for this task.",
        "Keep a genuinely needed long reference as a separate file and say when to consult it.",
      ],
      example: {
        title: "Try this",
        text: "Pick the longest file in one of your Projects. Write a half-page summary of the parts that matter for that task, upload the summary, and move the original to a clearly named reference file.",
      },
      check: {
        question: "You want Claude to follow the firm's report standards. What is the best thing to add to the Project?",
        options: [
          "The 40-page brand and policy PDF",
          "A one-page summary of the standards that apply to reports, in your words",
          "Six half-finished reports from last year",
          "Nothing; Claude knows what a good report looks like",
        ],
        answer: 1,
        explanation: "A short summary carries the rules that matter without burying them; the raw PDF and partial examples add noise.",
      },
      competencies: ["L2.selection"],
    },
    {
      slug: "l2-keep-healthy",
      rung: 2,
      title: "Keeping a Project healthy over time",
      promise: "You will keep a Project working for months with three small habits and spot the signs it has drifted.",
      minutes: 3,
      scene: "project-context",
      body: `A Project is not finished when you build it. It drifts. Templates change, a house rule is added, a file goes stale, and one morning the output is subtly wrong and you cannot see why.

Keep a Project healthy with three small habits.

**Correct in the Project, not in the chat.** When a run gets something wrong that will be wrong next week too, fix the instructions or the file. A correction typed in chat helps once. A correction in the Project helps forever.

**Review it on a schedule.** Once a month, open the Project with fresh eyes. Read the instructions top to bottom. Open each file and ask whether it still earns its place. Remove what has gone stale. Five minutes.

**Keep a short change note.** A line at the bottom of the instructions: "September: added rule about chart labelling after report feedback." It tells you and any colleague why the Project looks the way it does.

Signs of an unhealthy Project: you have started prefacing every chat with the same paragraph again, the file list has grown past a handful, or a teammate borrowed it and came back with questions. Each points at a specific fix.

Treat the Project as a colleague's brief. You would not let that go a year without an update.`,
      keyPoints: [
        "Fix recurring mistakes in the Project, not in the chat.",
        "Once a month, reread the instructions and ask whether each file still earns its place.",
        "Keep a one-line change note so you and your teammates know why it looks the way it does.",
      ],
      example: {
        title: "Try this",
        text: "Open your oldest Project and add a dated one-line change note at the bottom of the instructions describing the last thing you fixed. Delete one file that no longer earns its place.",
      },
      check: {
        question: "Claude keeps labelling the chart wrongly in every monthly report. What is the right fix?",
        options: [
          "Correct it in the chat each time",
          "Add the labelling rule to the Project instructions and note the change",
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
