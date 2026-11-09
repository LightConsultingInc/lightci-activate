"use client"

import Link from "next/link"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/shell/empty-state"
import { Chip, skillStatusTone } from "../chips"
import { useMySkills } from "@/hooks/learner/queries"

/** Compact "My skills" strip: adopted and authored, linking into the library. */
export function MySkillsPanel() {
  const q = useMySkills()
  return (
    <section className="rounded-xl border bg-card p-5" data-testid="my-skills-panel">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-medium">My skills</h2>
        <Link href="/library" className="text-xs underline underline-offset-4">Library</Link>
      </div>
      {q.isPending && <div className="mt-3 space-y-2"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>}
      {q.isError && <ErrorState detail={q.error.message} retry={() => q.refetch()} />}
      {q.data && (
        <div className="mt-3 space-y-4">
          <div>
            <p className="eyebrow mb-1.5">Skills you use · {q.data.adopted.length}</p>
            {q.data.adopted.length === 0 ? <p className="text-xs text-muted-foreground">None yet. The quickest start is picking a teammate&apos;s skill from the library and trying it on your own work.</p> : (
              <ul className="divide-y">
                {q.data.adopted.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm" data-testid="adopted-skill">
                    <Link href={`/library/${s.slug}`} className="min-w-0 truncate hover:underline hover:underline-offset-4">{s.name}</Link>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">{s.myActivations30d === 1 ? "used once" : `used ${s.myActivations30d} times`} in the last 30 days</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="eyebrow mb-1.5">Skills you wrote · {q.data.authored.length}</p>
            {q.data.authored.length === 0 ? <p className="text-xs text-muted-foreground">You&apos;ll write your first skill of your own in L3.</p> : (
              <ul className="divide-y">
                {q.data.authored.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm" data-testid="authored-skill">
                    <div className="min-w-0">
                      <Link href={`/library/${s.slug}`} className="block truncate hover:underline hover:underline-offset-4">{s.name}</Link>
                      <p className="text-xs text-muted-foreground">v{s.version}{s.usageByOthers30d > 0 ? ` · used ${s.usageByOthers30d === 1 ? "once" : `${s.usageByOthers30d} times`} by others in the last 30 days` : ""}</p>
                    </div>
                    <Chip tone={skillStatusTone(s.status)}>{s.status.replace("_", " ")}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
