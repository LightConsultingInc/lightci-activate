"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { AudioLines, CheckCircle2, Mic, MicOff, SendHorizonal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/shell/empty-state"
import { ApiError } from "@/lib/api"
import { ScribeCard } from "../scribe-card"
import { MarkdownLite } from "../markdown-lite"
import { useCompleteInterview, useInterview, useInterviewTurn, useRealtimeSession, useVoiceTranscript } from "@/hooks/learner/queries"
import { useVoiceSession, type VoiceTurn } from "@/hooks/learner/use-voice-session"
import { cn } from "@/lib/utils"
import type { InterviewComplete, InterviewView } from "@/hooks/learner/types"

type Msg = { role: "interviewer" | "user"; content: string; at: string; pending?: boolean; voice?: boolean }

const OPENERS: Record<InterviewView["mode"], string> = {
  intake: "Tell me about your role and what a normal week looks like. I'm listening for the work you repeat, how long it takes, and where Claude fits today.",
  workflow: "Walk me through this workflow as if I'm covering for you next week: what kicks it off, each step, where you decide something, and what must never leave the firm.",
  champion: "Let's inventory your team's workflows. Which repeated tasks eat the most hours, and which ones would you trust a well-briefed new hire with?",
}

export function IntakeChat({ interviewId, onComplete }: { interviewId: string; onComplete: (r: InterviewComplete) => void }) {
  const q = useInterview(interviewId)
  const turn = useInterviewTurn(interviewId)
  const complete = useCompleteInterview(interviewId)
  const realtime = useRealtimeSession()
  const voiceTranscript = useVoiceTranscript(interviewId)

  const [draft, setDraft] = useState("")
  const [voiceTurns, setVoiceTurns] = useState<Msg[]>([])
  const [voiceOn, setVoiceOn] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const voice = useVoiceSession({
    onTurn: (t: VoiceTurn) => setVoiceTurns((v) => [...v, { ...t, voice: true }]),
    onFlush: (turns) => voiceTranscript.mutate(turns.map((t) => ({ role: t.role, content: t.content })), { onSuccess: () => setVoiceTurns([]) }),
  })

  const messages = useMemo<Msg[]>(() => {
    const t = (q.data?.transcript ?? []).filter((m) => m.role === "interviewer" || m.role === "user") as Msg[]
    const base = t.length ? t : q.data ? [{ role: "interviewer" as const, content: q.data.nextQuestion || OPENERS[q.data.mode], at: new Date(0).toISOString() }] : []
    const all = [...base, ...voiceTurns]
    if (turn.isPending && turn.variables) all.push({ role: "user", content: turn.variables, at: new Date().toISOString(), pending: true })
    return all
  }, [q.data, voiceTurns, turn.isPending, turn.variables])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages.length, voice.partial])

  const send = () => {
    const content = draft.trim()
    if (!content || turn.isPending) return
    setDraft("")
    turn.mutate(content)
  }

  const toggleVoice = async (on: boolean) => {
    setVoiceOn(on)
    if (!on) {
      voice.stop()
      return
    }
    realtime.mutate(interviewId, {
      onSuccess: (session) => voice.start(session),
      onError: (e) => {
        setVoiceOn(false)
        if (e instanceof ApiError && e.status === 501) {
          voice.markUnavailable(e.detail || "Voice is not configured for this workspace")
          toast.message("Voice is not configured for this workspace", { description: "Keep typing; the interviewer works the same way." })
        } else toast.error(e instanceof Error ? e.message : "Couldn't start voice")
      },
    })
  }

  const finish = () => {
    voice.stop()
    complete.mutate(undefined, { onSuccess: onComplete })
  }

  if (q.isPending) return <div className="grid gap-6 lg:grid-cols-[1fr_22rem]"><Skeleton className="h-[32rem]" /><Skeleton className="h-[32rem]" /></div>
  if (q.isError) return <ErrorState title="Couldn't load the interview" detail={q.error.message} retry={() => q.refetch()} />
  const iv = q.data
  const readyToFinish = iv.completeness >= 0.85 || iv.turnCount >= 14
  const voiceUnavailable = voice.status === "unavailable"

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]" data-testid="intake-chat">
      <section className="flex min-h-[32rem] flex-col rounded-xl border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <p className="eyebrow">Interviewer · {iv.mode}</p>
            <p className="text-xs text-muted-foreground">{iv.turnCount} turn{iv.turnCount === 1 ? "" : "s"} · about 15 minutes</p>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="voice-toggle" className={cn("text-xs", voiceUnavailable && "text-muted-foreground")}>
              {voice.status === "live" ? <AudioLines className="size-4 text-glow-foreground animate-glow-pulse" /> : voiceUnavailable ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              {voice.status === "live" ? "Voice live" : voice.status === "connecting" ? "Connecting…" : voiceUnavailable ? "Voice unavailable" : "Voice mode"}
            </Label>
            <Switch id="voice-toggle" checked={voiceOn} onCheckedChange={toggleVoice} disabled={voiceUnavailable || realtime.isPending || voice.status === "connecting"} data-testid="voice-toggle" />
          </div>
        </header>
        {voiceUnavailable && <p className="border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground" data-testid="voice-unavailable">{voice.error}. Keep typing below.</p>}
        {voice.status === "error" && voice.error && <p className="border-b bg-fail-soft px-4 py-2 text-xs text-fail">{voice.error}</p>}

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4" data-testid="chat-transcript">
          {messages.map((m, i) => (
            <div key={`${m.at}-${i}`} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")} data-testid={`chat-${m.role}`}>
              <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm", m.role === "user" ? "rounded-br-md bg-ink text-paper dark:bg-paper dark:text-ink" : "rounded-bl-md bg-glow-soft/70", m.pending && "opacity-60")}>
                {m.role === "interviewer" ? <MarkdownLite text={m.content} className="space-y-2" /> : <p className="whitespace-pre-wrap">{m.content}</p>}
                {m.voice && <span className="mt-1 block text-[10px] opacity-60">voice</span>}
              </div>
            </div>
          ))}
          {turn.isPending && (
            <div className="flex justify-start"><div className="rounded-2xl rounded-bl-md bg-glow-soft/70 px-4 py-2.5 text-sm text-muted-foreground"><span className="animate-glow-pulse">Listening and writing to the scribe…</span></div></div>
          )}
          {voice.partial && (
            <div className="flex justify-start"><div className="max-w-[85%] rounded-2xl rounded-bl-md bg-glow-soft/40 px-4 py-2.5 text-sm text-muted-foreground italic">{voice.partial}</div></div>
          )}
          {voice.speaking === "user" && <p className="text-right text-xs text-muted-foreground animate-glow-pulse">Hearing you…</p>}
        </div>

        <footer className="border-t p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder={voice.status === "live" ? "Speak, or type here" : "Type your answer. Enter to send, Shift+Enter for a new line."}
              className="min-h-11 max-h-40"
              disabled={turn.isPending || complete.isPending}
              data-testid="intake-input"
            />
            <Button size="icon-lg" onClick={send} disabled={!draft.trim() || turn.isPending} aria-label="Send" data-testid="intake-send"><SendHorizonal /></Button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">{readyToFinish ? "The interviewer has enough to place you. Add anything else, or finish." : "Specifics help: minutes per run, how often, which systems."}</p>
            <Button variant={readyToFinish ? "default" : "outline"} size="sm" onClick={finish} disabled={complete.isPending || turn.isPending || iv.turnCount === 0} data-testid="complete-button">
              <CheckCircle2 data-icon="inline-start" /> {complete.isPending ? "Placing you…" : "Finish interview"}
            </Button>
          </div>
        </footer>
      </section>

      <ScribeCard scribe={iv.scribe} mode={iv.mode} completeness={iv.completeness} checkerFlags={iv.checkerFlags} className="lg:sticky lg:top-16 lg:self-start" />
    </div>
  )
}
