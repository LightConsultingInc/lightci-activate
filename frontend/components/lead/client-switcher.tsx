"use client"

import { Building2Icon } from "lucide-react"
import { useMe } from "@/hooks/use-me"
import { useLeadClients } from "@/hooks/mc/use-mc"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/** Switches the org the whole app is scoped to (X-Activate-Org via the activate_org cookie), then reloads. */
export function ClientSwitcher({ className }: { className?: string }) {
  const me = useMe()
  const clients = useLeadClients()
  const options = (clients.data?.map((c) => c.org) ?? me.orgs ?? []).filter((o, i, arr) => arr.findIndex((x) => x.id === o.id) === i)
  // `me.org` already reflects the activate_org cookie (the API scopes /auth/me by X-Activate-Org), so it is
  // safe to render on the server; reading document.cookie here caused a hydration mismatch.
  const current = me.org?.id ?? ""
  const switchTo = (id: string) => {
    if (!id || id === current) return
    document.cookie = `activate_org=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`
    window.location.reload()
  }
  return (
    <div className={className}>
      <Select value={current} onValueChange={(v) => v && switchTo(v as string)}>
        <SelectTrigger size="sm" className="min-w-56" data-testid="client-switcher" aria-label="Switch client">
          <Building2Icon className="size-3.5 text-muted-foreground" />
          <SelectValue>{(v: string) => options.find((o) => o.id === v)?.name ?? me.org?.name ?? "Choose a client"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id} data-testid="client-switcher-option">
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
