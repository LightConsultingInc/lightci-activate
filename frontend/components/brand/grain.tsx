"use client"

import { useId } from "react"
import { cn } from "@/lib/utils"

/** Subtle animated film grain, the LightCI texture. Pointer-transparent; honours reduced motion via CSS. */
export function Grain({ opacity = 0.05, className }: { opacity?: number; className?: string }) {
  const id = useId().replace(/:/g, "")
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} style={{ opacity }} aria-hidden>
      <svg className="animate-grain absolute h-[200%] w-[200%]" style={{ top: "-50%", left: "-50%" }}>
        <filter id={`grain-${id}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${id})`} />
      </svg>
    </div>
  )
}

/** Paper surface: faint grid plus grain, for heroes and empty states. */
export function Paper({ className, children, ...rest }: { className?: string; children?: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("relative overflow-hidden paper-grid", className)} {...rest}>
      <div className="mix-blend-multiply dark:mix-blend-screen">
        <Grain opacity={0.12} />
      </div>
      <div className="relative">{children}</div>
    </div>
  )
}
