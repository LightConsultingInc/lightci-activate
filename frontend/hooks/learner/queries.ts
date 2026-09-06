"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, ApiError } from "@/lib/api"
import type {
  Artifact, Baseline, ExerciseDetail, ExerciseSummary, HistoryItem, InterviewComplete, InterviewView, LadderView,
  Measurement, MySkills, RealtimeSession, RevisitAnswer, SkillDetail, SubmitResult, VoiceTranscriptTurn, WorkflowDetail, WorkflowSchema, WorkflowSummary,
} from "./types"

export const keys = {
  ladder: ["ladder"] as const,
  mySkills: ["my-skills"] as const,
  exercise: (id: string) => ["exercise", id] as const,
  history: ["history"] as const,
  workflows: ["workflows", "mine"] as const,
  workflow: (id: string) => ["workflow", id] as const,
  interview: (id: string) => ["interview", id] as const,
}

export function errorMessage(e: unknown, fallback = "Something went wrong") {
  if (e instanceof ApiError) return e.detail || e.title || fallback
  if (e instanceof Error) return e.message || fallback
  return fallback
}

// ─────────────────────────── Ladder ───────────────────────────
export const useLadder = () => useQuery({ queryKey: keys.ladder, queryFn: () => api.get<LadderView>("/api/ladder/me") })
export const useMySkills = () => useQuery({ queryKey: keys.mySkills, queryFn: () => api.get<MySkills>("/api/my-skills") })

export function useAnswerRevisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, response }: { id: string; response: string }) => api.post<RevisitAnswer>(`/api/revisits/${id}/answer`, { response }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.ladder }),
    onError: (e) => toast.error(errorMessage(e, "Couldn't grade that answer")),
  })
}

// ─────────────────────────── Exercise ───────────────────────────
export const useExercise = (id: string) =>
  useQuery({ queryKey: keys.exercise(id), queryFn: () => api.get<ExerciseDetail>(`/api/exercises/${id}`) })

export function useStartExercise(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<ExerciseDetail>(`/api/exercises/${id}/start`),
    onSuccess: (data) => qc.setQueryData(keys.exercise(id), data),
  })
}

export function useExpect(id: string) {
  return useMutation({
    mutationFn: (body: { expectationText: string; expectationConfidence: number }) => api.post<{ ok: boolean }>(`/api/exercises/${id}/expect`, body),
    onError: (e) => toast.error(errorMessage(e, "Couldn't save your expectation")),
  })
}

export function useHint(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<{ hint: string; hintsRevealed: number; hintsTotal: number }>(`/api/exercises/${id}/hint`),
    onSuccess: (data) => {
      qc.setQueryData<ExerciseDetail>(keys.exercise(id), (old) =>
        old ? { ...old, hints: old.hints.includes(data.hint) ? old.hints : [...old.hints, data.hint], hintsRevealed: data.hintsRevealed, hintsTotal: data.hintsTotal } : old,
      )
    },
    onError: (e) => toast.error(errorMessage(e, "No hint available")),
  })
}

export function useRunClaude(id: string) {
  return useMutation({
    mutationFn: (body: { prompt: string; context?: string; project?: { instructions: string; files: { name: string; content: string }[] } }) =>
      api.post<{ output: string; model: string; runId: string }>(`/api/exercises/${id}/run`, body),
    onError: (e) => toast.error(errorMessage(e, "Claude couldn't run that")),
  })
}

export function useSubmit(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { expectationText: string; expectationConfidence: number; artifact: Artifact; critiqueText: string; coldAttempt: boolean }) =>
      api.post<SubmitResult>(`/api/exercises/${id}/submit`, body),
    onSuccess: (data) => {
      qc.setQueryData(keys.exercise(id), data.exercise)
      qc.invalidateQueries({ queryKey: keys.ladder })
      qc.invalidateQueries({ queryKey: keys.history })
    },
    onError: (e) => toast.error(errorMessage(e, "Submission failed")),
  })
}

export function useSkipExercise(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { reason: "no_time" | "blocked" | "tool_issue" | "not_relevant"; note?: string }) =>
      api.post<{ ok: boolean; nextUp: ExerciseSummary | null }>(`/api/exercises/${id}/skip`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.ladder })
      qc.invalidateQueries({ queryKey: keys.exercise(id) })
    },
    onError: (e) => toast.error(errorMessage(e, "Couldn't skip")),
  })
}

export function useOpenInClaude(id: string) {
  return useMutation({
    mutationFn: () => api.post<{ prompt: string; contextBundle: string }>(`/api/exercises/${id}/open-in-claude`),
    onError: (e) => toast.error(errorMessage(e, "Couldn't prepare the pack")),
  })
}

// ─────────────────────────── History ───────────────────────────
export const useHistory = () => useQuery({ queryKey: keys.history, queryFn: () => api.get<{ items: HistoryItem[] }>("/api/history") })

// ─────────────────────────── Workflows ───────────────────────────
export const useMyWorkflows = () => useQuery({ queryKey: keys.workflows, queryFn: () => api.get<WorkflowSummary[]>("/api/workflows?mine=true") })
export const useWorkflow = (id: string) => useQuery({ queryKey: keys.workflow(id), queryFn: () => api.get<WorkflowDetail>(`/api/workflows/${id}`) })

export function usePatchWorkflow(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name?: string; schema?: Partial<WorkflowSchema>; status?: string; nextWave?: boolean }) => api.patch<WorkflowDetail>(`/api/workflows/${id}`, body),
    onSuccess: (data) => {
      qc.setQueryData(keys.workflow(id), data)
      qc.invalidateQueries({ queryKey: keys.workflows })
      toast.success("Workflow saved")
    },
    onError: (e) => toast.error(errorMessage(e, "Couldn't save the workflow")),
  })
}

export function useAddMeasurement(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { minutesPerWeek: number; reworkMinutesPerWeek: number; periodStart: string; periodEnd: string; method: "time_diary" | "interview_estimate" }) =>
      api.post<Measurement>(`/api/workflows/${id}/measurements`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.workflow(id) })
      qc.invalidateQueries({ queryKey: keys.workflows })
      qc.invalidateQueries({ queryKey: keys.ladder })
      toast.success("Measurement recorded")
    },
    onError: (e) => toast.error(errorMessage(e, "Couldn't record that measurement")),
  })
}

export function useAddBaseline(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { method: "time_diary" | "interview_estimate"; minutesPerWeek: number; reworkMinutesPerWeek: number }) =>
      api.post<Baseline>(`/api/workflows/${id}/baseline`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.workflow(id) })
      toast.success("Baseline captured")
    },
    onError: (e) => toast.error(errorMessage(e, "Couldn't capture the baseline")),
  })
}

export function useRequestBuild(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<{ skill: SkillDetail }>(`/api/workflows/${id}/build`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.workflow(id) })
      qc.invalidateQueries({ queryKey: keys.workflows })
      qc.invalidateQueries({ queryKey: keys.mySkills })
    },
    onError: (e) => toast.error(errorMessage(e, "Builder couldn't draft a skill")),
  })
}

// ─────────────────────────── Interviews ───────────────────────────
export function useCreateInterview() {
  return useMutation({
    mutationFn: (body: { mode: "intake" | "champion" | "workflow"; workflowMapId?: string; teamId?: string; voice?: boolean }) =>
      api.post<InterviewView>("/api/interviews", body),
    onError: (e) => toast.error(errorMessage(e, "Couldn't start the interview")),
  })
}

export const useInterview = (id: string | null) =>
  useQuery({ queryKey: keys.interview(id ?? "none"), queryFn: () => api.get<InterviewView>(`/api/interviews/${id}`), enabled: Boolean(id) })

export function useInterviewTurn(id: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => api.post<InterviewView>(`/api/interviews/${id}/turns`, { content }),
    onSuccess: (data) => qc.setQueryData(keys.interview(id ?? "none"), data),
    onError: (e) => toast.error(errorMessage(e, "The interviewer didn't hear that")),
  })
}

/**
 * Voice path: append spoken turns; the server re-runs scribe + checker and returns the updated view.
 * `nextQuestion` in this response is not meaningful (the Realtime agent asks its own questions).
 */
export function useVoiceTranscript(id: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (turns: VoiceTranscriptTurn[]) => api.post<InterviewView>(`/api/interviews/${id}/voice-transcript`, { turns }),
    onSuccess: (data) => qc.setQueryData(keys.interview(id ?? "none"), data),
  })
}

export function useCompleteInterview(id: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<InterviewComplete>(`/api/interviews/${id}/complete`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.ladder })
      qc.invalidateQueries({ queryKey: keys.workflows })
      qc.invalidateQueries({ queryKey: ["me"] })
    },
    onError: (e) => toast.error(errorMessage(e, "Couldn't complete the interview")),
  })
}

/** Mint an ephemeral Realtime client secret. 501 means voice is not configured for this workspace. */
export function useRealtimeSession() {
  return useMutation({ mutationFn: (interviewId: string) => api.post<RealtimeSession>("/api/realtime/session", { interviewId }) })
}

export function useConsent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean }>("/api/auth/consent", { accepted: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
    onError: (e) => toast.error(errorMessage(e, "Couldn't record consent")),
  })
}
