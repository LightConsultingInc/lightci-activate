import type { Module } from "./types"

export const MODULE_L3: Module = {
  rung: 3,
  code: "L3",
  name: "Skill",
  tagline: "Turn something you keep explaining into a recipe Claude picks up on its own, for the whole team.",
  outcomes: [
    "Write the one line that makes Claude use your skill for the right requests and leave it alone for the rest.",
    "Keep the skill to one job with a short front page, two worked examples, and the long material in files behind it.",
    "Say what the skill may read, what it must never receive and when a person checks, and write three sample requests that prove it.",
  ],
  practice:
    "Practice: you'll write the skill for one task your team repeats, starting from a pre-filled template, then run three sample requests and see which ones pick up the skill and what comes back.",
  lessons: [
    {
      slug: "l3-trigger-line",
      rung: 3,
      title: "The one line that makes a skill fire",
      promise: "You will write the description that makes Claude use your skill for the right requests and not for the neighbours.",
      minutes: 3,
      scene: "skill-trigger",
      body: `A skill is a recipe Claude picks up on its own, so your teammates get your best version every time. You write it once, it sits in the team library, and when a request matches, Claude follows it without anyone opening anything.

Because Claude does the choosing, the one-line description at the top does the real work. Vague, and the skill fires at the wrong moments or never. Precise, and it appears exactly when someone needs it.

**Before:** "Helps with customer emails."

**After:** "Drafts the reminder email sent before a customer's annual renewal. Use when someone asks for a renewal reminder, renewal notice, or heads-up for a contract ending within 60 days. Not for welcome emails or proposals."

The second version says what the skill does, names the requests people actually type, and rules out the nearby ones. Write it in the third person ("Drafts", not "I can draft") so it reads like every other skill on the shelf.

One test: could a colleague read that line and name two requests it catches and one it misses? If they hesitate, the line is not finished.`,
      keyPoints: [
        "Claude chooses the skill from its description, so that one line has to do real work.",
        "Say what it does, name the requests people really type, and say what it is not for.",
        "Test: a colleague can name two requests it catches and one it misses.",
      ],
      example: {
        title: "Try this",
        text: "Pick one task you explained to a colleague this week. Write a single sentence that starts \"Use when someone asks for...\" and ends with \"Not for...\".",
      },
      check: {
        question: "Which description will make Claude use the skill only at the right moments?",
        options: [
          "Helps with documents.",
          "I can write emails for you.",
          "Drafts the renewal reminder email. Use when someone asks for a renewal reminder, renewal notice or heads-up for a contract ending soon. Not for welcome emails.",
          "Runs steps one to five of the email process.",
        ],
        answer: 2,
        explanation: "It says what the skill does, names the requests that should trigger it, and rules out a neighbour, all in the third person.",
      },
      competencies: ["L3.trigger"],
    },
    {
      slug: "l3-one-job",
      rung: 3,
      title: "One skill, one job",
      promise: "You will cut a bundled task down to one job and write the line that says where the skill stops.",
      minutes: 3,
      scene: "include-exclude",
      body: `A skill that tries to do three jobs does none of them well, and nobody can fix one part without breaking the others. The most common problem with a first skill is that it started as one job and quietly swallowed the whole afternoon.

**Before:** "Prepares the weekly customer meeting: summarises the CRM notes, builds the agenda, writes the talking points and drafts the follow-up email."

That is four jobs with four different inputs and four different judgement calls. The description goes vague, the file gets long, and when the talking points misbehave you are editing the email too.

**After:** "Summarises anonymised CRM notes for an upcoming customer meeting into a half-page brief. Produces the brief only; does not write the agenda, talking points or follow-up email."

The test for splitting: could a teammate want one part without the others? If yes, they are separate skills. The proposal team will happily reuse the brief on its own.

The last sentence of the "after" matters as much as the first. Saying where the skill stops tells Claude what not to attempt and tells a reviewer what not to expect.`,
      keyPoints: [
        "If a teammate could want one part without the others, they are separate skills.",
        "Bundled jobs make the description vague and the fixes risky.",
        "End with a line that says what the skill does not do.",
      ],
      example: {
        title: "Try this",
        text: "Write the output of your skill in one line. If you needed the word \"and\" to describe it, you have two skills; keep the one you do most often.",
      },
      check: {
        question: "A draft skill writes the proposal, updates the CRM record and sends the follow-up email. What should you do?",
        options: [
          "Ship it; fewer skills are easier to manage",
          "Keep one job per skill and leave the record update and the send to a person",
          "Add more steps so it covers the whole workflow",
          "Make the description longer to explain all three",
        ],
        answer: 1,
        explanation: "Three different jobs with different judgement calls are three skills, and updating a record or sending an email is something a person should check first.",
      },
      competencies: ["L3.trigger"],
    },
    {
      slug: "l3-short-front-page",
      rung: 3,
      title: "A short front page, the long stuff behind it",
      promise: "You will keep the main file to what Claude needs on every run and put templates and rare cases in files it opens only when needed.",
      minutes: 3,
      scene: "progressive-disclosure",
      body: `Claude reads your skill's front page every time it uses it, so every paragraph there costs attention. Keep the front page to what changes the result, and put everything else behind it.

**Before:** a 600-word SKILL.md. The full four-page email template pasted in. A table of rules for each regional office. A paragraph explaining what a renewal is. The house style, copied from the team Project. The legacy-contract exception that comes up twice a year.

**After:** a 120-word SKILL.md. When to use it. The two inputs it expects. Five steps. What the output looks like. The boundary. Two examples. Then one note: "Full email template: template.md. Legacy contracts: legacy.md. House style: as set in the team Project."

Claude opens template.md only on a run that needs it, so the skill can carry any amount of reference material without slowing every run. House style is not repeated because it already lives in the Project; a copy would drift within a month.

The rule: if deleting a sentence would not change what Claude does, delete it. Claude knows what a renewal is. It does not know your five steps.`,
      keyPoints: [
        "The front page: when to use, inputs, steps, output, boundary, two examples. Nothing that could be cut.",
        "Templates, long tables and rare cases go in their own files with a one-line pointer.",
        "Do not copy what the Project already says; point to it.",
      ],
      example: {
        title: "Try this",
        text: "Open the longest set of instructions you have ever given Claude. Cross out every sentence it would follow anyway. What is left is your front page.",
      },
      check: {
        question: "Where does the full four-page email template belong?",
        options: [
          "Pasted into the front page so Claude always has it",
          "In its own file, with a one-line pointer from the front page",
          "In the one-line description",
          "Nowhere; Claude can invent the template each time",
        ],
        answer: 1,
        explanation: "Long material goes behind the front page in a file Claude opens only on the runs that need it.",
      },
      competencies: ["L3.disclosure"],
    },
    {
      slug: "l3-two-examples",
      rung: 3,
      title: "Two worked examples beat twelve rules",
      promise: "You will show Claude the shape you want with two complete examples instead of a rule list that never ends.",
      minutes: 3,
      scene: "canonical-examples",
      body: `Claude copies a shape far better than it follows a rulebook, so two complete examples do more than a page of ifs.

**Before:** twelve rules. "If the customer is a partner firm, use the partner greeting. If the contract is a legacy one, mention the old plan name. If they have already renewed part of it, list only the remaining products. If the value is under a thousand, drop the account manager line..." and eight more. Lists like this grow forever, contradict each other, and still miss the case that arrives next Tuesday.

**After:** two examples. Example one: the input (customer name, plan, contract end date, account manager) and the finished reminder email you actually sent, names removed. Example two: the same for a customer on a monthly plan, the other common shape.

Each example shows both halves, input and output. Pick typical cases, not strange ones.

A test for a good example: cover the output and ask whether a sensible colleague could produce something close from the input alone. If yes, the example carries real information. If no, it is a special case dressed up as an example.`,
      keyPoints: [
        "Two or three typical, complete examples with input and output, names removed.",
        "Rule lists grow forever and still miss next Tuesday's case.",
        "Test: could a colleague produce the output from the input alone?",
      ],
      example: {
        title: "Try this",
        text: "Find the last time you did this task well. Paste the input you had and the output you sent, with names removed, under a heading that says \"Example 1\".",
      },
      check: {
        question: "Your skill's output keeps missing the house shape. What is the best fix?",
        options: [
          "Add ten more rules covering every case you can think of",
          "Add two complete, typical examples showing the input and the output you wanted",
          "Make the description longer",
          "Remove all examples so Claude is not confused",
        ],
        answer: 1,
        explanation: "Complete examples teach the shape; longer rule lists dilute the skill and still miss cases.",
      },
      competencies: ["L3.examples"],
    },
    {
      slug: "l3-boundary",
      rung: 3,
      title: "Say what it may read and what it must never receive",
      promise: "You will write the three lines that tell Claude what data the skill can touch and when a person checks the result.",
      minutes: 3,
      scene: "boundary-declaration",
      body: `A skill runs without you watching, so it must carry its own rules about what data it can touch and when a person looks before anything goes out.

**Before:** a skill with no boundary. "Use whatever the requester pastes in. Draft and send the reminder email." Someone pastes a signed contract with an account number in it, the skill uses it, and the email goes out unread.

**After:** three short lists near the top of the front page.
May read: the calendar, the anonymised CRM summary export, internal templates.
Must never receive: customer documents, account numbers, payment details.
A person checks: before anything is sent to a customer, before anything is entered in the CRM.

Use your firm's own names for these kinds of data, the ones on the policy you already signed.

Then read your steps against the lists. If the lists say "never account numbers" and step two says "paste the signed contract", the lists are a promise the skill breaks. Change step two to ask for the contract end date and plan name instead. Steps and lists have to agree, or a reviewer will trust neither.`,
      keyPoints: [
        "Three lists: may read, must never receive, a person checks before.",
        "Use the names for data your firm already uses.",
        "Read the steps against the lists; a step that asks for forbidden data breaks the promise.",
      ],
      example: {
        title: "Try this",
        text: "Write three lines for your task, starting \"May read:\", \"Must never receive:\" and \"A person checks before:\". Then reread your steps for anything that breaks the second line.",
      },
      check: {
        question: "A skill says it must never receive account numbers, but step two says \"paste the signed contract\". What should you do?",
        options: [
          "Nothing; the lists are what count",
          "Change step two so it asks for the details it needs without the contract",
          "Leave it if the contract is short",
          "Delete the lists so there is no contradiction",
        ],
        answer: 1,
        explanation: "The steps and the lists have to agree; fix the step so it only asks for what the skill is allowed to receive.",
      },
      competencies: ["L3.boundary"],
    },
    {
      slug: "l3-sample-requests",
      rung: 3,
      title: "Three sample requests that prove it works",
      promise: "You will write one request that should use the skill, one that should not, and one borderline case, each with what should happen.",
      minutes: 3,
      scene: "predict-then-see",
      body: `You cannot watch every time Claude picks up your skill, so write three requests in advance that show when it should and when it should not.

For the renewal reminder skill:

**Should fire:** "Draft the renewal reminder for Northwind; their contract ends 14 October." Expected: Claude uses the skill and drafts the reminder from the template.

**Should not fire:** "Draft a welcome email for a new customer who signed yesterday." Expected: Claude writes a normal welcome email and leaves the skill alone.

**Borderline:** "Write to Northwind about their contract." Expected: Claude asks whether this is the renewal reminder before drafting anything.

Each request is one line a colleague would really type, in the team's words, with nothing in it you would not put in an email to a stranger. Each has one line saying what should happen. The borderline one is the most useful of the three: it tells you whether your description rules out the neighbours or just hopes to.

Keep the three requests with the skill. Six months from now, when someone edits the description, running them again is how you find out whether the change broke anything.`,
      keyPoints: [
        "One request that should fire, one that should not, one borderline, each with what should happen.",
        "Write them as a colleague would type them, with no restricted data.",
        "Keep them with the skill and rerun them after every change.",
      ],
      example: {
        title: "Try this",
        text: "Write the one request a colleague would most plausibly type that should NOT use your skill, and one line saying what should happen instead.",
      },
      check: {
        question: "Which set of sample requests is complete?",
        options: [
          "Three requests that should all fire the skill",
          "One that should fire, one that should not, one borderline, each with what should happen",
          "One long request that covers every case",
          "None; Claude will work it out",
        ],
        answer: 1,
        explanation: "The three kinds together show whether the description catches the right requests, leaves the wrong ones alone, and asks when it is unsure.",
      },
      competencies: ["L3.examples", "L3.trigger"],
    },
  ],
}
