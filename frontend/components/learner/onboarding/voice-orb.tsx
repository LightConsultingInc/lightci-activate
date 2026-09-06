"use client"

import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/learner/use-reduced-motion"

export type OrbState = "idle" | "connecting" | "listening" | "speaking" | "muted" | "ended" | "error"

const LABELS: Record<OrbState, string> = {
  idle: "Voice idle",
  connecting: "Connecting to the interviewer",
  listening: "Listening",
  speaking: "The interviewer is speaking",
  muted: "Microphone muted",
  ended: "Call ended",
  error: "Voice connection problem",
}

/**
 * The interviewer's presence: an amber `glow` orb on ink. Breathes while listening (faster while the
 * person is speaking), ripples while the interviewer speaks, dims when muted, and under reduced
 * motion stays still with a static glow ring.
 */
export function VoiceOrb({ state, userSpeaking = false, size = 176, className }: { state: OrbState; userSpeaking?: boolean; size?: number; className?: string }) {
  const reduced = useReducedMotion()
  const live = state === "listening" || state === "speaking"
  const dim = state === "muted" || state === "ended" || state === "idle"
  const breathe = !reduced && (state === "listening" || state === "connecting")
  const ripple = !reduced && state === "speaking"

  return (
    <div
      className={cn("relative grid place-items-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={LABELS[state]}
      data-testid="voice-orb"
      data-state={state}
      data-user-speaking={userSpeaking || undefined}
    >
      {/* Halo */}
      <div
        aria-hidden
        className="absolute inset-[6%] rounded-full bg-glow blur-2xl transition-opacity duration-700"
        style={{ opacity: state === "error" ? 0.15 : dim ? 0.18 : state === "speaking" ? 0.6 : 0.42 }}
      />

      {/* Ripples while the interviewer speaks */}
      {ripple &&
        [0, 1, 2].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute inset-[18%] rounded-full border border-glow/70"
            initial={{ scale: 1, opacity: 0 }}
            animate={{ scale: [1, 1.75], opacity: [0.6, 0] }}
            transition={{ duration: 1.9, repeat: Infinity, delay: i * 0.63, ease: "easeOut" }}
          />
        ))}

      {/* Static ring: reduced motion, or a quiet outline while live */}
      {((reduced && live) || state === "muted") && (
        <span aria-hidden className={cn("absolute inset-[10%] rounded-full ring-2 transition-colors", state === "muted" ? "ring-paper/20" : "ring-glow/60")} />
      )}
      {reduced && state === "speaking" && <span aria-hidden className="absolute inset-[4%] rounded-full ring-1 ring-glow/35" />}

      {/* Connecting: a slow dashed arc */}
      {state === "connecting" && !reduced && (
        <motion.span
          aria-hidden
          className="absolute inset-[8%] rounded-full border-2 border-dashed border-glow/50"
          animate={{ rotate: 360 }}
          transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
        />
      )}
      {state === "connecting" && reduced && <span aria-hidden className="absolute inset-[8%] rounded-full border-2 border-dashed border-glow/50" />}

      {/* Error ring */}
      {state === "error" && <span aria-hidden className="absolute inset-[10%] rounded-full ring-2 ring-fail/70" />}

      {/* Core */}
      <motion.div
        aria-hidden
        className={cn("relative rounded-full transition-[filter,opacity] duration-500", state === "muted" && "opacity-60 saturate-50", state === "ended" && "opacity-45 saturate-[0.35]", state === "error" && "opacity-70 saturate-50", state === "idle" && "opacity-55")}
        style={{
          width: "62%",
          height: "62%",
          background: "radial-gradient(circle at 34% 30%, color-mix(in oklch, var(--glow) 55%, white) 0%, var(--glow) 42%, color-mix(in oklch, var(--glow) 55%, var(--glow-foreground)) 78%, var(--glow-foreground) 108%)",
          boxShadow: live ? "0 0 70px -10px var(--glow), inset 0 -18px 30px -18px color-mix(in oklch, var(--glow-foreground) 70%, transparent)" : "0 0 36px -14px var(--glow), inset 0 -18px 30px -18px color-mix(in oklch, var(--glow-foreground) 70%, transparent)",
        }}
        animate={breathe ? { scale: userSpeaking ? [1, 1.1, 1] : [1, 1.05, 1] } : { scale: 1 }}
        transition={breathe ? { duration: userSpeaking ? 1.3 : 3.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Highlight */}
        <span className="absolute left-[22%] top-[16%] h-[18%] w-[26%] rounded-full bg-white/35 blur-[6px]" />
      </motion.div>
    </div>
  )
}
