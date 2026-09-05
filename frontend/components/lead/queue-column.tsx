"use client"

import { cn } from "@/lib/utils"

/** One of the four lead-console columns. Header carries a count so "closed" never looks like "empty". */
export function QueueColumn({ title, description, count, icon, children, testId, tone, empty }: { title: string; description?: string; count: number; icon?: React.ReactNode; children: React.ReactNode; testId: string; tone?: "fail" | "info" | "revise" | "pass"; empty: string }) {
  const toneCls = tone ? { fail: "bg-fail", info: "bg-info", revise: "bg-revise", pass: "bg-pass" }[tone] : "bg-foreground/30"
  return (
    <section className="flex min-h-64 flex-col rounded-xl bg-card ring-1 ring-foreground/10" data-testid={testId} data-count={count}>
      <header className="flex items-start gap-2 border-b px-3 py-2.5">
        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", toneCls)} />
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 font-display text-base font-medium leading-tight">
            {icon}
            {title}
            <span className="tabular rounded-full bg-muted px-1.5 text-xs text-muted-foreground" data-testid={`${testId}-count`}>{count}</span>
          </h3>
          {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
        </div>
      </header>
      <div className="flex-1 space-y-2 p-2">
        {count === 0 ? <p className="p-3 text-center text-xs text-muted-foreground">{empty}</p> : children}
      </div>
    </section>
  )
}

export function QueueCard({ org, title, meta, right, onClick, testId, className, children }: { org: string; title: React.ReactNode; meta?: React.ReactNode; right?: React.ReactNode; onClick?: () => void; testId?: string; className?: string; children?: React.ReactNode }) {
  const Comp = onClick ? "button" : "div"
  return (
    <Comp type={onClick ? "button" : undefined} onClick={onClick} className={cn("block w-full rounded-lg border bg-background p-2.5 text-left text-sm transition-colors", onClick && "hover:border-foreground/30 hover:bg-muted/30", className)} data-testid={testId}>
      <div className="flex items-start justify-between gap-2">
        <p className="eyebrow truncate !text-[10px]">{org}</p>
        {right}
      </div>
      <p className="mt-0.5 font-medium leading-snug">{title}</p>
      {meta && <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>}
      {children}
    </Comp>
  )
}
