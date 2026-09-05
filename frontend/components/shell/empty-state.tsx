import { Paper } from "@/components/brand/grain"
import { cn } from "@/lib/utils"

/** Cause-specific empty state. Never use it to hide a failed fetch; use ErrorState for that. */
export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <Paper className={cn("rounded-xl border bg-card p-10 text-center", className)}>
      {icon && <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-glow-soft text-glow-foreground">{icon}</div>}
      <h3 className="font-display text-xl font-medium">{title}</h3>
      {description && <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </Paper>
  )
}

export function ErrorState({ title = "Couldn't load this", detail, retry }: { title?: string; detail?: string; retry?: () => void }) {
  return (
    <div className="rounded-xl border border-fail/30 bg-fail-soft p-6 text-sm" role="alert" data-testid="error-state">
      <p className="font-medium text-fail">{title}</p>
      {detail && <p className="mt-1 text-muted-foreground">{detail}</p>}
      {retry && (
        <button onClick={retry} className="mt-3 text-sm font-medium underline underline-offset-4">
          Try again
        </button>
      )}
    </div>
  )
}
