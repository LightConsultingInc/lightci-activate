import Link from "next/link"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { PersonRef } from "@/hooks/library/types"

/** Avatar + name. `href` makes it a link to the person page (management surfaces only). */
export function PersonChip({ person, size = "sm", href, muted, className, showTitle }: { person: PersonRef | null; size?: "xs" | "sm" | "md"; href?: string; muted?: boolean; className?: string; showTitle?: boolean }) {
  const dim = size === "xs" ? "size-5 text-[9px]" : size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs"
  if (!person) return <span className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground italic", className)}>No owner</span>
  const inner = (
    <>
      <Avatar className={cn(dim, "shrink-0")}>
        {person.avatarUrl && <AvatarImage src={person.avatarUrl} alt="" />}
        <AvatarFallback className="bg-glow-soft text-glow-foreground font-medium">{fmt.initials(person.name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 leading-tight">
        <span className={cn("block truncate text-sm", muted ? "text-muted-foreground" : "text-foreground")}>{person.name}</span>
        {showTitle && person.title && <span className="block truncate text-xs text-muted-foreground">{person.title}</span>}
      </span>
    </>
  )
  const cls = cn("inline-flex min-w-0 items-center gap-2", href && "rounded-md hover:underline underline-offset-4", className)
  return href ? <Link href={href} className={cls} data-testid="person-chip">{inner}</Link> : <span className={cls} data-testid="person-chip">{inner}</span>
}
