"use client"

import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { ArrowUpRight } from "lucide-react"
import { RungBadge, rungMeta } from "@/components/brand/rung"
import { Grain } from "@/components/brand/grain"
import { useReducedMotion } from "@/hooks/learner/use-reduced-motion"

/** One-time, tasteful. Shown once per rung per browser (sessionStorage) so a refresh doesn't replay it. */
export function PromotionCelebration({ newRung }: { newRung: number }) {
  const reduced = useReducedMotion()
  const key = `activate:promo:${newRung}`
  // Rendered only after a client-side submit, so reading sessionStorage in the initializer is hydration-safe.
  const [show] = useState(() => typeof window !== "undefined" && !window.sessionStorage.getItem(key))
  useEffect(() => {
    if (show) window.sessionStorage.setItem(key, "1")
  }, [show, key])
  if (!show) return null
  const m = rungMeta(newRung)
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-xl bg-ink p-5 text-paper glow-ring"
      data-testid="promotion-celebration"
    >
      <Grain opacity={0.14} />
      <div className="relative">
        <p className="eyebrow text-paper/60">Moving up</p>
        <h3 className="mt-1 font-display text-2xl font-medium">
          You are now <span className="text-glow">{m.code} {m.name}</span>
        </h3>
        <p className="mt-1 text-sm text-paper/70">{m.short}. Earned on your own real work.</p>
        <div className="mt-3 flex items-center gap-2">
          <RungBadge rung={newRung} className="border-glow/60 text-paper" />
          <ArrowUpRight className="size-4 text-glow" />
        </div>
      </div>
    </motion.div>
  )
}
