import type { Module } from "./types"

export const MODULE_L4: Module = {
  rung: 4,
  code: "L4",
  name: "Workflow",
  tagline: "Map a whole workflow, decide where Claude fits and which systems it reads, measure before and after, and ship it through review.",
  outcomes: [
    "Write down a real workflow: inputs, steps, decisions, exceptions, systems, outputs and where a person reviews.",
    "Say which steps go to Claude, which systems they read, and which write steps stay with a person.",
    "Measure the workflow before you change it and report hours back honestly, including rework.",
  ],
  practice:
    "Practice: you'll map one workflow you own in the workflow form, see the skill it drafts, and get three lines of feedback.",
  lessons: [
    {
      slug: "l4-map-a-workflow",
      rung: 4,
      title: "Mapping a workflow",
      promise: "You will write down how a workflow really goes, including the decisions and exceptions the manual leaves out.",
      minutes: 4,
      scene: "workflow-map",
      body: `Before Claude can help with a whole workflow, someone has to write down how the workflow actually goes. Not the tidy version in the procedures manual. The real one.

A workflow map has seven parts. **Inputs**: what arrives and from where. **Steps**: what happens, in order. **Decisions**: where a person chooses between paths, and on what basis. **Exceptions**: what goes wrong often enough to matter. **Systems**: what gets read or written in your CRM, your reporting tool, your shared drive. **Outputs**: what leaves and to whom. **Human review**: where someone must look before the work moves on.

The decisions and exceptions are where the value hides. "Check the proposal" sounds like one step until you ask what you are checking for and what you do when it fails. A new hire would ask that question. Claude cannot, so the map has to answer it.

Activate walks you through this with questions, but the judgement is yours. When it plays the map back, read it as if you were handing the job to a colleague tomorrow. Anything you would add in the handover conversation belongs in the map.

Your champion verifies the map before it goes further. That is not bureaucracy. A map with one missing exception becomes a skill that fails quietly on exactly that case.`,
      keyPoints: [
        "Seven parts: inputs, steps, decisions, exceptions, systems, outputs, human review.",
        "Decisions and exceptions are where the value hides; write down what you check for and what you do when it fails.",
        "Read the map back as a handover to a colleague; your champion verifies it before it moves on.",
      ],
      example: {
        title: "Try this",
        text: "For one workflow you own, write down the last time it went wrong and why. That is your first exception. Add it to the map before anything else.",
      },
      check: {
        question: "Which part of a workflow map most often gets left out, and matters most?",
        options: [
          "The name of the workflow",
          "The decisions and exceptions",
          "The list of systems",
          "The outputs",
        ],
        answer: 1,
        explanation: "Steps are easy to list; the decisions and exceptions are what a new hire would ask about and what a skill fails on if missing.",
      },
      competencies: ["L4.schema"],
    },
    {
      slug: "l4-where-claude-fits",
      rung: 4,
      title: "Where Claude fits and where a person must stay",
      promise: "You will colour a workflow map into steps for Claude and steps that stay with a person, and be honest about exposure.",
      minutes: 4,
      scene: "workflow-map",
      body: `With the map in front of you, colour it. Some steps go to Claude. Some stay with a person. Getting this split right is the whole point of this module.

**Claude fits** steps that are repetitive, text-heavy and checkable: assembling the agenda from notes, drafting the first version of a proposal narrative, summarising the CRM history, formatting the report to the house template.

**A person stays** where any of these is true. The step needs one of your firm's forbidden data classes, such as payment card data or account numbers. The step is a judgement about a customer's situation or money. The step writes to a system of record. The step is a review point in the firm's policy. Or the output goes directly to a customer without anyone reading it.

Be honest about exposure. If a step touches a forbidden class even briefly, say so, and route it to a person. The review will find it anyway, and a candid map is approved faster than a hopeful one.

The pattern that works in most firms: Claude drafts, a person decides, Claude formats, a person sends. Each handoff is a review point and each is written into the map.

Do not aim to automate the workflow. Aim to remove the parts that were never really your job.`,
      keyPoints: [
        "Claude fits steps that are repetitive, text-heavy and checkable.",
        "A person stays wherever there is a forbidden data class, a judgement about a customer, a system write, or a policy review point.",
        "Be honest about exposure; a candid map gets approved faster than a hopeful one.",
      ],
      example: {
        title: "Try this",
        text: "Print or list the steps of one workflow. Mark each C (Claude) or P (person) using the rules above. Count the Ps; each is a review point to write into the map.",
      },
      check: {
        question: "A step writes the meeting summary into your CRM as a record. Who does it?",
        options: [
          "Claude, since it wrote the summary",
          "A person, because it is a write to a system of record",
          "Whoever is faster",
          "Nobody; skip the step",
        ],
        answer: 1,
        explanation: "Writes to systems of record are review points that stay with a person, even when Claude drafted the text.",
      },
      competencies: ["L4.schema", "L4.governance"],
    },
    {
      slug: "l4-systems-column",
      rung: 4,
      title: "Which steps read which system",
      promise: "You will fill in the system column of a map, mark reads and writes, and keep the writes with a person.",
      minutes: 4,
      scene: "workflow-map",
      body: `Your workflow map has a column for systems. Fill it in step by step: for each step, which tool is read, and which tool is written to.

Reads are where connectors help. If step two is "look up the account history", the system column says "Salesforce (read)" and the step can be Claude's. If step three is "check the last two calls", that is "Gong (read)". Reading is low risk: Claude sees only what you could see, and nothing changes.

Writes are different. "Update the opportunity stage", "log the meeting note", "send the proposal" all change a system of record. Mark each one "(write)" and keep it with a person, unless your firm's policy names it as allowed and says who reviews.

The map then shows something useful at a glance: a run of read steps that Claude can do, and a small number of write steps where a person confirms. If most of the steps are writes, the workflow is not a good first candidate.

Two questions for each write step. Does a person look at the change before it is saved? And can it be undone? If the answer to either is no, that step stays human for now.

Your champion checks the system column when they verify the map, so fill it honestly rather than optimistically.`,
      keyPoints: [
        "For each step, name the system and mark it read or write.",
        "Reads can be Claude's through a connector; writes stay with a person unless the firm's policy says otherwise.",
        "For every write, ask: does a person see it before it saves, and can it be undone?",
      ],
      example: {
        title: "Try this",
        text: "Add a system column to one of your workflow maps. Next to each step, write the tool name and (read) or (write). Circle every (write).",
      },
      check: {
        question: "Step four of a workflow is \"update the deal stage in Salesforce\". How should the map mark it?",
        options: [
          "Salesforce (read), Claude does it",
          "Salesforce (write), kept with a person unless the firm's policy allows it",
          "No system; it is just a click",
          "Gong (read)",
        ],
        answer: 1,
        explanation: "Changing a record is a write to a system of record; it stays with a person unless the policy names it as allowed and says who reviews.",
      },
      competencies: ["L4.schema", "L4.governance"],
    },
    {
      slug: "l4-baselines",
      rung: 4,
      title: "Baselines: measure before you change anything",
      promise: "You will time a workflow as it runs today, including rework, and get a second person to sign the number.",
      minutes: 4,
      scene: "baseline-measure",
      body: `Before you change anything, measure how long the workflow takes today. This is the step people most want to skip, and the one that makes every later claim believable.

A baseline is simple. For the next few runs of the workflow, note how long each took, end to end, including the rework: the second pass on the deck, the corrections after review, the twenty minutes hunting for last quarter's version. Rework is part of the true cost, and it is often the part Claude removes.

Pick a method that fits the work. For a weekly task, time three or four real runs. For a monthly one, reconstruct the last two from your calendar and be honest about the estimate. Write down how you measured so someone can repeat it later.

Then have your champion or the workflow owner sign the number. Not because anyone doubts you. Because in six months, when the readout says "four hours back per week", the first question will be "compared to what", and the answer has to be something two people agreed before the change.

Capture the baseline before the skill ships. After is too late; memory shrinks the old number.

A baseline nobody wrote down is a story. A baseline two people signed is a measurement.`,
      keyPoints: [
        "Time real runs end to end, and include the rework.",
        "Write down how you measured so someone else can repeat it.",
        "Capture it before anything ships and have a champion or the owner sign it.",
      ],
      example: {
        title: "Try this",
        text: "Next time you run the workflow, start a timer when you open the first tool and stop it when the output is sent. Write the number and the date in the map.",
      },
      check: {
        question: "Why does the baseline have to be captured before the skill ships?",
        options: [
          "Because the software requires it",
          "Because memory shrinks the old number once the new way is in place",
          "Because the skill changes the workflow name",
          "It does not; after is fine",
        ],
        answer: 1,
        explanation: "Once the faster way exists, people underestimate how long the old way took; a number agreed beforehand is the only trustworthy one.",
      },
      competencies: ["L4.baseline"],
    },
    {
      slug: "l4-promotion-queue",
      rung: 4,
      title: "Getting a skill through the promotion queue",
      promise: "You will know what the queue checks and arrive with a package that passes first time.",
      minutes: 4,
      scene: "promotion-queue",
      body: `A skill that only you use is a draft. A skill the team uses has been through the promotion queue. Here is what the queue checks, so you can arrive ready.

The path is draft, review, approved, published. You move from draft to review by requesting promotion. The request bundles four things: the skill itself, its score from the automatic review, the boundary check, and your sample cases. If any is missing, the request waits.

A reviewer, usually your team's champion, reads the package on one screen. They are asking: does the trigger fire at the right moments, is the scope one job, does the boundary declaration match the firm's list, do the steps honour it, and do the sample cases behave as described. If the skill touches a forbidden data class or writes to a system of record, compliance reviews too.

Approval is a signature. Then the skill is published to the library and assigned to the team's group in Claude. Every later change goes through the same path and gets a new version, so anyone can see what changed and roll back if needed.

To move through quickly: write the boundary declaration first, not last. Keep the scope narrow. Make the sample cases real. Most skills that stall in review stall on the boundary, not the prose.`,
      keyPoints: [
        "Draft, review, approved, published. The request bundles the skill, its score, the boundary check and the sample cases.",
        "The reviewer checks trigger, scope, boundary, steps and cases on one screen; compliance joins for forbidden classes or system writes.",
        "Write the boundary declaration first; that is where most skills stall.",
      ],
      example: {
        title: "Try this",
        text: "Open your draft skill and check the four parts are there: main file, score, boundary declaration, three sample cases. Fill in whichever is missing before you request promotion.",
      },
      check: {
        question: "Your promotion request has the skill and its score but no sample cases. What happens?",
        options: [
          "It is approved anyway",
          "It waits until the sample cases are added",
          "The champion writes the cases for you",
          "It is published without review",
        ],
        answer: 1,
        explanation: "The package needs all four parts; without cases the reviewer cannot judge the trigger and scope.",
      },
      competencies: ["L4.governance"],
    },
    {
      slug: "l4-hours-back",
      rung: 4,
      title: "Measuring hours back honestly",
      promise: "You will measure the new workflow the same way as the baseline and report the saving net of checking and rework.",
      minutes: 4,
      scene: "baseline-measure",
      body: `After the skill ships, you measure again. The number that matters is hours back, net of rework. Not hours the first draft saved, but hours saved after you did the checking and fixing that the draft still needed.

Measure the same way you measured the baseline. Same runs, same start and end points, same person timing. Include the time to read the output, verify the facts, and fix what was wrong. Include any time spent redoing something because the skill got it subtly wrong and nobody noticed until later. That last kind is the most expensive and the easiest to leave out.

If the honest number is small, say so. A skill that saves forty minutes a week on a task nobody enjoys is a good skill. A skill that claims four hours and delivers one poisons every number that comes after it.

Write a measurement plan into the promotion package: what you will time, how often, and when you will report. Three months is a reasonable first checkpoint.

Hours back is the number sponsors see and the number the programme's readouts are built on. Sponsors trust the programme exactly as much as they trust this number. Measure it as if a sceptic will read it, because one will.`,
      keyPoints: [
        "Measure the same way as the baseline: same runs, same start and end, same person.",
        "Net of rework means including reading, verifying, fixing, and anything redone later.",
        "A small honest number is worth more than a large hopeful one.",
      ],
      example: {
        title: "Try this",
        text: "On your next run with the skill, time three things separately: running it, checking it, fixing it. Add them up and subtract from your baseline. That is the number to report.",
      },
      check: {
        question: "The skill's first draft takes 20 minutes instead of 90, but checking and fixing takes another 40. What do you report?",
        options: [
          "70 minutes back",
          "30 minutes back",
          "90 minutes back",
          "Nothing until it improves",
        ],
        answer: 1,
        explanation: "Hours back is net of checking and rework: 90 minus 60 is 30, and that is the honest number.",
      },
      competencies: ["L4.baseline", "L4.governance"],
    },
  ],
}
