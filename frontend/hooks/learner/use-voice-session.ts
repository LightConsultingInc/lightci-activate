"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ApiError } from "@/lib/api"
import type { RealtimeSession, VoiceTranscriptTurn } from "./types"

export type VoiceStatus =
  "idle" | "connecting" | "listening" | "speaking" | "ended" | "error"
export type VoiceErrorKind = "unavailable" | "media" | "connection"
export type VoiceError = { kind: VoiceErrorKind; message: string }
export type VoiceTurn = {
  role: "user" | "interviewer"
  content: string
  at: string
}
export type StartResult =
  { ok: true } | { ok: false; kind: VoiceErrorKind; message: string }
/** Who ended the call: the agent (via `finish_interview`) or the person (End call). */
export type FinishReason = "agent" | "user"

type Options = {
  /** Mints an ephemeral Realtime session. Should reject with `ApiError(501)` when voice is not configured. */
  getSession: () => Promise<RealtimeSession>
  /** Persists spoken turns (POST /interviews/:id/voice-transcript). Rejections are retried on the next flush. */
  postTurns: (turns: VoiceTranscriptTurn[]) => Promise<unknown>
  /** Runs after the goodbye has played and the transcript is flushed; the caller completes the interview. */
  onFinish: (reason: FinishReason) => Promise<void> | void
  /** At most one transcript request per this many ms while live. */
  throttleMs?: number
  /** Longest we wait for the agent's goodbye after `finish_interview`. */
  goodbyeMs?: number
}

type RealtimeEvent = {
  type?: string
  transcript?: string
  delta?: string
  name?: string
  call_id?: string
  arguments?: string
  response_id?: string
  item?: { type?: string; name?: string; call_id?: string }
  response?: { id?: string }
  error?: { message?: string }
}

type FinishState = {
  active: boolean
  callResponseId: string | null
  spoke: boolean
  /** Goodbye text is complete (or there was none); only its audio may still be playing. */
  awaitingAudioStop: boolean
  maxTimer: ReturnType<typeof setTimeout> | null
  audioTimer: ReturnType<typeof setTimeout> | null
}

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls"
const DEFAULT_FINISH_TOOL = "finish_interview"

const freshFinish = (): FinishState => ({
  active: false,
  callResponseId: null,
  spoke: false,
  awaitingAudioStop: false,
  maxTimer: null,
  audioTimer: null,
})

function mediaErrorMessage(e: unknown) {
  const name = e instanceof Error ? e.name : ""
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Microphone permission was denied"
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No microphone was found"
  if (name === "NotReadableError")
    return "The microphone is in use by another app"
  return "Couldn't open the microphone"
}

/**
 * OpenAI Realtime over WebRTC: the Realtime agent IS the interviewer ("one brain").
 *
 * Handshake (verified): mic track + `oai-events` data channel → SDP offer POSTed to /v1/realtime/calls
 * with the ephemeral client secret → SDP answer. On open we `session.update` to enable input
 * transcription and `response.create` so the agent greets first.
 *
 * Transcript: `conversation.item.input_audio_transcription.completed` (user) and
 * `response.output_audio_transcript.done` (interviewer) become turns; turns are posted with
 * `postTurns` at most once per `throttleMs`, on `flush()`, and before finishing. Only unsent
 * turns are sent (index tracked); `acked` marks how many the server has confirmed.
 *
 * Ending: when the agent calls the `finish_interview` tool we answer `{"ok":true}` and ask for a
 * response so it can say goodbye, wait for that goodbye (or `goodbyeMs`), flush, close, then `onFinish`.
 */
export function useVoiceSession({
  getSession,
  postTurns,
  onFinish,
  throttleMs = 4_000,
  goodbyeMs = 6_000,
}: Options) {
  const [status, setStatus] = useState<VoiceStatus>("idle")
  const [error, setError] = useState<VoiceError | null>(null)
  const [muted, setMuted] = useState(false)
  const [userSpeaking, setUserSpeaking] = useState(false)
  /** The interviewer's current (or last finished) sentence; stays until the next response starts. */
  const [caption, setCaption] = useState("")
  /** The person's last transcribed utterance. */
  const [lastUserUtterance, setLastUserUtterance] = useState("")
  const captionResponse = useRef<string | null>(null)
  const [turns, setTurns] = useState<VoiceTurn[]>([])
  const [acked, setAcked] = useState(0)
  const [finishing, setFinishing] = useState(false)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const micRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const turnsRef = useRef<VoiceTurn[]>([])
  const sentRef = useRef(0)
  const lastSentAt = useRef(0)
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflight = useRef<Promise<void> | null>(null)

  const closingRef = useRef(false)
  const finalizedRef = useRef(false)
  const speakingRef = useRef(false)
  const startSeq = useRef(0)
  const finishToolRef = useRef(DEFAULT_FINISH_TOOL)
  const handledCalls = useRef(new Set<string>())
  const fin = useRef<FinishState>(freshFinish())

  const opts = useRef({ getSession, postTurns, onFinish })
  useEffect(() => {
    opts.current = { getSession, postTurns, onFinish }
  }, [getSession, postTurns, onFinish])

  // ─────────────────────────── transcript plumbing ───────────────────────────
  const flush = useCallback(async () => {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current)
      flushTimer.current = null
    }
    while (inflight.current) await inflight.current
    const from = sentRef.current
    const to = turnsRef.current.length
    if (to <= from) return
    sentRef.current = to
    lastSentAt.current = Date.now()
    const batch = turnsRef.current
      .slice(from, to)
      .map(({ role, content }) => ({ role, content }))
    const p = opts.current.postTurns(batch).then(
      () => setAcked((a) => Math.max(a, to)),
      () => {
        // Roll back so these turns go out with the next flush.
        sentRef.current = from
      }
    )
    inflight.current = p
    try {
      await p
    } finally {
      if (inflight.current === p) inflight.current = null
    }
  }, [])

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) return
    const wait = Math.max(0, throttleMs - (Date.now() - lastSentAt.current))
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null
      void flush()
    }, wait)
  }, [flush, throttleMs])

  const pushTurn = useCallback(
    (role: VoiceTurn["role"], content: string) => {
      const turn: VoiceTurn = { role, content, at: new Date().toISOString() }
      turnsRef.current = [...turnsRef.current, turn]
      setTurns(turnsRef.current)
      scheduleFlush()
    },
    [scheduleFlush]
  )

  // ─────────────────────────── connection lifecycle ───────────────────────────
  const clearFinishTimers = () => {
    if (fin.current.maxTimer) clearTimeout(fin.current.maxTimer)
    if (fin.current.audioTimer) clearTimeout(fin.current.audioTimer)
    fin.current.maxTimer = null
    fin.current.audioTimer = null
  }

  const teardown = useCallback(() => {
    closingRef.current = true
    clearFinishTimers()
    fin.current = freshFinish()
    dcRef.current?.close()
    pcRef.current?.getSenders().forEach((s) => s.track?.stop())
    pcRef.current?.close()
    micRef.current?.getTracks().forEach((t) => t.stop())
    if (audioRef.current) {
      audioRef.current.srcObject = null
      audioRef.current.remove()
    }
    dcRef.current = null
    pcRef.current = null
    micRef.current = null
    audioRef.current = null
    speakingRef.current = false
    captionResponse.current = null
    setUserSpeaking(false)
    setMuted(false)
  }, [])

  const send = (msg: unknown) => {
    const dc = dcRef.current
    if (dc && dc.readyState === "open") dc.send(JSON.stringify(msg))
  }

  /** Flush → close → `ended` → hand off to the caller (which completes the interview). */
  const finalize = useCallback(
    async (reason: FinishReason) => {
      if (finalizedRef.current) return
      finalizedRef.current = true
      clearFinishTimers()
      setFinishing(true)
      await flush()
      teardown()
      setStatus("ended")
      try {
        await opts.current.onFinish(reason)
      } finally {
        setFinishing(false)
      }
    },
    [flush, teardown]
  )

  const onFunctionCall = useCallback(
    (
      name: string | undefined,
      callId: string | undefined,
      responseId: string | undefined
    ) => {
      if (
        name !== finishToolRef.current ||
        !callId ||
        handledCalls.current.has(callId)
      )
        return
      handledCalls.current.add(callId)
      // Acknowledge the tool so the agent can say goodbye, then wait for that goodbye (bounded).
      send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify({ ok: true }),
        },
      })
      send({ type: "response.create" })
      fin.current = {
        ...freshFinish(),
        active: true,
        callResponseId: responseId ?? null,
      }
      fin.current.maxTimer = setTimeout(() => void finalize("agent"), goodbyeMs)
      setFinishing(true)
    },
    [finalize, goodbyeMs]
  )

  /** Once the goodbye text is done (or there was none), let its audio finish, then finalize. */
  const finishAfterAudio = useCallback(() => {
    const f = fin.current
    if (!f.active) return
    if (!speakingRef.current) {
      void finalize("agent")
      return
    }
    f.awaitingAudioStop = true
    if (!f.audioTimer)
      f.audioTimer = setTimeout(() => void finalize("agent"), 4_000)
  }, [finalize])

  const handleEvent = useCallback(
    (raw: string) => {
      let ev: RealtimeEvent
      try {
        ev = JSON.parse(raw) as RealtimeEvent
      } catch {
        return
      }
      const f = fin.current
      switch (ev.type) {
        case "input_audio_buffer.speech_started":
          // The person talking over the agent interrupts it (server VAD clears the output buffer).
          setUserSpeaking(true)
          setStatus((s) => (s === "speaking" ? "listening" : s))
          break
        case "input_audio_buffer.speech_stopped":
          setUserSpeaking(false)
          break
        case "output_audio_buffer.started":
          speakingRef.current = true
          setStatus((s) =>
            s === "listening" || s === "speaking" ? "speaking" : s
          )
          break
        case "output_audio_buffer.stopped":
        case "output_audio_buffer.cleared":
          speakingRef.current = false
          setStatus((s) => (s === "speaking" ? "listening" : s))
          if (f.active && f.awaitingAudioStop) void finalize("agent")
          break
        case "response.output_audio_transcript.delta":
        case "response.audio_transcript.delta":
          if (f.active) f.spoke = true
          setStatus((s) => (s === "listening" ? "speaking" : s))
          if (captionResponse.current !== (ev.response_id ?? null)) {
            // A new response: replace the previous sentence rather than appending to it.
            captionResponse.current = ev.response_id ?? null
            setCaption(ev.delta ?? "")
          } else setCaption((c) => c + (ev.delta ?? ""))
          break
        case "conversation.item.input_audio_transcription.completed": {
          const content = (ev.transcript ?? "").trim()
          if (content) {
            setLastUserUtterance(content)
            pushTurn("user", content)
          }
          break
        }
        case "response.output_audio_transcript.done":
        case "response.audio_transcript.done": {
          const content = (ev.transcript ?? "").trim()
          if (content) {
            setCaption(content)
            captionResponse.current = ev.response_id ?? captionResponse.current
            pushTurn("interviewer", content)
          }
          if (f.active) finishAfterAudio()
          break
        }
        case "response.function_call_arguments.done":
          onFunctionCall(ev.name, ev.call_id, ev.response_id)
          break
        case "response.output_item.done":
          if (ev.item?.type === "function_call")
            onFunctionCall(ev.item.name, ev.item.call_id, ev.response_id)
          break
        case "response.done":
          // The goodbye response finished. If the agent had nothing more to say, don't wait for it.
          if (
            f.active &&
            ev.response?.id &&
            ev.response.id !== f.callResponseId &&
            !f.spoke
          )
            finishAfterAudio()
          break
        case "error":
          // Realtime `error` events are usually recoverable (e.g. an overlapping response); keep the call up.
          console.warn("[voice] realtime error", ev.error?.message)
          break
      }
    },
    [finalize, finishAfterAudio, onFunctionCall, pushTurn]
  )

  const start = useCallback(async (): Promise<StartResult> => {
    teardown()
    const seq = ++startSeq.current
    closingRef.current = false
    finalizedRef.current = false
    handledCalls.current.clear()
    setError(null)
    setFinishing(false)
    setCaption("")
    setLastUserUtterance("")
    setStatus("connecting")
    const superseded: StartResult = {
      ok: false,
      kind: "connection",
      message: "Superseded",
    }
    const fail = (kind: VoiceErrorKind, message: string): StartResult => {
      if (seq === startSeq.current) {
        teardown()
        setError({ kind, message })
        setStatus("error")
      }
      return { ok: false, kind, message }
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    )
      return fail("media", "This browser can't access a microphone")
    let mic: MediaStream
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      return fail("media", mediaErrorMessage(e))
    }
    if (seq !== startSeq.current) {
      mic.getTracks().forEach((t) => t.stop())
      return superseded
    }
    micRef.current = mic

    // Make sure the server seeds the new session with everything said so far.
    await flush()

    let session: RealtimeSession
    try {
      session = await opts.current.getSession()
    } catch (e) {
      if (e instanceof ApiError)
        return fail(
          e.status === 501 ? "unavailable" : "connection",
          e.detail || e.title || "Couldn't start voice"
        )
      return fail(
        "connection",
        e instanceof Error ? e.message : "Couldn't start voice"
      )
    }
    if (seq !== startSeq.current) return superseded
    finishToolRef.current = session.finishTool || DEFAULT_FINISH_TOOL

    try {
      const pc = new RTCPeerConnection()
      pcRef.current = pc

      const audio = document.createElement("audio")
      audio.autoplay = true
      document.body.appendChild(audio)
      audioRef.current = audio
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0]
      }
      mic.getTracks().forEach((t) => pc.addTrack(t, mic))

      const dc = pc.createDataChannel("oai-events")
      dcRef.current = dc
      dc.addEventListener("message", (e) => handleEvent(String(e.data)))
      dc.addEventListener("open", () => {
        if (seq !== startSeq.current) return
        // User-speech transcription so both sides of the conversation reach the scribe.
        dc.send(
          JSON.stringify({
            type: "session.update",
            session: {
              type: "realtime",
              audio: {
                input: { transcription: { model: "gpt-4o-mini-transcribe" } },
              },
            },
          })
        )
        // The agent opens (greeting + first question, or a resume acknowledgement).
        dc.send(JSON.stringify({ type: "response.create" }))
        setStatus("listening")
      })
      pc.onconnectionstatechange = () => {
        if (closingRef.current || seq !== startSeq.current) return
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected" ||
          pc.connectionState === "closed"
        ) {
          setError({
            kind: "connection",
            message: "The voice connection dropped",
          })
          setStatus("error")
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const url = new URL(REALTIME_CALLS_URL)
      if (session.model) url.searchParams.set("model", session.model)
      const res = await fetch(url, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${session.clientSecret}`,
          "Content-Type": "application/sdp",
        },
      })
      if (!res.ok) throw new Error(`Realtime handshake failed (${res.status})`)
      if (seq !== startSeq.current) return superseded
      await pc.setRemoteDescription({ type: "answer", sdp: await res.text() })
      return { ok: true }
    } catch (e) {
      return fail(
        "connection",
        e instanceof Error ? e.message : "Couldn't connect to voice"
      )
    }
  }, [flush, handleEvent, teardown])

  /** Hang up without finishing (e.g. switching to typing). Resolves once unsent turns are flushed. */
  const stop = useCallback(async () => {
    startSeq.current++
    teardown()
    setFinishing(false)
    setStatus("idle")
    await flush()
  }, [flush, teardown])

  /** The person hung up: flush, close and hand off (the caller decides whether to complete). */
  const endCall = useCallback(() => finalize("user"), [finalize])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m
      micRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next))
      return next
    })
  }, [])

  useEffect(
    () => () => {
      startSeq.current++
      teardown()
      void flush()
    },
    [flush, teardown]
  )

  return {
    status,
    error,
    muted,
    userSpeaking,
    caption,
    lastUserUtterance,
    turns,
    acked,
    finishing,
    start,
    stop,
    endCall,
    toggleMute,
    flush,
  }
}
