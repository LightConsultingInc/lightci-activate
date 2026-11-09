"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { useCreateSkill } from "@/hooks/library/queries"
import { useMe } from "@/hooks/use-me"
import { describeError } from "./skill-actions"

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48)
}

function starterSkillMd(name: string, triggerLine: string) {
  return `---
name: ${slugify(name) || "new-skill"}
description: ${triggerLine || "Use when …"}
---

# ${name || "New skill"}

## When to use
${triggerLine || "Describe the moment a teammate should reach for this."}

## Inputs
- What Claude may read (keep to the data rules you set)

## Steps
1. …

## Output
Describe the shape of the result and who reviews it before it leaves the firm.
`
}

/** "New skill" → create dialog → POST /skills → detail page in edit mode. */
export function NewSkillDialog({ teams }: { teams: { id: string; name: string }[] }) {
  const me = useMe()
  const router = useRouter()
  const create = useCreateSkill()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [triggerLine, setTriggerLine] = useState("")
  const [teamId, setTeamId] = useState<string | null>(me.team?.id ?? null)
  const [plugin, setPlugin] = useState("")
  const teamOptions = teams.length ? teams : me.team ? [me.team] : []
  const valid = name.trim().length >= 3 && triggerLine.trim().length >= 8

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    create.mutate(
      {
        name: name.trim(),
        triggerLine: triggerLine.trim(),
        teamId: teamId ?? undefined,
        plugin: plugin.trim() || undefined,
        skillMd: starterSkillMd(name.trim(), triggerLine.trim()),
        boundary: { mayRead: [], mustNeverReceive: [], humanReview: [] },
        sampleCases: [],
      },
      {
        onSuccess: (d) => { setOpen(false); toast.success("Draft created", { description: `Branch skill/${d.slug} is yours to edit.` }); router.push(`/library/${d.slug}?edit=1`) },
        onError: (err) => toast.error("Couldn't create the skill", { description: describeError(err) }),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button data-testid="new-skill" />}>
        <Plus data-icon="inline-start" /> New skill
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" data-testid="new-skill-dialog">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Start a skill</DialogTitle>
            <DialogDescription>It starts as a draft. Nobody else gets it until it passes a check and someone approves it for sharing.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="ns-name">Name</Label>
              <Input id="ns-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Meeting prep notes" autoFocus data-testid="new-skill-name" />
              {name && <p className="font-mono text-[11px] text-muted-foreground">slug: {slugify(name)}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ns-trigger">When to use it</Label>
              <Input id="ns-trigger" value={triggerLine} onChange={(e) => setTriggerLine(e.target.value)} placeholder="Use when someone needs prep notes for a customer meeting from the CRM record" data-testid="new-skill-trigger" />
              <p className="text-xs text-muted-foreground">One sentence starting with “Use when”. This is what Claude matches against.</p>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
              <div className="grid gap-1.5">
                <Label>Team</Label>
                <Select value={teamId} onValueChange={(v) => setTeamId(v as string | null)} items={teamOptions.map((t) => ({ value: t.id, label: t.name }))}>
                  <SelectTrigger className="w-full" data-testid="new-skill-team"><SelectValue placeholder="Shared" /></SelectTrigger>
                  <SelectContent>
                    {teamOptions.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ns-plugin">Plugin <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="ns-plugin" value={plugin} onChange={(e) => setPlugin(e.target.value)} placeholder="team default" data-testid="new-skill-plugin" />
              </div>
            </div>
          </div>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={!valid || create.isPending} data-testid="new-skill-submit">
              {create.isPending && <Spinner className="size-3.5" />} Create draft
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
