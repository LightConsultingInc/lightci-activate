"use client"

import { Check, Eye, EyeOff, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Grain } from "@/components/brand/grain"
import { useConsent } from "@/hooks/learner/queries"

const SEES = [
  "Usage metadata from Claude Enterprise: when you were active, which surfaces you used, which skills ran",
  "The artifacts you submit here: prompts, Projects, skills, workflow maps, and your critiques",
  "Your interview transcript, so the Interviewer can build your plan",
]
const DOES_NOT = [
  "The content of your chats in Claude",
  "Files in your Projects unless you paste them into an exercise",
  "Anything about you from outside your firm's Claude tenant",
]

export function ConsentStep({ onDone, name }: { onDone: () => void; name: string }) {
  const consent = useConsent()
  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]" data-testid="consent-step">
      <div className="relative overflow-hidden rounded-2xl bg-ink p-8 text-paper md:p-10">
        <Grain opacity={0.1} />
        <div className="relative">
          <p className="eyebrow text-paper/60">Welcome, {name.split(" ")[0]}</p>
          <h1 className="mt-3 font-display text-4xl font-medium leading-[1.08] md:text-5xl">
            You&apos;ll climb the ladder by <em className="not-italic text-glow">producing real work</em>. Here is exactly what we see to grade it.
          </h1>
          <p className="mt-5 max-w-lg text-paper/70">
            Activate is a delegation-training system. Before every run you predict, after every run you critique, and Coach grades the artifact, not your effort. To do that it needs a narrow, specific view of your work.
          </p>
        </div>
      </div>
      <div className="space-y-5 self-center">
        <ul className="rounded-xl border bg-card p-5">
          <li className="flex items-center gap-2 text-sm font-medium"><Eye className="size-4 text-info" /> What Activate sees</li>
          {SEES.map((s) => (
            <li key={s} className="mt-2.5 flex gap-2 text-sm text-muted-foreground"><Check className="mt-0.5 size-4 shrink-0 text-pass" /> {s}</li>
          ))}
        </ul>
        <ul className="rounded-xl border bg-card p-5">
          <li className="flex items-center gap-2 text-sm font-medium"><EyeOff className="size-4 text-fail" /> What it does not</li>
          {DOES_NOT.map((s) => (
            <li key={s} className="mt-2.5 flex gap-2 text-sm text-muted-foreground"><Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {s}</li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">Your firm&apos;s usage policy and compliance boundary apply to everything you submit. Grades and mastery are visible to you and your champion; leaderboards are off by default.</p>
        <Button size="lg" className="w-full" onClick={() => consent.mutate(undefined, { onSuccess: onDone })} disabled={consent.isPending} data-testid="consent-accept">
          {consent.isPending ? "Recording…" : "I understand, let's start"}
        </Button>
      </div>
    </div>
  )
}
