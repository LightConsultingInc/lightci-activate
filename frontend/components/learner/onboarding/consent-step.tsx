"use client"

import { Check, Eye, EyeOff, Keyboard, Mic, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useConsent } from "@/hooks/learner/queries"
import type { InputMode } from "./onboarding-flow"

const COLUMNS: {
  icon: React.ReactNode
  title: string
  items: string[]
  tone: "glow" | "info" | "muted"
}[] = [
  {
    icon: <Sparkles className="size-4" />,
    title: "What Activate does",
    tone: "glow",
    items: [
      "Talks with you about your week, then picks exercises from your own work.",
      "Grades what you produce and shows you how to make it better.",
      "Turns the things you repeat into skills you and your team can reuse.",
    ],
  },
  {
    icon: <Eye className="size-4" />,
    title: "What we'll see",
    tone: "info",
    items: [
      "Usage metadata from Claude: when you were active and which features you used.",
      "The artifacts you submit here: prompts, projects, skills and workflow maps.",
      "Your grades and progress, visible to you and your champion.",
    ],
  },
  {
    icon: <EyeOff className="size-4" />,
    title: "What we won't see",
    tone: "muted",
    items: [
      "Your chats in Claude.",
      "Client documents, unless you paste something into an exercise.",
      "Account data, or anything outside your firm's Claude tenant.",
    ],
  },
]

const TONE = {
  glow: "bg-glow-soft text-glow-foreground",
  info: "bg-info-soft text-info",
  muted: "bg-muted text-muted-foreground",
} as const

/** Plain-language landing: what this is, what we see, what we don't, one button into the interviewer. */
export function ConsentStep({
  onDone,
  name,
}: {
  onDone: (mode: InputMode) => void
  name: string
}) {
  const consent = useConsent()
  const first = name.split(" ")[0]
  const go = (mode: InputMode) =>
    consent.mutate(undefined, { onSuccess: () => onDone(mode) })

  return (
    <div className="mx-auto max-w-4xl pt-6 md:pt-14" data-testid="consent-step">
      <p className="eyebrow">Welcome, {first}</p>
      <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.08] font-medium md:text-5xl">
        We&apos;re going to teach you to work with AI by{" "}
        <em className="text-glow-foreground not-italic underline decoration-glow decoration-4 underline-offset-4">
          doing your own work
        </em>
        .
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
        You&apos;ll do real exercises from your own week, build skills you can
        test yourself, and get feedback as you go. No courses.
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {COLUMNS.map((c) => (
          <section key={c.title} className="rounded-xl border bg-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <span
                className={`grid size-7 place-items-center rounded-full ${TONE[c.tone]}`}
              >
                {c.icon}
              </span>
              {c.title}
            </h2>
            <ul className="mt-3 space-y-2.5">
              {c.items.map((it) => (
                <li
                  key={it}
                  className="flex gap-2 text-sm text-muted-foreground"
                >
                  <Check
                    className={`mt-0.5 size-4 shrink-0 ${c.tone === "muted" ? "text-muted-foreground/60" : "text-pass"}`}
                  />{" "}
                  {it}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-10 flex flex-col items-start gap-3">
        <Button
          size="lg"
          className="h-11 px-5 text-base"
          onClick={() => go("voice")}
          disabled={consent.isPending}
          data-testid="consent-accept"
        >
          <Mic data-icon="inline-start" />{" "}
          {consent.isPending ? "One moment…" : "Start the conversation"}
        </Button>
        <button
          type="button"
          onClick={() => go("chat")}
          disabled={consent.isPending}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
          data-testid="consent-accept-chat"
        >
          <Keyboard className="size-3.5" /> Prefer to type?
        </button>
        <p className="mt-2 text-xs text-muted-foreground">
          Starting records your consent to the above. Your firm&apos;s usage
          policy applies to everything you submit; leaderboards are off by
          default.
        </p>
      </div>
    </div>
  )
}
