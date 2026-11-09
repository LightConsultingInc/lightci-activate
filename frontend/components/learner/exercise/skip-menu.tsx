"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useSkipExercise } from "@/hooks/learner/queries"

type Reason = "no_time" | "blocked" | "tool_issue" | "not_relevant"
const REASONS: { value: Reason; label: string; hint: string }[] = [
  { value: "no_time", label: "No time this week", hint: "We'll move it to later." },
  { value: "blocked", label: "I'm blocked", hint: "If it happens twice in a row, your champion hears about it." },
  { value: "tool_issue", label: "Tool issue", hint: "Something in Claude or Activate isn't working." },
  { value: "not_relevant", label: "Not relevant to my work", hint: "We'll change your plan." },
]

export function SkipMenu({ exerciseId, disabled }: { exerciseId: string; disabled?: boolean }) {
  const router = useRouter()
  const skip = useSkipExercise(exerciseId)
  const [reason, setReason] = useState<Reason | null>(null)
  const [note, setNote] = useState("")

  const confirm = () => {
    if (!reason) return
    skip.mutate(
      { reason, note: note.trim() || undefined },
      {
        onSuccess: (res) => {
          toast.success(res.nextUp ? `Skipped. Next up: ${res.nextUp.title}` : "Skipped. We'll set up something new.")
          setReason(null)
          router.push(res.nextUp ? `/exercise/${res.nextUp.id}` : "/")
        },
      },
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" disabled={disabled} data-testid="skip-menu" />}>
          <SkipForward data-icon="inline-start" /> Skip
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuGroup><DropdownMenuLabel>Why are you skipping?</DropdownMenuLabel></DropdownMenuGroup>
          <DropdownMenuSeparator />
          {REASONS.map((r) => (
            <DropdownMenuItem key={r.value} onClick={() => setReason(r.value)} data-testid={`skip-${r.value}`}>
              <div>
                <p>{r.label}</p>
                <p className="text-xs text-muted-foreground">{r.hint}</p>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={reason !== null} onOpenChange={(o) => !o && setReason(null)}>
        <DialogContent data-testid="skip-dialog">
          <DialogHeader>
            <DialogTitle>Skip this practice</DialogTitle>
            <DialogDescription>{REASONS.find((r) => r.value === reason)?.label}. A note helps us pick something better.</DialogDescription>
          </DialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional: what got in the way?" data-testid="skip-note" />
          <DialogFooter showCloseButton>
            <Button onClick={confirm} disabled={skip.isPending} data-testid="skip-confirm">{skip.isPending ? "Skipping…" : "Skip"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
