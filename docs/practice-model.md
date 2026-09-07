# Practice model (v2) and what makes a good lesson

This replaces the "expectation → run → critique" exercise design. It is the source of truth for the learner experience.

## Practice: one instruction, one thing to do, the output, feedback

Every practice item is framed on one of the learner's own workflows (from the interview and the person memory). It has exactly four parts on one screen:

1. **The ask**, one sentence. "For your customer-call prep, write the prompt you'd give Claude."
2. **One input area** that matches the rung (below).
3. **The output**, produced by us when they press Run: the learner sees what Claude actually made.
4. **Feedback**: three short lines from Coach (what worked, what to change, one thing to try), a score out of 10, and a "Try again" button that keeps their draft. Passing is decided from the score.

Run and feedback are **one press** (changed 2026-09-07): the learner presses Run, Claude's output appears, and Coach's feedback lands under it without a second step. Every Run is therefore an attempt. Only review practice (L5), which has nothing to run, keeps a Submit button. Run never stops at a clarifying question: when the prompt promised material that never arrived, Claude still produces the deliverable with [slots] and ends with "To finish this I still need …", and Coach's feedback says what to paste before the next run. **The prompt box is never pre-written** (2026-09-07): a starter prompt gives the answer away, so the box starts empty and the three nudges carry the guidance. The prompt practice looks like Claude's own message box: an empty composer, a **+** menu listing the person's own tools as connectors (switched on by default), the sample material attached like a file rather than pasted into the box, the model label, and the send arrow as Run. The run stands in for the connectors: "pull my last call from Granola" returns plainly fictional sample records marked as standing in for Granola, never "I don't have Granola"; a tool that is switched off gets one sentence on how to connect it. Claude's reply is shown as a conversation: your message, then Claude's.

Nothing else. No prediction note, no self-check list, no confidence slider, no worked-example gating, no "do it in Claude and paste it back". The words expectation, critique, calibration, competency, rung, mastery, scribe never appear.

| Module | The ask | Input | What Run does |
|---|---|---|---|
| L0 Orientation | "Try one real thing: write what you'd ask Claude for *workflow*." | prompt textarea, starter text pre-filled from their workflow | runs the prompt, shows the output |
| L1 Conversational | "For *workflow*, write the prompt." (variants: "Make this draft shorter for a customer", "Give Claude the three facts it needs") | prompt textarea + optional paste of the material | runs it, shows the output |
| L2 Context | "Set up a Project for *workflow*." | a Claude Project page: name, Instructions (edit in place), Files (upload text files or paste, up to 4), Connected tools (the person's connectors), and the chat box holding the test message (send = Run) | answers the test message inside the Project, connectors simulated, shown as a conversation |
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

### The picture at the top (added 2026-09-07)

Every lesson opens with one static diagram, drawn in the LightCI presentation style (SVG, mono small-caps labels with a quieter sub-line, tinted nodes, thin connectors, a serif word where the picture has a centre). No motion: the earlier animated scenes were removed because they distracted more than they taught. The lesson's `scene` picks the drawing from `frontend/components/learner/diagrams`, and each drawing carries a one-sentence caption that passes the layman test. Rules: one idea per picture; every label is a phrase a colleague would say; numbers appear only as concrete examples ("about 3 hours a week"), never as data; the drawing must read on paper and in dark mode (theme tokens only); narrow screens scroll the picture sideways rather than shrinking the type below legibility.

### Where to click (added 2026-09-07)

Lessons that touch Claude's own screen carry an optional `mock` (`frontend/components/learner/mocks`): a static sketch of that screen (fresh chat, the plus menu, the plus menu's Connectors list, Settings › Connectors for connecting your own account, a conversation with a follow-up, a Project page, the instructions editor, a skill picked up from a plain request) with numbered spots and a plain-words legend. Each sketch closes with "yours may look a little different, but the buttons keep their names", because Claude's interface moves faster than our lessons. L4 and L5 lessons live in Activate's own screens and carry no mock.

## Data stance (corrected 2026-09-07)

Claude Enterprise is a governed workspace. Pasting documents, uploading files and using connectors (Salesforce, Gong, Google Drive, Confluence, and any MCP server the firm has approved) is encouraged and is how Claude does real work. The only line is the firm's own policy, which Activate holds as the org boundary: the named forbidden data classes (typically personal identifiers, health data, payment card data, account numbers, anything regulated) and secrets. Lessons and Coach must teach the policy, not fear: "your firm allows X, keeps out Y; here is how to check" rather than "describe the situation, not the person" as a blanket rule. "Describe the situation" is a useful habit only for the specific classes the policy forbids. Reminders shown to the learner come from the org boundary, never from a hard-coded list.

## Connectors are part of the curriculum

Connectors let Claude read (and, when allowed, write to) the tools people already use. They appear in every module: L0 explains what a connector is and how to see which ones the firm has turned on; L1 teaches asking Claude to pull from a connector instead of pasting; L2 teaches a Project that uses connected sources; L3 teaches a skill that calls a connector; L4 maps which steps read from which system and which steps a person keeps; L5 covers reviewing skills that touch systems of record. Practice prefills may say "pull this from Salesforce if you have the connector; otherwise paste the summary".

## Connector facts the lessons rely on (checked 2026-09-07 against the Claude Help Center)

- On Team and Enterprise plans an Owner/admin enables a connector for the organisation (Organization settings › Connectors › Browse connectors › Add). Enabling makes it available; it does not connect anyone.
- Each person then connects their own account once: Settings › Connectors › Connect, then sign in to that tool. Access is per-user delegated OAuth, so Claude sees only what that person could open.
- In a chat, connectors live under the **+** button beside the message box (Connectors submenu), each with an on/off switch for that conversation; "Manage connectors" leads back to Settings.
- Sources: support.claude.com articles 11176164 ("Use connectors to extend Claude's capabilities") and 14503689 ("MCP connectors").

## Tools the learner names become connectors (2026-09-07)

The practice composer offers the person's own tools as connectors. That list is computed live from three places: the intake profile and workflow maps, and the `systems` list on the person's Coach memory. When a practice is graded, the Grader returns `toolsNamed` (tools the learner named in their work) and the controller folds those, plus any switched-on connector they actually named, straight into the memory's `systems` (no version bump) and into the graded event's note. So a learner who writes "pull this from Notion" once sees Notion offered as a connector on their next exercise, and the memory synthesis keeps it.

## No placeholders, anywhere (2026-09-07)

Nothing the learner sees carries a bracketed placeholder. Pre-fills: the prompt box, Project instructions and Project files start empty (the only pre-filled text is the Project's test message, a concrete note about a plainly made-up account, and the attached sample material). Runs: Claude never leaves "[client name]" or "[figure]"; where a specific is missing it writes the piece with a plainly made-up stand-in and ends with one line, "Stand-ins: …", so the learner always sees a finished piece that reads like the real thing. Grader: labelled stand-ins are not invention; unlabelled made-up facts are. For a Project, the grader judges the whole thing (name, instructions, each file, connectors switched on) with the test reply as evidence.
