import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { LoginForm } from "./login-form"
import { ActivateLockup, LightciWordmark } from "@/components/brand/logo"
import { Paper } from "@/components/brand/grain"

export const metadata = { title: "Sign in · LightCI Activate" }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ authError?: string; next?: string }> }) {
  // The proxy skips AuthKit for the sign-in server action, so check the session cookie directly.
  if ((await cookies()).get("wos-session")) redirect("/")
  const sp = await searchParams
  return (
    <main className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <Paper className="hidden bg-ink text-paper lg:block" contentClassName="flex h-full min-h-svh flex-col justify-between p-12">
        <LightciWordmark className="h-6 text-paper" />
        <div className="max-w-xl">
          <p className="eyebrow text-paper/60">Activation and enablement for Claude Enterprise</p>
          <h1 className="mt-4 font-display text-5xl leading-[1.05] font-medium">
            Every rung is passed by <em className="not-italic text-glow">producing real work</em>, not by finishing a course.
          </h1>
          <p className="mt-6 text-lg text-paper/70">
            Activate runs your team up a mastery-gated fluency ladder: predict before Claude runs, critique before you accept, and ship skills your compliance team has signed.
          </p>
        </div>
        <div className="flex items-center gap-6 text-sm text-paper/50">
          <span>Ladder</span><span>·</span><span>Skill library</span><span>·</span><span>Governance</span><span>·</span><span>Mission Control</span>
        </div>
      </Paper>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm animate-rise">
          <ActivateLockup className="mb-10" />
          <h2 className="font-display text-3xl font-medium">Welcome back</h2>
          <p className="mt-2 text-sm text-muted-foreground">Sign in with your work account. Your firm&apos;s SSO is honoured automatically.</p>
          <LoginForm authError={sp.authError === "1"} />
        </div>
      </div>
    </main>
  )
}
