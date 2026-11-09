"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowUpRight, GitFork, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useAdoptSkill, useForkSkill } from "@/hooks/library/queries"
import { ApiError } from "@/lib/api"
import type { SkillCard } from "@/hooks/library/types"
import { cn } from "@/lib/utils"

export function describeError(e: unknown, fallback = "Something went wrong") {
  if (e instanceof ApiError) return e.detail || e.title || fallback
  if (e instanceof Error) return e.message || fallback
  return fallback
}

/** Adopt / Fork / Open, the three verbs every skill carries. Used on cards, in the quick-look and in the detail action bar. */
export function SkillActions({ skill, size = "sm", showOpen = true, className, variant = "row" }: { skill: SkillCard; size?: "xs" | "sm" | "default"; showOpen?: boolean; className?: string; variant?: "row" | "bar" }) {
  const router = useRouter()
  const adopt = useAdoptSkill()
  const fork = useForkSkill()
  const canAdopt = skill.status === "published" && !skill.adoptedByMe

  const onAdopt = () =>
    adopt.mutate(skill, {
      onSuccess: (d) =>
        toast.success(`Adopted ${skill.name}`, {
          description: d.exercise ? `Your first practice with it is ready: “${d.exercise.title}”.` : "Added to My skills.",
          action: d.exercise ? { label: "Open practice", onClick: () => router.push(`/exercise/${d.exercise.id}`) } : undefined,
        }),
      onError: (e) => toast.error("Couldn't adopt this skill", { description: describeError(e) }),
    })

  const onFork = () =>
    fork.mutate(skill, {
      onSuccess: (d) => { toast.success(`Copied ${skill.name}`, { description: `Your copy “${d.name}” is ready to edit.` }); router.push(`/library/${d.slug}?edit=1`) },
      onError: (e) => toast.error("Couldn't copy this skill", { description: describeError(e) }),
    })

  const stop = (e: React.MouseEvent) => e.stopPropagation()
  const primary = variant === "bar" ? "default" : "outline"
  return (
    <div className={cn("flex items-center gap-1.5", className)} onClick={stop} data-testid="skill-actions">
      <Button size={size} variant={skill.adoptedByMe ? "secondary" : primary} onClick={onAdopt} disabled={!canAdopt || adopt.isPending} data-testid="skill-adopt" title={skill.adoptedByMe ? "Already in My skills" : skill.status !== "published" ? "Only shared skills can be adopted" : "Adds it to My skills and sets up a practice on your own work"}>
        {adopt.isPending ? <Spinner className="size-3.5" /> : <Sparkles data-icon="inline-start" />}
        {skill.adoptedByMe ? "Adopted" : "Adopt"}
      </Button>
      <Button size={size} variant="outline" onClick={onFork} disabled={fork.isPending} data-testid="skill-fork" title="Make your own copy to change, starting from this version">
        {fork.isPending ? <Spinner className="size-3.5" /> : <GitFork data-icon="inline-start" />}
        Copy
      </Button>
      {showOpen && (
        <Button size={size} variant="ghost" render={<Link href={`/library/${skill.slug}`} />} data-testid="skill-open">
          Open <ArrowUpRight data-icon="inline-end" />
        </Button>
      )}
    </div>
  )
}
