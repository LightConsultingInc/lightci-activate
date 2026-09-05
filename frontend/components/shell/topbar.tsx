"use client"

import { usePathname } from "next/navigation"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { useMe } from "@/hooks/use-me"
import { Badge } from "@/components/ui/badge"

const TITLES: [RegExp, string][] = [
  [/^\/$/, "My Ladder"], [/^\/exercise/, "Exercise"], [/^\/history/, "History"], [/^\/workflows/, "My Workflows"],
  [/^\/library/, "Skill Library"], [/^\/team\/reviews/, "Review Queue"], [/^\/team/, "Team"], [/^\/promotions/, "Promotion Queue"],
  [/^\/mission-control/, "Mission Control"], [/^\/admin/, "Company admin"], [/^\/lead/, "Activation Lead Console"], [/^\/people/, "Person"], [/^\/onboarding/, "Onboarding"],
]

export function Topbar() {
  const pathname = usePathname()
  const me = useMe()
  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? "Activate"
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-1 h-4" />
      <span className="text-sm font-medium" data-testid="topbar-title">{title}</span>
      <div className="ml-auto flex items-center gap-2">
        {me.org?.isDemo && <Badge variant="outline" className="border-glow text-glow-foreground bg-glow-soft">Demo data</Badge>}
        {me.org && <span className="hidden text-xs text-muted-foreground sm:inline" data-testid="topbar-org">{me.org.name}</span>}
      </div>
    </header>
  )
}
