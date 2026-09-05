import { cn } from "@/lib/utils"

/** A tiny labelled bar for 0..1 values: used in backlog rows and the roster. Text carries the value; colour carries nothing. */
export function MicroBar({ value, label, color = "var(--foreground)", className, showValue = true, width = 56, fluid = false }: { value: number; label?: string; color?: string; className?: string; showValue?: boolean; width?: number; fluid?: boolean }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  return (
    <span className={cn("inline-flex items-center gap-1.5", fluid && "flex w-full", className)} title={label ? `${label}: ${Math.round(v * 100)}%` : undefined}>
      {label && <span className="eyebrow !text-[9px] w-14 truncate">{label}</span>}
      <span className={cn("h-1.5 overflow-hidden rounded-full bg-muted", fluid && "flex-1")} style={fluid ? undefined : { width }}>
        <span className="block h-full rounded-full" style={{ width: `${v * 100}%`, background: color, transition: "width 600ms cubic-bezier(0.22,1,0.36,1)" }} />
      </span>
      {showValue && <span className="w-7 text-right text-[11px] tabular text-muted-foreground">{Math.round(v * 100)}</span>}
    </span>
  )
}
