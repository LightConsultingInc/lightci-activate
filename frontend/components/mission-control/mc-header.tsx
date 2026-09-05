"use client"

import { PageHeader } from "@/components/shell/page-header"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useTeams } from "@/hooks/mc/use-mc"
import { useMcFilters, type Range } from "@/hooks/mc/use-mc-filters"
import { useMe } from "@/hooks/use-me"
import { McTabs } from "./mc-tabs"

const ALL = "__all__"

export function McFilters({ team = true, range = true }: { team?: boolean; range?: boolean }) {
  const f = useMcFilters()
  const teams = useTeams()
  return (
    <div className="flex items-center gap-2" data-testid="mc-filters">
      {team && (
        <Select value={f.teamId ?? ALL} onValueChange={(v) => f.set({ teamId: v === ALL ? null : (v as string) })}>
          <SelectTrigger size="sm" className="min-w-40" data-testid="mc-team-filter" aria-label="Filter by team">
            <SelectValue>{(v: string) => (v === ALL || !v ? "All teams" : teams.data?.find((t) => t.id === v)?.name ?? "Team")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All teams</SelectItem>
            {(teams.data ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {range && (
        <ToggleGroup value={[f.range]} onValueChange={(v) => v[0] && f.set({ range: v[0] as Range })} variant="outline" size="sm" spacing={0} data-testid="mc-range-toggle" aria-label="Range">
          <ToggleGroupItem value="30d" data-testid="mc-range-30d">
            30d
          </ToggleGroupItem>
          <ToggleGroupItem value="90d" data-testid="mc-range-90d">
            90d
          </ToggleGroupItem>
        </ToggleGroup>
      )}
    </div>
  )
}

/** Header + tabs shell for every Mission Control page. */
export function McHeader({ title, description, filters, actions }: { title: string; description?: React.ReactNode; filters?: { team?: boolean; range?: boolean } | false; actions?: React.ReactNode }) {
  const me = useMe()
  return (
    <>
      <PageHeader
        eyebrow={`Mission Control · ${me.org?.name ?? "Your firm"}`}
        title={title}
        description={description}
        actions={
          <>
            {filters !== false && <McFilters {...(filters ?? {})} />}
            {actions}
          </>
        }
        className="pb-4"
      />
      <McTabs />
    </>
  )
}
