"use client"

import type { MockKind } from "@/content/lessons/types"
import { AttachMenu, Conversation, NewChat, ProjectInstructions, ProjectPage, SkillInUse, ToolsMenu } from "./screens"

/** One screen per kind, and the plain-words legend for its numbered spots. */
const MOCKS: Record<MockKind, { Screen: () => React.JSX.Element; title: string; legend: string[] }> = {
  "new-chat": {
    Screen: NewChat,
    title: "A fresh chat",
    legend: [
      "Chats: everything you have asked before, searchable.",
      "Projects: a saved setup for a task you repeat.",
      "Code: Claude Code, for work that lives in files and code.",
      "Cowork: hand off a longer job and check in on it.",
      "The plus button: add a file, or one from Drive.",
      "The tools button: the connectors your firm has turned on.",
      "Send. Enter does the same.",
    ],
  },
  "attach-menu": {
    Screen: AttachMenu,
    title: "Adding material",
    legend: [
      "Click the plus button.",
      "Upload a file from your computer: a document, a spreadsheet, a PDF.",
      "Or pick one straight from your firm's Drive.",
      "Pasting into the box works too. Notes, an email, a table: paste and describe what you want.",
    ],
  },
  "tools-menu": {
    Screen: ToolsMenu,
    title: "Your firm's connectors",
    legend: [
      "Click the tools button next to the plus.",
      "Everything listed under Connectors has been turned on by your firm. You cannot add one yourself, and that is the point.",
      "Name the tool in your request and say what to fetch. Claude sees only what you could open yourself.",
    ],
  },
  conversation: {
    Screen: Conversation,
    title: "Working on a draft",
    legend: [
      "Your request. Hover over it to edit and resend if you left something out.",
      "Claude's draft. Read it like a colleague's: numbers, names, claims.",
      "Copy, rate, or try again. Try again gives a fresh version of the same request.",
      "Say what to change in the same chat. Two or three specific instructions beat starting over.",
    ],
  },
  "project-page": {
    Screen: ProjectPage,
    title: "Inside a Project",
    legend: [
      "Instructions: how you like this task done, written once.",
      "Files: a summary, a template, two good examples. Short beats long here.",
      "A connected folder or tool, so the Project reads the latest version instead of a copy.",
      "Start a chat here and it already knows all of the above.",
    ],
  },
  "project-instructions": {
    Screen: ProjectInstructions,
    title: "Writing the instructions",
    legend: [
      "Open the Project, then Instructions, then Edit. Write to Claude the way you would brief a careful new hire.",
      "Principles, not rules: say what matters and why. Claude can follow a principle into cases you did not list.",
      "Save. Every chat in the Project uses the new version from now on.",
    ],
  },
  "skill-in-use": {
    Screen: SkillInUse,
    title: "A skill at work",
    legend: [
      "You ask in plain words. No command, no special phrasing.",
      "Claude shows which skill it picked up. Click it to see the steps.",
      "What it read, and from where. Your permissions apply to every line.",
      "The result, in the shape the skill defines. Still yours to check before it goes anywhere.",
    ],
  },
}

/** The "where to click" panel: a sketch of Claude's screen with numbered spots and a legend. */
export function ClaudeMock({ kind }: { kind: MockKind }) {
  const entry = MOCKS[kind]
  if (!entry) return null
  const { Screen, title, legend } = entry
  return (
    <section className="space-y-4" data-testid="lesson-mock" data-kind={kind}>
      <div>
        <p className="eyebrow">Where to click</p>
        <h2 className="mt-1 font-display text-xl font-medium">{title}</h2>
      </div>
      <Screen />
      <ol className="grid gap-2 sm:grid-cols-2">
        {legend.map((l, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-glow text-[11px] font-semibold text-glow-foreground">{i + 1}</span>
            <span>{l}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">A sketch of Claude&apos;s screen. Yours may look a little different, but the buttons keep their names.</p>
    </section>
  )
}
