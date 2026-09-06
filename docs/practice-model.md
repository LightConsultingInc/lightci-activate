# Practice model (v2) and what makes a good lesson

This replaces the "expectation → run → critique" exercise design. It is the source of truth for the learner experience.

## Practice: one instruction, one thing to do, the output, feedback

Every practice item is framed on one of the learner's own workflows (from the interview and the person memory). It has exactly four parts on one screen:

1. **The ask**, one sentence. "For your customer-call prep, write the prompt you'd give Claude."
2. **One input area** that matches the rung (below).
3. **The output**, produced by us when they press Run: the learner sees what Claude actually made.
4. **Feedback**: three short lines from Coach (what worked, what to change, one thing to try), a score out of 10, and a "Try again" button that keeps their draft. Passing is decided from the score.

Nothing else. No prediction note, no self-check list, no confidence slider, no worked-example gating, no "do it in Claude and paste it back". The words expectation, critique, calibration, competency, rung, mastery, scribe never appear.

| Module | The ask | Input | What Run does |
|---|---|---|---|
| L0 Orientation | "Try one real thing: write what you'd ask Claude for *workflow*." | prompt textarea, starter text pre-filled from their workflow | runs the prompt, shows the output |
| L1 Conversational | "For *workflow*, write the prompt." (variants: "Make this draft shorter for a customer", "Give Claude the three facts it needs") | prompt textarea + optional paste of the material | runs it, shows the output |
| L2 Context | "Set up a Project for *workflow*." | instructions textarea + 1–2 pasted files + the test task (pre-filled) | runs the test task with the Project context, shows the output |
| L3 Skill | "Write the skill for *workflow*." | SKILL.md editor pre-filled with a template + 3 sample requests (pre-filled, editable) | runs each sample request with the skill in context, shows fired/not-fired and the outputs |
| L4 Workflow | "Map *workflow*." | the workflow form (inputs, steps, decisions, exceptions, systems, outputs, review points) | drafts the skill from the map, shows it |
| L5 Champion | "Review this." | a teammate's artifact shown read-only + a score and a short feedback box | compares the learner's score and notes with the grader's |

Grading uses the same rubric machinery underneath, but the learner only ever sees the three lines, the score and pass/try again. Mastery per competency comes from scores across distinct workflows plus recaps; the judgement component is retired (weights: artifact 0.6, consistency 0.2, retention 0.2).

## What makes a good lesson

A good lesson:
- teaches **one idea** and says in the first sentence why it matters to someone doing ordinary office work;
- **shows the idea** with a concrete before/after in plain text (a weak prompt and the better one; a bloated Project and the trimmed one) using a situation any office worker recognises (a customer meeting, a follow-up email, a recurring report, a proposal);
- asks the reader to **do one very simple thing** or **try one very simple sequence** ("paste your last email and ask for a shorter version", "add one line saying who will read it");
- has a **check** that tests the idea itself and is answerable from the lesson alone;
- is readable in **under three minutes**, with short paragraphs and no theory words;
- never references the product's internal concepts (rungs, competencies, mastery, calibration, scribe, grader) or another firm's systems.

A bad lesson:
- explains a framework or lists principles without showing them;
- uses jargon it does not demonstrate ("progressive disclosure", "canonical examples", "context engineering");
- asks a check question that needs knowledge from outside the lesson or from someone else's job;
- covers two or more ideas, or runs long;
- tells the reader to go do something in another tool and come back;
- talks about the reader's judgement, predictions, or how they will be measured.
