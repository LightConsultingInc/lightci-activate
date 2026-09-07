import type { Module } from "./types"

export const MODULE_L3: Module = {
  rung: 3,
  code: "L3",
  name: "Skill",
  tagline: "Turn something you keep explaining into a recipe your whole team can use.",
  outcomes: [
    "Write a one-line description that makes Claude use your skill at the right moment and not otherwise.",
    "Keep the front page short, put long references behind it, and show two strong examples.",
    "Say what the skill reads, including any connected tool, what it must never receive, and where a person reviews.",
  ],
  practice:
    "Practice: you'll write one skill for a task your team repeats, run three sample requests against it, and see which ones fire.",
  lessons: [
    {
      slug: "l3-what-is-a-skill",
      rung: 3,
      title: "What a skill is: one job, done well",
      promise: "You will know what a skill is, how it differs from a Project, and why it should do exactly one job.",
      minutes: 4,
      scene: "skill-trigger",
      mock: "skill-in-use",
      body: `A skill is a recipe Claude can pick up on its own. You write it once, it lives in the team library, and when a request matches, Claude reads the recipe and follows it.

That is what makes a skill different from a Project. With a Project, you open it. With a skill, Claude decides to use it based on a short description you wrote. That means the description has to do real work, which the next lesson covers.

A skill is a folder with a main file, usually called SKILL.md, plus any reference files it needs. At the top of the main file, a name and one-line description that Claude sees all the time. Below that, the instructions, which Claude reads only when it decides the skill applies.

Good skills do one job. "Draft the reminder email for an upcoming renewal" is a skill. "Help with customer communications" is a department. "Prepare for the weekly customer meeting" sounds like one job but is four: agenda, summary of notes, open action items, talking points. Bundled, the skill gets long, the trigger gets vague, and fixing one part breaks another. Split by asking: could a teammate want one of these without the others?

State where the skill stops. "Produces the talking points as a bulleted list; does not draft the follow-up email or update the CRM."

Before you write a skill, run the task a few times and notice what you keep explaining. That repeated explanation is the skill.`,
      keyPoints: [
        "A skill is a recipe Claude picks up on its own; a Project is one you open.",
        "One job per skill; if a teammate could want one part without the others, split it.",
        "State where the skill stops, and write the thing you keep explaining, not the whole process.",
      ],
      example: {
        title: "Try this",
        text: "Write one sentence describing a task you have explained to Claude at least three times this month. If the sentence contains \"and\", split it into two sentences. Each is a skill candidate.",
      },
      check: {
        question: "A draft skill drafts the proposal, updates the CRM record, and sends the follow-up email. What should the author do?",
        options: [
          "Ship it; fewer skills are easier to manage",
          "Split it into separate skills and keep the CRM update and the send with a person",
          "Add more steps so it covers the whole workflow",
          "Make the description longer to explain all three",
        ],
        answer: 1,
        explanation: "Three different jobs should be three skills, and the record update and the send are review points for a person.",
      },
      competencies: ["L3.trigger"],
    },
    {
      slug: "l3-trigger-line",
      rung: 3,
      title: "Writing a trigger line that fires at the right moment",
      promise: "You will write a description that names what the skill does and when to use it, in the words a teammate would type.",
      minutes: 4,
      scene: "skill-trigger",
      mock: "skill-in-use",
      body: `The description is the one line Claude reads to decide whether to use your skill. If it is vague, the skill fires at the wrong times or never. If it is precise, the skill appears exactly when a teammate needs it.

Write it in two halves: what the skill does, and when to use it. Say both in the words a colleague would actually type, not the internal steps of the skill.

**Weak**: "Helps with customer emails."

**Strong**: "Drafts the reminder email sent before a customer's annual renewal. Use when someone asks for a renewal reminder, renewal notice, or heads-up email for a customer whose contract ends within 60 days."

Notice the strong version names the situations, includes the shorthand people really use, and gives Claude enough to rule the skill out for a neighbouring request like a welcome email for a new customer.

Write in the third person. "Drafts", not "I can draft" or "you can use this to draft". The description is read alongside dozens of others, and a consistent voice helps Claude compare them.

One test before you move on: read the description to a teammate and ask them to name two requests it should catch and one it should not. If they hesitate, the line is not done.`,
      keyPoints: [
        "Two halves: what the skill does, and when to use it, in the words people really type.",
        "Name the situations and the shorthand; make neighbouring requests easy to rule out.",
        "Third person, always. Test it by asking a teammate for two hits and one miss.",
      ],
      example: {
        title: "Try this",
        text: "Write the description for your skill candidate in two sentences: the first starts with a verb (\"Drafts...\"), the second starts with \"Use when...\". Read it to a teammate and ask for two hits and one miss.",
      },
      check: {
        question: "Which description will make Claude use the skill at the right moments?",
        options: [
          "Helps with documents.",
          "I can write emails for you.",
          "Drafts the renewal reminder email. Use when someone asks for a renewal reminder, renewal notice or heads-up for a customer whose contract ends soon.",
          "Runs steps one to five of the email process.",
        ],
        answer: 2,
        explanation: "It says what the skill does and names the requests that should trigger it, in third person and in the team's words.",
      },
      competencies: ["L3.trigger"],
    },
    {
      slug: "l3-progressive-disclosure",
      rung: 3,
      title: "Short front page, references behind it",
      promise: "You will keep the main file to what Claude needs on every run and move templates and rare cases into linked files.",
      minutes: 4,
      scene: "progressive-disclosure",
      body: `Claude reads your skill in layers. First the name and description, always. Then the main file, only when the skill is chosen. Then any reference files, only when the instructions point to them. Write for those layers.

The main file is the front page. Keep it short: when to use this, what inputs to expect, the steps, what the output looks like, the boundaries, and two examples. If a paragraph could be deleted without changing what Claude does, delete it. Claude already knows what a status report is; it does not know your team's month-end checklist.

Everything long or rarely needed goes behind the front page in its own file. The full email template. The table of regional rules. The unusual case that comes up twice a year. Reference each from the main file with a plain pointer: "For customers on legacy contracts, read legacy-contracts.md." Keep references one level deep so Claude reads whole files rather than skimming a chain.

Use the same section order in every skill your team writes. A reviewer can then find the boundary or the examples in seconds, and Claude gets a consistent shape.

The effect is a skill that loads fast, stays focused, and can carry as much reference material as you like without slowing every run.`,
      keyPoints: [
        "Front page: when to use, inputs, steps, output, boundaries, two examples. Nothing that could be cut.",
        "Long templates and rare cases go in their own files, referenced one level deep.",
        "Same section order in every skill so reviewers and Claude find things fast.",
      ],
      example: {
        title: "Try this",
        text: "Open your draft skill and find the longest block of text. Move it into a separate file with a clear name and replace it with one line: \"For X, read filename.md.\"",
      },
      check: {
        question: "Where does the full four-page email template belong?",
        options: [
          "Pasted into the main file so Claude always has it",
          "In a separate file the main file points to",
          "In the description",
          "Nowhere; Claude can invent the template",
        ],
        answer: 1,
        explanation: "Long material goes behind the front page in a referenced file, loaded only when a run needs it.",
      },
      competencies: ["L3.disclosure"],
    },
    {
      slug: "l3-canonical-examples",
      rung: 3,
      title: "Two good examples beat a list of edge cases",
      promise: "You will choose two or three typical, complete examples and stop writing rule lists that never end.",
      minutes: 4,
      scene: "canonical-examples",
      body: `When you want Claude to produce something in a particular shape, show it. Two good examples teach more than a page of rules.

Pick examples that are typical, complete, and clearly in the firm's voice. A finished renewal reminder for a straightforward case. A second one for the other common case, say a customer on a monthly plan. Each shows the input Claude received and the output you would have been happy to send.

What not to do is list edge cases. "If the customer is a partner firm, do X. If the contract is a legacy one, do Y. If they have already renewed part of it, do Z." Lists like this grow forever, contradict each other, and still miss the case that arrives next Tuesday. Claude generalises well from strong examples and poorly from long rule lists.

A useful test: cover the output half of your example and ask whether a sensible colleague could produce something close from the input alone. If yes, the example is carrying real information. If no, it is a special case dressed up as an example.

Keep the examples in the main file if they are short, or in an examples file if they run long. Either way, two or three, chosen carefully, is the number to aim for.`,
      keyPoints: [
        "Show two or three typical, complete examples with input and output.",
        "Edge-case lists grow forever and still miss next Tuesday's case.",
        "Test: could a sensible colleague produce the output from the input? If not, it is a special case, not an example.",
      ],
      example: {
        title: "Try this",
        text: "Find the best finished output you produced for this task in the last month. Paste it into your skill as Example 1, with the request that led to it above it.",
      },
      check: {
        question: "Your skill's output keeps missing the house shape. What is the best fix?",
        options: [
          "Add ten more rules covering every case you can think of",
          "Add two complete, typical input-and-output examples in the firm's voice",
          "Make the description longer",
          "Remove all examples so Claude is not confused",
        ],
        answer: 1,
        explanation: "Strong examples teach the shape; longer rule lists dilute the skill and still miss cases.",
      },
      competencies: ["L3.examples"],
    },
    {
      slug: "l3-connector-skill",
      rung: 3,
      title: "A skill that calls a connector",
      promise: "You will write a skill that names its source, says what to read, and says what a person still checks.",
      minutes: 4,
      scene: "boundary-declaration",
      mock: "skill-in-use",
      body: `A skill can use connectors too. The difference from a chat is that the skill has to say, in writing, which source it reads and what a person still checks.

Three lines do most of the work.

**Name the source.** "Reads the account record and open opportunities from Salesforce for the customer named in the request." Not "look up the customer" and hope.

**Say what to read and what to skip.** "Read the last two calls in Gong; ignore internal calls." Specific reads keep the skill fast and predictable.

**Say what a person checks.** "Draft only; a person confirms any date or amount against the record before it is sent." Connectors read faithfully, but records can be stale or wrong, and the skill should not pretend otherwise.

Put the same three lines in the boundary declaration: Salesforce and Gong under may read, nothing under may write unless the firm has allowed it, and the review point named. Then your sample cases should include one where the source is empty. "Prep for a customer with no Salesforce record": the skill says so and stops, rather than inventing history.

If the skill needs to write to a system, for example updating a CRM note, keep that step with a person unless your firm's policy explicitly allows the skill to write and says where it is reviewed.`,
      keyPoints: [
        "Name the source, say what to read and skip, say what a person checks.",
        "Put the sources under may read in the boundary declaration; writes only if the firm has allowed them.",
        "Include a sample case where the source is empty, and make the skill say so rather than invent.",
      ],
      example: {
        title: "Try this",
        text: "Add one line to your skill's steps: \"Read [tool] for [what]; if nothing is found, say so and stop.\" Then add \"[tool]\" under may read in the boundary declaration.",
      },
      check: {
        question: "A skill reads Salesforce and the customer has no record there. What should the skill do?",
        options: [
          "Invent a plausible history so the draft is complete",
          "Say the record is missing and stop or continue from other sources",
          "Create the record in Salesforce",
          "Skip the customer silently",
        ],
        answer: 1,
        explanation: "A skill should report an empty source honestly; inventing history or writing a record is exactly what the boundary is there to prevent.",
      },
      competencies: ["L3.boundary", "L3.disclosure"],
    },
    {
      slug: "l3-boundary-and-cases",
      rung: 3,
      title: "The boundary declaration and sample cases",
      promise: "You will declare what the skill may read, must never receive and where a person reviews, and write cases that prove it.",
      minutes: 4,
      scene: "boundary-declaration",
      body: `Every skill ships with two small documents that let a reviewer trust it without running it.

The **boundary declaration** has three lists. What the skill may read: calendar, Salesforce, a CRM export, internal templates, uploaded documents. What it must never receive: the few classes on your firm's list, typically payment card data, account numbers, personal identifiers, secrets. Where a human reviews: before anything is sent, before anything is written to a system. Use the firm's own names for these data classes, and check that the steps in your skill actually honour the lists. A skill that says "never receives payment card data" and then asks for the card number in step two will not pass.

The **sample cases** are three or more short requests with the behaviour you expect. At least one that should fire the skill, one that should not, and one that is genuinely ambiguous. "Draft the renewal reminder for a customer whose contract ends next month" should fire. "Draft a welcome email for a new customer" should not. "Write to a customer about their contract" is ambiguous, and you say what Claude should do: ask whether it is about the renewal.

Write the cases from your real work, in your team's words. They are how the reviewer checks the trigger and the scope, and they are how you will know, six months from now, whether a change broke something.`,
      keyPoints: [
        "Three lists: may read, must never receive, where a human reviews, in the firm's own data-class names.",
        "The steps must honour the lists; a forbidden input in step two fails the skill.",
        "Sample cases: at least one should-fire, one should-not, one ambiguous, each with expected behaviour, from your real work.",
      ],
      example: {
        title: "Try this",
        text: "Write three one-line requests for your skill: one it should catch, one it should not, and one where it should ask a question. Put them in a cases folder next to the main file.",
      },
      check: {
        question: "A skill declares it never receives payment card data, but step two says \"paste the card number from the billing record\". What happens in review?",
        options: [
          "It passes; the declaration is what counts",
          "It fails; the steps must honour the declaration",
          "It passes if the number is short",
          "The reviewer removes the declaration",
        ],
        answer: 1,
        explanation: "The declaration and the steps have to agree; a step that asks for forbidden data breaks the boundary regardless of what the lists say.",
      },
      competencies: ["L3.boundary", "L3.examples"],
    },
  ],
}
