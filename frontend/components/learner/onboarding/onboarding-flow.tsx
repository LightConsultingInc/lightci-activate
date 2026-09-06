"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useMe } from "@/hooks/use-me"
import {
  errorMessage,
  useCreateInterview,
  useMyWorkflows,
} from "@/hooks/learner/queries"
import { ApiError } from "@/lib/api"
import { ConsentStep } from "./consent-step"
import { IntakeChat } from "./intake-chat"
import { CompletionStep } from "./completion-step"
import { cn } from "@/lib/utils"
import type { InterviewComplete } from "@/hooks/learner/types"

export type InputMode = "voice" | "chat"

type Props = {
  consented: boolean
  interviewId: string | null
  mode: "intake" | "workflow" | "champion"
  workflowMapId: string | null
  /** How the interviewer starts: talking (default) or typing (`?mode=chat`, or "Prefer to type?" on the landing). */
  initialMode?: InputMode
}
type Stage = "consent" | "interview" | "done"

const STAGES: { key: Stage; label: string }[] = [
  { key: "consent", label: "Consent" },
  { key: "interview", label: "Interview" },
  { key: "done", label: "Placement" },
]

const TITLES = {
  intake: "A short conversation about your work",
  workflow: "Map the workflow",
  champion: "Inventory the team's workflows",
} as const

export function OnboardingFlow(p: Props) {
  const me = useMe()
  const router = useRouter()
  const [stage, setStage] = useState<Stage>(
    p.consented ? "interview" : "consent"
  )
  const [inputMode, setInputMode] = useState<InputMode>(
    p.initialMode ?? "voice"
  )
  const [interviewId, setInterviewId] = useState<string | null>(p.interviewId)
  const [result, setResult] = useState<InterviewComplete | null>(null)
  const create = useCreateInterview()
  const workflows = useMyWorkflows()
  const creating = useRef(false)

  useEffect(() => {
    if (stage === "interview" && !interviewId && !creating.current) {
      creating.current = true
      create.mutate(
        { mode: p.mode, workflowMapId: p.workflowMapId ?? undefined },
        {
          onSuccess: (iv) => setInterviewId(iv.id),
          onSettled: () => (creating.current = false),
        }
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, interviewId])

  const onComplete = (r: InterviewComplete) => {
    setResult(r)
    setStage("done")
    workflows.refetch()
    router.prefetch("/")
  }

  const idx = STAGES.findIndex((x) => x.key === stage)

  return (
    <div className="space-y-8" data-testid="onboarding-flow" data-stage={stage}>
      {/* One quiet progress line. */}
      <ol
        className="flex items-center gap-2 text-[11px] tracking-wide text-muted-foreground"
        data-testid="onboarding-stages"
        aria-label="Onboarding progress"
      >
        {STAGES.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={cn(
                i === idx && "font-medium text-foreground",
                i < idx && "text-pass"
              )}
              aria-current={i === idx ? "step" : undefined}
            >
              {s.label}
            </span>
            {i < STAGES.length - 1 && (
              <span
                aria-hidden
                className={cn("h-px w-6", i < idx ? "bg-pass/60" : "bg-border")}
              />
            )}
          </li>
        ))}
      </ol>

      {stage === "consent" && (
        <ConsentStep
          name={me.user?.name ?? "there"}
          onDone={(m) => {
            setInputMode(m)
            setStage("interview")
          }}
        />
      )}

      {stage === "interview" && (
        <div className="space-y-4">
          <div>
            <h1 className="font-display text-3xl font-medium md:text-4xl">
              {TITLES[p.mode]}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {p.mode === "intake"
                ? "Talk it through, or type if you'd rather. The scribe on the right writes down your role, your weekly workflows and how you use Claude today; when the interviewer has enough it ends the conversation and places you."
                : "Talk it through, or type if you'd rather. The scribe fills the workflow map as you go, and a checker flags anything that doesn't add up."}
            </p>
          </div>
          {create.isError ? (
            <StartFailed
              error={create.error}
              retry={() => {
                creating.current = false
                create.reset()
                setInterviewId(null)
              }}
            />
          ) : interviewId ? (
            <IntakeChat
              interviewId={interviewId}
              initialMode={inputMode}
              onComplete={onComplete}
            />
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
              <Skeleton className="h-[32rem]" />
              <Skeleton className="h-[32rem]" />
            </div>
          )}
        </div>
      )}

      {stage === "done" && result && (
        <CompletionStep
          result={result}
          workflows={workflows.data ?? []}
          mode={p.mode}
        />
      )}
    </div>
  )
}

/** Friendly card for a failed POST /interviews: the API's `detail` in plain words, and a retry. */
function StartFailed({ error, retry }: { error: unknown; retry: () => void }) {
  const status = error instanceof ApiError ? error.status : 0
  const title =
    status === 409
      ? "There's already an interview open"
      : status === 400
        ? "We couldn't start this interview"
        : status >= 500
          ? "The interviewer is unavailable right now"
          : "We couldn't start the interview"
  const detail = errorMessage(error, "Something went wrong on our side.")
  return (
    <div
      className="mx-auto max-w-lg rounded-xl border bg-card p-6 text-center"
      role="alert"
      data-testid="interview-start-failed"
    >
      <h2 className="font-display text-2xl font-medium">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      <div className="mt-5 flex justify-center gap-2">
        <Button onClick={retry}>
          <RotateCcw data-icon="inline-start" /> Try again
        </Button>
      </div>
      {status >= 500 && (
        <p className="mt-3 text-xs text-muted-foreground">
          If this keeps happening, tell your champion; nothing you said has been
          lost.
        </p>
      )}
    </div>
  )
}
