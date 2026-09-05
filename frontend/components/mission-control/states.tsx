"use client"

import type { UseQueryResult } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/shell/empty-state"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

/** Renders skeleton / error / children for a query. Never turns a failed fetch into an empty state. */
export function QueryState<T>({ query, children, skeleton, className }: { query: UseQueryResult<T>; children: (data: T) => React.ReactNode; skeleton?: React.ReactNode; className?: string }) {
  if (query.isPending) return <div className={className}>{skeleton ?? <DashboardSkeleton />}</div>
  if (query.isError) {
    const e = query.error
    const detail = e instanceof ApiError ? `${e.status} ${e.title}${e.detail ? ` — ${e.detail}` : ""}` : (e as Error).message
    return <ErrorState detail={detail} retry={() => query.refetch()} />
  }
  return <>{children(query.data as T)}</>
}

export function DashboardSkeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <div className="space-y-6" data-testid="mc-skeleton">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: tiles }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  )
}

/** Card shell used across dashboards: eyebrow title, optional description/actions, dense body. */
export function Panel({ title, description, actions, children, className, testId, footer }: { title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; testId?: string; footer?: React.ReactNode }) {
  return (
    <section className={cn("flex flex-col rounded-xl bg-card ring-1 ring-foreground/10", className)} data-testid={testId}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-4">
          <div className="min-w-0">
            {title && <h3 className="font-display text-base font-medium leading-tight">{title}</h3>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="flex-1 p-4">{children}</div>
      {footer && <footer className="border-t px-4 py-2 text-[11px] text-muted-foreground">{footer}</footer>}
    </section>
  )
}

/** Footnote line for any number: "Source: … · Baseline: …". Greys when no baseline is known. */
export function SourceLine({ source, baseline, className }: { source?: string | null; baseline?: string | null; className?: string }) {
  const hasBaseline = Boolean(baseline)
  return (
    <p className={cn("text-[11px] leading-snug text-muted-foreground", className)} data-testid="source-line" data-baseline={hasBaseline ? "yes" : "no"}>
      <span>Source: {source || "Activate"}</span>
      <span className="mx-1">·</span>
      <span className={cn(!hasBaseline && "italic")}>Baseline: {baseline || "no baseline"}</span>
    </p>
  )
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("eyebrow", className)}>{children}</p>
}

export function Delta({ value, goodWhenUp = true, suffix = "" }: { value: number | null | undefined; goodWhenUp?: boolean; suffix?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-xs text-muted-foreground">—</span>
  const up = value > 0
  const flat = value === 0
  const good = flat ? null : up === goodWhenUp
  return (
    <span className={cn("tabular text-xs font-medium", flat ? "text-muted-foreground" : good ? "text-pass" : "text-fail")}>
      {up ? "▲" : flat ? "•" : "▼"} {Math.abs(value)}
      {suffix}
    </span>
  )
}
