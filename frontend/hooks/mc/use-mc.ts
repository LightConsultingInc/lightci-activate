"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { LicenseState,
  Adoption, Assignment, Backlog, Cost, CostInput, Escalation, Governance, Groups, GroupsCompare, IntegrationKind, IntegrationSummary,
  Journey, LeadClient, LeadClientDetail, LeadQueue, MarketplaceStatus, McPeople, McSkills, Org, Person, Readout, Setup, Team,
  UpdateStatus, SignInStatus, AdminInviteResult,
} from "./types"

const qs = (params: Record<string, string | number | boolean | null | undefined>) => {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v))
  const s = sp.toString()
  return s ? `?${s}` : ""
}

export type McFilters = { teamId?: string | null; range?: "30d" | "90d" }

// ─────────────── Mission Control ───────────────
export const useAdoption = (f: McFilters) => useQuery({ queryKey: ["mc", "adoption", f], queryFn: () => api.get<Adoption>(`/api/mc/adoption${qs({ teamId: f.teamId, range: f.range ?? "30d" })}`) })
export const useMcPeople = (sort?: string) => useQuery({ queryKey: ["mc", "people", sort], queryFn: () => api.get<McPeople>(`/api/mc/people${qs({ sort })}`) })
export const useJourney = () => useQuery({ queryKey: ["mc", "journey"], queryFn: () => api.get<Journey>("/api/mc/journey") })
export const useGroups = () => useQuery({ queryKey: ["mc", "groups"], queryFn: () => api.get<Groups>("/api/mc/groups") })
export const useGroupsCompare = (a: string | null, b: string | null) =>
  useQuery({ queryKey: ["mc", "groups", "compare", a, b], queryFn: () => api.get<GroupsCompare>(`/api/mc/groups/compare${qs({ a, b })}`), enabled: Boolean(a && b && a !== b) })
export const useMcSkills = () => useQuery({ queryKey: ["mc", "skills"], queryFn: () => api.get<McSkills>("/api/mc/skills") })
export const useGovernance = () => useQuery({ queryKey: ["mc", "governance"], queryFn: () => api.get<Governance>("/api/mc/governance") })
export const useMcBacklog = (teamId?: string | null) => useQuery({ queryKey: ["mc", "backlog", teamId], queryFn: () => api.get<Backlog>(`/api/mc/backlog${qs({ teamId })}`) })
export const useCost = () => useQuery({ queryKey: ["mc", "cost"], queryFn: () => api.get<Cost>("/api/mc/cost") })
export function useSaveCostInputs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (inputs: CostInput) => api.put<CostInput>("/api/mc/cost/inputs", inputs),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mc", "cost"] }),
  })
}
export const useReadouts = () =>
  useQuery({
    queryKey: ["mc", "readouts"],
    queryFn: async () => {
      const r = await api.get<Readout[] | { items: Readout[] } | { readouts: Readout[] }>("/api/mc/readouts")
      if (Array.isArray(r)) return r
      if ("items" in r) return r.items
      return r.readouts
    },
  })
export const useReadout = (id: string | null) => useQuery({ queryKey: ["mc", "readouts", id], queryFn: () => api.get<Readout>(`/api/mc/readouts/${id}`), enabled: Boolean(id) })
export function useGenerateReadout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { scopeType: "org" | "team" | "person"; scopeId?: string; periodStart: string; periodEnd: string }) => api.post<Readout>("/api/mc/readouts", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mc", "readouts"] }),
  })
}

// ─────────────── Company admin ───────────────
export const useOrg = () => useQuery({ queryKey: ["org"], queryFn: () => api.get<Org>("/api/org") })
export function usePatchOrg() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<Pick<Org, "settings" | "seats" | "premiumSeats" | "marketplaceRepo">> & { auditNote?: string }) => api.patch<Org>("/api/org", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org"] })
      qc.invalidateQueries({ queryKey: ["me"] })
    },
  })
}
/** License status; only admins may ask, and only self-hosted installs have one to show. */
export const useUpdates = (enabled: boolean) => useQuery({ queryKey: ["admin", "updates"], queryFn: () => api.get<UpdateStatus>("/api/admin/updates"), enabled, staleTime: 5 * 60_000 })
export const useLicense = (enabled: boolean) => useQuery({ queryKey: ["admin", "license"], queryFn: () => api.get<LicenseState>("/api/admin/license"), enabled, staleTime: 60_000 })
export function useLicenseMutations() {
  const qc = useQueryClient()
  const install = useMutation({ mutationFn: (license: string) => api.post<LicenseState>("/api/admin/license", { license }), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "license"] }) })
  return { install }
}
/** Which WorkOS setup page to open. */
export type SetupIntent = "sso" | "dsync" | "domain_verification"
/** How the company signs in. `fresh` re-asks WorkOS (after returning from its setup pages). */
export const useSignInStatus = (enabled = true, fresh = false) =>
  useQuery({ queryKey: ["org", "sign-in", fresh], queryFn: () => api.get<SignInStatus>(`/api/org/sign-in${fresh ? "?fresh=1" : ""}`), enabled, staleTime: 5 * 60_000 })
export function useSignInMutations() {
  const qc = useQueryClient()
  /** A WorkOS setup link, made at click time; the caller sends the browser straight to it. */
  const setupLink = useMutation({ mutationFn: (intent: SetupIntent) => api.post<{ url: string; intent: SetupIntent }>("/api/org/sign-in/setup-link", { intent }) })
  const inviteAdmin = useMutation({
    mutationFn: (body: { email: string; name?: string }) => api.post<AdminInviteResult>("/api/org/sign-in/admins", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org", "sign-in"] }),
  })
  return { setupLink, inviteAdmin }
}
export const useIntegrations = () => useQuery({ queryKey: ["org", "integrations"], queryFn: () => api.get<IntegrationSummary[]>("/api/org/integrations") })
export function useIntegrationMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["org"] })
    qc.invalidateQueries({ queryKey: ["mc"] })
  }
  const save = useMutation({ mutationFn: ({ kind, secret, config }: { kind: IntegrationKind; secret: string; config?: Record<string, string> }) => api.put<IntegrationSummary>(`/api/org/integrations/${kind}`, { secret, config }), onSuccess: invalidate })
  const verify = useMutation({ mutationFn: (kind: IntegrationKind) => api.post<IntegrationSummary>(`/api/org/integrations/${kind}/verify`), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: (kind: IntegrationKind) => api.delete<void>(`/api/org/integrations/${kind}`), onSuccess: invalidate })
  return { save, verify, remove }
}
export const useTeams = () => useQuery({ queryKey: ["teams"], queryFn: () => api.get<Team[]>("/api/teams") })
export const usePeople = (teamId?: string | null) => useQuery({ queryKey: ["people", teamId], queryFn: () => api.get<Person[]>(`/api/people${qs({ teamId })}`) })
export function useTeamMutations() {
  const qc = useQueryClient()
  const done = () => {
    qc.invalidateQueries({ queryKey: ["teams"] })
    qc.invalidateQueries({ queryKey: ["people"] })
  }
  const create = useMutation({ mutationFn: (body: { name: string; slug?: string; pluginName?: string; rbacGroupId?: string }) => api.post<Team>("/api/teams", body), onSuccess: done })
  const patch = useMutation({ mutationFn: ({ id, ...body }: { id: string; name?: string; championPersonId?: string | null; inProgram?: boolean; pluginName?: string | null; rbacGroupId?: string | null }) => api.patch<Team>(`/api/teams/${id}`, body), onSuccess: done })
  const importGroups = useMutation({ mutationFn: () => api.post<{ groups: number; created: number; linked: number; teams?: Team[] }>("/api/teams/import-groups"), onSuccess: done })
  const patchPerson = useMutation({ mutationFn: ({ id, ...body }: { id: string; teamId?: string | null; roles?: Person["roles"]; title?: string; status?: Person["status"] }) => api.patch<Person>(`/api/people/${id}`, body), onSuccess: done })
  const invite = useMutation({ mutationFn: (body: { email: string; teamId?: string }) => api.post<{ ok: boolean; personId: string; invitation?: "sent" | "failed" | "skipped"; detail?: string }>("/api/auth/invites", body), onSuccess: done })
  return { create, patch, importGroups, patchPerson, invite }
}
export const useSetup = () => useQuery({ queryKey: ["org", "setup"], queryFn: () => api.get<Setup>("/api/org/setup") })
export const useMarketplaceStatus = () => useQuery({ queryKey: ["marketplace", "status"], queryFn: () => api.get<MarketplaceStatus>("/api/marketplace/status") })
export const useAssignments = () => useQuery({ queryKey: ["assignments"], queryFn: () => api.get<Assignment[]>("/api/assignments") })
export function useMarketplaceMutations() {
  const qc = useQueryClient()
  const sync = useMutation({
    mutationFn: () => api.post<MarketplaceStatus | { ok: boolean }>("/api/marketplace/sync"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketplace"] })
      qc.invalidateQueries({ queryKey: ["assignments"] })
      qc.invalidateQueries({ queryKey: ["org", "setup"] })
    },
  })
  const assign = useMutation({
    mutationFn: (body: { plugin: string; teamId: string; intendedMode: Assignment["intendedMode"] }) => api.put<Assignment>("/api/assignments", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assignments"] }),
  })
  return { sync, assign }
}

// ─────────────── LightCI lead ───────────────
export const useLeadQueue = () => useQuery({ queryKey: ["lead", "queue"], queryFn: () => api.get<LeadQueue>("/api/lead/queue"), refetchInterval: 60_000 })
export const useLeadClients = () => useQuery({ queryKey: ["lead", "clients"], queryFn: () => api.get<LeadClient[]>("/api/lead/clients") })
export const useLeadSignIn = (id: string) => useQuery({ queryKey: ["lead", "clients", id, "sign-in"], queryFn: () => api.get<SignInStatus>(`/api/lead/clients/${id}/sign-in`) })
export const useLeadClient = (id: string) => useQuery({ queryKey: ["lead", "clients", id], queryFn: () => api.get<LeadClientDetail>(`/api/lead/clients/${id}`) })
export function useLeadMutations() {
  const qc = useQueryClient()
  const done = () => qc.invalidateQueries({ queryKey: ["lead"] })
  const provision = useMutation({
    mutationFn: (body: { name: string; slug: string; emailDomains?: string; createIdentityOrganization?: boolean; workosOrganizationId?: string; industry?: string; sponsorName?: string; seats: number }) =>
      api.post<Org>("/api/lead/clients", body),
    onSuccess: done,
  })
  /** One-time Admin Portal link so the client's IT admin connects SSO or their directory themselves. */
  const portalLink = useMutation({
    mutationFn: ({ id, intent }: { id: string; intent: "sso" | "dsync" }) => api.post<{ url: string; intent: "sso" | "dsync" }>(`/api/lead/clients/${id}/portal-link`, { intent, returnUrl: window.location.origin }),
  })
  /** Pre-create a client admin and have WorkOS email them the invitation; they connect sign-in themselves. */
  const inviteAdmin = useMutation({
    mutationFn: ({ id, email, name }: { id: string; email: string; name?: string }) => api.post<AdminInviteResult>(`/api/lead/clients/${id}/admins`, { email, name }),
    onSuccess: done,
  })
  const resolve = useMutation({ mutationFn: ({ id, resolution }: { id: string; resolution: string }) => api.post<Escalation>(`/api/escalations/${id}/resolve`, { resolution }), onSuccess: done })
  const assign = useMutation({ mutationFn: ({ id, personId }: { id: string; personId: string }) => api.post<Escalation>(`/api/escalations/${id}/assign`, { personId }), onSuccess: done })
  return { provision, portalLink, inviteAdmin, resolve, assign }
}
