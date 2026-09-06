import type { Module } from "./types"

export const MODULE_L5: Module = {
  rung: 5,
  code: "L5",
  name: "Champion",
  tagline: "Grade others fairly, give feedback that teaches, and keep the team's queue and backlog moving.",
  outcomes: [
    "Grade a teammate's skill against the rubric and land close to the grader's score and decision.",
    "Give feedback that is specific, actionable and teaches the principle, with hints before answers.",
    "Run the promotion queue on time, spot a stalled teammate early, and own the team backlog.",
  ],
  practice:
    "Practice: you'll grade two real skills from your team, write feedback for each, and clear the queue once a week for a month.",
  lessons: [
    {
      slug: "l5-grading-with-rubric",
      rung: 5,
      title: "Grading someone else's skill with the rubric",
      promise: "You will grade a skill against the seven rubric parts and see how close you land to the grader.",
      minutes: 4,
      scene: "review-others",
      body: `As a champion, you grade other people's skills against the same rubric the grader uses. The aim is agreement: your score and the grader's should land close, and your pass or revise decision should match.

The rubric has seven parts, and you already know them from L3. Trigger clarity. Scope. Progressive disclosure. Boundary declaration. Canonical examples over edge-case lists. Tight context. Behaviour on the author's own sample cases.

Grade the skill, not the author. Read the description first and ask what it would catch and miss. Then the front page: could anything be cut. Then the boundary: do the steps honour it. Then run the sample cases in your head and check the expected behaviour is what you would want.

Score each part before you look at the grader's score. If you look first, you will anchor and learn nothing. Where you disagree by more than a little, work out why. Usually one of you saw something the other did not, and the conversation is worth having.

Be consistent across authors. The same skill from a nervous first-timer and from a confident veteran gets the same score. Consistency is what makes the library trustworthy, and it is what the L5 gate measures.

Aim to be strict and kind at once: strict on the rubric, kind in the feedback.`,
      keyPoints: [
        "Seven parts: trigger, scope, disclosure, boundary, examples, tight context, sample-case behaviour.",
        "Score before you look at the grader's score, then work out any big disagreement.",
        "Same skill, same score, whoever wrote it.",
      ],
      example: {
        title: "Grading a proposal-narrative skill",
        text: "Trigger: strong, names three real requests. Scope: one job. Disclosure: template correctly in a separate file. Boundary: declares pricing data as must-never-receive, but step four asks for the price list; fail on consistency. Examples: two good ones. Decision: revise, one finding.",
      },
      check: {
        question: "Why should you score a skill before looking at the grader's score?",
        options: [
          "To finish faster",
          "So you do not anchor on the grader and can find out where your judgement differs",
          "Because the grader is usually wrong",
          "It does not matter which comes first",
        ],
        answer: 1,
        explanation: "An independent score is the only way to measure agreement and learn from the places you disagree.",
      },
      competencies: ["L5.grading"],
    },
    {
      slug: "l5-feedback-that-teaches",
      rung: 5,
      title: "Giving feedback that teaches",
      promise: "You will write feedback that is specific, actionable and explains the principle, with a hint before the answer.",
      minutes: 4,
      scene: "review-others",
      body: `Good feedback leaves the author able to fix this skill and write a better one next time. Bad feedback fixes this skill and teaches nothing.

Three qualities matter.

**Specific.** Point at the line. "The description says helps with customer emails, so it will fire for complaints and proposals too" beats "trigger is vague".

**Actionable.** Say what would fix it, or what question to ask. "Name the two or three requests this should catch, in the words the team uses."

**Teaches the principle.** One sentence on why. "Claude chooses between dozens of skills from the description alone, so it has to rule out neighbours, not just describe the job." Now the author can write the next trigger line without you.

Give hints before answers. If a boundary list is incomplete, ask "what does step three read?" before you say "you have not declared the CRM export". The author who finds the gap remembers it. The author who is told the gap forgets by Thursday.

Lead with what is right. Not as a courtesy; because the author needs to know what to keep.

Keep it short. Three findings that matter beat twelve that do not. If a skill has twelve problems, the biggest is scope, so say that one.`,
      keyPoints: [
        "Specific, actionable, and one sentence on the principle behind it.",
        "Hints before answers: ask the question that leads the author to the gap.",
        "Three findings that matter, starting with what to keep.",
      ],
      example: {
        title: "Feedback on a meeting-prep skill",
        text: "\"The two examples are excellent; keep them. One thing: the description would also catch first calls with prospects. Which requests should it catch, and which nearby ones should it not? Claude picks from the description alone, so it needs to rule neighbours out.\"",
      },
      check: {
        question: "A teammate's boundary declaration is missing the CRM export that step three reads. What is the best first line of feedback?",
        options: [
          "\"Boundary incomplete.\"",
          "\"You forgot the CRM export; add it.\"",
          "\"What does step three read, and is it in your may-read list?\"",
          "\"Revise and resubmit.\"",
        ],
        answer: 2,
        explanation: "A hint that leads the author to find the gap teaches more than naming it, and is still specific and actionable.",
      },
      competencies: ["L5.feedback"],
    },
    {
      slug: "l5-running-the-queue",
      rung: 5,
      title: "Running the review and promotion queue",
      promise: "You will clear the queue on a rhythm, choose approve, revise or escalate, and watch the library's health.",
      minutes: 4,
      scene: "promotion-queue",
      body: `The promotion queue is where the team's work waits for you. Run it well and skills ship within days. Run it badly and people stop writing them.

Set a rhythm. Look at the queue at a fixed time, at least twice a week. Each request has a package on one screen: skill, grade, boundary check, sample cases. Most take ten minutes to review. Aim to return every request within the team's agreed time, usually a few working days. A request that sits for two weeks tells the author their effort did not matter.

Three outcomes. **Approve** when the rubric is met and the boundary is clean. **Revise** with feedback that teaches, and say what will make it pass. **Escalate** when it is not your call: a skill that touches a restricted class needs compliance; a skill that overlaps with another team's needs both champions; anything you are unsure about goes to your activation lead.

Watch the library, not just the queue. Skills that nobody has used for a month, grades that dropped after a model change, a boundary that is missing a newly restricted class, two skills with overlapping triggers. Each is a short conversation with an owner.

Your job is stewardship. The queue should be a place work flows through, not where it goes to wait.`,
      keyPoints: [
        "Fixed rhythm, at least twice a week; return every request within the agreed time.",
        "Approve, revise with teaching feedback, or escalate to compliance, another champion, or your activation lead.",
        "Watch library health too: unused skills, dropped grades, stale boundaries, overlapping triggers.",
      ],
      example: {
        title: "A Tuesday queue",
        text: "Three requests. The renewal reminder skill: clean, approved. A report-outline skill: trigger overlaps with the proposal team's outline skill; message both authors, escalate to the other champion. A skill reading customer payment details: restricted class, route to compliance with a note on why it is needed.",
      },
      check: {
        question: "A submitted skill reads a restricted data class. What do you do?",
        options: [
          "Approve it if the skill is otherwise good",
          "Reject it outright",
          "Escalate to compliance for their review alongside yours",
          "Ask the author to remove the declaration",
        ],
        answer: 2,
        explanation: "Restricted classes are not the champion's call alone; compliance reviews too, and the declaration must stay honest.",
      },
      competencies: ["L5.stewardship"],
    },
    {
      slug: "l5-stalled-teammate",
      rung: 5,
      title: "Spotting a stalled teammate and what to do",
      promise: "You will notice a stall early, start with the work rather than the person, and know when to escalate.",
      minutes: 4,
      scene: "review-others",
      body: `Not everyone moves up the ladder at the same pace, and that is fine. A stall is different: someone has stopped producing anything at their rung, or keeps missing the same competency, and nothing on the ladder is changing. Champions see this before anyone else.

The signs are on your Team page. No submission in two or three weeks at the current rung. The same rubric item scored low three times running. Revisits skipped. A first attempt at L3 abandoned mid-way.

Do not start with "why haven't you". Start with the work. "What is the thing on your calendar this week that annoys you most?" Almost always, the stall is not about Claude. The person is busy, the exercise did not match their real work, or they hit the boundary and did not know how to describe a task without customer details.

Each has a fix. Busy: shrink the exercise to twenty minutes on something already due. Poor match: ask Coach for a new exercise and tell it what the person actually does. Boundary confusion: sit with them for one prompt and show describing the situation instead of the person.

If two conversations change nothing, escalate to your activation lead. That is not giving up on the teammate. It is getting them help you cannot give alone.`,
      keyPoints: [
        "A stall is no artifact for weeks or the same competency missed repeatedly, not just a slow pace.",
        "Start with the work on their calendar, not with why they have not done the exercise.",
        "Shrink it, re-match it, or sit with them for one prompt; escalate after two conversations that change nothing.",
      ],
      example: {
        title: "A teammate stuck at L1",
        text: "Three weeks, no submission. The champion asks what is eating her week: the monthly report. They turn that into the exercise, anonymised, and do the first prompt together at her desk. Submission that afternoon; the stall was a mismatch, not a lack of interest.",
      },
      check: {
        question: "A teammate has submitted nothing for three weeks. What is the best opening?",
        options: [
          "\"Why haven't you done your exercises?\"",
          "\"What is the most annoying thing on your calendar this week?\"",
          "\"You are behind the rest of the team.\"",
          "Say nothing and wait another month",
        ],
        answer: 1,
        explanation: "Starting with real work usually reveals the actual cause, which is rarely about Claude, and gives you the next exercise.",
      },
      competencies: ["L5.stewardship", "L5.feedback"],
    },
    {
      slug: "l5-own-the-backlog",
      rung: 5,
      title: "Owning the team backlog",
      promise: "You will keep the ranked list of workflows honest against reality and feed it with what you hear from the team.",
      minutes: 4,
      scene: "workflow-map",
      body: `The backlog is the list of workflows your team could hand to Claude next, ranked. As champion, you own it. Nobody else has both the view of the team's real work and the standing to say what matters.

The Scorer ranks candidates by hours, value, how ready they are to automate, and compliance exposure. Your job is to check its work against reality. The Scorer cannot know that the quarterly report process is about to change, or that the proposal workflow is one person's job and she is leaving in March.

Once a month, open the backlog with your team's workflow maps beside it. Ask three questions of the top five. Is this still how the work goes? Is the baseline still right? Is the person named as owner still the right person? Move things up or down and write one line on why.

Prefer boring, frequent workflows over impressive rare ones. Weekly meeting prep saves more hours than an elegant one-off. Prefer low exposure while the team is learning; save the ones that touch restricted classes for when your reviewers are practised.

Feed the backlog with what you hear. Every "I spend all Friday on" in a team meeting is a candidate.

A backlog nobody owns fills with wishes. Yours should be a plan.`,
      keyPoints: [
        "Check the Scorer's ranking against what you know is changing in the team.",
        "Monthly: is this still how the work goes, is the baseline right, is the owner right? Write one line on why.",
        "Boring and frequent beats impressive and rare; low exposure first while the team learns.",
      ],
      example: {
        title: "A monthly backlog pass",
        text: "Top of the list: quarterly reports, high hours. The champion knows the template changes next quarter, so it drops two places. Weekly meeting prep moves up: weekly, low exposure, three people already asking. A new entry from Friday's meeting: the monthly renewal-reminder run, added with a rough baseline.",
      },
      check: {
        question: "Two candidates: a weekly low-exposure meeting-prep workflow and a rare, impressive one that reads customer payment details. Which goes first while the team is still learning?",
        options: [
          "The impressive one; bigger win",
          "The weekly low-exposure one",
          "Both at once",
          "Neither; wait for the Scorer",
        ],
        answer: 1,
        explanation: "Frequent, low-exposure work returns more hours and lets reviewers practise before anything touches restricted classes.",
      },
      competencies: ["L5.stewardship"],
    },
  ],
}
