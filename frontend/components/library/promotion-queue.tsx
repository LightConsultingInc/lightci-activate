"use client"

import { useState } from "react"
import { GitPullRequest } from "lucide-react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/shell/page-header"
import { EmptyState, ErrorState } from "@/components/shell/empty-state"
import { usePromotions } from "@/hooks/library/queries"
import { PromotionCard } from "./promotion-card"
import { describeError } from "./skill-actions"

export function PromotionQueue() {
  const [state, setState] = useState<"pending" | "all">("pending")
  const q = usePromotions(state)
  const items = q.data ?? []
  const high = items.filter((p) => p.highExposure && p.decision === "pending")
  return (
    <>
      <PageHeader
        eyebrow="Champion"
        title="Promotion Queue"
        description="Skills your teammates want to share with everyone. Each one shows its score, what it's allowed to use, what changed and who needs to sign off. Nothing is shared until it's approved."
        actions={
          <ToggleGroup value={[state]} onValueChange={(v) => { const s = v[0] as "pending" | "all" | undefined; if (s) setState(s) }} variant="outline" spacing={0} data-testid="promotions-state">
            <ToggleGroupItem value="pending">Pending</ToggleGroupItem>
            <ToggleGroupItem value="all">All</ToggleGroupItem>
          </ToggleGroup>
        }
      />
      {q.isPending ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : q.isError ? (
        <ErrorState title="Couldn't load the skills waiting for approval" detail={describeError(q.error)} retry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={<GitPullRequest className="size-5" />} title={state === "pending" ? "Nothing waiting on you" : "No requests to share a skill yet"} description={state === "pending" ? "When a teammate's skill passes its check and they ask to share it, it shows up here. Switch to All to see past requests." : "The first one usually comes from a backlog task someone turned into a skill, once it has a passing score."} />
      ) : (
        <div className="space-y-6">
          {high.length > 0 && (
            <section data-testid="promotions-high-exposure">
              <p className="eyebrow mb-2 text-fail">Compliance approval required · {high.length}</p>
              <div className="space-y-2">{high.map((p) => <PromotionCard key={p.id} p={p} />)}</div>
            </section>
          )}
          <section>
            {high.length > 0 && <p className="eyebrow mb-2">Everything else</p>}
            <div className="space-y-2" data-testid="promotions-list">{items.filter((p) => !high.includes(p)).map((p) => <PromotionCard key={p.id} p={p} />)}</div>
          </section>
        </div>
      )}
    </>
  )
}
