import type { Module } from "./types"

export const MODULE_L1: Module = {
  rung: 1,
  code: "L1",
  name: "Conversational",
  tagline: "Write a clear prompt, give Claude the facts, and check what comes back before it goes out.",
  outcomes: [
    "Write a prompt that says who will read it and what done looks like.",
    "Give Claude the facts it needs, and check every number and date in what comes back.",
    "Fix a draft with a short follow-up instead of starting over.",
  ],
  practice:
    "Practice: for one of your own tasks, you'll write the prompt (and paste the material if there is any). We run it and show you what Claude made, with three short lines of feedback.",
  lessons: [
    {
      slug: "l1-who-and-done",
      rung: 1,
      title: "Say who it's for and what done looks like",
      promise: "You will add the two lines that turn a generic draft into one you can send.",
      minutes: 3,
      scene: "prompt-anatomy",
      body: `Claude cannot see your inbox, your customer or your calendar. The only thing it knows about the job is what you type, so a prompt that leaves out the reader and the finish line gets a generic draft back.

Here is the prompt most people write:

"Write a follow-up email after today's meeting."

Here is the same prompt with the two missing parts:

"Write a follow-up email to Dana at Northfield after today's meeting. She's the operations lead, busy, prefers plain language. Confirm the two actions we agreed (we send the revised quote by Friday; she checks the site access dates), thank her briefly, no sales language, no prices. Under 120 words, ready to send."

The second version says **who will read it** and **what done looks like**: the points it must cover, the tone, the length, the things to leave out. That is the whole difference. Nothing clever, just the details you would give a new colleague.

Use your own words for things. If your team says "check-in", not "sync", say check-in. Claude will use your words back and the draft will need less editing.`,
      keyPoints: [
        "Say who will read it: their role, how busy they are, how they like to be spoken to.",
        "Say what done looks like: the points to cover, the tone, the length, what to leave out.",
        "Use your team's own words and Claude will use them back.",
      ],
      example: {
        title: "Try this",
        text: "Take the last email you sent. Ask Claude to rewrite it, and add one line saying who will read it and one line saying how long it should be.",
      },
      check: {
        question: "Someone types \"Summarise these notes\" and pastes the notes. The summary comes back long and generic. What was missing from the prompt?",
        options: [
          "Who will read it and what done looks like",
          "The verb",
          "The notes",
          "Nothing; Claude should have known",
        ],
        answer: 0,
        explanation: "The task and the notes were there. Nobody said who the summary was for, how long it should be, or what it had to cover, so Claude guessed.",
      },
      competencies: ["L1.description"],
    },
    {
      slug: "l1-give-the-facts",
      rung: 1,
      title: "Give Claude the facts it needs",
      promise: "You will hand over the three things Claude would otherwise have to guess.",
      minutes: 3,
      scene: "include-exclude",
      body: `A prompt with no material is a request to make things up. Ask for a summary of last month's sales without the numbers and Claude will write something that sounds like a summary, and you will spend longer fixing it than writing it.

Before you send the prompt, ask what a colleague would need in hand to do this. Usually three things. The notes or the draft you already have. The facts that must appear. Anything they would otherwise have to guess.

Weak: "Write talking points for my renewal call with Harbor Logistics tomorrow."

Better: "Write talking points for my renewal call with Harbor Logistics tomorrow. Facts: they have been with us three years; usage is up 40% since January; the contract renews on 30 September; they asked about a multi-site option in June. My notes from the last call are pasted below."

Paste, don't describe. "Here are my notes" with the notes attached beats "my notes said roughly that..." Swap out customer personal details before you paste.

Hand over the drafting, not the decision. Claude drafts the talking points; whether to offer a discount on the call is yours.`,
      keyPoints: [
        "Three things to hand over: the material you have, the facts that must appear, anything Claude would have to guess.",
        "Paste the notes rather than describing them, with personal details swapped out.",
        "Claude drafts; the decisions on the call stay with you.",
      ],
      example: {
        title: "Try this",
        text: "Pick one thing you have to write this week. Before you ask Claude for it, type three facts it would have to guess without you, then ask.",
      },
      check: {
        question: "Your talking points came back with a contract date you never mentioned. What went wrong?",
        options: [
          "Claude looked it up",
          "The prompt left out the facts, so Claude filled the gap",
          "The notes were too long",
          "Nothing; it is usually right about dates",
        ],
        answer: 1,
        explanation: "Claude cannot see your contract. When a fact is missing from the prompt it writes something plausible in its place.",
      },
      competencies: ["L1.description", "L1.delegation"],
    },
    {
      slug: "l1-accept-if",
      rung: 1,
      title: "Decide what you'd accept before you read it",
      promise: "You will write a ten-second line that turns reading a draft into checking it.",
      minutes: 3,
      scene: "check-output",
      body: `When a draft looks tidy it is easy to nod through it. The fix is a habit that takes ten seconds: before you read the output, write one line saying what you would accept.

You have asked for the outline of the monthly report. Before reading, you type:

"Accept if: eight slides or fewer, goals before results, mentions the delayed Q3 launch."

Now you read against that line instead of just reading. The outline has nine slides, results first, and the launch is not there. Nothing about it looked wrong on the page; the line found three things to change. Your follow-up writes itself: "Cut to eight slides, put goals before results, add a slide on the delayed Q3 launch."

Keep the line short and concrete. Length, order, the one thing it must include, the one thing it must not. "Sounds good" is not a bar. "Under 150 words and no prices" is.

If the draft clears the line, send it. If it does not, you already know what to say next. Either way you spent ten seconds and skipped the vague re-read.`,
      keyPoints: [
        "Before you read, type one line starting \"Accept if:\".",
        "Make it concrete: length, order, one thing it must include, one thing it must not.",
        "Whatever fails the line becomes your follow-up message.",
      ],
      example: {
        title: "Try this",
        text: "Before your next Claude request, type one line starting \"Accept if:\" with a length and one thing it must include. Run it, then read the draft against your line.",
      },
      check: {
        question: "Which is a usable \"Accept if\" line for a customer follow-up email?",
        options: [
          "Accept if it's good",
          "Accept if under 120 words, confirms the Friday quote, no prices",
          "Accept if Claude sounds confident",
          "Accept if it's longer than my usual emails",
        ],
        answer: 1,
        explanation: "It names a length, one thing that must be in, and one thing that must be out. You can check each in seconds.",
      },
      competencies: ["L1.discernment"],
    },
    {
      slug: "l1-check-numbers",
      rung: 1,
      title: "Check every number and date",
      promise: "You will spot the figure Claude invented before it reaches a customer.",
      minutes: 3,
      scene: "check-output",
      body: `Claude writes with the same confidence whether a figure came from your notes or from nowhere. A wrong date in a customer email is your problem, not Claude's, so every number, date and name gets checked before it goes out.

Here is a paragraph from a renewal reminder Claude drafted:

"Your current agreement runs until 31 October and includes 25 user licences. As discussed, renewing before 15 October keeps your current pricing."

You gave it the October renewal date. You did not give it a licence count or an early-renewal deadline. Those two details are made up: they read naturally, they are the kind of thing such an email would say, and they are wrong.

How to spot them: go through the draft and underline anything that is a number, date, name or rule. For each one ask, did I give it this? If yes, check it matches. If no, it came from nowhere, so take it out or replace it with the real figure from your contract or your notes.

Smooth writing is not evidence. A sentence that reads well can still be wrong.`,
      keyPoints: [
        "Underline every number, date, name and rule in the draft.",
        "For each one ask: did I give it this? If not, it is made up.",
        "Take invented figures out or replace them from the source; never leave them because they sound right.",
      ],
      example: {
        title: "Try this",
        text: "Ask Claude to draft a short renewal reminder and give it only one fact: the renewal date. Underline every number and date in the draft and count how many you did not provide.",
      },
      check: {
        question: "A draft says \"renewing before 15 October keeps your pricing\". You never mentioned 15 October. What do you do?",
        options: [
          "Leave it; it sounds right",
          "Take it out, or replace it with the real date from the contract",
          "Ask Claude if it is sure",
          "Start a new chat",
        ],
        answer: 1,
        explanation: "You did not give it that date, so it came from nowhere. Confident wording is not a source; the contract is.",
      },
      competencies: ["L1.discernment", "L1.diligence"],
    },
    {
      slug: "l1-two-line-fix",
      rung: 1,
      title: "Fix the draft with a two-line follow-up",
      promise: "You will turn a nearly-right draft into a finished one with one short message.",
      minutes: 3,
      scene: "prompt-anatomy",
      body: `The first draft is rarely the last, and a new chat throws away everything Claude already knows about the job. One follow-up message fixes it, if you say exactly what to change.

First draft of a customer follow-up:

"I hope this email finds you well. I wanted to reach out following our productive conversation earlier today, during which we discussed a number of important topics relating to your upcoming renewal..."

The weak follow-up: "Make it better." Claude changes things at random.

The follow-up that works:

"Cut the opener and get to the point in the first sentence. Half the length, and say plainly that the revised quote comes Friday."

Point at the part, say what is wrong, say what right looks like. Three moves cover most cases: shorter ("same content, half the length"), different reader ("rewrite this for a customer annoyed about the delay"), missing piece ("add one line on what happens if they miss the date").

Two or three rounds is normal. On round five, stop: the first message probably left out who it is for or what done looks like. Fix that instead of sending a sixth patch.`,
      keyPoints: [
        "Point at the part, say what is wrong, say what right looks like.",
        "Three moves cover most drafts: shorter, different reader, missing piece.",
        "Round five means the first message was the problem; rewrite it instead of patching again.",
      ],
      example: {
        title: "Try this",
        text: "Take any draft Claude gave you and reply with exactly two lines: what to cut, and what to add.",
      },
      check: {
        question: "The draft is too long and misses the Friday deadline. Which follow-up works?",
        options: [
          "Make it better",
          "Try again",
          "Half the length, and add that the revised quote comes Friday",
          "Start a new chat with the same prompt",
        ],
        answer: 2,
        explanation: "It names what to cut and what to add. \"Make it better\" leaves Claude guessing what you disliked.",
      },
      competencies: ["L1.description", "L1.delegation"],
    },
  ],
}
