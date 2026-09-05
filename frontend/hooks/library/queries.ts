"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type {
  ExerciseSummary, GradeView, LibraryFilters, LibraryResponse, PersonPage, PromotionDetail, PromotionView, Readout,
  ReviewGradeResponse, RubricScore, SkillComment, SkillDetail, TeamView, WorkflowSummary, WorkflowDetailLike,
} from "./types"

export const keys = {
  library: (f: LibraryFilters) => ["library", f] as const,
  skill: (slug: string) => ["skill", slug] as const,
  team: () => ["team"] as const,
  readout: () => ["team", "readout"] as const,
  promotions: (state: "pending" | "all") => ["promotions", state] as const,
  promotion: (id: string) => ["promotion", id] as const,
  person: (id: string) => ["person", id] as const,
}

export function libraryQueryString(f: LibraryFilters) {
  const p = new URLSearchParams()
  for (const k of ["team", "family", "rung", "status", "q", "sort"] as const) {
    const v = f[k]
    if (v) p.set(k, v)
  }
  const s = p.toString()
  return s ? `?${s}` : ""
}

export function useLibrary(filters: LibraryFilters) {
  return useQuery({ queryKey: keys.library(filters), queryFn: () => api.get<LibraryResponse>(`/api/library${libraryQueryString(filters)}`), placeholderData: (prev) => prev })
}

/** Unfiltered top six, used as the "Skills nearby" fallback when a search comes up empty. */
export function useNearbySkills(enabled: boolean) {
  return useQuery({ queryKey: keys.library({ sort: "most_used" }), queryFn: () => api.get<LibraryResponse>("/api/library?sort=most_used"), enabled, select: (d) => d.skills.slice(0, 6) })
}

export function useSkill(slug: string, initial?: SkillDetail) {
  return useQuery({ queryKey: keys.skill(slug), queryFn: () => api.get<SkillDetail>(`/api/skills/${encodeURIComponent(slug)}`), initialData: initial })
}

export function useTeam(initial?: TeamView) {
  return useQuery({ queryKey: keys.team(), queryFn: () => api.get<TeamView>("/api/team"), initialData: initial })
}

export function useTeamReadout(enabled: boolean) {
  return useQuery({ queryKey: keys.readout(), queryFn: () => api.get<Readout>("/api/team/readout"), enabled, staleTime: 5 * 60_000 })
}

export function usePromotions(state: "pending" | "all") {
  return useQuery({ queryKey: keys.promotions(state), queryFn: () => api.get<PromotionView[]>(`/api/promotions?state=${state}`), placeholderData: (prev) => prev })
}

export function usePromotion(id: string) {
  return useQuery({ queryKey: keys.promotion(id), queryFn: () => api.get<PromotionDetail>(`/api/promotions/${id}`) })
}

export function usePersonPage(id: string, enabled = true) {
  return useQuery({ queryKey: keys.person(id), queryFn: () => api.get<PersonPage>(`/api/mc/people/${id}`), enabled })
}

/** Invalidate everything that lists skills after a skill mutation. */
function useInvalidateSkills() {
  const qc = useQueryClient()
  return (slug?: string) => {
    qc.invalidateQueries({ queryKey: ["library"] })
    qc.invalidateQueries({ queryKey: ["team"] })
    if (slug) qc.invalidateQueries({ queryKey: keys.skill(slug) })
  }
}

export function useAdoptSkill() {
  const inv = useInvalidateSkills()
  return useMutation({
    mutationFn: (skill: { id: string; slug: string }) => api.post<{ adoption: unknown; exercise: ExerciseSummary }>(`/api/skills/${skill.id}/adopt`),
    onSuccess: (_d, skill) => inv(skill.slug),
  })
}

export function useForkSkill() {
  const inv = useInvalidateSkills()
  return useMutation({ mutationFn: (skill: { id: string }) => api.post<SkillDetail>(`/api/skills/${skill.id}/fork`), onSuccess: () => inv() })
}

export type CreateSkillInput = { name: string; teamId?: string; triggerLine: string; plugin?: string; skillMd: string; boundary: SkillDetail["boundary"]; sampleCases: SkillDetail["sampleCases"] }

export function useCreateSkill() {
  const inv = useInvalidateSkills()
  return useMutation({ mutationFn: (input: CreateSkillInput) => api.post<SkillDetail>("/api/skills", input), onSuccess: () => inv() })
}

export type PatchSkillInput = Partial<Pick<SkillDetail, "skillMd" | "triggerLine" | "boundary" | "sampleCases" | "name">>

export function usePatchSkill(slug: string) {
  const qc = useQueryClient()
  const inv = useInvalidateSkills()
  return useMutation({
    mutationFn: ({ id, ...patch }: PatchSkillInput & { id: string }) => api.patch<SkillDetail>(`/api/skills/${id}`, patch),
    onSuccess: (d) => { qc.setQueryData(keys.skill(slug), d); inv() },
  })
}

export function useGradeSkill(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<{ grade: GradeView; skill: SkillDetail }>(`/api/skills/${id}/grade`),
    onSuccess: (d) => qc.setQueryData(keys.skill(slug), d.skill),
  })
}

export function useCommentSkill(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => api.post<SkillComment>(`/api/skills/${id}/comments`, { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.skill(slug) }),
  })
}

export function useDeprecateSkill(slug: string) {
  const inv = useInvalidateSkills()
  return useMutation({
    mutationFn: ({ id, successorSkillId }: { id: string; successorSkillId?: string }) => api.post<SkillDetail>(`/api/skills/${id}/deprecate`, successorSkillId ? { successorSkillId } : {}),
    onSuccess: () => inv(slug),
  })
}

export function useRequestPromotion(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<PromotionView>(`/api/skills/${id}/promotion-requests`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.skill(slug) }); qc.invalidateQueries({ queryKey: ["promotions"] }) },
  })
}

export function useDecidePromotion(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ action, note }: { action: "approve" | "send-back"; note?: string }) => api.post<PromotionView>(`/api/promotions/${id}/${action}`, note ? { note } : {}),
    onSuccess: (d) => {
      qc.setQueryData(keys.promotion(id), (prev: PromotionDetail | undefined) => (prev ? { ...prev, ...d } : prev))
      qc.invalidateQueries({ queryKey: ["promotions"] })
      qc.invalidateQueries({ queryKey: ["team"] })
      qc.invalidateQueries({ queryKey: keys.skill(d.skill.slug) })
    },
  })
}

export function useBuildWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (workflowId: string) => api.post<{ skill: SkillDetail }>(`/api/workflows/${workflowId}/build`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team"] }); qc.invalidateQueries({ queryKey: ["library"] }) },
  })
}

export function useMarkNextWave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, nextWave }: { id: string; nextWave: boolean }) => api.patch<WorkflowDetailLike | WorkflowSummary>(`/api/workflows/${id}`, { nextWave }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team"] }),
  })
}

export type ReviewGradeInput = { submissionId: string; rubric: RubricScore[]; feedback: string; decision: "pass" | "revise" }

export function useGradeReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ submissionId, ...body }: ReviewGradeInput) => api.post<ReviewGradeResponse>(`/api/team/reviews/${submissionId}/grade`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team"] }),
  })
}
