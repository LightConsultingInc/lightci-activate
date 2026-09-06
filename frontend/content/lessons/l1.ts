import type { Module } from "./types"

export const MODULE_L1: Module = {
  rung: 1,
  code: "L1",
  name: "Conversational",
  tagline: "Describe a task well, guess what you'll get, then check it like a colleague's draft.",
  outcomes: [
    "Write a prompt that says who it is for, what good looks like, and what shape the output takes.",
    "State what you expect before you read the output, and find the real problems after.",
    "Fix a draft in two or three rounds instead of starting over, and know when not to use Claude at all.",
  ],
  practice:
    "Practice: you'll write one real prompt for something on your calendar this week and see how Claude did against what you expected.",
  lessons: [
    {
      slug: "l1-describe-the-task",
      rung: 1,
      title: "Describing a task so Claude can do it",
      promise: "You will write a prompt with the five parts that turn a generic draft into a usable one.",
      minutes: 4,
      scene: "prompt-anatomy",
      body: `Claude cannot see your screen, your calendar or your customer. Everything it knows about the task is what you put in the message. A good description has five parts, and you can write them in any order.

**Role**: who Claude should be for this task. "You are helping an account manager who looks after long-standing customers."

**Task**: the verb and the object. "Draft the email that reminds a customer their annual renewal is coming up."

**Inputs**: what it has to work with. Paste the notes, the template, the bullet points. If the input contains customer details, replace them with the situation.

**What good looks like**: the audience and the standard. "For a customer who has been with us for years and prefers plain language. Warm, not chatty. Never quote prices in the email."

**Format**: shape and length. "Under 200 words, three short paragraphs, ready to paste into our email template."

Most weak prompts are missing the fourth and fifth parts. People say what to do and forget to say who it is for and what done looks like, then are surprised when the draft is generic.

Use your team's words. If you call it a "quarterly check-in", say that. Claude will match your vocabulary, and the draft will need less rework.`,
      keyPoints: [
        "Five parts: role, task, inputs, what good looks like, format.",
        "Most weak prompts skip the audience and the standard; that is why drafts come back generic.",
        "Use your team's own words and Claude will use them back.",
      ],
      example: {
        title: "A proposal cover note",
        text: "\"You're helping a salesperson. Draft the one-paragraph cover note for a proposal to a prospective customer, a small company replacing three separate tools with one. Warm and direct, no jargon, no prices. Under 120 words. Here are my bullet notes from the discovery call.\"",
      },
      check: {
        question: "Someone writes: \"Summarise these notes.\" The summary comes back long and generic. Which parts of the description were missing?",
        options: [
          "Role and task",
          "What good looks like and format",
          "Inputs",
          "Nothing; Claude should have known",
        ],
        answer: 1,
        explanation: "The task and inputs were there; the audience, the standard and the shape were not, so Claude had to guess.",
      },
      competencies: ["L1.description"],
    },
    {
      slug: "l1-guess-first",
      rung: 1,
      title: "Guess first, then look",
      promise: "You will state what you expect before you read the output, and see why that one sentence changes how you read.",
      minutes: 4,
      scene: "predict-then-see",
      body: `Before you read any output, write down what you expect. One sentence, with a rough confidence. "I think this will be about eighty percent usable but it will miss that the customer wants everything on one page."

It feels like a small ritual. It changes everything about how you read.

When you read without a prediction, you skim. The draft looks plausible, the sentences are grammatical, and your eye slides down the page nodding. Errors that a fresh reader would spot go straight through.

When you have a prediction, you are checking. Did it miss what I thought it would miss? Did it get the tone I asked for? The output becomes a test of your judgement, not just a thing to accept or reject. When you are confidently wrong, the surprise sticks, and you will describe the task better next time.

Over weeks, your predictions get sharper. You learn where Claude is reliable for your work and where it wobbles. That is the actual skill: knowing when to trust the draft and when to slow down.

Activate asks for the prediction before every run and records it. Not to catch you out. Because the gap between what you expected and what you got is where the learning happens.`,
      keyPoints: [
        "Write one sentence about what you expect, with a rough confidence, before you look.",
        "A prediction turns skimming into checking; you are testing a guess, not nodding along.",
        "Being confidently wrong is useful: the surprise is what makes the lesson stick.",
      ],
      example: {
        title: "Monthly report outline",
        text: "Before running the prompt, you write: \"Seventy percent confident it gives me eight sensible slides but puts results before goals, which we never do.\" It did exactly that. Next time the prompt says \"goals slide comes before results\", and the prediction is ninety percent.",
      },
      check: {
        question: "Why does Activate ask for your expectation before every run?",
        options: [
          "To time how fast you type",
          "So the gap between what you expected and what you got becomes something you learn from",
          "To decide whether you are allowed to run the prompt",
          "To compare you with teammates",
        ],
        answer: 1,
        explanation: "The prediction makes you read as a checker, and the recorded gap is what sharpens your judgement over time.",
      },
      competencies: ["L1.discernment"],
    },
    {
      slug: "l1-check-output",
      rung: 1,
      title: "Checking an output like a colleague's draft",
      promise: "You will check facts, gaps and tone in a fixed order and write a critique that says what would fix it.",
      minutes: 4,
      scene: "check-output",
      body: `Read Claude's draft the way you would read a bright new colleague's: grateful for the head start, responsible for what goes out.

Check in four passes, in this order.

**Facts.** Every number, date, rule and name. Claude can state a price, a policy detail or a deadline with total confidence and be wrong. Verify against the source: the contract, the policy page, your notes. Anything you cannot verify comes out.

**Gaps.** What did you ask for that is not here? What would the customer ask that this does not answer? A draft can be accurate and still incomplete.

**Tone.** Does it sound like the firm? Look for phrases you would never say, filler openings, and false warmth. Read one paragraph aloud if you are unsure.

**What you would change.** Write it down in a sentence or two. "Second paragraph too long; missed the renewal deadline; sounds like a brochure." This is your critique, and it is what the next prompt is built from.

Two things to avoid. Do not accept because it reads smoothly; fluency is not accuracy. Do not reject because one line is off; fix the line. Your job is to find the real issues and say what would fix them.`,
      keyPoints: [
        "Four passes in order: facts, gaps, tone, what you would change.",
        "Verify every number and date against a source; anything you cannot verify comes out.",
        "Fluent is not the same as right, and one bad line does not mean a bad draft.",
      ],
      example: {
        title: "Renewal reminder email",
        text: "Facts: the email says the renewal date is 31 December; correct for this customer, checked. Gaps: it never says who to contact with questions. Tone: opens with \"I hope this finds you well\", which the firm never uses. Critique: \"Add a contact line, cut the opener, otherwise good.\"",
      },
      check: {
        question: "The draft quotes a deadline from your policy and it reads confidently. What do you do?",
        options: [
          "Trust it; Claude is usually right about dates",
          "Check it against the source before it stays in",
          "Delete the whole draft and start again",
          "Ask Claude if it is sure",
        ],
        answer: 1,
        explanation: "Numbers and dates get verified against a source every time; confidence in the prose is not evidence.",
      },
      competencies: ["L1.discernment", "L1.diligence"],
    },
    {
      slug: "l1-iterate",
      rung: 1,
      title: "Iterating instead of starting over",
      promise: "You will turn a critique into two or three specific instructions and know when a fresh start is actually the fix.",
      minutes: 4,
      scene: "prompt-anatomy",
      body: `The first draft is rarely the last. The mistake is to throw it away and start a fresh chat. Claude already has your context; use it.

Iterate by telling Claude what to change, specifically. Not "make it better" but "keep the structure, cut the second paragraph to two sentences, and change the opening so it does not start with I hope this finds you well." Point at the part, say what is wrong, say what right looks like.

Three iteration moves cover most situations.

**Tighten**: "Same content, half the length."

**Redirect**: "You have written this for a colleague. Rewrite it for a customer who is unhappy about a delay."

**Fill**: "Add a short paragraph on what happens if they miss the renewal deadline."

Two or three rounds is normal. If you are on round five and still unhappy, the problem is usually the original description. Stop, reread your first message, and ask which of the five parts was missing. Then start again with a better first message, not a sixth patch.

Keep the critique you wrote in the last lesson visible while you iterate. Each item on it becomes one instruction. When the list is empty, you are done.`,
      keyPoints: [
        "Point at the part, say what is wrong, say what right looks like.",
        "Three moves cover most cases: tighten, redirect, fill.",
        "Round five means the first message was the problem; fix that instead of patching again.",
      ],
      example: {
        title: "Customer meeting talking points",
        text: "Round one: talking points come back as long paragraphs. \"Same content as bullets, one line each.\" Round two: bullets are good but skip the pricing change. \"Add one bullet on the pricing change we agreed in March.\" Done in two rounds.",
      },
      check: {
        question: "You are on the fifth round of edits and the draft still is not right. What is the most likely fix?",
        options: [
          "A sixth, more forceful instruction",
          "Switching to Claude Code",
          "Rereading your first message and starting again with a better description",
          "Accepting the draft as it is",
        ],
        answer: 2,
        explanation: "Repeated patching usually means the original description was missing a part; a better first message beats another patch.",
      },
      competencies: ["L1.description", "L1.delegation"],
    },
    {
      slug: "l1-when-not",
      rung: 1,
      title: "When not to use Claude",
      promise: "You will say out loud which parts of a task stay with you, and recognise the tasks that should not go to Claude at all.",
      minutes: 4,
      scene: "four-d",
      body: `Delegation includes deciding not to delegate. Some work should stay with you, and knowing which is a sign of skill, not reluctance.

**Keep the judgement.** Whether to offer a discount, how to handle a customer who is upset, what to say when a colleague has had bad news. Claude can help you think, draft options, or check your reasoning, but the call is yours.

**Keep the relationship.** Anything the customer will hear as your voice on a personal matter should be written by you. A drafted condolence note sounds like one.

**Keep anything past the boundary.** If the task needs customer documents or account data, Claude is the wrong tool for that step. Do the step yourself and hand Claude the anonymised result.

**Skip it when it is faster to do it yourself.** A two-line reply does not need a prompt.

**Skip it when you cannot check it.** If you do not know enough to tell whether the output is right, you are not delegating, you are gambling. Get the knowledge first or ask a colleague.

A good habit: before you open Claude, say the split out loud. "Claude drafts the structure and the background section. I write the recommendation and the closing." Splitting first makes both halves better.`,
      keyPoints: [
        "Keep the judgement, the relationship, and anything past the boundary.",
        "Skip Claude when doing it yourself is faster or when you could not check the result.",
        "Say the split out loud before you start: what Claude drafts, what you write.",
      ],
      example: {
        title: "A difficult customer call",
        text: "A customer is angry about a missed delivery and threatening to leave. You ask Claude for a checklist of what to confirm before the call and the options you could offer. You write the apology yourself, and do the call without a script.",
      },
      check: {
        question: "Which task is the best candidate to keep entirely with you?",
        options: [
          "Turning your meeting bullets into an agenda",
          "Deciding whether to offer a specific customer a discount",
          "Reformatting a report outline to the house template",
          "Summarising a public industry article",
        ],
        answer: 1,
        explanation: "The discount is a judgement about a customer and money; Claude can help you think, but the call stays yours.",
      },
      competencies: ["L1.delegation", "L0.boundary"],
    },
  ],
}
