"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { RealtimeSession } from "./types"

export type VoiceStatus = "idle" | "connecting" | "live" | "error" | "unavailable"
export type VoiceTurn = { role: "user" | "interviewer"; content: string; at: string }

type Options = {
  /** Called for each finished transcript (user speech or assistant reply). */
  onTurn: (turn: VoiceTurn) => void
  /** Called with buffered turns every `flushMs` while live, and once on stop. */
  onFlush: (turns: VoiceTurn[]) => void
  flushMs?: number
}

/**
 * OpenAI Realtime over WebRTC. Handshake per platform.openai.com/docs/guides/realtime-webrtc:
 * mic track + `oai-events` data channel → SDP offer POSTed to /v1/realtime/calls with the
 * ephemeral client secret (model lives in the session created server-side) → SDP answer.
 * Transcripts arrive on the data channel as
 * `conversation.item.input_audio_transcription.completed` (user) and
 * `response.output_audio_transcript.done` (assistant).
 */
export function useVoiceSession({ onTurn, onFlush, flushMs = 15_000 }: Options) {
  const [status, setStatus] = useState<VoiceStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState<"user" | "assistant" | null>(null)
  const [partial, setPartial] = useState("")

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const micRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const bufferRef = useRef<VoiceTurn[]>([])
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const onTurnRef = useRef(onTurn)
  const onFlushRef = useRef(onFlush)
  useEffect(() => {
    onTurnRef.current = onTurn
    onFlushRef.current = onFlush
  }, [onTurn, onFlush])

  const flush = useCallback(() => {
    if (bufferRef.current.length === 0) return
    const turns = bufferRef.current
    bufferRef.current = []
    onFlushRef.current(turns)
  }, [])

  const stop = useCallback(() => {
    if (flushTimer.current) clearInterval(flushTimer.current)
    flushTimer.current = null
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
    flush()
    setSpeaking(null)
    setPartial("")
    setStatus((s) => (s === "unavailable" ? s : "idle"))
  }, [flush])

  const handleEvent = useCallback((raw: string) => {
    let ev: { type?: string; transcript?: string; delta?: string; error?: { message?: string } }
    try {
      ev = JSON.parse(raw)
    } catch {
      return
    }
    switch (ev.type) {
      case "input_audio_buffer.speech_started":
        setSpeaking("user")
        break
      case "input_audio_buffer.speech_stopped":
        setSpeaking(null)
        break
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
        setSpeaking("assistant")
        setPartial((p) => p + (ev.delta ?? ""))
        break
      case "conversation.item.input_audio_transcription.completed": {
        const content = (ev.transcript ?? "").trim()
        if (content) {
          const turn: VoiceTurn = { role: "user", content, at: new Date().toISOString() }
          bufferRef.current.push(turn)
          onTurnRef.current(turn)
        }
        break
      }
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done": {
        const content = (ev.transcript ?? "").trim()
        setPartial("")
        setSpeaking(null)
        if (content) {
          const turn: VoiceTurn = { role: "interviewer", content, at: new Date().toISOString() }
          bufferRef.current.push(turn)
          onTurnRef.current(turn)
        }
        break
      }
      case "error":
        setError(ev.error?.message ?? "Realtime error")
        break
    }
  }, [])

  const start = useCallback(
    async (session: RealtimeSession) => {
      setError(null)
      setStatus("connecting")
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

        const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
        micRef.current = mic
        mic.getTracks().forEach((t) => pc.addTrack(t, mic))

        const dc = pc.createDataChannel("oai-events")
        dcRef.current = dc
        dc.addEventListener("message", (e) => handleEvent(String(e.data)))
        dc.addEventListener("open", () => {
          // Ask for user-speech transcription so both sides of the conversation land in the scribe.
          dc.send(
            JSON.stringify({
              type: "session.update",
              session: { type: "realtime", audio: { input: { transcription: { model: "gpt-4o-mini-transcribe" } } } },
            }),
          )
          setStatus("live")
        })
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
            setError("Voice connection dropped")
            setStatus("error")
          }
        }

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        const url = new URL("https://api.openai.com/v1/realtime/calls")
        if (session.model) url.searchParams.set("model", session.model)
        const res = await fetch(url, {
          method: "POST",
          body: offer.sdp,
          headers: { Authorization: `Bearer ${session.clientSecret}`, "Content-Type": "application/sdp" },
        })
        if (!res.ok) throw new Error(`Realtime handshake failed (${res.status})`)
        const answer = { type: "answer" as RTCSdpType, sdp: await res.text() }
        await pc.setRemoteDescription(answer)

        flushTimer.current = setInterval(flush, flushMs)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't start voice")
        setStatus("error")
        stop()
      }
    },
    [flush, flushMs, handleEvent, stop],
  )

  const markUnavailable = useCallback((detail?: string) => {
    setStatus("unavailable")
    setError(detail ?? "Voice is not configured for this workspace")
  }, [])

  useEffect(() => () => stop(), [stop])

  return { status, error, speaking, partial, start, stop, markUnavailable, flush }
}
