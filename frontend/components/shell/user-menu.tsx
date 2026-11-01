"use client"

import { useTheme } from "next-themes"
import { LogOut, Moon, Sun, Building2, Check } from "lucide-react"
import { useMe } from "@/hooks/use-me"
import { fmt } from "@/lib/format"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenuButton } from "@/components/ui/sidebar"

function setOrgCookie(id: string) {
  document.cookie = `activate_org=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 30}`
}

export function UserMenu() {
  const me = useMe()
  const { resolvedTheme, setTheme } = useTheme()
  if (!me.user) return null
  const u = me.user
  const switchOrg = (id: string) => {
    setOrgCookie(id)
    window.location.reload()
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent" data-testid="user-menu" />}>
          <Avatar className="size-8 rounded-lg">
            {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={u.name} />}
            <AvatarFallback className="rounded-lg bg-ink text-paper text-xs">{fmt.initials(u.name)}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{u.name}</span>
            <span className="truncate text-xs text-muted-foreground">{me.org?.name ?? "LightCI"}</span>
          </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="text-sm font-medium">{u.name}</div>
            <div className="text-xs text-muted-foreground">{u.email}</div>
            <div className="mt-1 text-xs text-muted-foreground">{u.roles.join(" · ")}</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {me.orgs.length > 1 && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="eyebrow">Client</DropdownMenuLabel>
              {me.orgs.map((o) => (
                <DropdownMenuItem key={o.id} onClick={() => switchOrg(o.id)} data-testid={`org-switch-${o.slug}`}>
                  <Building2 className="size-4" />
                  <span className="flex-1 truncate">{o.name}</span>
                  {me.org?.id === o.id && <Check className="size-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} data-testid="theme-toggle">
          {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        {/* A full navigation on purpose: the route handler clears cookies and redirects. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <DropdownMenuItem render={<a href="/api/auth/sign-out" data-testid="sign-out" />}>
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
