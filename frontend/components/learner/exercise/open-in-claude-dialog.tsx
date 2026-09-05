"use client"

import { useEffect, useState } from "react"
import { ExternalLink, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { CopyButton } from "../copy-button"
import { useOpenInClaude } from "@/hooks/learner/queries"
import { ErrorState } from "@/components/shell/empty-state"

type Props = { exerciseId: string; open: boolean; onOpenChange: (o: boolean) => void; onPasteBack: (artifact: string, packPrompt: string) => void }

/** Copy-ready prompt + context pack for doing the exercise in claude.ai, with a paste-back field for the result. */
export function OpenInClaudeDialog({ exerciseId, open, onOpenChange, onPasteBack }: Props) {
  const pack = useOpenInClaude(exerciseId)
  const [pasted, setPasted] = useState("")
  useEffect(() => {
    if (open && !pack.data && !pack.isPending) pack.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-testid="open-in-claude-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl"><Sparkles className="size-4 text-claude" /> Do this in Claude</DialogTitle>
          <DialogDescription>Copy the prompt and the context pack into a new chat in claude.ai (or a Project), do the work there, then paste the finished artifact back here.</DialogDescription>
        </DialogHeader>
        {pack.isPending && <p className="text-sm text-muted-foreground">Preparing your pack…</p>}
        {pack.isError && <ErrorState title="Couldn't prepare the pack" detail={pack.error.message} retry={() => pack.mutate()} />}
        {pack.data && (
          <div className="space-y-4">
            <Pane label="Prompt" text={pack.data.prompt} testId="claude-pack-prompt" />
            <Pane label="Context pack" text={pack.data.contextBundle} testId="claude-pack-context" />
            <Button variant="outline" render={<a href="https://claude.ai/new" target="_blank" rel="noreferrer" />} data-testid="open-claude-link">
              <ExternalLink data-icon="inline-start" /> Open claude.ai
            </Button>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Paste the artifact back</p>
              <Textarea value={pasted} onChange={(e) => setPasted(e.target.value)} className="min-h-32 font-mono text-xs" placeholder="Paste Claude's output (or your finished draft) here" data-testid="paste-back-input" />
            </div>
          </div>
        )}
        <DialogFooter showCloseButton>
          <Button
            disabled={pasted.trim().length < 20}
            onClick={() => {
              onPasteBack(pasted, pack.data?.prompt ?? "")
              setPasted("")
              onOpenChange(false)
            }}
            data-testid="paste-back-confirm"
          >
            Use this as my output
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Pane({ label, text, testId }: { label: string; text: string; testId: string }) {
  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <p className="eyebrow">{label}</p>
        <CopyButton text={text} size="xs" testId={`${testId}-copy`} />
      </div>
      <pre className="max-h-40 overflow-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap" data-testid={testId}>{text}</pre>
    </div>
  )
}
