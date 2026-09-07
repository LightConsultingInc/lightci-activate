"use client"

/**
 * A sketch of Claude's screen for "where to click" moments in lessons. Static HTML, drawn in the
 * LightCI window style (rounded frame, faint chrome) with Claude's warm palette from the theme tokens.
 * Numbered spots mark the things the lesson talks about; the legend under the picture explains each.
 */
import type { ReactNode } from "react"
import { ArrowUp, ChevronDown, Code, FolderOpen, MessageSquare, Plus, SlidersHorizontal, Users } from "lucide-react"
import { cn } from "@/lib/utils"

/** A numbered marker pinned to the top-right of whatever it wraps. */
export function Spot({ n, children, className, pos = "tr" }: { n: number; children: ReactNode; className?: string; pos?: "tr" | "tl" | "br" | "bl" | "r" }) {
  const at = { tr: "-top-2.5 -right-2.5", tl: "-top-2.5 -left-2.5", br: "-bottom-2.5 -right-2.5", bl: "-bottom-2.5 -left-2.5", r: "top-1/2 -translate-y-1/2 -right-3" }[pos]
  return (
    <div className={cn("relative", className)}>
      {children}
      <span className={cn("absolute z-10 grid size-5 place-items-center rounded-full bg-glow text-[11px] font-semibold text-glow-foreground shadow ring-2 ring-card", at)} data-testid="mock-spot" aria-hidden>
        {n}
      </span>
    </div>
  )
}

/** The browser-ish window around every screen. */
export function Window({ children, url = "claude.ai", className }: { children: ReactNode; url?: string; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border bg-card shadow-[0_18px_50px_-24px_rgba(0,0,0,0.35)]", className)}>
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <span className="size-2.5 rounded-full bg-[#FF5F57]/80" />
        <span className="size-2.5 rounded-full bg-[#FEBC2E]/80" />
        <span className="size-2.5 rounded-full bg-[#28C840]/80" />
        <span className="mx-auto rounded-md bg-background px-3 py-0.5 text-[11px] text-muted-foreground">{url}</span>
        <span className="w-12" />
      </div>
      {children}
    </div>
  )
}

export type NavKey = "chat" | "chats" | "projects" | "code" | "cowork"

/** Claude's left rail, with one entry highlighted. `spots` pins markers on entries. */
export function Sidebar({ active = "chat", spots = {}, projectName }: { active?: NavKey; spots?: Partial<Record<NavKey, number>>; projectName?: string }) {
  const item = (key: NavKey, icon: ReactNode, label: string) => {
    const row = (
      <div className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px]", active === key ? "bg-foreground/[0.06] font-medium" : "text-muted-foreground")}>
        {icon} {label}
      </div>
    )
    return spots[key] ? <Spot key={key} n={spots[key]!} pos="r">{row}</Spot> : <div key={key}>{row}</div>
  }
  return (
    <aside className="hidden w-[168px] shrink-0 flex-col gap-0.5 border-r bg-muted/25 p-2 sm:flex">
      <div className="mb-2 flex items-center gap-1.5 px-2 pt-1 text-[13px] font-semibold text-claude">
        <span className="inline-block size-3 rounded-sm bg-claude" /> Claude
      </div>
      {item("chat", <Plus className="size-3.5" />, "New chat")}
      {item("chats", <MessageSquare className="size-3.5" />, "Chats")}
      {item("projects", <FolderOpen className="size-3.5" />, "Projects")}
      {item("code", <Code className="size-3.5" />, "Code")}
      {item("cowork", <Users className="size-3.5" />, "Cowork")}
      {projectName && (
        <div className="mt-3 border-t pt-2">
          <p className="px-2 text-[10px] uppercase tracking-wider text-muted-foreground">Projects</p>
          <div className="mt-1 rounded-lg bg-foreground/[0.06] px-2 py-1.5 text-[12px] font-medium">{projectName}</div>
        </div>
      )}
      <div className="mt-auto flex items-center gap-2 px-2 pt-2 text-[11px] text-muted-foreground">
        <span className="grid size-5 place-items-center rounded-full bg-foreground/10 text-[10px] font-medium text-foreground">Z</span> You
      </div>
    </aside>
  )
}

/** The message box. `text` shows typed content; `spots` pin markers on the plus, tools and send buttons. */
export function Composer({ text, placeholder = "How can I help you today?", spots = {}, className, children }: { text?: string; placeholder?: string; spots?: { plus?: number; tools?: number; send?: number; box?: number }; className?: string; children?: ReactNode }) {
  const plus = <button type="button" tabIndex={-1} className="grid size-7 place-items-center rounded-lg border text-muted-foreground" aria-label="Add"><Plus className="size-3.5" /></button>
  const tools = <button type="button" tabIndex={-1} className="grid size-7 place-items-center rounded-lg border text-muted-foreground" aria-label="Tools"><SlidersHorizontal className="size-3.5" /></button>
  const send = <button type="button" tabIndex={-1} className={cn("grid size-7 place-items-center rounded-lg", text ? "bg-claude text-paper" : "bg-foreground/10 text-muted-foreground")} aria-label="Send"><ArrowUp className="size-3.5" /></button>
  const box = (
    <div className="relative rounded-2xl border bg-background p-3 shadow-sm">
      <p className={cn("min-h-[2.5rem] text-[13px] leading-relaxed", text ? "text-foreground" : "text-muted-foreground")}>{text ?? placeholder}</p>
      {children}
      <div className="mt-2 flex items-center gap-1.5">
        {spots.plus ? <Spot n={spots.plus} pos="tl">{plus}</Spot> : plus}
        {spots.tools ? <Spot n={spots.tools} pos="tl">{tools}</Spot> : tools}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">Claude Opus 5 <ChevronDown className="size-3" /></span>
        {spots.send ? <Spot n={spots.send}>{send}</Spot> : send}
      </div>
    </div>
  )
  return <div className={className}>{spots.box ? <Spot n={spots.box} pos="tl">{box}</Spot> : box}</div>
}

/** A message bubble in the conversation. */
export function Message({ from, children, className }: { from: "you" | "claude"; children: ReactNode; className?: string }) {
  return from === "you" ? (
    <div className={cn("ml-auto max-w-[85%] rounded-2xl bg-foreground/[0.06] px-3.5 py-2.5 text-[12.5px] leading-relaxed", className)}>{children}</div>
  ) : (
    <div className={cn("flex gap-2.5 text-[12.5px] leading-relaxed", className)}>
      <span className="mt-1 inline-block size-4 shrink-0 rounded-sm bg-claude" aria-hidden />
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
    </div>
  )
}

/** A dropdown panel drawn open over the screen. */
export function Menu({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <div className={cn("w-[236px] rounded-xl border bg-card p-1.5 text-[12px] shadow-lg", className)}>
      {title && <p className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{title}</p>}
      {children}
    </div>
  )
}

export function MenuItem({ icon, children, trailing, active }: { icon?: ReactNode; children: ReactNode; trailing?: ReactNode; active?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5", active && "bg-foreground/[0.05]")}>
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {trailing}
    </div>
  )
}

/** A small on/off switch, drawn on. */
export function Toggle({ on = true }: { on?: boolean }) {
  return (
    <span className={cn("relative inline-block h-4 w-7 rounded-full", on ? "bg-claude" : "bg-foreground/15")} aria-hidden>
      <span className={cn("absolute top-0.5 size-3 rounded-full bg-paper transition-none", on ? "left-3.5" : "left-0.5")} />
    </span>
  )
}
