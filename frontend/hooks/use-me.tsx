"use client"

import { createContext, useContext } from "react"
import { useQuery } from "@tanstack/react-query"
import { getMe, type Me } from "@/lib/api"

const MeContext = createContext<Me | null>(null)

export function MeProvider({ initial, children }: { initial: Me; children: React.ReactNode }) {
  const { data } = useQuery({ queryKey: ["me"], queryFn: getMe, initialData: initial, staleTime: 60_000 })
  return <MeContext.Provider value={data ?? initial}>{children}</MeContext.Provider>
}

export function useMe(): Me {
  const me = useContext(MeContext)
  if (!me) throw new Error("useMe must be used inside MeProvider")
  return me
}

export function hasRole(me: Me, ...roles: NonNullable<Me["user"]>["roles"]) {
  const r = me.user?.roles ?? []
  if (r.includes("lead")) return true
  if (r.includes("admin") && !roles.includes("lead")) return true
  return roles.some((x) => r.includes(x))
}
