/**
 * Lesson content model. Lessons are static, versioned content shipped with the app; exercises
 * (practice) and grades (feedback) stay dynamic and come from the API.
 */

export type Rung = 0 | 1 | 2 | 3 | 4 | 5

/** The static diagram drawn at the top of a lesson (components/learner/diagrams). Lessons pick one. */
export type SceneKind =
  | "surfaces"         // Claude surfaces as tiles: Chat, Projects, Claude Code, Cowork; highlights which fits a task
  | "connectors"       // Claude reading the firm's tools through connectors, behind the person's own permissions
  | "first-task"       // the first exercise: pick one real task, ask Claude, check it
  | "policy-boundary"  // documents flowing toward Claude; some pass, restricted classes bounce off a boundary line
  | "four-d"           // Delegation → Description → Discernment → Diligence as a loop
  | "prompt-anatomy"   // a prompt assembling from role, task, inputs, format, constraints
  | "check-output"     // an output with claims lighting up as verified / unverified
  | "predict-then-see" // you write a guess, then the result appears next to it and they get compared
  | "project-context"  // files and instructions moving into a Project; some kept out
  | "include-exclude"  // a pile of context being pruned to the essential set
  | "skill-trigger"    // a request arriving, matching (or not) a skill's trigger line
  | "progressive-disclosure" // a SKILL.md unfolding: short top, references opened only when needed
  | "canonical-examples"     // two strong examples versus a long list of edge cases
  | "boundary-declaration"   // may-read / must-never-receive / human-review lists locking into place
  | "workflow-map"           // steps, decisions and exceptions being laid out as a map
  | "baseline-measure"       // a before bar and an after bar, hours back appearing between them
  | "promotion-queue"        // a skill moving draft → review → approved → published
  | "review-others"          // two rubrics side by side converging (grader agreement)

/** A sketch of Claude's own screen showing where to click (components/learner/mocks). Optional per lesson. */
export type MockKind =
  | "new-chat"             // the rail (Chats, Projects, Code, Cowork), the box, plus, tools, send
  | "attach-menu"          // the plus menu open: upload, Drive, screenshot; paste works too
  | "tools-menu"           // the plus menu with Connectors open: the firm's connectors, on or off for this chat
  | "connect-connector"    // Settings › Connectors: connect your own account to a connector the firm turned on
  | "conversation"         // your request, Claude's draft, the actions under it, the follow-up box
  | "project-page"         // a Project: instructions, files, connected folder, start a chat inside
  | "project-instructions" // editing a Project's instructions
  | "skill-in-use"         // a plain request picking up a skill: the step shown, what it read, the result

export interface LessonCheck {
  question: string
  options: string[]
  /** index into options */
  answer: number
  explanation: string
}

export interface Lesson {
  slug: string
  rung: Rung
  title: string
  /** One sentence, plain language: what you will be able to do after this. */
  promise: string
  minutes: number
  scene: SceneKind
  /** Optional "where to click" screen, shown after the body. */
  mock?: MockKind
  /** 120–260 words of teaching in plain language, may use **bold** and short paragraphs (blank-line separated). */
  body: string
  keyPoints: [string, string, string]
  /** A real-work example in the Meridian vocabulary (meeting prep, RMD letters, review decks, IPS...). */
  example: { title: string; text: string }
  check: LessonCheck
  /** Competency codes this lesson supports (see api competency catalog, e.g. "L1.description"). */
  competencies: string[]
}

export interface Module {
  rung: Rung
  code: string           // "L0".."L5"
  name: string           // "Orientation", ...
  tagline: string        // one line in plain words
  /** What you will be able to do at the end (3 bullets). */
  outcomes: [string, string, string]
  /** What practice looks like at this rung, in plain words. */
  practice: string
  lessons: Lesson[]
}
