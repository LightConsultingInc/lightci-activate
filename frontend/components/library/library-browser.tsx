"use client"

import { useEffect, useMemo, useState } from "react"
import { Compass, Search, SlidersHorizontal, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { PageHeader } from "@/components/shell/page-header"
import { EmptyState, ErrorState } from "@/components/shell/empty-state"
import { RUNGS } from "@/components/brand/rung"
import { useLibrary, useNearbySkills } from "@/hooks/library/queries"
import { useLibraryFilters } from "@/hooks/library/use-library-filters"
import type { LibraryFacets, LibrarySort, SkillCard as SkillCardT, SkillStatus } from "@/hooks/library/types"
import { STATUS_META } from "./status-ribbon"
import { SkillCard, SkillCardSkeleton } from "./skill-card"
import { SkillQuickLook } from "./skill-quick-look"
import { NewSkillDialog } from "./new-skill-dialog"
import { describeError } from "./skill-actions"
import { cn } from "@/lib/utils"

const SORT_LABEL: Record<LibrarySort, string> = { most_used: "Most used", newest: "Newest", grade: "Highest grade" }

/** Facet counts arrive either as arrays or as key→count maps; normalise to a map. */
function countMap<K extends string>(v: LibraryFacets["rungs"] | LibraryFacets["statuses"] | undefined, key: "rung" | "status"): Record<string, number> {
  if (!v) return {}
  if (Array.isArray(v)) return Object.fromEntries((v as Record<string, unknown>[]).map((x) => [String(x[key]), Number(x.count ?? 0)]))
  return v as Record<K, number>
}

export function LibraryBrowser() {
  const { filters, set, clear, activeCount } = useLibraryFilters()
  const q = useLibrary(filters)
  const [quick, setQuick] = useState<SkillCardT | null>(null)
  const [search, setSearch] = useState(filters.q ?? "")

  // Debounce the search box into the URL.
  useEffect(() => {
    const t = setTimeout(() => { if ((filters.q ?? "") !== search.trim()) set({ q: search.trim() || undefined }) }, 300)
    return () => clearTimeout(t)
  }, [search, filters.q, set])
  const [prevQ, setPrevQ] = useState(filters.q)
  if (filters.q !== prevQ) { setPrevQ(filters.q); setSearch(filters.q ?? "") }

  const skills = q.data?.skills ?? []
  const facets = q.data?.facets
  const rungCounts = useMemo(() => countMap(facets?.rungs, "rung"), [facets])
  const statusCounts = useMemo(() => countMap(facets?.statuses, "status"), [facets])
  const noResults = q.isSuccess && skills.length === 0
  const nearby = useNearbySkills(noResults && activeCount > 0)

  return (
    <>
      <PageHeader
        eyebrow="Library"
        title="Skill Library"
        description="Every skill here has an owner, a grade, a boundary declaration and an approver. Adopting a teammate's skill is the fastest way through L3."
        actions={<NewSkillDialog teams={facets?.teams ?? []} />}
      />

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3" data-testid="library-filters">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or trigger: “meeting prep”, “RMD”, “IPS”…" className="pl-8" data-testid="library-search" aria-label="Search skills" />
          </div>
          <Select value={filters.team ?? "all"} onValueChange={(v) => set({ team: v as string })} items={[{ value: "all", label: "All teams" }, ...(facets?.teams ?? []).map((t) => ({ value: t.id, label: `${t.name} (${t.count})` }))]}>
            <SelectTrigger className="w-44" data-testid="filter-team"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All teams</SelectItem>
              {(facets?.teams ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name} <span className="text-muted-foreground">({t.count})</span></SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.family ?? "all"} onValueChange={(v) => set({ family: v as string })} items={[{ value: "all", label: "All workflows" }, ...(facets?.families ?? []).map((f) => ({ value: f.name, label: `${f.name} (${f.count})` }))]}>
            <SelectTrigger className="w-48" data-testid="filter-family"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All workflows</SelectItem>
              {(facets?.families ?? []).map((f) => <SelectItem key={f.name} value={f.name}>{f.name} <span className="text-muted-foreground">({f.count})</span></SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.sort ?? "most_used"} onValueChange={(v) => set({ sort: v === "most_used" ? undefined : (v as string) })} items={SORT_LABEL}>
            <SelectTrigger className="w-40" data-testid="filter-sort"><SlidersHorizontal className="size-3.5 text-muted-foreground" /><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(SORT_LABEL) as LibrarySort[]).map((s) => <SelectItem key={s} value={s}>{SORT_LABEL[s]}</SelectItem>)}</SelectContent>
          </Select>
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { clear(); setSearch("") }} data-testid="filters-clear"><X data-icon="inline-start" /> Clear {activeCount}</Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="eyebrow">Rung</span>
            <ToggleGroup value={filters.rung ? [filters.rung] : []} onValueChange={(v) => set({ rung: v[0] as string | undefined })} size="sm" variant="outline" spacing={0} data-testid="filter-rung">
              {RUNGS.filter((r) => r.rung > 0).map((r) => (
                <ToggleGroupItem key={r.rung} value={String(r.rung)} aria-label={`${r.code} ${r.name}`} className="gap-1.5">
                  <span className="size-1.5 rounded-full" style={{ background: `var(--rung-${r.rung})` }} />{r.code}
                  {rungCounts[r.rung] !== undefined && <span className="text-muted-foreground tabular">{rungCounts[r.rung]}</span>}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="flex items-center gap-2">
            <span className="eyebrow">Status</span>
            <ToggleGroup value={filters.status ? [filters.status] : []} onValueChange={(v) => set({ status: v[0] as string | undefined })} size="sm" variant="outline" spacing={0} data-testid="filter-status">
              {(Object.keys(STATUS_META) as SkillStatus[]).map((s) => (
                <ToggleGroupItem key={s} value={s} className="gap-1.5">
                  {STATUS_META[s].label}
                  {statusCounts[s] !== undefined && <span className="text-muted-foreground tabular">{statusCounts[s]}</span>}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          {q.isSuccess && <span className="ml-auto text-xs text-muted-foreground tabular" data-testid="library-count">{skills.length} {skills.length === 1 ? "skill" : "skills"}</span>}
        </div>
      </div>

      <section className="mt-6" aria-live="polite">
        {q.isPending ? (
          <Grid>{Array.from({ length: 6 }).map((_, i) => <SkillCardSkeleton key={i} />)}</Grid>
        ) : q.isError ? (
          <ErrorState title="The library didn't load" detail={describeError(q.error)} retry={() => q.refetch()} />
        ) : noResults ? (
          <div className="space-y-6">
            <EmptyState
              icon={<Compass className="size-5" />}
              title={activeCount > 0 ? "Nothing matches those filters" : "The library is empty so far"}
              description={
                activeCount > 0
                  ? "Try widening the rung or clearing the team. Skills nearby are below: the most-used across the firm right now."
                  : "The first skills usually come from a mapped workflow: advisor meeting prep, RMD reminder letters, annual review decks. Start one, or convert a backlog item on the Team page."
              }
              action={activeCount > 0 ? <Button variant="outline" onClick={() => { clear(); setSearch("") }} data-testid="empty-clear-filters">Clear filters</Button> : <NewSkillDialog teams={[]} />}
            />
            {activeCount > 0 && (nearby.data?.length ?? 0) > 0 && (
              <div data-testid="skills-nearby">
                <p className="eyebrow mb-3">Skills nearby</p>
                <Grid>{nearby.data!.map((s, i) => <SkillCard key={s.id} skill={s} index={i} onQuickLook={setQuick} />)}</Grid>
              </div>
            )}
          </div>
        ) : (
          <Grid className={cn(q.isFetching && "opacity-70 transition-opacity")}>
            {skills.map((s, i) => <SkillCard key={s.id} skill={s} index={i} onQuickLook={setQuick} />)}
          </Grid>
        )}
      </section>

      <SkillQuickLook skill={quick} onClose={() => setQuick(null)} />
    </>
  )
}

function Grid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", className)} data-testid="skill-grid">{children}</div>
}
