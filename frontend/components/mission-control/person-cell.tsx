"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { PersonRef } from "@/hooks/mc/types"

export function PersonCell({ person, sub, className, size = "sm" }: { person: Pick<PersonRef, "name" | "avatarUrl"> & Partial<PersonRef>; sub?: React.ReactNode; className?: string; size?: "sm" | "md" }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <Avatar className={size === "sm" ? "size-6" : "size-8"}>
        {person.avatarUrl && <AvatarImage src={person.avatarUrl} alt="" />}
        <AvatarFallback className="text-[10px]">{fmt.initials(person.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-sm font-medium">{person.name}</div>
        {(sub ?? person.title ?? person.teamName) && <div className="truncate text-xs text-muted-foreground">{sub ?? person.title ?? person.teamName}</div>}
      </div>
    </div>
  )
}
