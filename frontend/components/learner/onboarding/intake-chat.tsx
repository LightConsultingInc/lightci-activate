"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import {
  AudioLines,
  CheckCircle2,
  Keyboard,
  Mic,
  MicOff,
  PhoneOff,
  RotateCcw,
  SendHorizonal,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/shell/empty-state"
import { Grain } from "@/components/brand/grain"
import { ScribeCard } from "../scribe-card"
import { MarkdownLite } from "../markdown-lite"
import {
  keys,
  useCompleteInterview,
  useInterview,
  useInterviewTurn,
  useRealtimeSession,
  useVoiceTranscript,
} from "@/hooks/learner/queries"
import {
  useVoiceSession,
  type FinishReason,
} from "@/hooks/learner/use-voice-session"
import { cn } from "@/lib/utils"
import type {
  InterviewComplete,
  InterviewView,
  VoiceTranscriptTurn,
} from "@/hooks/learner/types"
import { VoiceOrb, type OrbState } from "./voice-orb"

type Msg = {
  role: "interviewer" | "user"
  content: string
  at: string
  pending?: boolean
}
type Mode = "voice" | "chat"
type Fallback = { kind: "unavailable" | "media" | "connection"; message: string }

/** Text-mode opener when the transcript is still empty (voice mode lets the agent open itself). */
const OPENERS: Record<InterviewView["mode"], string> = {
  intake:
    "Tell me about your role and what a normal week looks like. I'm listening for the work you repeat, how long it takes, and where Claude fits today.",
  workflow:
    "Walk me through this workflow as if I'm covering for you next week: what kicks it off, each step, where you decide something, and what must never leave the firm.",
  champion:
    "Let's inventory your team's workflows. Which repeated tasks eat the most hours, and which ones would you trust a well-briefed new hire with?",
}

/**
 * The interview surface. Voice is the default: the Realtime agent is the interviewer and the
 * transcript column shows exactly what was said on both sides. "Prefer to type" hands the same
 * interview to the text interviewer (Claude), and back again; both modes share one transcript
 * and one scribe.
 */
export function IntakeChat({
  interviewId,
  onComplete,
}: {
  interviewId: string
  onComplete: (r: InterviewComplete) => void
}) {
  const qc = useQueryClient()
  const q = useInterview(interviewId)
  const turn = useInterviewTurn(interviewId)
  const complete = useCompleteInterview(interviewId)
  const realtime = useRealtimeSession()
  const voiceTranscript = useVoiceTranscript(interviewId)

  // `?mode=chat` starts in typing mode (used by tests and by people who know they cannot talk right now).
  const searchParams = useSearchParams()
  const preferChat = searchParams.get("mode") === "chat"
  const [mode, setMode] = useState<Mode>(preferChat ? "chat" : "voice")
  const [fallback, setFallback] = useState<Fallback | null>(null)
  const [switching, setSwitching] = useState(false)
  const [draft, setDraft] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoStarted = useRef(false)
  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  const { mutateAsync: mintSession } = realtime
  const { mutateAsync: postTranscript } = voiceTranscript
  const { mutateAsync: completeAsync } = complete

  const getSession = useCallback(
    () => mintSession(interviewId),
    [mintSession, interviewId]
  )
  const postTurns = useCallback(
    (turns: VoiceTranscriptTurn[]) => postTranscript(turns),
    [postTranscript]
  )
  const onFinish = useCallback(
    async (reason: FinishReason) => {
      const spoken =
        qc.getQueryData<InterviewView>(keys.interview(interviewId))
          ?.turnCount ?? 0
      if (reason === "user" && spoken === 0) {
        // Nothing was said; drop back to typing rather than placing on an empty interview.
        setMode("chat")
        return
      }
      try {
        onCompleteRef.current(await completeAsync())
      } catch {
        // Toasted by the mutation; let the person finish from chat.
        setMode("chat")
      }
    },
    [qc, interviewId, completeAsync]
  )

  const voice = useVoiceSession({ getSession, postTurns, onFinish })
  const { start: startSession, stop: stopSession, flush: flushVoice } = voice

  /** Connect; a 501 (voice not configured) or a microphone failure falls back to typing. */
  const connectVoice = useCallback(async () => {
    const r = await startSession()
    if (!r.ok && (r.kind === "unavailable" || r.kind === "media")) {
      setFallback({ kind: r.kind, message: r.message })
      setMode("chat")
    }
  }, [startSession])

  const startVoice = () => {
    setFallback(null)
    setMode("voice")
    void connectVoice()
  }

  const toChat = useCallback(async () => {
    setSwitching(true)
    try {
      await stopSession()
    } finally {
      setMode("chat")
      setSwitching(false)
    }
  }, [stopSession])

  // Voice by default, as soon as the interview is loaded and still open.
  useEffect(() => {
    if (!q.data || q.data.status !== "active" || autoStarted.current || preferChat) return
    autoStarted.current = true
    void connectVoice()
  }, [q.data, connectVoice, preferChat])

  // A connection that never reaches "listening" (or drops) falls back to typing with a note, so
  // nobody is stuck watching an orb. "Switch to voice" retries.
  useEffect(() => {
    if (mode !== "voice") return
    if (voice.status === "error") {
      setFallback({ kind: "connection", message: voice.error?.message ?? "The voice connection dropped." })
      setMode("chat")
      return
    }
    if (voice.status !== "connecting") return
    const t = setTimeout(() => {
      void stopSession()
      setFallback({ kind: "connection", message: "Voice took too long to connect." })
      setMode("chat")
    }, 12_000)
    return () => clearTimeout(t)
  }, [mode, voice.status, voice.error, stopSession])

  const localTurns = useMemo(
    () => voice.turns.slice(voice.acked),
    [voice.turns, voice.acked]
  )

  const messages = useMemo<Msg[]>(() => {
    const server = (q.data?.transcript ?? []).filter(
      (m): m is Msg => m.role === "interviewer" || m.role === "user"
    )
    const all: Msg[] = [...server, ...localTurns]
    if (all.length === 0 && mode === "chat" && q.data)
      all.push({
        role: "interviewer",
        content: q.data.nextQuestion || OPENERS[q.data.mode],
        at: new Date(0).toISOString(),
      })
    if (turn.isPending && turn.variables)
      all.push({
        role: "user",
        content: turn.variables,
        at: new Date().toISOString(),
        pending: true,
      })
    return all
  }, [q.data, localTurns, mode, turn.isPending, turn.variables])

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages.length])

  const send = () => {
    const content = draft.trim()
    if (!content || turn.isPending) return
    setDraft("")
    turn.mutate(content)
  }

  const finishFromChat = async () => {
    await stopSession()
    await flushVoice()
    complete.mutate(undefined, { onSuccess: (r) => onCompleteRef.current(r) })
  }

  if (q.isPending)
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Skeleton className="h-[32rem]" />
        <Skeleton className="h-[32rem]" />
      </div>
    )
  if (q.isError)
    return (
      <ErrorState
        title="Couldn't load the interview"
        detail={q.error.message}
        retry={() => q.refetch()}
      />
    )
  const iv = q.data
  const readyToFinish = iv.completeness >= 0.85 || iv.turnCount >= 14
  const inVoice = mode === "voice" && iv.status === "active"
  const live = voice.status === "listening" || voice.status === "speaking"
  const placing = complete.isPending
  const orbState: OrbState =
    voice.status === "connecting"
      ? "connecting"
      : voice.status === "error"
        ? "error"
        : voice.status === "ended"
          ? "ended"
          : voice.status === "idle"
            ? "idle"
            : voice.muted
              ? "muted"
              : voice.status

  const voiceLabel =
    inVoice && voice.status === "connecting"
      ? "Connecting…"
      : inVoice && live
        ? voice.finishing
          ? "Voice live · wrapping up"
          : "Voice live"
        : inVoice && voice.status === "ended"
          ? "Call ended"
          : inVoice && voice.status === "error"
            ? "Voice interrupted"
            : "Voice mode"

  return (
    <div
      className="grid gap-6 lg:grid-cols-[1fr_22rem]"
      data-testid="intake-chat"
      data-mode={mode}
    >
      <section className="flex min-h-[32rem] flex-col overflow-hidden rounded-xl border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <p className="eyebrow">Interviewer · {iv.mode}</p>
            <p className="text-xs text-muted-foreground">
              {iv.turnCount} turn{iv.turnCount === 1 ? "" : "s"} · about 15
              minutes
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Label
              htmlFor="voice-toggle"
              className={cn(
                "text-xs font-normal",
                inVoice && live ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {inVoice && live ? (
                <AudioLines className="size-4 animate-glow-pulse text-glow-foreground" />
              ) : inVoice && voice.status === "connecting" ? (
                <AudioLines className="size-4 animate-glow-pulse" />
              ) : fallback ? (
                <MicOff className="size-4" />
              ) : (
                <Mic className="size-4" />
              )}
              {voiceLabel}
            </Label>
            <Button
              id="voice-toggle"
              variant={inVoice ? "ghost" : "outline"}
              size="sm"
              onClick={() => (inVoice ? void toChat() : startVoice())}
              disabled={
                switching ||
                placing ||
                voice.finishing ||
                iv.status !== "active"
              }
              aria-pressed={inVoice}
              data-checked={inVoice ? "" : undefined}
              data-testid="voice-toggle"
            >
              {inVoice ? (
                <>
                  <Keyboard data-icon="inline-start" /> Prefer to type
                </>
              ) : (
                <>
                  <Mic data-icon="inline-start" /> Switch to voice
                </>
              )}
            </Button>
          </div>
        </header>

        {!inVoice && fallback?.kind === "unavailable" && (
          <p
            className="border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground"
            data-testid="voice-unavailable"
          >
            Voice isn&apos;t configured for this workspace, so we&apos;ll type.
            The interviewer works the same way.
          </p>
        )}
        {!inVoice && fallback?.kind === "media" && (
          <p className="border-b bg-fail-soft px-4 py-2 text-xs text-fail">
            {fallback.message}. Typing works the same way, or switch to voice
            once the microphone is available.
          </p>
        )}

        {inVoice && (
          <div className="relative flex-1 overflow-hidden bg-ink text-paper">
            <Grain opacity={0.08} />
            <div className="relative flex h-full flex-col items-center px-6 pt-8 pb-6">
              <VoiceOrb state={orbState} userSpeaking={voice.userSpeaking} />
              <p className="mt-4 eyebrow text-paper/60">
                {placing
                  ? "Placing you…"
                  : voice.finishing
                    ? "Wrapping up"
                    : voice.status === "connecting"
                      ? "Connecting to the interviewer"
                      : voice.status === "error"
                        ? "Voice was interrupted"
                        : voice.status === "ended"
                          ? "Call ended"
                          : voice.muted
                            ? "Muted"
                            : voice.status === "speaking"
                              ? "The interviewer is speaking"
                              : voice.userSpeaking
                                ? "Hearing you"
                                : "Listening"}
              </p>
              <p className="mt-1 text-xs text-paper/60">
                {placing
                  ? "Reading the transcript and choosing your first exercise."
                  : voice.finishing
                    ? "The interviewer is saying goodbye; your placement follows."
                    : voice.status === "connecting"
                      ? "Allow the microphone if your browser asks."
                      : voice.status === "error"
                        ? (voice.error?.message ?? "The connection dropped.")
                        : voice.status === "ended"
                          ? "Thanks for talking it through."
                          : voice.muted
                            ? "Unmute when you're ready to continue."
                            : "Speak naturally; the scribe on the right writes as you go."}
              </p>

              {/* One live caption: the sentence being spoken now (deltas appended), kept until the next response. */}
              <div className="mt-4 flex min-h-[7.5rem] w-full max-w-2xl flex-col items-center justify-start text-center">
                <p
                  className="font-display text-2xl leading-snug font-medium text-paper md:text-[1.75rem]"
                  aria-live="polite"
                  data-testid="voice-caption"
                >
                  {voice.caption ||
                    (voice.status === "connecting" ? (
                      <span className="text-paper/40">
                        The interviewer will open the conversation in a moment.
                      </span>
                    ) : voice.status === "error" ? (
                      <span className="text-paper/40">
                        Nothing to say until we reconnect.
                      </span>
                    ) : (
                      <span className="text-paper/40">…</span>
                    ))}
                </p>
                {voice.lastUserUtterance && (
                  <p
                    className="mt-3 max-w-xl text-sm text-paper/55"
                    data-testid="voice-you-said"
                  >
                    <span className="eyebrow text-paper/40">You said</span>{" "}
                    <span className="italic">“{voice.lastUserUtterance}”</span>
                  </p>
                )}
              </div>

              <div className="mt-5 flex items-center gap-2">
                {voice.status === "error" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-paper/25 bg-paper/5 text-paper hover:bg-paper/15 hover:text-paper"
                    onClick={startVoice}
                    disabled={realtime.isPending}
                    data-testid="voice-retry"
                  >
                    <RotateCcw data-icon="inline-start" /> Try again
                  </Button>
                ) : live ? (
                  <>
                    <Button
                      variant="outline"
                      size="icon-lg"
                      className={cn(
                        "rounded-full border-paper/25 bg-paper/5 text-paper hover:bg-paper/15 hover:text-paper",
                        voice.muted &&
                          "bg-paper text-ink hover:bg-paper/90 hover:text-ink"
                      )}
                      onClick={voice.toggleMute}
                      aria-pressed={voice.muted}
                      aria-label={
                        voice.muted ? "Unmute microphone" : "Mute microphone"
                      }
                      disabled={voice.finishing}
                      data-testid="voice-mute"
                    >
                      {voice.muted ? <MicOff /> : <Mic />}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-lg"
                      className="rounded-full border-fail/50 bg-fail/20 text-paper hover:bg-fail/40 hover:text-paper"
                      onClick={() => void voice.endCall()}
                      aria-label="End call and finish the interview"
                      title="End call"
                      disabled={voice.finishing}
                      data-testid="voice-end"
                    >
                      <PhoneOff />
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {!inVoice && (
          <div
            ref={scrollRef}
            className="flex-1 space-y-4 overflow-y-auto p-4"
            data-testid="chat-transcript"
          >
            {messages.map((m, i) => (
              <div
                key={`${m.at}-${i}`}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start"
                )}
                data-testid={`chat-${m.role}`}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                    m.role === "user"
                      ? "rounded-br-md bg-ink text-paper dark:bg-paper dark:text-ink"
                      : "rounded-bl-md bg-glow-soft/70",
                    m.pending && "opacity-60"
                  )}
                >
                  {m.role === "interviewer" ? (
                    <MarkdownLite text={m.content} className="space-y-2" />
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}
                </div>
              </div>
            ))}
            {turn.isPending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-glow-soft/70 px-4 py-2.5 text-sm text-muted-foreground">
                  <span className="animate-glow-pulse">
                    Listening and writing to the scribe…
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {iv.checkerFlags.length > 0 && (
          <ul
            className="space-y-1 border-t px-4 py-2 text-[11px] text-muted-foreground"
            data-testid="checker-notes"
          >
            {iv.checkerFlags.slice(0, 3).map((f, i) => (
              <li key={`${f.field}-${i}`} className="flex gap-1.5">
                <Sparkles className="mt-0.5 size-3 shrink-0 text-glow-foreground" />
                <span>
                  The checker wonders about{" "}
                  <span className="font-medium text-foreground">{f.field}</span>
                  : {f.issue}
                </span>
              </li>
            ))}
          </ul>
        )}

        {!inVoice && (
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
                placeholder="Type your answer. Enter to send, Shift+Enter for a new line."
                className="max-h-40 min-h-11"
                disabled={turn.isPending || placing || iv.status !== "active"}
                data-testid="intake-input"
              />
              <Button
                size="icon-lg"
                onClick={send}
                disabled={
                  !draft.trim() || turn.isPending || iv.status !== "active"
                }
                aria-label="Send"
                data-testid="intake-send"
              >
                <SendHorizonal />
              </Button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                {readyToFinish
                  ? "The interviewer has enough to place you. Add anything else, or finish."
                  : "Specifics help: minutes per run, how often, which systems."}
              </p>
              <Button
                variant={readyToFinish ? "default" : "outline"}
                size="sm"
                onClick={() => void finishFromChat()}
                disabled={
                  placing ||
                  turn.isPending ||
                  iv.turnCount === 0 ||
                  iv.status !== "active"
                }
                data-testid="complete-button"
              >
                <CheckCircle2 data-icon="inline-start" />{" "}
                {placing ? "Placing you…" : "Finish interview"}
              </Button>
            </div>
          </footer>
        )}
        {inVoice && (
          <footer className="border-t px-4 py-2 text-[11px] text-muted-foreground">
            {voice.finishing || placing
              ? "Hold on; the interviewer is closing the conversation."
              : readyToFinish
                ? "The interviewer has enough to place you and will wrap up shortly."
                : "The interviewer ends the call when it has what it needs. Hang up any time with the red button."}
          </footer>
        )}
      </section>

      <ScribeCard
        scribe={iv.scribe}
        mode={iv.mode}
        completeness={iv.completeness}
        checkerFlags={iv.checkerFlags}
        className="lg:sticky lg:top-16 lg:self-start"
      />
    </div>
  )
}
