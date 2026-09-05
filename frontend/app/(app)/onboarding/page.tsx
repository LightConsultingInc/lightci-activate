import { getMe } from "@/lib/api"
import { OnboardingFlow } from "@/components/learner/onboarding/onboarding-flow"

export const metadata = { title: "Welcome" }

type SP = { interview?: string; mode?: string; workflow?: string }

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const [sp, me] = await Promise.all([searchParams, getMe().catch(() => null)])
  const mode = sp.mode === "workflow" || sp.mode === "champion" ? sp.mode : "intake"
  return (
    <OnboardingFlow
      consented={Boolean(me?.user?.consentAt)}
      interviewId={sp.interview ?? null}
      mode={mode}
      workflowMapId={sp.workflow ?? null}
    />
  )
}
