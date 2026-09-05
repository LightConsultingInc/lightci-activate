"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import * as Icons from "lucide-react"
import { ActivateLockup } from "@/components/brand/logo"
import { RungBadge } from "@/components/brand/rung"
import { useMe } from "@/hooks/use-me"
import { navFor } from "@/components/shell/nav"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail,
} from "@/components/ui/sidebar"
import { UserMenu } from "./user-menu"

type IconName = keyof typeof Icons
function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons[name as IconName] ?? Icons.Circle) as React.ComponentType<{ className?: string }>
  return <C className={className} />
}

export function AppSidebar() {
  const me = useMe()
  const pathname = usePathname()
  const groups = navFor(me)
  return (
    <Sidebar collapsible="icon" data-testid="app-sidebar">
      <SidebarHeader className="px-3 py-3">
        <Link href="/" className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <ActivateLockup compact={false} className="group-data-[collapsible=icon]:hidden" />
          <ActivateLockup compact className="hidden group-data-[collapsible=icon]:flex" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel className="eyebrow">{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => {
                  const active = item.match === "exact" ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/")
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton render={<Link href={item.href} data-testid={item.testId} />} isActive={active} tooltip={item.label}>
                        <Icon name={item.icon} className="size-4" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="gap-2 p-2">
        {me.user && (
          <div className="px-2 group-data-[collapsible=icon]:hidden">
            <RungBadge rung={me.user.rung} />
          </div>
        )}
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
