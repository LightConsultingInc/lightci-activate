"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ErrorState } from "@/components/shell/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useMe } from "@/hooks/use-me"
import { useCreateInterview, useMyWorkflows } from "@/hooks/learner/queries"
import { ConsentStep } from "./consent-step"
import { IntakeChat } from "./intake-chat"
import { CompletionStep } from "./completion-step"
import { cn } from "@/lib/utils"
import type { InterviewComplete } from "@/hooks/learner/types"

type Props = { consented: boolean; interviewId: string | null; mode: "intake" | "workflow" | "champion"; workflowMapId: string | null }
type Stage = "consent" | "interview" | "done"

const STAGES: { key: Stage; label: string }[] = [
  { key: "consent", label: "Consent" },
  { key: "interview", label: "Interview" },
  { key: "done", label: "Placement" },
]

export function OnboardingFlow(p: Props) {
  const me = useMe()
  const router = useRouter()
  const [stage, setStage] = useState<Stage>(p.consented ? "interview" : "consent")
  const [interviewId, setInterviewId] = useState<string | null>(p.interviewId)
  const [result, setResult] = useState<InterviewComplete | null>(null)
  const create = useCreateInterview()
  const workflows = useMyWorkflows()
  const creating = useRef(false)

  useEffect(() => {
    if (stage === "interview" && !interviewId && !creating.current) {
      creating.current = true
      create.mutate({ mode: p.mode, workflowMapId: p.workflowMapId ?? undefined }, { onSuccess: (iv) => setInterviewId(iv.id), onSettled: () => (creating.current = false) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, interviewId])

  const onComplete = (r: InterviewComplete) => {
    setResult(r)
    setStage("done")
    workflows.refetch()
    router.prefetch("/")
  }

  return (
    <div className="space-y-8" data-testid="onboarding-flow" data-stage={stage}>
      <ol className="flex items-center gap-3 text-xs" data-testid="onboarding-stages">
        {STAGES.map((s, i) => {
          const idx = STAGES.findIndex((x) => x.key === stage)
          const state = i < idx ? "done" : i === idx ? "current" : "upcoming"
          return (
            <li key={s.key} className="flex items-center gap-2">
              <span className={cn("grid size-5 place-items-center rounded-full text-[10px] font-semibold tabular", state === "current" ? "bg-glow text-glow-foreground" : state === "done" ? "bg-pass text-white" : "bg-muted text-muted-foreground")}>{i + 1}</span>
              <span className={cn(state === "upcoming" && "text-muted-foreground")}>{s.label}</span>
              {i < STAGES.length - 1 && <span className="h-px w-8 bg-border" />}
            </li>
          )
        })}
      </ol>

      {stage === "consent" && <ConsentStep name={me.user?.name ?? "there"} onDone={() => setStage("interview")} />}

      {stage === "interview" && (
        <div className="space-y-4">
          <div>
            <p className="eyebrow">Step 2</p>
            <h1 className="mt-1 font-display text-3xl font-medium md:text-4xl">{p.mode === "intake" ? "A short conversation about your work" : p.mode === "workflow" ? "Map the workflow" : "Inventory the team's workflows"}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {p.mode === "intake"
                ? "Talk it through, or type if you'd rather. The Interviewer asks; the scribe on the right writes down your role, your weekly workflows and how you use Claude today. When it has enough, it ends the conversation, places you on the ladder and queues your first exercise."
                : "Talk it through, or type if you'd rather. The scribe fills the workflow schema as you go. A checker flags anything that doesn't add up, and your champion verifies the final map."}
            </p>
          </div>
          {create.isError ? (
            <ErrorState title="Couldn't start the interview" detail={create.error.message} retry={() => { creating.current = false; setInterviewId(null); create.reset() }} />
          ) : interviewId ? (
            <IntakeChat interviewId={interviewId} onComplete={onComplete} />
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_22rem]"><Skeleton className="h-[32rem]" /><Skeleton className="h-[32rem]" /></div>
          )}
        </div>
      )}

      {stage === "done" && result && <CompletionStep result={result} workflows={workflows.data ?? []} mode={p.mode} />}
    </div>
  )
}
