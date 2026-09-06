"use client"

import { useCallback } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, BookOpen, MessageSquareText, Wrench } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/shell/empty-state"
import { Grain } from "@/components/brand/grain"
import { rungColor } from "@/components/brand/rung"
import { moduleFor } from "@/content/lessons"
import { useLadder, useWhyMe } from "@/hooks/learner/queries"
import { ProgressRing } from "./progress-ring"
import { moduleProgress, moduleState, parseModuleCode } from "./module-state"
import { LearnTab } from "./learn-tab"
import { PracticeTab } from "./practice-tab"
import { FeedbackTab } from "./feedback-tab"

const TABS = ["learn", "practice", "feedback"] as const
type Tab = (typeof TABS)[number]

/** A module page: header (name, tagline, three outcomes) and the Learn · Practice · Feedback tabs. */
export function ModuleView({ code }: { code: string }) {
  const rung = parseModuleCode(code)
  const ladder = useLadder()
  const whyMe = useWhyMe(code)
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const tabParam = sp.get("tab")
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "learn"
  const setTab = useCallback(
    (v: string) => {
      const next = new URLSearchParams(sp.toString())
      if (v === "learn") next.delete("tab")
      else next.set("tab", v)
      router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false })
    },
    [router, pathname, sp],
  )

  if (rung == null) return <ErrorState title="No such module" detail={`"${code}" is not one of L0–L5.`} />
  const mod = moduleFor(rung)
  const state = moduleState(ladder.data, rung)
  const progress = moduleProgress(ladder.data, rung)

  return (
    <div className="space-y-6 animate-rise" data-testid="module-view" data-code={mod.code} data-state={state}>
      <Link href="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" data-testid="module-back">
        <ArrowLeft className="size-3" /> Your path
      </Link>

      <header className="relative overflow-hidden rounded-2xl bg-ink text-paper" data-testid="module-header">
        <Grain opacity={0.1} />
        <div className="relative grid gap-6 p-6 md:grid-cols-[auto_1fr] md:p-8">
          <ProgressRing rung={rung} progress={progress} size={88} stroke={6}>
            <div className="text-center leading-none">
              <div className="font-display text-2xl font-medium">{mod.code}</div>
              <div className="eyebrow mt-1 text-paper/60">{state === "done" ? "done" : state === "current" ? `${Math.round(progress * 100)}%` : "locked"}</div>
            </div>
          </ProgressRing>
          <div className="min-w-0">
            <p className="eyebrow text-paper/60">Module {rung + 1} of 6{state === "current" ? " · you are here" : state === "done" ? " · completed" : ""}</p>
            <h1 className="mt-1 font-display text-3xl font-medium leading-tight md:text-4xl" data-testid="module-name">{mod.name}</h1>
            <p className="mt-2 max-w-2xl text-sm text-paper/75">{mod.tagline}</p>
            {whyMe.data?.line?.trim() && (
              <p className="mt-2 max-w-2xl text-sm italic text-glow" data-testid="module-why-me">Why this matters for you: {whyMe.data.line}</p>
            )}
            <ul className="mt-4 grid gap-2 sm:grid-cols-3" data-testid="module-outcomes">
              {mod.outcomes.map((o, i) => (
                <li key={i} className="flex gap-2 rounded-lg border border-paper/10 bg-paper/5 p-3 text-xs leading-relaxed text-paper/85">
                  <span className="mt-0.5 size-1.5 shrink-0 rounded-full" style={{ background: rungColor(rung) }} />
                  {o}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </header>

      {ladder.isError && <ErrorState title="Couldn't load your progress" detail={ladder.error.message} retry={() => ladder.refetch()} />}

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList variant="line" className="w-full justify-start border-b" data-testid="module-tabs">
          <TabsTrigger value="learn" className="flex-none px-3" data-testid="module-tab-learn"><BookOpen data-icon="inline-start" /> Learn</TabsTrigger>
          <TabsTrigger value="practice" className="flex-none px-3" data-testid="module-tab-practice"><Wrench data-icon="inline-start" /> Practice</TabsTrigger>
          <TabsTrigger value="feedback" className="flex-none px-3" data-testid="module-tab-feedback"><MessageSquareText data-icon="inline-start" /> Feedback</TabsTrigger>
        </TabsList>
        <TabsContent value="learn" className="pt-4" data-testid="module-panel-learn">
          <LearnTab module={mod} />
        </TabsContent>
        <TabsContent value="practice" className="pt-4" data-testid="module-panel-practice">
          <PracticeTab module={mod} />
        </TabsContent>
        <TabsContent value="feedback" className="pt-4" data-testid="module-panel-feedback">
          {ladder.isPending ? <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-40" /></div> : ladder.data ? <FeedbackTab module={mod} ladder={ladder.data} /> : null}
        </TabsContent>
      </Tabs>
    </div>
  )
}
